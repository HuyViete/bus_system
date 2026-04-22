#ifndef GPS_H
#define GPS_H

#include <iostream>
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

// Forward-declare Sender so GPS can call it without a circular include.
class Sender;
// Forward-declare Database for the same reason.
class Database;

struct EdgeFilterState {
    double  lastSentLat        = 0.0;
    double  lastSentLon        = 0.0;
    double  lastSentSpeed      = 0.0;
    int64_t lastSentTimestamp  = 0;    // 0 = never sent yet
    int     ticksSinceLastSend = 0;

    // Thresholds — adjust here and rebuild; no other files need to change.
    static constexpr double MIN_DISTANCE_M         = 5.0;   // metres
    static constexpr double SPEED_CHANGE_THRESHOLD = 3.0;   // km/h
    static constexpr int    HEARTBEAT_TICKS        = 10;    // ticks (10 x 3s = 30s)
};

struct EdgeAnomalyDetector {
    double prevSpeed = 0.0;

    struct Anomaly {
        std::string type;   // "hard_brake" | "speeding"
    };

    std::vector<Anomaly> check(double speed) {
        std::vector<Anomaly> found;
        double drop = prevSpeed - speed;
        if (prevSpeed > 0.0 && drop >= 20.0)
            found.push_back({"hard_brake"});
        if (speed > 80.0)
            found.push_back({"speeding"});
        prevSpeed = speed;
        return found;
    }
};

inline double haversineM(double lat1, double lon1, double lat2, double lon2) {
    constexpr double R      = 6'371'000.0;    // Earth radius in metres
    constexpr double TO_RAD = 3.14159265358979323846 / 180.0;
    double dLat = (lat2 - lat1) * TO_RAD;
    double dLon = (lon2 - lon1) * TO_RAD;
    double a = std::sin(dLat / 2.0) * std::sin(dLat / 2.0)
             + std::cos(lat1 * TO_RAD) * std::cos(lat2 * TO_RAD)
             * std::sin(dLon / 2.0) * std::sin(dLon / 2.0);
    return R * 2.0 * std::asin(std::sqrt(a));
}

// =============================================================================
//  GPS
//  Responsibility: Walk along the assigned route waypoints every 3 seconds,
//  apply edge filtering and anomaly detection, and hand qualifying snapshots
//  to the Sender for transmission.
//
//  The GPS object does NOT own a thread. The Bus creates and runs the thread;
//  GPS just exposes start() and stop() for clean lifecycle control.
// =============================================================================
class GPS {
public:
    GPS();
    ~GPS();

    // Inject route data plus non-owning references to the Sender and Database.
    // Must be called BEFORE start().
    void setRoute(int route_id,
                  const std::vector<Waypoint>& waypoints,
                  int start_index,
                  int vehicle_id,
                  Sender&   sender,
                  Database& db);

    // Blocking loop: advances waypoints every 3 seconds, applies edge filter,
    // and calls sender.enqueueGPS() only for qualifying snapshots.
    // Meant to be run on a dedicated std::thread owned by Bus.
    void start();

    // Signal the loop to exit cleanly on the next iteration.
    void stop();

private:
    int                   route_id_;
    std::vector<Waypoint> waypoints_;
    int                   wp_index_;
    std::atomic<bool>     running_;
    std::string           vehicle_id_str_;

    Sender*   sender_;   // non-owning: Bus guarantees Sender outlives GPS
    Database* db_;       // non-owning: Bus guarantees Database outlives GPS

    // Per-instance edge intelligence — one filter and one anomaly detector
    // per bus, so each bus tracks its own movement state independently.
    EdgeFilterState     filter_;
    EdgeAnomalyDetector anomaly_;

    GPSData buildSnapshot();
};

#endif // GPS_H