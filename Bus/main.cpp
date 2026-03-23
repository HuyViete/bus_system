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
#include "bus.h"
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
std::atomic<int>       next_bus_id{1000};   // auto-increment; first bus = 1001

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
//  Returns the new vehicle_id on success, -1 on failure.
//  start_waypoint: the index along the route where the bus begins.
//  Passing -1 will default to waypoint 0.
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

    int bus_id = ++next_bus_id;
    std::cout << "[Spawn] Bus #" << bus_id << " → Route " << route_id
              << " (waypoint " << start_waypoint << ")\n";

    std::lock_guard<std::mutex> lock(buses_mutex);
    active_buses.push_back({
        bus_id, route_id,
        std::make_unique<Bus>(bus_id, route_id, waypoints, start_waypoint,
                              SERVER_HOST, DATA_PORT, CMD_PORT)
    });
    return bus_id;
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

    if (flags.count("-r")) {
        // ── Spawn N buses on one specific route ───────────────────────────────
        int route_id     = safeInt(flags, "-r");
        auto it          = routes.find(route_id);
        if (it == routes.end()) {
            std::cerr << "[Start] Route " << route_id << " not found.\n";
            return;
        }
        int wp_count = (int)it->second.size();
        int spawned  = 0;

        for (int i = 0; i < n; ++i) {
            // Spread starting positions evenly: bus i starts at (i/n) of the route
            int wp = (wp_count > 1 && n > 1) ? (i * wp_count / n) : 0;
            if (spawnBus(route_id, wp, routes) != -1) ++spawned;
        }
        std::cout << "[Start] Spawned " << spawned << "/" << n
                  << " bus(es) on route " << route_id << "\n";

    } else {
        // ── Distribute N buses across all routes ──────────────────────────────
        std::vector<int> route_ids;
        route_ids.reserve(routes.size());
        for (auto& [id, _] : routes) route_ids.push_back(id);
        std::sort(route_ids.begin(), route_ids.end());

        int total_routes = (int)route_ids.size();
        int spawned      = 0;

        if (n >= total_routes) {
            // At least 1 bus per route; distribute evenly with remainder going
            // to the first routes (round-robin style).
            int base  = n / total_routes;
            int extra = n % total_routes;   // first `extra` routes get one more

            for (int ri = 0; ri < total_routes; ++ri) {
                int route_id   = route_ids[ri];
                int buses_here = base + (ri < extra ? 1 : 0);
                const auto& wps = routes[route_id];
                int wp_count    = (int)wps.size();

                for (int i = 0; i < buses_here; ++i) {
                    int wp = (wp_count > 1 && buses_here > 1)
                             ? (i * wp_count / buses_here)
                             : 0;
                    if (spawnBus(route_id, wp, routes) != -1) ++spawned;
                }
            }
        } else {
            // Fewer buses than routes: put exactly 1 on the first N routes.
            for (int i = 0; i < n; ++i) {
                if (spawnBus(route_ids[i], 0, routes) != -1) ++spawned;
            }
        }

        std::cout << "[Start] Spawned " << spawned << " bus(es) across "
                  << std::min(n, total_routes) << " route(s).\n";
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
    std::lock_guard<std::mutex> lock(buses_mutex);

    // ── (a) Stop all ──────────────────────────────────────────────────────────
    if (flags.count("-a")) {
        std::cout << "[Stop] Stopping all " << active_buses.size() << " bus(es)...\n";
        for (auto& e : active_buses) e.bus->stop();
        active_buses.clear();
        return;
    }

    // ── (b) Stop by vehicle ID ────────────────────────────────────────────────
    if (flags.count("-i")) {
        int id = safeInt(flags, "-i");
        auto it = std::find_if(active_buses.begin(), active_buses.end(),
                               [id](const BusEntry& e){ return e.vehicle_id == id; });
        if (it == active_buses.end()) {
            std::cerr << "[Stop] No bus with ID " << id << ".\n";
            return;
        }
        std::cout << "[Stop] Bus #" << it->vehicle_id
                  << " (route " << it->route_id << ") stopped.\n";
        it->bus->stop();
        active_buses.erase(it);
        return;
    }

    // ── (c) Stop by list index ────────────────────────────────────────────────
    if (flags.count("-b")) {
        int idx = safeInt(flags, "-b");
        if (idx < 0 || idx >= (int)active_buses.size()) {
            std::cerr << "[Stop] Index " << idx << " out of range (0–"
                      << (int)active_buses.size() - 1 << ").\n";
            return;
        }
        auto it = active_buses.begin() + idx;
        std::cout << "[Stop] Bus #" << it->vehicle_id
                  << " (route " << it->route_id << ") stopped.\n";
        it->bus->stop();
        active_buses.erase(it);
        return;
    }

    // ── (d) Stop N latest buses, optionally filtered by route ─────────────────
    // "Latest" = closest to the end of active_buses (most recently spawned).
    int n = safeInt(flags, "-n", (int)active_buses.size());
    if (n <= 0) { std::cerr << "[Stop] -n must be > 0.\n"; return; }

    if (flags.count("-r")) {
        int route_id = safeInt(flags, "-r");
        int stopped  = 0;

        // Scan from the back so we remove the most-recently-spawned first.
        for (auto it = active_buses.end(); it != active_buses.begin() && stopped < n; ) {
            --it;
            if (it->route_id == route_id) {
                std::cout << "[Stop] Bus #" << it->vehicle_id
                          << " (route " << route_id << ")\n";
                it->bus->stop();
                it = active_buses.erase(it);
                ++stopped;
            }
        }
        std::cout << "[Stop] Stopped " << stopped << " bus(es) on route "
                  << route_id << ".\n";
    } else {
        // No route filter: stop the last N globally.
        int to_stop = std::min(n, (int)active_buses.size());
        for (int i = 0; i < to_stop; ++i) {
            auto& e = active_buses.back();
            std::cout << "[Stop] Bus #" << e.vehicle_id
                      << " (route " << e.route_id << ")\n";
            e.bus->stop();
            active_buses.pop_back();
        }
        std::cout << "[Stop] Stopped " << to_stop << " bus(es).\n";
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
                  << " — Route " << e.route_id << "\n";
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
    std::cout << "\n╔══════════════════════════════════════════════╗\n";
    std::cout <<   "║          Bus Fleet Manager (REPL)            ║\n";
    std::cout <<   "╚══════════════════════════════════════════════╝\n";
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
    RouteMap routes = loadRoutes("routes.csv");
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

    // 3. Graceful shutdown — stop everything still running
    std::cout << "Stopping all buses...\n";
    {
        std::lock_guard<std::mutex> lock(buses_mutex);
        for (auto& e : active_buses) e.bus->stop();
        active_buses.clear();
    }
    std::cout << "=== Bus System Stopped ===\n";
    return 0;
}