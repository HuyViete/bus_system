#include <iostream>
#include <thread>
#include <vector>
#include <memory>
#include <string>
#include <sstream>
#include <mutex>
#include <atomic>
#include <algorithm>
#include <map>
#include <iomanip>
#include "bus.h"
#include "bus_stats.h"
#include "route_loader.h"

// ─────────────────────────────────────────────────────────────────────────────
//  Server connection settings
// ─────────────────────────────────────────────────────────────────────────────
static constexpr const char* SERVER_HOST = "127.0.0.1";
static constexpr int DATA_PORT = 3000;
static constexpr int CMD_PORT  = 4000;

// ─────────────────────────────────────────────────────────────────────────────
//  Bus registry
//
//  BusEntry holds the metadata alongside the Bus object itself.
//  std::unique_ptr<Bus> guarantees the Bus is stopped and destroyed when
//  the entry is erased from the vector — no manual memory management needed.
// ─────────────────────────────────────────────────────────────────────────────
struct BusEntry {
    int vehicle_id;
    int route_id;
    std::unique_ptr<Bus> bus;
};

std::vector<BusEntry> active_buses;
std::mutex             buses_mutex;

// Per-route bus counters: route_id → how many buses have been spawned on it.
// Bus ID formula:  route_id * 1000 + sequence_number
//   Route  3, bus 13  →   3013
//   Route 11, bus  2  →  11002
// Counter persists across multiple 'start' commands so IDs never repeat.
std::map<int, int> route_counters;
std::mutex         counters_mutex;
std::mutex         progress_mutex;

int nextBusId(int route_id) {
    std::lock_guard<std::mutex> lock(counters_mutex);
    return route_id * 1000 + (++route_counters[route_id]);
}

void printProgressBar(const std::string& label, int done, int total) {
    std::lock_guard<std::mutex> lock(progress_mutex);
    constexpr int width = 32;
    int safeTotal = std::max(total, 1);
    int filled = (done * width) / safeTotal;
    if (filled < 0) filled = 0;
    if (filled > width) filled = width;

    std::cout << "\r[" << label << "] ["
              << std::string(filled, '#')
              << std::string(width - filled, '-')
              << "] " << std::setw(4) << done << "/" << total << std::flush;

    if (done >= total) {
        std::cout << "\n";
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Utilities
// ─────────────────────────────────────────────────────────────────────────────

// Split a line into whitespace-separated tokens.
std::vector<std::string> tokenize(const std::string& line) {
    std::vector<std::string> tokens;
    std::istringstream ss(line);
    std::string tok;
    while (ss >> tok) tokens.push_back(tok);
    return tokens;
}

// Build a flag map from tokens starting at index `start`.
// Handles:
//   "-a"          → { "-a": "1" }       (boolean flag)
//   "-r 1 -n 10"  → { "-r": "1", "-n": "10" }
std::map<std::string, std::string> parseFlags(const std::vector<std::string>& tokens, int start) {
    std::map<std::string, std::string> flags;
    for (int i = start; i < (int)tokens.size(); ++i) {
        const auto& t = tokens[i];
        if (t[0] != '-') continue;
        // Next token is either another flag or the value for this one
        bool nextIsValue = (i + 1 < (int)tokens.size()) && (tokens[i + 1][0] != '-');
        flags[t] = nextIsValue ? tokens[++i] : "1";
    }
    return flags;
}

// Safe stoi with a fallback default — avoids crashing on bad user input.
int safeInt(const std::map<std::string, std::string>& flags,
            const std::string& key, int fallback = 0)
{
    auto it = flags.find(key);
    if (it == flags.end()) return fallback;
    try { return std::stoi(it->second); }
    catch (...) { return fallback; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  spawnBus — creates one bus with an auto-generated ID
//
//  CONCEPT — Why we split the work around the mutex:
//  The slow part is Bus construction: it opens a SQLite file AND makes 2
//  blocking TCP connect() calls (data port + command port). Holding the mutex
//  during that work forces every thread to queue up serially — killing
//  parallelism. The fix: do all the slow work first, THEN acquire the lock
//  just long enough to push_back into the vector (a few microseconds).
// ─────────────────────────────────────────────────────────────────────────────
int spawnBus(int route_id, int start_waypoint, RouteMap& routes) {
    auto it = routes.find(route_id);
    if (it == routes.end()) {
        std::cerr << "[Spawn] Route " << route_id << " not found.\n";
        return -1;
    }
    const auto& waypoints = it->second;
    if (waypoints.empty()) {
        std::cerr << "[Spawn] Route " << route_id << " has no waypoints.\n";
        return -1;
    }
    if (start_waypoint < 0 || start_waypoint >= (int)waypoints.size())
        start_waypoint = 0;

    // Generate ID: route_id * 1000 + per-route sequence number.
    // Thread-safe: nextBusId() holds its own lightweight mutex.
    int bus_id = nextBusId(route_id);

    // ── SLOW: open DB + TCP connect — runs WITHOUT the mutex ─────────────────
    // Multiple threads can be doing this concurrently, which is the whole point.
    auto bus = std::make_unique<Bus>(bus_id, route_id, waypoints, start_waypoint,
                                     SERVER_HOST, DATA_PORT, CMD_PORT);

    // ── FAST: only the vector push_back needs the lock (~microseconds) ────────
    {
        std::lock_guard<std::mutex> lock(buses_mutex);
        active_buses.push_back({ bus_id, route_id, std::move(bus) });
    }

    return bus_id;
}

// ─────────────────────────────────────────────────────────────────────────────
//  spawnParallel — fan out a work list across N hardware threads
//
//  `work` is a flat list of (route_id, start_waypoint) pairs — one entry
//  per bus to spawn. The list is divided into equal slices and each slice
//  is handed to a worker std::thread. All TCP connections therefore happen
//  concurrently, saturating all available CPU cores.
//
//  With 16 logical processors spawning 100 buses:
//    Serial:   100 × ~5ms connect = ~500ms
//    Parallel: ceil(100/16) × ~5ms = ~35ms  (≈14× faster)
// ─────────────────────────────────────────────────────────────────────────────
int spawnParallel(const std::vector<std::pair<int,int>>& work, RouteMap& routes) {
    int n = (int)work.size();
    if (n == 0) return 0;

    int hw          = (int)std::thread::hardware_concurrency();
    int num_threads = std::min(n, hw > 0 ? hw : 4);

    std::atomic<int> spawned{0};
    std::atomic<int> done{0};     // total attempts finished (success + fail)

    printProgressBar("Start", 0, n);

    std::vector<std::thread> workers;
    workers.reserve(num_threads);

    for (int t = 0; t < num_threads; ++t) {
        int lo = t * n / num_threads;
        int hi = (t + 1) * n / num_threads;

        workers.emplace_back([&, lo, hi]() {
            for (int i = lo; i < hi; ++i) {
                auto [route_id, wp] = work[i];
                bool ok = (spawnBus(route_id, wp, routes) != -1);
                if (ok) ++spawned;
                int d = ++done;
                if (n <= 100 || d % std::max(1, n/100) == 0 || d == n) {
                    printProgressBar("Start", d, n);
                }
            }
        });
    }

    for (auto& w : workers) w.join();
    return spawned.load();
}

// ─────────────────────────────────────────────────────────────────────────────
//  cmd: start
//
//  start -r <route> -n <count>
//    Spawn <count> buses all on the given route, distributed evenly
//    across the route's waypoints so they don't all start at the same spot.
//
//  start -n <count>
//    Distribute <count> buses across ALL routes.
//    • count >= num_routes → floor(count/routes) per route + remainder on first routes
//    • count <  num_routes → 1 bus on the first <count> routes (sorted by ID)
// ─────────────────────────────────────────────────────────────────────────────
void cmdStart(const std::map<std::string, std::string>& flags, RouteMap& routes) {
    int n = safeInt(flags, "-n", 1);
    if (n <= 0) { std::cerr << "[Start] -n must be > 0.\n"; return; }

    // Build a flat list of (route_id, waypoint) pairs — one per bus to spawn.
    // Constructing this list is O(n) and fast; the actual Bus creation (TCP
    // connect, SQLite open) is deferred to spawnParallel which does it in
    // parallel across all available hardware threads.
    std::vector<std::pair<int,int>> work;
    work.reserve(n);

    if (flags.count("-r")) {
        // ── Spawn N buses on one specific route ───────────────────────────────
        int route_id = safeInt(flags, "-r");
        auto it      = routes.find(route_id);
        if (it == routes.end()) {
            std::cerr << "[Start] Route " << route_id << " not found.\n";
            return;
        }
        int wp_count = (int)it->second.size();
        for (int i = 0; i < n; ++i) {
            int wp = (wp_count > 1 && n > 1) ? (i * wp_count / n) : 0;
            work.emplace_back(route_id, wp);
        }

    } else {
        // ── Distribute N buses across all routes ──────────────────────────────
        std::vector<int> route_ids;
        route_ids.reserve(routes.size());
        for (auto& [id, _] : routes) route_ids.push_back(id);
        std::sort(route_ids.begin(), route_ids.end());

        int total_routes = (int)route_ids.size();

        if (n >= total_routes) {
            int base  = n / total_routes;
            int extra = n % total_routes;
            for (int ri = 0; ri < total_routes; ++ri) {
                int route_id   = route_ids[ri];
                int buses_here = base + (ri < extra ? 1 : 0);
                const auto& wps = routes[route_id];
                int wp_count    = (int)wps.size();
                for (int i = 0; i < buses_here; ++i) {
                    int wp = (wp_count > 1 && buses_here > 1)
                             ? (i * wp_count / buses_here) : 0;
                    work.emplace_back(route_id, wp);
                }
            }
        } else {
            for (int i = 0; i < n; ++i)
                work.emplace_back(route_ids[i], 0);
        }
    }

    // Fan out the work list across hardware threads
    auto before = snapshotBusErrors();
    int spawned = spawnParallel(work, routes);
    auto after  = snapshotBusErrors();
    auto delta  = diffBusErrors(before, after);

    std::cout << "[Start] Done - " << spawned << "/" << n << " bus(es) active.\n";
    if (delta.hasAny()) {
        std::cout << "[Start] Error summary:"
                  << " data-connect=" << delta.senderConnectFailures
                  << ", cmd-connect=" << delta.receiverConnectFailures
                  << ", send=" << delta.senderSendFailures
                  << ", recv=" << delta.receiverRecvFailures
                  << "\n";
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  cmd: stop
//
//  stop -a           Stop every active bus.
//  stop -i <id>      Stop the bus whose vehicle_id == id.
//  stop -b <index>   Stop the bus at position <index> in the active list (0-based).
//  stop -r <route> -n <count>
//                    Stop the <count> most-recently-spawned buses on <route>.
//  stop -n <count>   Stop the <count> most-recently-spawned buses (globally).
// ─────────────────────────────────────────────────────────────────────────────
void cmdStop(const std::map<std::string, std::string>& flags) {

    // Collect buses to stop -- hold lock only briefly for the swap.
    // Stopping (TCP teardown + SQLite close) is slow; we do it in parallel
    // after releasing the mutex.
    std::vector<BusEntry> victims;
    {
        std::lock_guard<std::mutex> lock(buses_mutex);

        if (flags.count("-a")) {
            std::cout << "[Stop] Collecting all " << active_buses.size() << " bus(es)...\n";
            victims = std::move(active_buses);
            active_buses.clear();

        } else if (flags.count("-i")) {
            int id = safeInt(flags, "-i");
            auto it = std::find_if(active_buses.begin(), active_buses.end(),
                                   [id](const BusEntry& e){ return e.vehicle_id == id; });
            if (it == active_buses.end()) {
                std::cerr << "[Stop] No bus with ID " << id << ".\n"; return;
            }
            victims.push_back(std::move(*it));
            active_buses.erase(it);

        } else if (flags.count("-b")) {
            int idx = safeInt(flags, "-b");
            if (idx < 0 || idx >= (int)active_buses.size()) {
                std::cerr << "[Stop] Index " << idx << " out of range.\n"; return;
            }
            auto it = active_buses.begin() + idx;
            victims.push_back(std::move(*it));
            active_buses.erase(it);

        } else {
            int n = safeInt(flags, "-n", (int)active_buses.size());
            if (n <= 0) { std::cerr << "[Stop] -n must be > 0.\n"; return; }

            if (flags.count("-r")) {
                int route_id = safeInt(flags, "-r");
                for (auto it = active_buses.end();
                     it != active_buses.begin() && (int)victims.size() < n; ) {
                    --it;
                    if (it->route_id == route_id) {
                        victims.push_back(std::move(*it));
                        it = active_buses.erase(it);
                    }
                }
            } else {
                int to_stop = std::min(n, (int)active_buses.size());
                while (to_stop-- > 0) {
                    victims.push_back(std::move(active_buses.back()));
                    active_buses.pop_back();
                }
            }
        }
    } // mutex released

    if (victims.empty()) { std::cout << "[Stop] Nothing to stop.\n"; return; }

    // Stop in parallel with a live progress bar
    int total       = (int)victims.size();
    int hw          = (int)std::thread::hardware_concurrency();
    int num_threads = std::min(total, hw > 0 ? hw : 4);
    printProgressBar("Stop", 0, total);

    auto before = snapshotBusErrors();
    std::atomic<int> done{0};
    std::vector<std::thread> workers;
    workers.reserve(num_threads);
    for (int t = 0; t < num_threads; ++t) {
        int lo = t * total / num_threads;
        int hi = (t + 1) * total / num_threads;
        workers.emplace_back([&, lo, hi]() {
            for (int i = lo; i < hi; ++i) {
                victims[i].bus->stop();
                int d = ++done;
                if (total <= 50 || d % std::max(1, total/50) == 0 || d == total)
                    printProgressBar("Stop", d, total);
            }
        });
    }
    for (auto& w : workers) w.join();
    auto after = snapshotBusErrors();
    auto delta = diffBusErrors(before, after);
    // victims goes out of scope -- Bus destructors called automatically
    std::cout << "[Stop] Done - " << total << " bus(es) stopped.\n";
    if (delta.hasAny()) {
        std::cout << "[Stop] Error summary:"
                  << " data-connect=" << delta.senderConnectFailures
                  << ", cmd-connect=" << delta.receiverConnectFailures
                  << ", send=" << delta.senderSendFailures
                  << ", recv=" << delta.receiverRecvFailures
                  << "\n";
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  cmd: list — print all active buses
// ─────────────────────────────────────────────────────────────────────────────
void cmdList() {
    std::lock_guard<std::mutex> lock(buses_mutex);
    if (active_buses.empty()) {
        std::cout << "[List] No active buses.\n";
        return;
    }
    std::cout << "[List] " << active_buses.size() << " active bus(es):\n";
    for (int i = 0; i < (int)active_buses.size(); ++i) {
        const auto& e = active_buses[i];
        std::cout << "  [" << i << "] Bus #" << e.vehicle_id
                  << " - Route " << e.route_id << "\n";
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Dispatch: parse one line and call the right command handler.
//  Returns false when the user wants to quit.
// ─────────────────────────────────────────────────────────────────────────────
bool dispatch(const std::string& line, RouteMap& routes) {
    auto tokens = tokenize(line);
    if (tokens.empty()) return true;

    const auto& cmd = tokens[0];

    if (cmd == "exit" || cmd == "quit") return false;

    if (cmd == "start") {
        cmdStart(parseFlags(tokens, 1), routes);
    } else if (cmd == "stop") {
        cmdStop(parseFlags(tokens, 1));
    } else if (cmd == "list") {
        cmdList();
    } else {
        std::cerr << "[?] Unknown command: '" << cmd << "'. "
                  << "Try: start | stop | list | exit\n";
    }
    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Interactive REPL
// ─────────────────────────────────────────────────────────────────────────────
void interactiveMode(RouteMap& routes) {
    std::cout << "\n===============================================\n";
    std::cout <<   "          Bus Fleet Manager (REPL)\n";
    std::cout <<   "===============================================\n";
    std::cout << "  start -r <route> -n <count>    Spawn buses on one route\n";
    std::cout << "  start -n <count>               Distribute buses across all routes\n";
    std::cout << "  stop  -a                       Stop ALL buses\n";
    std::cout << "  stop  -i <id>                  Stop bus by vehicle ID\n";
    std::cout << "  stop  -b <index>               Stop bus by list index\n";
    std::cout << "  stop  -r <route> -n <count>    Stop N latest buses on a route\n";
    std::cout << "  stop  -n <count>               Stop N latest buses\n";
    std::cout << "  list                           Print all active buses\n";
    std::cout << "  exit / quit                    Shut down\n\n> ";

    std::string line;
    while (std::getline(std::cin, line)) {
        if (!dispatch(line, routes)) break;
        std::cout << "> ";
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  main
// ─────────────────────────────────────────────────────────────────────────────
int main(int argc, char* argv[]) {
    // 1. Load routes
    RouteMap routes = loadRoutes("routes.json");
    if (routes.empty()) {
        std::cerr << "[main] No routes loaded. Exiting.\n";
        return 1;
    }
    std::cout << "[main] Loaded " << routes.size() << " routes.\n";

    // 2. Mode selection
    if (argc > 1) {
        // ── Non-interactive: run one command from CLI args and wait ───────────
        // Examples:
        //   ./bus start -r 1 -n 10
        //   ./bus start -n 100
        std::vector<std::string> tokens(argv + 1, argv + argc);
        std::string line;
        for (const auto& t : tokens) { line += t; line += ' '; }

        if (!dispatch(line, routes)) return 0;

        std::cout << "\nFleet running. Press Enter to stop all and exit.\n";
        std::cin.get();
    } else {
        // ── Interactive REPL ──────────────────────────────────────────────────
        interactiveMode(routes);
    }

    // 3. Graceful shutdown -- parallel stop
    std::vector<BusEntry> remaining;
    {
        std::lock_guard<std::mutex> lock(buses_mutex);
        remaining = std::move(active_buses);
        active_buses.clear();
    }
    if (!remaining.empty()) {
        int total       = (int)remaining.size();
        int hw          = (int)std::thread::hardware_concurrency();
        int num_threads = std::min(total, hw > 0 ? hw : 4);
        std::cout << "Stopping " << total << " bus(es)..." << std::flush;
        std::vector<std::thread> workers;
        for (int t = 0; t < num_threads; ++t) {
            int lo = t * total / num_threads;
            int hi = (t + 1) * total / num_threads;
            workers.emplace_back([&, lo, hi]() {
                for (int i = lo; i < hi; ++i) remaining[i].bus->stop();
            });
        }
        for (auto& w : workers) w.join();
        std::cout << " done.\n";
    }
    std::cout << "=== Bus System Stopped ===\n";
    return 0;
}