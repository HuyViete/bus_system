#include <iostream>
#include "database.h"
#include "receiver.h"

int main() {
    Database db;
    
    if (!db.open()) {
        std::cerr << "Failed to open database" << std::endl;
        return -1;
    }

    db.createTable("gps_data");
    db.createTable("sensor_data");

    Receiver receiver;
    std::cout << "Starting GPS receiver server..." << std::endl;
    receiver.startServer(8080);

    return 0;
}