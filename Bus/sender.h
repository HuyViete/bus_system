#ifndef SENDER_H
#define SENDER_H

#include <iostream>
#include <string>
#include <thread>
#include <winsock2.h>

struct GPSData {
    std::string vehicle_id;
    int route;
    double latitude;
    double longitude;
    double speed;
    double heading;
    int timestamp;
    int synced;
};

struct SensorData {
    std::string vehicle_id;
    int passenger_count;
    int timestamp;
    int synced;
};

class Sender {
public:
    Sender();
    ~Sender();
    void start();
    void stop();

    void sendGPSData(GPSData &data);
    void sendSensorData(SensorData &data);
private:
    SOCKET clientSocket;
    bool running;
};

#endif // SENDER_H