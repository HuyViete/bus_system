#include "gps.h"
#include <chrono>

GPS::GPS()
    : route_id(0), wp_index(0), running(false) {}

GPS::~GPS() {
    stop();
}

void GPS::setRoute(int rid,
                   const std::vector<Waypoint>& wps,
                   int start_index) {
    route_id       = rid;
    waypoints      = wps;
    wp_index       = (waypoints.empty()) ? 0 : (start_index % (int)waypoints.size());
    vehicle_id_str = "BUS-" + std::to_string(rid);
}

void GPS::start() {
    running = true;
    while (running) {
        getLocation();
        std::this_thread::sleep_for(std::chrono::seconds(1));
    }
}

void GPS::stop() {
    running = false;
}

void GPS::getLocation() {
    if (waypoints.empty()) return;

    const Waypoint& wp = waypoints[wp_index];

    GPSData data;
    data.vehicle_id = vehicle_id_str;
    data.route      = route_id;
    data.latitude   = wp.lat;
    data.longitude  = wp.lon;
    data.speed      = 20.0 + (std::rand() % 200) / 10.0;   // 20-40 km/h
    data.heading    = std::rand() % 360;
    data.timestamp  = std::time(nullptr);
    data.synced     = 0;

    // std::cout << "[GPS " << vehicle_id_str << "] "
    //           << "wp " << wp_index << "/" << waypoints.size() - 1
    //           << " -> Lat " << data.latitude
    //           << ", Lon " << data.longitude
    //           << ", Speed " << data.speed << " km/h"
    //           << std::endl;

    // Advance to next waypoint (loop back to start when route ends)
    wp_index = (wp_index + 1) % (int)waypoints.size();
}

void GPS::sendGPSData(GPSData& data) {
    // Left for later implementation
}