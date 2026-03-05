#ifndef ROUTE_LOADER_H
#define ROUTE_LOADER_H

#include <string>
#include <vector>
#include <map>
#include <fstream>
#include <sstream>
#include <iostream>

struct Waypoint {
    double lat;
    double lon;
};

// route_id (numeric, e.g. 1, 3, 57) -> ordered list of waypoints
using RouteMap = std::map<int, std::vector<Waypoint>>;

/**
 * Parses Bus/routes.csv and returns a map of route_id -> waypoints.
 * CSV format expected:
 *   route_id, sequence, lat, lon
 *   route_1,  0,        10.77..., 106.70...
 */
inline RouteMap loadRoutes(const std::string& csv_path) {
    RouteMap routes;

    std::ifstream file(csv_path);
    if (!file.is_open()) {
        std::cerr << "[RouteLoader] Cannot open " << csv_path << std::endl;
        return routes;
    }

    std::string line;
    std::getline(file, line); // skip header

    while (std::getline(file, line)) {
        if (line.empty()) continue;

        std::istringstream ss(line);
        std::string id_str, seq_str, lat_str, lon_str;

        if (!std::getline(ss, id_str,  ',')) continue;
        if (!std::getline(ss, seq_str, ',')) continue;
        if (!std::getline(ss, lat_str, ',')) continue;
        if (!std::getline(ss, lon_str, ',')) continue;

        // id_str is like "route_3" -> extract the number
        auto pos = id_str.find('_');
        if (pos == std::string::npos) continue;
        int route_id = std::stoi(id_str.substr(pos + 1));

        Waypoint wp;
        wp.lat = std::stod(lat_str);
        wp.lon = std::stod(lon_str);
        routes[route_id].push_back(wp);
    }

    std::cout << "[RouteLoader] Loaded " << routes.size() << " routes from " << csv_path << std::endl;
    return routes;
}

#endif // ROUTE_LOADER_H
