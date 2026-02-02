#ifndef DATABASE_H
#define DATABASE_H

#include "libs/sqlite3.h"
#include <iostream>
#include <string>
#include <cstdint>

struct GPSData {
    std::string vehicleId;
    double latitude;
    double longitude;
    double speed;
    double heading;
    int64_t timestamp;
    bool synced;
};
struct SensorData {
    std::string vehicleId;
    int passengerCount;
    double temperature;
    double fuelLevel;
    int64_t timestamp;
    bool synced;
};

class Database {
public:
  Database();
  ~Database();
  void createTable(std::string name);

  bool open();
  void close();
  bool isOpen();

  bool insertGPSData(GPSData &data);
  bool insertSensorData(SensorData &data);

private:
  sqlite3* DB;

};

#endif // DATABASE_H