#ifndef ROUTE_LOADER_H
#define ROUTE_LOADER_H

#include <string>
#include <vector>
#include <map>
#include <fstream>
#include <sstream>
#include <iostream>
#include <stdexcept>

struct Waypoint {
    double lat;
    double lon;
};

// route_ref (numeric, e.g. 1, 3, 57) -> ordered list of waypoints
using RouteMap = std::map<int, std::vector<Waypoint>>;

// ─────────────────────────────────────────────────────────────────────────────
//  Minimal hand-rolled JSON tokenizer — no external dependencies.
//
//  The routes.json format produced by the frontend tool is:
//    [ { "id":"13753989", "ref":"01", "name":"...", "color":[...],
//        "path":[[lon,lat],[lon,lat], ...] }, ... ]
//
//  Key facts used by the parser:
//   • "ref" holds the human-readable route number (e.g. "01", "31").
//     We parse it as an integer (01 → 1, 31 → 31) to use as the map key.
//   • "path" is an array of [lon, lat] pairs  (GeoJSON ordering).
//   • Multiple objects may share the same "ref" — we build a single unified
//     waypoint list per ref by appending all their paths.
//
//  The parser is a simple state machine over raw characters; it does NOT need
//  to handle the full JSON spec (no escape sequences in field names, no nulls).
// ─────────────────────────────────────────────────────────────────────────────

namespace detail {

// Advance pos past whitespace.
inline void skipWS(const std::string& s, size_t& pos) {
    while (pos < s.size() && (s[pos]==' '||s[pos]=='\t'||s[pos]=='\n'||s[pos]=='\r'))
        ++pos;
}

// Read a JSON string (starts with '"' at pos).  Returns content, advances pos past closing '"'.
inline std::string readString(const std::string& s, size_t& pos) {
    if (pos >= s.size() || s[pos] != '"') return "";
    ++pos; // skip opening "
    std::string result;
    while (pos < s.size() && s[pos] != '"') {
        if (s[pos] == '\\') { ++pos; } // skip escape char, take next literally
        if (pos < s.size()) result += s[pos++];
    }
    if (pos < s.size()) ++pos; // skip closing "
    return result;
}

// Read a JSON number (double) starting at pos, advances pos past the number.
inline double readNumber(const std::string& s, size_t& pos) {
    size_t start = pos;
    if (pos < s.size() && (s[pos]=='-'||s[pos]=='+')) ++pos;
    while (pos < s.size() && (std::isdigit((unsigned char)s[pos])||s[pos]=='.'||s[pos]=='e'||s[pos]=='E'||s[pos]=='+'||s[pos]=='-'))
        ++pos;
    try { return std::stod(s.substr(start, pos - start)); }
    catch (...) { return 0.0; }
}

// Skip any JSON value (string, number, array, object) at pos.
void skipValue(const std::string& s, size_t& pos);

inline void skipObject(const std::string& s, size_t& pos) {
    if (pos >= s.size() || s[pos] != '{') return;
    ++pos;
    int depth = 1;
    while (pos < s.size() && depth > 0) {
        char c = s[pos++];
        if (c == '"') { // skip string content
            while (pos < s.size() && s[pos] != '"') {
                if (s[pos] == '\\') ++pos;
                ++pos;
            }
            if (pos < s.size()) ++pos;
        } else if (c == '{') ++depth;
        else if (c == '}') --depth;
    }
}

inline void skipArray(const std::string& s, size_t& pos) {
    if (pos >= s.size() || s[pos] != '[') return;
    ++pos;
    int depth = 1;
    while (pos < s.size() && depth > 0) {
        char c = s[pos++];
        if (c == '"') {
            while (pos < s.size() && s[pos] != '"') {
                if (s[pos] == '\\') ++pos;
                ++pos;
            }
            if (pos < s.size()) ++pos;
        } else if (c == '[') ++depth;
        else if (c == ']') --depth;
    }
}

inline void skipValue(const std::string& s, size_t& pos) {
    skipWS(s, pos);
    if (pos >= s.size()) return;
    char c = s[pos];
    if (c == '"')      readString(s, pos);
    else if (c == '{') skipObject(s, pos);
    else if (c == '[') skipArray(s, pos);
    else {
        // number / true / false / null
        while (pos < s.size() && s[pos]!=','&&s[pos]!=']'&&s[pos]!='}'&&s[pos]!='\n')
            ++pos;
    }
}

// Parse the "path" array: [[lon,lat],[lon,lat],...] into waypoints.
inline std::vector<Waypoint> parsePath(const std::string& s, size_t& pos) {
    std::vector<Waypoint> wps;
    skipWS(s, pos);
    if (pos >= s.size() || s[pos] != '[') return wps;
    ++pos; // skip outer [

    while (pos < s.size()) {
        skipWS(s, pos);
        if (pos >= s.size()) break;
        if (s[pos] == ']') { ++pos; break; }  // end of path array
        if (s[pos] == ',') { ++pos; continue; }

        // Expect [lon, lat]
        if (s[pos] == '[') {
            ++pos;
            skipWS(s, pos);
            double lon = readNumber(s, pos);
            skipWS(s, pos);
            if (pos < s.size() && s[pos] == ',') ++pos;
            skipWS(s, pos);
            double lat = readNumber(s, pos);
            skipWS(s, pos);
            if (pos < s.size() && s[pos] == ']') ++pos;
            wps.push_back({lat, lon});
        } else {
            ++pos; // unexpected char, skip
        }
    }
    return wps;
}

// Parse one route object { "id":..., "ref":"01", "name":..., "color":..., "path":[...] }
// Returns the ref as an int and fills wps.  Returns -1 on parse error.
inline int parseRouteObject(const std::string& s, size_t& pos,
                             std::vector<Waypoint>& wps) {
    int ref = -1;
    wps.clear();

    skipWS(s, pos);
    if (pos >= s.size() || s[pos] != '{') return -1;
    ++pos;

    while (pos < s.size()) {
        skipWS(s, pos);
        if (pos >= s.size()) break;
        if (s[pos] == '}') { ++pos; break; }
        if (s[pos] == ',') { ++pos; continue; }

        // Expect "key": value
        if (s[pos] != '"') { ++pos; continue; }
        std::string key = readString(s, pos);
        skipWS(s, pos);
        if (pos < s.size() && s[pos] == ':') ++pos;
        skipWS(s, pos);

        if (key == "ref") {
            std::string refStr = readString(s, pos);
            try { ref = std::stoi(refStr); } catch(...) { ref = -1; }
        } else if (key == "path") {
            wps = parsePath(s, pos);
        } else {
            skipValue(s, pos);
        }
    }
    return ref;
}

} // namespace detail

// ─────────────────────────────────────────────────────────────────────────────
//  Public API — drop-in replacement for the old loadRoutes(csv_path).
// ─────────────────────────────────────────────────────────────────────────────
inline RouteMap loadRoutes(const std::string& json_path) {
    RouteMap routes;

    std::ifstream file(json_path, std::ios::binary);
    if (!file.is_open()) {
        std::cerr << "[RouteLoader] Cannot open " << json_path << "\n";
        return routes;
    }

    // Read entire file into memory (routes.json is ~6 MB — fits easily in RAM)
    std::string content((std::istreambuf_iterator<char>(file)),
                         std::istreambuf_iterator<char>());
    file.close();

    size_t pos = 0;
    detail::skipWS(content, pos);

    // Expect outer array [
    if (pos >= content.size() || content[pos] != '[') {
        std::cerr << "[RouteLoader] Expected JSON array at start of file\n";
        return routes;
    }
    ++pos;

    while (pos < content.size()) {
        detail::skipWS(content, pos);
        if (pos >= content.size()) break;
        if (content[pos] == ']') { ++pos; break; }
        if (content[pos] == ',') { ++pos; continue; }

        if (content[pos] == '{') {
            std::vector<Waypoint> wps;
            int ref = detail::parseRouteObject(content, pos, wps);
            if (ref > 0 && !wps.empty()) {
                // Multiple objects with the same ref share one waypoint list
                auto& dest = routes[ref];
                dest.insert(dest.end(), wps.begin(), wps.end());
            }
        } else {
            detail::skipValue(content, pos);
        }
    }

    std::cout << "[RouteLoader] Loaded " << routes.size()
              << " routes from " << json_path << "\n";
    return routes;
}

#endif // ROUTE_LOADER_H
