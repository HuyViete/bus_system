#include <iostream>
#include <thread>
#include <vector>
#include <memory>
#include <string>
#include <sstream>
#include <mutex>
#include "bus.h"
#include "route_loader.h"

// ─────────────────────────────────────────────────────────────────────────────
//  Server connection settings
// ─────────────────────────────────────────────────────────────────────────────
static constexpr const char* SERVER_HOST = "127.0.0.1";
static constexpr int DATA_PORT  = 3000;
static constexpr int CMD_PORT   = 4000;

// Global list of active buses and a mutex to protect it
std::vector<std::unique_ptr<Bus>> active_buses;
std::mutex buses_mutex;

// ─────────────────────────────────────────────────────────────────────────────
// spanwBus: Creates a new bus and adds it to the active_buses list
// ─────────────────────────────────────────────────────────────────────────────
void spawnBus(int bus_id, int route_id, int start_waypoint, RouteMap& routes) {
    auto it = routes.find(route_id);
    if (it == routes.end()) {
        std::cerr << "Route " << route_id << " not found!\n";
        return;
    }
    
    const auto& waypoints = it->second;
    if (waypoints.empty()) {
        std::cerr << "Route " << route_id << " has no waypoints!\n";
        return;
    }

    if (start_waypoint < 0 || start_waypoint >= (int)waypoints.size()) {
        std::cerr << "Invalid waypoint " << start_waypoint << " for route " << route_id 
                  << " (max " << waypoints.size() - 1 << "). Defaulting to 0.\n";
        start_waypoint = 0;
    }

    std::cout << "[Spawn] Bus ID " << bus_id << " on Route " << route_id 
              << " starting at waypoint " << start_waypoint << ".\n";

    std::lock_guard<std::mutex> lock(buses_mutex);
    active_buses.push_back(std::make_unique<Bus>(
        bus_id,
        route_id,
        waypoints,
        start_waypoint,
        SERVER_HOST,
        DATA_PORT,
        CMD_PORT
    ));
}

// ─────────────────────────────────────────────────────────────────────────────
// interactiveMode: Keeps reading commands from standard input
// ─────────────────────────────────────────────────────────────────────────────
void interactiveMode(RouteMap& routes) {
    std::cout << "\n=== Interactive Manager Mode ===\n";
    std::cout << "Type commands in the format: <bus_id> <route_id> [start_waypoint]\n";
    std::cout << "Example: 2003 2      (Spawns bus 2003 on route 2 at waypoint 0)\n";
    std::cout << "Example: 4007 4 15   (Spawns bus 4007 on route 4 at waypoint 15)\n";
    std::cout << "Type 'exit' or 'quit' to shut down.\n\n> ";

    std::string line;
    while (std::getline(std::cin, line)) {
        if (line == "exit" || line == "quit") break;
        if (line.empty()) { 
            std::cout << "> "; 
            continue; 
        }

        std::stringstream ss(line);
        int bus_id, route_id;
        int start_waypoint = 0; // default value

        if (ss >> bus_id >> route_id) {
            ss >> start_waypoint; // read optional waypoint if provided
            spawnBus(bus_id, route_id, start_waypoint, routes);
        } else {
            std::cout << "Invalid format. Use: <bus_id> <route_id> [start_waypoint]\n";
        }
        std::cout << "> ";
    }
}

int main(int argc, char* argv[]) {
    // ── 1. Load all routes ────────────────────────────────────────────────────
    RouteMap routes = loadRoutes("routes.csv");
    if (routes.empty()) {
        std::cerr << "[main] No routes loaded. Exiting.\n";
        return 1;
    }

    // ── 2. Determine mode based on arguments ──────────────────────────────────
    if (argc > 1) {
        // SINGLE BUS MODE (Command-line arguments provided)
        if (argc < 3) {
            std::cerr << "Usage: " << argv[0] << " <bus_id> <route_id> [start_waypoint]\n";
            return 1;
        }
        
        int bus_id = std::stoi(argv[1]);
        int route_id = std::stoi(argv[2]);
        int start_waypoint = 0;
        if (argc > 3) {
            start_waypoint = std::stoi(argv[3]);
        }

        spawnBus(bus_id, route_id, start_waypoint, routes);

        // Block until the user presses Enter
        std::cout << "\nBus is running. Press Enter to stop.\n";
        std::cin.get();
        
    } else {
        // MULTI-BUS MANAGER MODE (No arguments provided)
        interactiveMode(routes);
    }

    // ── 3. Stop all buses cleanly ─────────────────────────────────────────────
    std::cout << "Stopping all buses...\n";
    std::lock_guard<std::mutex> lock(buses_mutex);
    for (auto& bus : active_buses) {
        bus->stop();
    }

    std::cout << "=== Bus System Stopped ===\n";
    return 0;
}