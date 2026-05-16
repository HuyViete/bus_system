#ifndef STATION_LOADER_H
#define STATION_LOADER_H

#include <fstream>
#include <sstream>
#include <string>
#include <vector>
#include <map>
#include "speed_sim.h"

struct Station {
    int    id;
    std::string name;
    double lat;
    double lon;
};

using StationList = std::vector<Station>;

inline StationList loadStations(const std::string& path) {
    StationList stations;

    std::ifstream file(path);
    if (!file.is_open()) return stations;

    std::string content((std::istreambuf_iterator<char>(file)),
                         std::istreambuf_iterator<char>());

    size_t pos = 0;
    while (pos < content.size()) {
        size_t objStart = content.find('{', pos);
        if (objStart == std::string::npos) break;
        size_t objEnd = content.find('}', objStart);
        if (objEnd == std::string::npos) break;

        std::string obj = content.substr(objStart, objEnd - objStart + 1);
        pos = objEnd + 1;

        Station s;
        s.id = 0; s.lat = 0; s.lon = 0;

        auto extractInt = [&](const std::string& key) -> int {
            std::string needle = "\"" + key + "\":";
            size_t p = obj.find(needle);
            if (p == std::string::npos) return 0;
            p += needle.size();
            while (p < obj.size() && (obj[p] == ' ')) ++p;
            return std::stoi(obj.substr(p));
        };

        auto extractDouble = [&](const std::string& key) -> double {
            std::string needle = "\"" + key + "\":";
            size_t p = obj.find(needle);
            if (p == std::string::npos) return 0.0;
            p += needle.size();
            while (p < obj.size() && (obj[p] == ' ')) ++p;
            size_t end = obj.find_first_of(",}", p);
            return std::stod(obj.substr(p, end - p));
        };

        s.id  = extractInt("id");
        s.lat = extractDouble("lat");
        s.lon = extractDouble("lon");

        if (s.id != 0 && s.lat != 0.0 && s.lon != 0.0)
            stations.push_back(s);
    }

    return stations;
}

inline std::vector<StopZone> stationsToStopZones(const StationList& stations) {
    std::vector<StopZone> zones;
    zones.reserve(stations.size());
    for (const auto& s : stations) {
        zones.push_back({ s.id, s.lat, s.lon, 40.0 });
    }
    return zones;
}

inline std::vector<StopZone> findNearbyStops(
    const std::vector<StopZone>& allStops,
    const std::vector<Waypoint>& waypoints,
    double maxDistM = 200.0)
{
    std::vector<StopZone> nearby;
    constexpr double R = 6'371'000.0;
    constexpr double TO_RAD = 3.14159265358979323846 / 180.0;

    for (const auto& stop : allStops) {
        for (size_t i = 0; i < waypoints.size(); i += 10) {
            double dLat = (stop.lat - waypoints[i].lat) * TO_RAD;
            double dLon = (stop.lon - waypoints[i].lon) * TO_RAD;
            double a = std::sin(dLat/2)*std::sin(dLat/2)
                     + std::cos(waypoints[i].lat*TO_RAD)*std::cos(stop.lat*TO_RAD)
                     * std::sin(dLon/2)*std::sin(dLon/2);
            double d = R * 2.0 * std::asin(std::sqrt(a));
            if (d < maxDistM) {
                nearby.push_back(stop);
                break;
            }
        }
    }
    return nearby;
}

#endif // STATION_LOADER_H
