#ifndef TRANSIT_GRAPH_LOADER_H
#define TRANSIT_GRAPH_LOADER_H

#include <fstream>
#include <sstream>
#include <string>
#include <map>
#include <vector>
#include <iostream>
#include "edge_geo.h"

using TransitGraphMap = std::map<int, RouteGraph>;

namespace tg_detail {

inline void skipWS(const std::string& s, size_t& p) {
    while (p < s.size() && (s[p]==' '||s[p]=='\t'||s[p]=='\n'||s[p]=='\r')) ++p;
}

inline void expect(const std::string& s, size_t& p, char c) {
    skipWS(s, p);
    if (p < s.size() && s[p] == c) ++p;
}

inline std::string readString(const std::string& s, size_t& p) {
    skipWS(s, p);
    if (p >= s.size() || s[p] != '"') return "";
    ++p;
    std::string r;
    while (p < s.size() && s[p] != '"') r += s[p++];
    if (p < s.size()) ++p;
    return r;
}

inline double readNumber(const std::string& s, size_t& p) {
    skipWS(s, p);
    size_t start = p;
    if (p < s.size() && (s[p] == '-' || s[p] == '+')) ++p;
    while (p < s.size() && (std::isdigit(s[p]) || s[p] == '.' || s[p] == 'e' || s[p] == 'E' || s[p] == '+' || s[p] == '-')) ++p;
    if (p == start) return 0;
    return std::stod(s.substr(start, p - start));
}

inline void skipValue(const std::string& s, size_t& p) {
    skipWS(s, p);
    if (p >= s.size()) return;
    if (s[p] == '"') { readString(s, p); return; }
    if (s[p] == '{') {
        int depth = 1; ++p;
        while (p < s.size() && depth > 0) {
            if (s[p] == '{') ++depth;
            else if (s[p] == '}') --depth;
            else if (s[p] == '"') { readString(s, p); continue; }
            ++p;
        }
        return;
    }
    if (s[p] == '[') {
        int depth = 1; ++p;
        while (p < s.size() && depth > 0) {
            if (s[p] == '[') ++depth;
            else if (s[p] == ']') --depth;
            else if (s[p] == '"') { readString(s, p); continue; }
            ++p;
        }
        return;
    }
    while (p < s.size() && s[p] != ',' && s[p] != '}' && s[p] != ']') ++p;
}

inline std::vector<double> readNumberArray(const std::string& s, size_t& p) {
    std::vector<double> arr;
    skipWS(s, p);
    if (p >= s.size() || s[p] != '[') return arr;
    ++p;
    while (p < s.size()) {
        skipWS(s, p);
        if (s[p] == ']') { ++p; break; }
        arr.push_back(readNumber(s, p));
        skipWS(s, p);
        if (s[p] == ',') ++p;
    }
    return arr;
}

inline RouteStop readStop(const std::string& s, size_t& p) {
    RouteStop stop{};
    skipWS(s, p);
    expect(s, p, '{');
    while (p < s.size() && s[p] != '}') {
        skipWS(s, p);
        if (s[p] == '}') break;
        std::string key = readString(s, p);
        skipWS(s, p); expect(s, p, ':');

        if (key == "id") stop.id = (int)readNumber(s, p);
        else if (key == "lat") stop.lat = readNumber(s, p);
        else if (key == "lon") stop.lon = readNumber(s, p);
        else if (key == "dist_along_route") stop.distAlongRoute = readNumber(s, p);
        else skipValue(s, p);

        skipWS(s, p);
        if (s[p] == ',') ++p;
    }
    expect(s, p, '}');
    return stop;
}

} // namespace tg_detail

inline TransitGraphMap loadTransitGraph(const std::string& path) {
    TransitGraphMap result;

    std::ifstream file(path);
    if (!file.is_open()) {
        std::cerr << "[TransitGraph] Could not open " << path << "\n";
        return result;
    }

    std::string content((std::istreambuf_iterator<char>(file)),
                         std::istreambuf_iterator<char>());

    size_t p = 0;
    using namespace tg_detail;

    // Find "routes" array
    size_t routesPos = content.find("\"routes\"", p);
    if (routesPos == std::string::npos) return result;
    p = routesPos + 8;
    skipWS(content, p); expect(content, p, ':');
    skipWS(content, p); expect(content, p, '[');

    while (p < content.size()) {
        skipWS(content, p);
        if (content[p] == ']') break;

        RouteGraph graph{};
        expect(content, p, '{');

        while (p < content.size() && content[p] != '}') {
            skipWS(content, p);
            if (content[p] == '}') break;
            std::string key = readString(content, p);
            skipWS(content, p); expect(content, p, ':');

            if (key == "id") {
                graph.routeId = (int)readNumber(content, p);
            }
            else if (key == "total_distance_m") {
                graph.totalDistanceM = readNumber(content, p);
            }
            else if (key == "cumulative_dist") {
                graph.cumulativeDist = readNumberArray(content, p);
            }
            else if (key == "stops") {
                skipWS(content, p); expect(content, p, '[');
                while (p < content.size()) {
                    skipWS(content, p);
                    if (content[p] == ']') { ++p; break; }
                    graph.stops.push_back(readStop(content, p));
                    skipWS(content, p);
                    if (content[p] == ',') ++p;
                }
            }
            else {
                skipValue(content, p);
            }

            skipWS(content, p);
            if (content[p] == ',') ++p;
        }
        expect(content, p, '}');

        if (graph.routeId > 0) {
            result[graph.routeId] = std::move(graph);
        }

        skipWS(content, p);
        if (content[p] == ',') ++p;
    }

    return result;
}

#endif // TRANSIT_GRAPH_LOADER_H
