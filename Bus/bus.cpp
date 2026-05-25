#include "bus.h"

#include <iostream>

#include "runtime_config.h"


Bus::Bus(int vehicle_id, int route_id, const std::vector<Waypoint>& waypoints, int start_index,
         const std::string& server_host, int data_port, int cmd_port, const std::vector<StopZone>& stops,
         const RouteGraph* routeGraph)
    : vehicle_id_(vehicle_id), route_id_(route_id), sender_(), receiver_(), gps_(), db_() {
    start(server_host, data_port, cmd_port, waypoints, start_index, stops, routeGraph);
}

Bus::~Bus() { stop(); }

void Bus::start(const std::string& host, int data_port, int cmd_port, const std::vector<Waypoint>& waypoints,
                int start_index, const std::vector<StopZone>& stops, const RouteGraph* routeGraph) {
    if (kVerboseBusLogs) std::cout << "[Bus " << vehicle_id_ << "] Starting on route " << route_id_ << "\n";

    if (kEnableLocalDatabase) db_.open("BUS-" + std::to_string(vehicle_id_));

    sender_.start(host, data_port);
    receiver_.start(host, cmd_port);

    gps_.setRoute(route_id_, waypoints, start_index, vehicle_id_, sender_, db_);
    gps_.setStops(stops);
    if (routeGraph) gps_.setRouteGraph(*routeGraph);

    gps_thread_ = std::thread(&GPS::start, &gps_);

    if (kVerboseBusLogs) std::cout << "[Bus " << vehicle_id_ << "] All systems running.\n";
}

void Bus::stop() {
    if (kVerboseBusLogs) std::cout << "[Bus " << vehicle_id_ << "] Stopping...\n";

    gps_.stop();
    if (gps_thread_.joinable()) gps_thread_.join();

    GPSData offlineData;
    offlineData.vehicle_id = std::to_string(vehicle_id_);
    offlineData.route = route_id_;
    offlineData.status = "offline";
    offlineData.timestamp = std::time(nullptr);
    sender_.enqueueGPS(offlineData);
    std::this_thread::sleep_for(std::chrono::milliseconds(50));

    sender_.stop();
    receiver_.stop();

    if (kEnableLocalDatabase) db_.close();

    if (kVerboseBusLogs) std::cout << "[Bus " << vehicle_id_ << "] Stopped.\n";
}
