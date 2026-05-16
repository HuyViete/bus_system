#include "database.h"
#include <filesystem>

Database::Database() : DB(nullptr) {}

Database::~Database() {
    close();
}

bool Database::open(const std::string& vehicle_id) {
    if (DB != nullptr) return true;

    db_path_ = "db/" + vehicle_id + ".db";
    std::filesystem::create_directories("db");

    int rc = sqlite3_open(db_path_.c_str(), &DB);
    if (rc != SQLITE_OK) {
        std::cerr << "[DB] Could not open " << db_path_ << ": "
                  << sqlite3_errmsg(DB) << std::endl;
        sqlite3_close(DB);
        DB = nullptr;
        return false;
    }

    sqlite3_exec(DB, "PRAGMA journal_mode=WAL;", nullptr, nullptr, nullptr);
    createTable("gps_data");
    createTable("sensor_data");
    return true;
}

void Database::close() {
    if (DB != nullptr) {
        sqlite3_close(DB);
        DB = nullptr;
    }
}

bool Database::isOpen() {
    return DB != nullptr;
}

void Database::createTable(std::string name) {
    if (!isOpen()) return;

    char* errMsg = nullptr;
    std::string sql;

    if (name == "gps_data") {
        sql = "CREATE TABLE IF NOT EXISTS gps_data ("
              "id         INTEGER PRIMARY KEY AUTOINCREMENT, "
              "vehicle_id TEXT    NOT NULL, "
              "latitude   REAL    NOT NULL, "
              "longitude  REAL    NOT NULL, "
              "speed      REAL    DEFAULT 0, "
              "heading    REAL    DEFAULT 0, "
              "timestamp  INTEGER NOT NULL, "
              "synced     INTEGER DEFAULT 0, "
              "created_at INTEGER DEFAULT (strftime('%s', 'now'))"
              ");";

        sqlite3_exec(DB, sql.c_str(), nullptr, nullptr, &errMsg);
        if (errMsg) { sqlite3_free(errMsg); return; }

        sqlite3_exec(DB, "CREATE INDEX IF NOT EXISTS idx_gps_synced    ON gps_data(synced);",    nullptr, nullptr, nullptr);
        sqlite3_exec(DB, "CREATE INDEX IF NOT EXISTS idx_gps_timestamp ON gps_data(timestamp);", nullptr, nullptr, nullptr);
        sqlite3_exec(DB, "CREATE INDEX IF NOT EXISTS idx_gps_vehicle   ON gps_data(vehicle_id);",nullptr, nullptr, nullptr);
    }
    else if (name == "sensor_data") {
        sql = "CREATE TABLE IF NOT EXISTS sensor_data ("
              "id              INTEGER PRIMARY KEY AUTOINCREMENT, "
              "vehicle_id      TEXT    NOT NULL, "
              "passenger_count INTEGER DEFAULT 0, "
              "temperature     REAL, "
              "fuel_level      REAL, "
              "timestamp       INTEGER NOT NULL, "
              "synced          INTEGER DEFAULT 0, "
              "created_at      INTEGER DEFAULT (strftime('%s', 'now'))"
              ");";

        sqlite3_exec(DB, sql.c_str(), nullptr, nullptr, &errMsg);
        if (errMsg) { sqlite3_free(errMsg); return; }

        sqlite3_exec(DB, "CREATE INDEX IF NOT EXISTS idx_sensor_synced    ON sensor_data(synced);",    nullptr, nullptr, nullptr);
        sqlite3_exec(DB, "CREATE INDEX IF NOT EXISTS idx_sensor_timestamp ON sensor_data(timestamp);", nullptr, nullptr, nullptr);
    }
}

bool Database::insertGPSData(const GPSData& data) {
    if (!isOpen()) return false;

    const char* sql =
        "INSERT INTO gps_data "
        "(vehicle_id, latitude, longitude, speed, heading, timestamp, synced) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)";

    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(DB, sql, -1, &stmt, nullptr) != SQLITE_OK) return false;

    sqlite3_bind_text  (stmt, 1, data.vehicle_id.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_double(stmt, 2, data.latitude);
    sqlite3_bind_double(stmt, 3, data.longitude);
    sqlite3_bind_double(stmt, 4, data.speed);
    sqlite3_bind_double(stmt, 5, data.heading);
    sqlite3_bind_int64 (stmt, 6, data.timestamp);
    sqlite3_bind_int   (stmt, 7, data.synced);

    bool ok = (sqlite3_step(stmt) == SQLITE_DONE);
    sqlite3_finalize(stmt);
    return ok;
}

bool Database::insertSensorData(const SensorData& data) {
    if (!isOpen()) return false;

    const char* sql =
        "INSERT INTO sensor_data "
        "(vehicle_id, passenger_count, temperature, fuel_level, timestamp, synced) "
        "VALUES (?, ?, ?, ?, ?, ?)";

    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(DB, sql, -1, &stmt, nullptr) != SQLITE_OK) return false;

    sqlite3_bind_text  (stmt, 1, data.vehicle_id.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_int   (stmt, 2, data.passenger_count);
    sqlite3_bind_double(stmt, 3, data.temperature);
    sqlite3_bind_double(stmt, 4, data.fuelLevel);
    sqlite3_bind_int64 (stmt, 5, data.timestamp);
    sqlite3_bind_int   (stmt, 6, data.synced);

    bool ok = (sqlite3_step(stmt) == SQLITE_DONE);
    sqlite3_finalize(stmt);
    return ok;
}