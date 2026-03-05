#include <iostream>
#include <thread>
#include <vector>
#include <memory>
#include "bus.h"
#include "route_loader.h"

// Number of buses to spawn per route
static constexpr int BUSES_PER_ROUTE = 2;

/**
 * Spawns `count` buses on the given route, each starting at an evenly-spaced
 * waypoint index so they are distributed across the full route length.
 *
 *   start_index for bus i = (total_waypoints / count) * i
 *
 * Each Bus object is heap-allocated and stored in `buses` so it lives for
 * the lifetime of main(). The Bus constructor immediately detaches threads.
 */
void spawnBusesForRoute(int route_id,
                        const std::vector<Waypoint>& waypoints,
                        int count,
                        std::vector<std::unique_ptr<Bus>>& buses)
{
    int total = (int)waypoints.size();
    if (total == 0) {
        std::cout << "[Spawn] Route " << route_id
                  << " has no waypoints — skipped." << std::endl;
        return;
    }

    int step = total / count;   // gap between buses (in waypoints)
    if (step < 1) step = 1;

    for (int i = 0; i < count; i++) {
        int vehicle_id  = route_id * 1000 + i;
        int start_index = (step * i) % total;

        std::cout << "[Spawn] Route " << route_id
                  << " | Bus #" << i
                  << " | vehicle_id=" << vehicle_id
                  << " | start waypoint=" << start_index
                  << "/" << total - 1
                  << std::endl;

        buses.push_back(std::make_unique<Bus>(
            vehicle_id, route_id, /*current_station=*/0,
            waypoints, start_index
        ));
    }
}

int main(int argc, char* argv[]) {
    std::cout << "=== Bus System Starting ===" << std::endl;

    // ── 1. Load all routes from CSV ───────────────────────────────────────────
    // The CSV lives next to the compiled binary (Bus/routes.csv).
    // Adjust the path if your working directory differs.
    RouteMap routes = loadRoutes("routes.csv");

    if (routes.empty()) {
        std::cerr << "[main] No routes loaded. Exiting." << std::endl;
        return 1;
    }

    // ── 2. Spawn buses ────────────────────────────────────────────────────────
    // Keep Bus objects alive until the user stops the program.
    std::vector<std::unique_ptr<Bus>> buses;
    buses.reserve(routes.size() * BUSES_PER_ROUTE);

    for (const auto& [route_id, waypoints] : routes) {
        spawnBusesForRoute(route_id, waypoints, BUSES_PER_ROUTE, buses);
    }

    std::cout << "\n=== " << buses.size() << " buses running across "
              << routes.size() << " routes. Press Enter to stop. ===" << std::endl;

    // ── 3. Wait for user input ────────────────────────────────────────────────
    std::cin.get();

    // ── 4. Stop all buses ─────────────────────────────────────────────────────
    std::cout << "Stopping all buses..." << std::endl;
    for (auto& bus : buses) {
        bus->stop();
    }

    std::cout << "=== Bus System Stopped ===" << std::endl;
    return 0;
}