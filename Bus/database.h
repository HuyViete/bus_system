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

  bool open(const std::string& vehicle_id); // Opens (or creates) <vehicle_id>.db
  void close();
  bool isOpen();

  bool insertGPSData(const GPSData& data);
  bool insertSensorData(const SensorData& data);

private:
  sqlite3*    DB;
  std::string db_path_;  // e.g. "BUS-2003.db"

};

#endif // DATABASE_H