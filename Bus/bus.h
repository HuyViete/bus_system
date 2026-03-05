#ifndef BUS_H
#define BUS_H

#include <iostream>
#include <vector>
#include "receiver.h"
#include "sender.h"
#include "database.h"
#include "gps.h"
#include "route_loader.h"

class Bus {
private:
    int vehicle_id;
    int route;
    int current_station;

    Database db;
    Receiver receiver;
    Sender sender;
    GPS gps;
public:
    // waypoints   : the ordered GPS path for this route (from routes.csv)
    // start_index : which waypoint this bus starts from (spread across route)
    Bus(int vehicle_id, int route, int current_station,
        const std::vector<Waypoint>& waypoints, int start_index);
    ~Bus();

    void start();
    void stop();
};

#endif // BUS_H
