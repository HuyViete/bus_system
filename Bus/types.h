#ifndef TYPES_H
#define TYPES_H

#include <string>
#include <cstdint>

struct GPSData {
    std::string vehicle_id;
    int route;
    double latitude;
    double longitude;
    double speed;
    double heading;
    int64_t timestamp;
    int synced;
};

struct SensorData {
    std::string vehicle_id;
    int passenger_count;
    double temperature;
    double fuelLevel;
    int64_t timestamp;
    int synced;
};

#endif // TYPES_H
