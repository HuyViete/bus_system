#include "bus.h"
#include <thread>

Bus::Bus(int vehicle_id, int route, int current_station,
         const std::vector<Waypoint>& waypoints, int start_index)
    : vehicle_id(vehicle_id), route(route), current_station(current_station),
      db(), receiver(), sender(), gps() {
        gps.setRoute(route, waypoints, start_index);
        start();
}

Bus::~Bus() {
    stop();
}

void Bus::start() {
    db.open();
    
    std::thread receiverThread(&Receiver::startServer, &receiver, 8080);
    receiverThread.detach();

    std::thread senderThread(&Sender::start, &sender);
    senderThread.detach();

    std::thread gpsThread(&GPS::start, &gps);
    gpsThread.detach();
}

void Bus::stop() {
    receiver.stop();
    sender.stop();
    db.close();
    gps.stop();
}
