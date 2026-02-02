#include "database.h"

Database::Database() : DB(nullptr) {
}

Database::~Database() {
    close();
}

bool Database::open() {
    if (DB != nullptr) {
        std::cerr << "Database already open" << std::endl;
        return true;
    }

    int exit = sqlite3_open("example.db", &DB);
    
    if (exit != SQLITE_OK) {
        std::cerr << "Error opening DB: " << sqlite3_errmsg(DB) << std::endl;
        return false;
    }
    
    std::cout << "Database opened successfully!" << std::endl;
    return true;
}

void Database::close() {
    if (DB != nullptr) {
        sqlite3_close(DB);
        DB = nullptr;
        std::cout << "Database closed successfully!" << std::endl;
    }
}

bool Database::isOpen() {
    return DB != nullptr;
}
void Database::createTable(std::string name) {
    if (!isOpen()) {
        std::cerr << "Database is not open" << std::endl;
        return;
    }

    std::string sql;
    char* errMsg = nullptr;

    if (name == "gps_data") {
        sql = "CREATE TABLE IF NOT EXISTS gps_data ("
              "id INTEGER PRIMARY KEY AUTOINCREMENT, "
              "vehicle_id TEXT NOT NULL, "
              "latitude REAL NOT NULL, "
              "longitude REAL NOT NULL, "
              "speed REAL DEFAULT 0, "
              "heading REAL DEFAULT 0, "
              "timestamp INTEGER NOT NULL, "
              "synced INTEGER DEFAULT 0, "
              "created_at INTEGER DEFAULT (strftime('%s', 'now'))"
              ");";
        
        int exit = sqlite3_exec(DB, sql.c_str(), NULL, 0, &errMsg);
        if (exit != SQLITE_OK) {
            std::cerr << "Error creating gps_data table: " << errMsg << std::endl;
            sqlite3_free(errMsg);
            return;
        }

        sql = "CREATE INDEX IF NOT EXISTS idx_gps_synced ON gps_data(synced);";
        sqlite3_exec(DB, sql.c_str(), NULL, 0, &errMsg);
        
        sql = "CREATE INDEX IF NOT EXISTS idx_gps_timestamp ON gps_data(timestamp);";
        sqlite3_exec(DB, sql.c_str(), NULL, 0, &errMsg);
        
        sql = "CREATE INDEX IF NOT EXISTS idx_gps_vehicle ON gps_data(vehicle_id);";
        sqlite3_exec(DB, sql.c_str(), NULL, 0, &errMsg);

        std::cout << "Table 'gps_data' created successfully!" << std::endl;
    }
    else if (name == "sensor_data") {
        sql = "CREATE TABLE IF NOT EXISTS sensor_data ("
              "id INTEGER PRIMARY KEY AUTOINCREMENT, "
              "vehicle_id TEXT NOT NULL, "
              "passenger_count INTEGER DEFAULT 0, "
              "temperature REAL, "
              "fuel_level REAL, "
              "timestamp INTEGER NOT NULL, "
              "synced INTEGER DEFAULT 0, "
              "created_at INTEGER DEFAULT (strftime('%s', 'now'))"
              ");";
        
        int exit = sqlite3_exec(DB, sql.c_str(), NULL, 0, &errMsg);
        if (exit != SQLITE_OK) {
            std::cerr << "Error creating sensor_data table: " << errMsg << std::endl;
            sqlite3_free(errMsg);
            return;
        }

        sql = "CREATE INDEX IF NOT EXISTS idx_sensor_synced ON sensor_data(synced);";
        sqlite3_exec(DB, sql.c_str(), NULL, 0, &errMsg);
        
        sql = "CREATE INDEX IF NOT EXISTS idx_sensor_timestamp ON sensor_data(timestamp);";
        sqlite3_exec(DB, sql.c_str(), NULL, 0, &errMsg);

        std::cout << "Table 'sensor_data' created successfully!" << std::endl;
    }
}

bool Database::insertGPSData(GPSData &data) {
    if (!isOpen()) {
        std::cerr << "Database is not open" << std::endl;
        return false;
    }
    
    return true;
}

bool Database::insertSensorData(SensorData &data) {
    if (!isOpen()) {
        std::cerr << "Database is not open" << std::endl;
        return false;
    }
    
    return true;
}