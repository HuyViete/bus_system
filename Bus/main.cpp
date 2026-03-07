#include <iostream>
#include <thread>
#include <vector>
#include <memory>
#include "bus.h"
#include "route_loader.h"

// ─────────────────────────────────────────────────────────────────────────────
//  Server connection settings
//  Change these if your Node.js / big-server runs on a different host or port.
// ─────────────────────────────────────────────────────────────────────────────
static constexpr const char* SERVER_HOST = "127.0.0.1";
static constexpr int DATA_PORT  = 3000;   // Sender → server's HTTP / data port
static constexpr int CMD_PORT   = 4000;   // Receiver ← server's command port

// Number of buses spawned per route.
static constexpr int BUSES_PER_ROUTE = 2;

// ─────────────────────────────────────────────────────────────────────────────
//  spawnBusesForRoute
//  Creates BUSES_PER_ROUTE Bus objects, each starting at an evenly-spaced
//  waypoint so they are spread across the full length of the route.
//
//  CONCEPT — std::unique_ptr<Bus>
//  We heap-allocate (new) each Bus because:
//    1. Bus objects are large and contain threads — they must NOT be copied.
//       Putting them in a vector<Bus> would try to copy them (compile error).
//    2. unique_ptr<Bus> gives us heap allocation while still following RAII:
//       when the vector is destroyed, every unique_ptr destructor runs Bus::~Bus()
//       automatically — no manual delete needed.
// ─────────────────────────────────────────────────────────────────────────────
void spawnBusesForRoute(int route_id,
                        const std::vector<Waypoint>& waypoints,
                        std::vector<std::unique_ptr<Bus>>& buses)
{
    int total = (int)waypoints.size();
    if (total == 0) {
        std::cout << "[Spawn] Route " << route_id << " has no waypoints — skipped.\n";
        return;
    }

    int step = std::max(1, total / BUSES_PER_ROUTE);

    for (int i = 0; i < BUSES_PER_ROUTE; i++) {
        int vehicle_id  = route_id * 1000 + i;
        int start_index = (step * i) % total;

        std::cout << "[Spawn] Route " << route_id
                  << " | Bus #" << i
                  << " | vehicle_id=" << vehicle_id
                  << " | start waypoint=" << start_index << "/" << (total - 1)
                  << "\n";

        // std::make_unique<Bus>(...) is the preferred way to create unique_ptrs.
        // It is exception-safe: if the Bus constructor throws, the memory is
        // freed automatically.
        buses.push_back(std::make_unique<Bus>(
            vehicle_id,
            route_id,
            waypoints,
            start_index,
            SERVER_HOST,
            DATA_PORT,
            CMD_PORT
        ));
    }
}

int main() {
    std::cout << "=== Bus System Starting ===\n";
    std::cout << "  Data port : " << DATA_PORT << "\n";
    std::cout << "  Cmd  port : " << CMD_PORT  << "\n\n";

    // ── 1. Load all routes ────────────────────────────────────────────────────
    RouteMap routes = loadRoutes("routes.csv");
    if (routes.empty()) {
        std::cerr << "[main] No routes loaded. Exiting.\n";
        return 1;
    }

    // ── 2. Spawn buses ────────────────────────────────────────────────────────
    std::vector<std::unique_ptr<Bus>> buses;
    buses.reserve(routes.size() * BUSES_PER_ROUTE);

    for (const auto& [route_id, waypoints] : routes) {
        spawnBusesForRoute(route_id, waypoints, buses);
    }

    std::cout << "\n=== " << buses.size() << " buses running across "
              << routes.size() << " routes. Press Enter to stop. ===\n";

    // ── 3. Block until the user presses Enter ─────────────────────────────────
    std::cin.get();

    // ── 4. Stop all buses ─────────────────────────────────────────────────────
    //  Walking the vector and calling stop() triggers Bus::~Bus() explicitly.
    //  unique_ptr would also call the destructor when the vector goes out of
    //  scope, but doing it explicitly here gives us a clear shutdown log.
    std::cout << "Stopping all buses...\n";
    for (auto& bus : buses) {
        bus->stop();
    }

    std::cout << "=== Bus System Stopped ===\n";
    return 0;
}