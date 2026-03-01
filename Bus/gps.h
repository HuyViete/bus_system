#ifndef GPS_H
#define GPS_H

#include <iostream>
#include <string>
#include <thread>
#include <winsock2.h>
#include <vector>
#include "types.h"

class GPS {
public:
    GPS();
    ~GPS();
    void start();
    void stop();

    void sendGPSData(GPSData &data);
    void getLocation();
private:
    SOCKET clientSocket;
    bool running;
};

#endif // GPS_H