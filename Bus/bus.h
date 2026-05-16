#ifndef BUS_H
#define BUS_H

#include <vector>
#include <thread>
#include <string>
#include "receiver.h"
#include "sender.h"
#include "database.h"
#include "gps.h"
#include "route_loader.h"
#include "speed_sim.h"

class Bus {
public:
    Bus(int vehicle_id,
        int route_id,
        const std::vector<Waypoint>& waypoints,
        int start_index,
        const std::string& server_host,
        int data_port,
        int cmd_port,
        const std::vector<StopZone>& stops = {});

    ~Bus();
    void stop();

private:
    int vehicle_id_;
    int route_id_;

    Sender   sender_;
    Receiver receiver_;
    GPS      gps_;
    Database db_;

    std::thread gps_thread_;

    void start(const std::string& host, int data_port, int cmd_port,
               const std::vector<Waypoint>& waypoints, int start_index,
               const std::vector<StopZone>& stops);
};

#endif // BUS_H
