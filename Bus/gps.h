#ifndef GPS_H
#define GPS_H

#include <iostream>
#include <string>
#include <thread>
#include <vector>
#include "route_loader.h"
#include "types.h"

class GPS {
public:
    GPS();
    ~GPS();

    // Must be called before start() to give this GPS instance its route path
    // and the index to start from (for spreading buses along the route).
    void setRoute(int route_id,
                  const std::vector<Waypoint>& waypoints,
                  int start_index);

    void start();
    void stop();

    void sendGPSData(GPSData& data);
    void getLocation();

private:
    int                       route_id;
    std::vector<Waypoint>     waypoints;    // ordered waypoints along the route
    int                       wp_index;     // current position in the waypoints list
    bool                      running;

    std::string               vehicle_id_str;
};

#endif // GPS_H