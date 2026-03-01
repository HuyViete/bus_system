#include "gps.h"
#include <cstdlib>
#include <ctime>
#include <chrono>

GPS::GPS() : running(false), clientSocket(INVALID_SOCKET) {
    std::srand(std::time(nullptr));
}

GPS::~GPS() {
    stop();
}

void GPS::start() {
    running = true;
    while (running) {
        getLocation();
        std::this_thread::sleep_for(std::chrono::seconds(1));
    }
}

void GPS::stop() {
    running = false;
}

void GPS::getLocation() {
    GPSData data;
    data.vehicle_id = "BUS-123";
    data.route = 1;
    data.latitude = 10.762622 + (std::rand() % 1000 - 500) / 100000.0;
    data.longitude = 106.660172 + (std::rand() % 1000 - 500) / 100000.0;
    data.speed = 20.0 + (std::rand() % 200) / 10.0;
    data.heading = std::rand() % 360;
    data.timestamp = std::time(nullptr);
    data.synced = 0;
    
    std::cout << "Fake GPS location generated: Lat " << data.latitude 
              << ", Lon " << data.longitude << ", Speed " << data.speed << std::endl;
}

void GPS::sendGPSData(GPSData &data) {
    // Left unimplemented: user said "Make it simple, the logic can be handled later on"
}