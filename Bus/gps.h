#ifndef GPS_H
#define GPS_H

#include <string>
#include <thread>
#include <vector>
#include <atomic>
#ifndef _USE_MATH_DEFINES
#define _USE_MATH_DEFINES
#endif
#include <cmath>
#include "route_loader.h"
#include "types.h"
#include "speed_sim.h"
#include "edge_geo.h"

class Sender;
class Database;

struct EdgeFilterState {
    double  lastSentLat        = 0.0;
    double  lastSentLon        = 0.0;
    double  lastSentSpeed      = 0.0;
    int64_t lastSentTimestamp  = 0;
    int     ticksSinceLastSend = 0;

    static constexpr double MIN_DISTANCE_M         = 5.0;
    static constexpr double SPEED_CHANGE_THRESHOLD = 3.0;
    static constexpr int    HEARTBEAT_TICKS        = 10;
};

inline double haversineM(double lat1, double lon1, double lat2, double lon2) {
    constexpr double R      = 6'371'000.0;
    constexpr double TO_RAD = 3.14159265358979323846 / 180.0;
    double dLat = (lat2 - lat1) * TO_RAD;
    double dLon = (lon2 - lon1) * TO_RAD;
    double a = std::sin(dLat / 2.0) * std::sin(dLat / 2.0)
             + std::cos(lat1 * TO_RAD) * std::cos(lat2 * TO_RAD)
             * std::sin(dLon / 2.0) * std::sin(dLon / 2.0);
    return R * 2.0 * std::asin(std::sqrt(a));
}

class GPS {
public:
    GPS();
    ~GPS();

    void setRoute(int route_id,
                  const std::vector<Waypoint>& waypoints,
                  int start_index,
                  int vehicle_id,
                  Sender&   sender,
                  Database& db);

    void setStops(const std::vector<StopZone>& stops);
    void setRouteGraph(const RouteGraph& graph);

    void start();
    void stop();

private:
    int                   route_id_;
    std::vector<Waypoint> waypoints_;
    int                   wp_index_;
    std::atomic<bool>     running_;
    std::string           vehicle_id_str_;

    Sender*   sender_;
    Database* db_;

    EdgeFilterState  filter_;
    SpeedSimulator   speedSim_;
    RouteGraph       routeGraph_;
    bool             hasRouteGraph_ = false;

    GPSData buildSnapshot(const SpeedSimulator::TickResult& tick);
};

#endif // GPS_H