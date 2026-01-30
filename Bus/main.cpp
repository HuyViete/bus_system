#include <iostream>
#include "libs/sqlite3.h"
#include "receiver.h"

int main() {
    sqlite3* DB;
    int exit = 0;
    exit = sqlite3_open("example.db", &DB);

    if (exit) {
        std::cerr << "Error open DB " << sqlite3_errmsg(DB) << std::endl;
        return (-1);
    }
    else
        std::cout << "Opened Database Successfully!" << std::endl;

    // Start TCP receiver to get GPS data
    Receiver receiver;
    std::cout << "Starting GPS receiver server..." << std::endl;
    receiver.startServer(8080);

    sqlite3_close(DB);
    return (0);
}