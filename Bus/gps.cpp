#include "gps.h"
#include "sender.h"
#include "database.h"
#include "runtime_config.h"
#include <chrono>
#include <cstdlib>
#include <ctime>

GPS::GPS()
    : route_id_(0), wp_index_(0), running_(false), sender_(nullptr), db_(nullptr) {}

GPS::~GPS() {
    stop();
}

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

void GPS::setStops(const std::vector<StopZone>& stops) {
    speedSim_.setStops(stops);
}

void GPS::start() {
    if (waypoints_.empty()) return;

    running_ = true;
    constexpr double DT = 3.0;

    while (running_) {
        const Waypoint& wp = waypoints_[wp_index_];
        int nextIdx = (wp_index_ + 1) % (int)waypoints_.size();
        const Waypoint& nextWp = waypoints_[nextIdx];

        auto tick = speedSim_.tick(wp.lat, wp.lon, nextWp.lat, nextWp.lon, DT);
        GPSData data = buildSnapshot(tick);

        if (kEnableLocalDatabase && db_)
            db_->insertGPSData(data);

        bool isFirst   = (filter_.lastSentTimestamp == 0);
        double dist    = isFirst ? 9999.0
                                 : haversineM(data.latitude, data.longitude,
                                              filter_.lastSentLat, filter_.lastSentLon);
        double speedDelta = std::abs(data.speed - filter_.lastSentSpeed);
        bool heartbeat = (filter_.ticksSinceLastSend >= EdgeFilterState::HEARTBEAT_TICKS);
        bool hasAnomaly = !tick.anomalies.empty();
        bool hasStopEvent = !tick.stopEvent.empty();

        bool shouldSend =
            isFirst
            || dist       > EdgeFilterState::MIN_DISTANCE_M
            || speedDelta > EdgeFilterState::SPEED_CHANGE_THRESHOLD
            || heartbeat
            || hasAnomaly
            || hasStopEvent;

        if (shouldSend) {
            if (sender_)
                sender_->enqueueGPS(data);

            filter_.lastSentLat       = data.latitude;
            filter_.lastSentLon       = data.longitude;
            filter_.lastSentSpeed     = data.speed;
            filter_.lastSentTimestamp = data.timestamp;
            filter_.ticksSinceLastSend = 0;
        } else {
            filter_.ticksSinceLastSend++;
        }

        wp_index_ = nextIdx;
        std::this_thread::sleep_for(std::chrono::seconds(3));
    }
}

void GPS::stop() {
    running_ = false;
}

GPSData GPS::buildSnapshot(const SpeedSimulator::TickResult& tick) {
    const Waypoint& wp = waypoints_[wp_index_];

    GPSData d;
    d.vehicle_id    = vehicle_id_str_;
    d.route         = route_id_;
    d.latitude      = wp.lat;
    d.longitude     = wp.lon;
    d.speed         = tick.speed;
    d.heading       = tick.heading;
    d.timestamp     = std::time(nullptr);
    d.synced        = 0;
    d.edgeAnomalies = tick.anomalies;
    d.stopEvent     = tick.stopEvent;
    d.stopEventId   = tick.stopEventId;
    d.dwellSeconds  = tick.dwellSeconds;
    return d;
}