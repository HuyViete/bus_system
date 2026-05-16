#ifndef TYPES_H
#define TYPES_H

#include <string>
#include <vector>
#include <cstdint>

struct GPSData {
    std::string vehicle_id;
    int         route;
    double      latitude;
    double      longitude;
    double      speed;
    double      heading;
    int64_t     timestamp;
    int         synced;

    std::vector<std::string> edgeAnomalies;

    std::string stopEvent;
    int         stopEventId    = -1;
    double      dwellSeconds   = 0;

    double      distAlongRoute = -1;
    int         nextStopId     = -1;
    double      distToNextStop = -1;
};

struct SensorData {
    std::string vehicle_id;
    int         passenger_count;
    double      temperature;
    double      fuelLevel;
    int64_t     timestamp;
    int         synced;
};

#endif // TYPES_H
