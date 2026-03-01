#include <iostream>
#include <thread>
#include <chrono>
#include "bus.h"

int main() {
    std::cout << "Starting the Bus System..." << std::endl;
    
    // Create a Bus instance (vehicle_id = 123, route = 1, current_station = 1)
    Bus myBus(123, 1, 1);
    
    std::cout << "Bus System is running. Press Enter to stop." << std::endl;
    
    // Wait for user input to stop
    std::cin.get();
    
    std::cout << "Stopping the Bus System..." << std::endl;
    myBus.stop();
    
    return 0;
}