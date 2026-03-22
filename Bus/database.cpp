#include "database.h"
#include <filesystem>

Database::Database() : DB(nullptr) {}

Database::~Database() {
    close();
}

// ─────────────────────────────────────────────────────────────────────────────
//  open() — Creates/opens a SQLite file named after the vehicle.
//
//  CONCEPT — Per-bus database files
//  Each physical bus is an independent "edge device". In a real deployment every
//  device has its own local database so:
//    • Buses don't share a single file (no locking contention between processes).
//    • If one file is corrupted, other buses are unaffected.
//    • You can pull the .db file off a specific bus for diagnostics.
//
//  File naming: pass the vehicle_id string ("BUS-2003") → opens "BUS-2003.db".
// ─────────────────────────────────────────────────────────────────────────────
bool Database::open(const std::string& vehicle_id) {
    if (DB != nullptr) {
        std::cerr << "[DB " << vehicle_id << "] Already open." << std::endl;
        return true;
    }

    db_path_ = "db/" + vehicle_id + ".db";

    // sqlite3_open() can create a missing FILE, but NOT a missing DIRECTORY.
    // create_directories() creates the full path ("db/") if it doesn't exist.
    // It is a no-op if the directory is already there, so this is always safe.
    std::filesystem::create_directories("db");

    int rc = sqlite3_open(db_path_.c_str(), &DB);
    if (rc != SQLITE_OK) {
        std::cerr << "[DB] Could not open " << db_path_ << ": "
                  << sqlite3_errmsg(DB) << std::endl;
        sqlite3_close(DB);
        DB = nullptr;
        return false;
    }

    // WAL mode: allows concurrent reads while a write is happening.
    // Without WAL, a write locks the whole file — bad for a bus that
    // reads back unsynced rows while also inserting new ones.
    sqlite3_exec(DB, "PRAGMA journal_mode=WAL;", nullptr, nullptr, nullptr);

    std::cout << "[DB] Opened " << db_path_ << std::endl;

    createTable("gps_data");
    createTable("sensor_data");
    return true;
}

void Database::close() {
    if (DB != nullptr) {
        sqlite3_close(DB);
        DB = nullptr;
        std::cout << "[DB] Closed " << db_path_ << std::endl;
    }
}

bool Database::isOpen() {
    return DB != nullptr;
}

// ─────────────────────────────────────────────────────────────────────────────
//  createTable() — idempotent schema setup ("CREATE TABLE IF NOT EXISTS")
// ─────────────────────────────────────────────────────────────────────────────
void Database::createTable(std::string name) {
    if (!isOpen()) {
        std::cerr << "[DB] createTable called but DB is not open." << std::endl;
        return;
    }

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
        if (errMsg) {
            std::cerr << "[DB] Error creating gps_data: " << errMsg << std::endl;
            sqlite3_free(errMsg);
            return;
        }

        // Indexes for the two most common queries:
        //   1. "Give me all unsynced rows"  → WHERE synced = 0
        //   2. "Give me rows after time T"  → WHERE timestamp > T
        sqlite3_exec(DB, "CREATE INDEX IF NOT EXISTS idx_gps_synced    ON gps_data(synced);",    nullptr, nullptr, nullptr);
        sqlite3_exec(DB, "CREATE INDEX IF NOT EXISTS idx_gps_timestamp ON gps_data(timestamp);", nullptr, nullptr, nullptr);
        sqlite3_exec(DB, "CREATE INDEX IF NOT EXISTS idx_gps_vehicle   ON gps_data(vehicle_id);",nullptr, nullptr, nullptr);

        std::cout << "[DB] Table 'gps_data' ready." << std::endl;
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
        if (errMsg) {
            std::cerr << "[DB] Error creating sensor_data: " << errMsg << std::endl;
            sqlite3_free(errMsg);
            return;
        }

        sqlite3_exec(DB, "CREATE INDEX IF NOT EXISTS idx_sensor_synced    ON sensor_data(synced);",    nullptr, nullptr, nullptr);
        sqlite3_exec(DB, "CREATE INDEX IF NOT EXISTS idx_sensor_timestamp ON sensor_data(timestamp);", nullptr, nullptr, nullptr);

        std::cout << "[DB] Table 'sensor_data' ready." << std::endl;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  insertGPSData() — persist one GPS snapshot to the local SQLite buffer.
//
//  CONCEPT — Prepared Statements vs. string-building
//  BAD:   "INSERT INTO gps_data VALUES ('" + data.vehicle_id + "', ...)"
//    • SQL injection risk (even from your own data — a vehicle_id with a quote
//      would corrupt the statement).
//    • SQLite must re-parse the SQL text on every call.
//
//  GOOD:  sqlite3_prepare_v2() compiles the SQL once, then you bind values.
//    • The engine knows the types — no quoting bugs.
//    • 4-step pattern: prepare → bind → step → finalize.
// ─────────────────────────────────────────────────────────────────────────────
bool Database::insertGPSData(const GPSData& data) {
    if (!isOpen()) {
        std::cerr << "[DB] insertGPSData: DB not open." << std::endl;
        return false;
    }

    const char* sql =
        "INSERT INTO gps_data "
        "(vehicle_id, latitude, longitude, speed, heading, timestamp, synced) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)";

    sqlite3_stmt* stmt = nullptr;

    // Step 1 — compile the SQL template
    if (sqlite3_prepare_v2(DB, sql, -1, &stmt, nullptr) != SQLITE_OK) {
        std::cerr << "[DB] prepare GPS insert failed: " << sqlite3_errmsg(DB) << std::endl;
        return false;
    }

    // Step 2 — bind values to the '?' placeholders (1-indexed)
    sqlite3_bind_text  (stmt, 1, data.vehicle_id.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_double(stmt, 2, data.latitude);
    sqlite3_bind_double(stmt, 3, data.longitude);
    sqlite3_bind_double(stmt, 4, data.speed);
    sqlite3_bind_double(stmt, 5, data.heading);
    sqlite3_bind_int64 (stmt, 6, data.timestamp);
    sqlite3_bind_int   (stmt, 7, data.synced);

    // Step 3 — execute; SQLITE_DONE means "ran fine, no rows to return"
    bool ok = (sqlite3_step(stmt) == SQLITE_DONE);
    if (!ok) {
        std::cerr << "[DB] GPS insert step failed: " << sqlite3_errmsg(DB) << std::endl;
    }

    // Step 4 — always finalize to release the compiled statement
    sqlite3_finalize(stmt);
    return ok;
}

// ─────────────────────────────────────────────────────────────────────────────
//  insertSensorData() — same pattern as insertGPSData()
// ─────────────────────────────────────────────────────────────────────────────
bool Database::insertSensorData(const SensorData& data) {
    if (!isOpen()) {
        std::cerr << "[DB] insertSensorData: DB not open." << std::endl;
        return false;
    }

    const char* sql =
        "INSERT INTO sensor_data "
        "(vehicle_id, passenger_count, temperature, fuel_level, timestamp, synced) "
        "VALUES (?, ?, ?, ?, ?, ?)";

    sqlite3_stmt* stmt = nullptr;

    if (sqlite3_prepare_v2(DB, sql, -1, &stmt, nullptr) != SQLITE_OK) {
        std::cerr << "[DB] prepare Sensor insert failed: " << sqlite3_errmsg(DB) << std::endl;
        return false;
    }

    sqlite3_bind_text  (stmt, 1, data.vehicle_id.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_int   (stmt, 2, data.passenger_count);
    sqlite3_bind_double(stmt, 3, data.temperature);
    sqlite3_bind_double(stmt, 4, data.fuelLevel);
    sqlite3_bind_int64 (stmt, 5, data.timestamp);
    sqlite3_bind_int   (stmt, 6, data.synced);

    bool ok = (sqlite3_step(stmt) == SQLITE_DONE);
    if (!ok) {
        std::cerr << "[DB] Sensor insert step failed: " << sqlite3_errmsg(DB) << std::endl;
    }

    sqlite3_finalize(stmt);
    return ok;
}