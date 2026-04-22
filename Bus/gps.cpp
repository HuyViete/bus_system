#include "gps.h"
#include "sender.h"
#include "database.h"
#include "runtime_config.h"
#include <chrono>
#include <cstdlib>
#include <ctime>
#include <sstream>

GPS::GPS()
    : route_id_(0), wp_index_(0), running_(false), sender_(nullptr), db_(nullptr) {}

GPS::~GPS() {
    stop();
}

// ─────────────────────────────────────────────────────────────────────────────
//  setRoute() — Dependency Injection
//  GPS borrows non-owning pointers to the Sender and Database.
//  Bus owns both and guarantees they outlive GPS.
// ─────────────────────────────────────────────────────────────────────────────
void GPS::setRoute(int rid,
                   const std::vector<Waypoint>& wps,
                   int start_index,
                   int vehicle_id,
                   Sender&   sender,
                   Database& db)
{
    route_id_       = rid;
    waypoints_      = wps;
    wp_index_       = waypoints_.empty() ? 0 : (start_index % (int)waypoints_.size());
    vehicle_id_str_ = std::to_string(vehicle_id);
    sender_         = &sender;
    db_             = &db;
}

// ─────────────────────────────────────────────────────────────────────────────
//  start() — the main GPS loop (runs on its own thread)
//
//  TICK RATE: 3 seconds.
//  Every tick the bus computes its current position and runs it through the
//  edge filter. Only packets that pass the filter are serialised and sent.
//
//  FILTER DECISION (see EdgeFilterState in gps.h for full rationale):
//
//   SEND if ANY of:
//     A) First packet ever             → registers bus on server
//     B) Moved > 5 m                  → meaningful position change
//     C) Speed changed > 3 km/h       → acceleration / braking event
//     D) 30 seconds elapsed (10 ticks)→ heartbeat so bus stays on live map
//     E) Anomaly detected             → speeding is always sent immediately
//
//   DROP (silent) if none of the above.
//
//  ANOMALY PRE-DETECTION:
//  Before the filter decision, the EdgeAnomalyDetector checks for hard brakes
//  and speeding. Anomalies are attached to the packet as "edge_anomalies" so
//  the server can skip its own redundant check for those two types.
//  Note: speeding forces a send even if the bus hasn't moved 5 m.
// ─────────────────────────────────────────────────────────────────────────────
void GPS::start() {
    if (waypoints_.empty()) {
        std::cerr << "[GPS " << vehicle_id_str_ << "] No waypoints — exiting.\n";
        return;
    }

    running_ = true;

    while (running_) {

        GPSData data = buildSnapshot();

        auto anomalies = anomaly_.check(data.speed);
        bool hasAnomaly = !anomalies.empty();

        bool isFirst   = (filter_.lastSentTimestamp == 0);
        double dist    = isFirst ? 9999.0
                                 : haversineM(data.latitude, data.longitude,
                                              filter_.lastSentLat, filter_.lastSentLon);
        double speedDelta = std::abs(data.speed - filter_.lastSentSpeed);
        bool heartbeat = (filter_.ticksSinceLastSend >= EdgeFilterState::HEARTBEAT_TICKS);

        bool shouldSend =
            isFirst                                          // A
            || dist      > EdgeFilterState::MIN_DISTANCE_M  // B
            || speedDelta> EdgeFilterState::SPEED_CHANGE_THRESHOLD // C
            || heartbeat                                     // D
            || hasAnomaly;                                   // E (speeding / hard_brake)

        if (shouldSend) {
            if (kEnableLocalDatabase && db_)
                db_->insertGPSData(data);

            data.edgeAnomalies.clear();
            for (const auto& a : anomalies)
                data.edgeAnomalies.push_back(a.type);
            //        The Sender's serializeGPS reads data.edgeAnomalies if set.
            data.edgeAnomalies.clear();
            for (const auto& a : anomalies)
                data.edgeAnomalies.push_back(a.type);

            // ── 4c. Hand to Sender queue (non-blocking from GPS perspective) ──
            if (sender_)
                sender_->enqueueGPS(data);

            // ── 4d. Update filter state ───────────────────────────────────────
            filter_.lastSentLat       = data.latitude;
            filter_.lastSentLon       = data.longitude;
            filter_.lastSentSpeed     = data.speed;
            filter_.lastSentTimestamp = data.timestamp;
            filter_.ticksSinceLastSend = 0;

        } else {
            // ── 4b. Packet dropped — just increment the silent-tick counter ───
            filter_.ticksSinceLastSend++;
        }

        // ── 5. Advance to next waypoint (wraps around at route end) ──────────
        wp_index_ = (wp_index_ + 1) % (int)waypoints_.size();

        // ── 6. Sleep 3 seconds before next tick ──────────────────────────────
        std::this_thread::sleep_for(std::chrono::seconds(3));
    }
}

void GPS::stop() {
    running_ = false;
    // No join here — Bus owns the thread and is responsible for joining it.
}

// ─────────────────────────────────────────────────────────────────────────────
//  buildSnapshot() — assemble a GPSData struct from the current waypoint.
// ─────────────────────────────────────────────────────────────────────────────
GPSData GPS::buildSnapshot() {
    const Waypoint& wp = waypoints_[wp_index_];

    GPSData d;
    d.vehicle_id = vehicle_id_str_;
    d.route      = route_id_;
    d.latitude   = wp.lat;
    d.longitude  = wp.lon;
    d.speed      = 20.0 + (std::rand() % 200) / 10.0;  // 20 – 40 km/h
    d.heading    = std::rand() % 360;
    d.timestamp  = std::time(nullptr);
    d.synced     = 0;
    return d;
}