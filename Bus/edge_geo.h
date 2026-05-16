#ifndef EDGE_GEO_H
#define EDGE_GEO_H

#include <vector>
#include <cmath>
#include <string>
#include <algorithm>

struct RouteStop {
    int    id;
    double lat;
    double lon;
    double distAlongRoute;
};

struct RouteGraph {
    int                  routeId;
    double               totalDistanceM;
    std::vector<double>  cumulativeDist;
    std::vector<RouteStop> stops;
};

struct DistanceResult {
    double distAlongRoute;
    int    nextStopId;
    double distToNextStop;
    int    prevStopId;
    double distFromPrevStop;
};

inline DistanceResult computeDistances(const RouteGraph& graph, int wpIndex) {
    DistanceResult r;
    r.distAlongRoute  = 0;
    r.nextStopId      = -1;
    r.distToNextStop  = -1;
    r.prevStopId      = -1;
    r.distFromPrevStop = -1;

    if (graph.cumulativeDist.empty() || wpIndex < 0) return r;

    int idx = std::min(wpIndex, (int)graph.cumulativeDist.size() - 1);
    r.distAlongRoute = graph.cumulativeDist[idx];

    for (int i = 0; i < (int)graph.stops.size(); ++i) {
        if (graph.stops[i].distAlongRoute > r.distAlongRoute) {
            r.nextStopId     = graph.stops[i].id;
            r.distToNextStop = graph.stops[i].distAlongRoute - r.distAlongRoute;
            break;
        }
    }

    for (int i = (int)graph.stops.size() - 1; i >= 0; --i) {
        if (graph.stops[i].distAlongRoute <= r.distAlongRoute) {
            r.prevStopId       = graph.stops[i].id;
            r.distFromPrevStop = r.distAlongRoute - graph.stops[i].distAlongRoute;
            break;
        }
    }

    return r;
}

inline double distBetweenStops(const RouteGraph& graph, int fromStopId, int toStopId) {
    double fromDist = -1, toDist = -1;
    for (const auto& s : graph.stops) {
        if (s.id == fromStopId) fromDist = s.distAlongRoute;
        if (s.id == toStopId)   toDist   = s.distAlongRoute;
        if (fromDist >= 0 && toDist >= 0) break;
    }
    if (fromDist < 0 || toDist < 0) return -1;
    return std::abs(toDist - fromDist);
}

#endif // EDGE_GEO_H
