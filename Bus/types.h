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

    // Edge-computed anomaly flags.
    // Populated by GPS before enqueueing; empty vector = no anomaly detected.
    // Serialised by Sender into "edge_anomalies": ["hard_brake"] etc.
    // The server reads this and skips its own check for these anomaly types.
    std::vector<std::string> edgeAnomalies;
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
