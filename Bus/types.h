#ifndef TYPES_H
#define TYPES_H

#include <cstdint>
#include <string>
#include <vector>


struct GPSData {
    std::string vehicle_id;
    int route = 0;
    double latitude = 0.0;
    double longitude = 0.0;
    double speed = 0.0;
    double heading = 0.0;
    int64_t timestamp = 0;
    int synced = 0;
    std::string status;

    std::vector<std::string> edgeAnomalies;

    std::string stopEvent;
    int stopEventId = -1;
    double dwellSeconds = 0;

    double distAlongRoute = -1;
    int nextStopId = -1;
    double distToNextStop = -1;
};

struct SensorData {
    std::string vehicle_id;
    int passenger_count;
    double temperature;
    double fuelLevel;
    int64_t timestamp;
    int synced;
};

#endif  // TYPES_H
