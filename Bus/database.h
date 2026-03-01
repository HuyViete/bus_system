#ifndef DATABASE_H
#define DATABASE_H

#include "libs/sqlite3.h"
#include <iostream>
#include <string>
#include <cstdint>
#include "types.h"

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