#ifndef SENDER_H
#define SENDER_H

#include <iostream>
#include <string>
#include <thread>
#include <winsock2.h>
#include "types.h"

class Sender {
public:
    Sender();
    ~Sender();
    void start();
    void stop();

    void sendGPSData(GPSData &data);
    void sendSensorData(SensorData &data);

    void sendEstimatedTime(int station);
private:
    SOCKET clientSocket;
    bool running;
};

#endif // SENDER_H