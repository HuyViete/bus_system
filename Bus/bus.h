#ifndef BUS_H
#define BUS_H

#include <iostream>
#include "receiver.h"
#include "sender.h"
#include "database.h"
#include "gps.h"    

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
    Bus(int vehicle_id, int route, int current_station);
    ~Bus();

    void start();
    void stop();
};

#endif // BUS_H
