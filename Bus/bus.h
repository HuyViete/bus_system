#ifndef BUS_H
#define BUS_H

#include <vector>
#include <thread>
#include <string>
#include "receiver.h"
#include "sender.h"
#include "database.h"
#include "gps.h"
#include "route_loader.h"

// ─────────────────────────────────────────────────────────────────────────────
//  Bus  (the "Edge Device")
//
//  A Bus object models one physical bus on the road.  It owns:
//    • A Sender   — keeps one persistent outgoing TCP connection for data.
//    • A Receiver — keeps one persistent incoming TCP connection for commands.
//    • A GPS      — ticks every second and pushes positions to the Sender.
//    • A Database — local SQLite for offline buffering (if the server is down).
//
//  Thread ownership:
//    gps_thread_      — runs GPS::start() loop
//    sender owns its own worker thread (created inside Sender::start())
//    receiver owns its own worker thread (created inside Receiver::start())
//
//  Lifetime rule: Bus manages ALL of these objects.  When Bus is destroyed,
//  everything is shut down cleanly in the destructor via stop().
// ─────────────────────────────────────────────────────────────────────────────
class Bus {
public:
    Bus(int vehicle_id,
        int route_id,
        const std::vector<Waypoint>& waypoints,
        int start_index,
        const std::string& server_host,  // e.g. "127.0.0.1"
        int data_port,                   // Sender connects here (e.g. 3000)
        int cmd_port);                   // Receiver connects here (e.g. 4000)

    // Destructor calls stop() so the Bus cleans itself up automatically.
    ~Bus();

    // Explicitly stop all threads and connections.
    void stop();

private:
    int vehicle_id_;
    int route_id_;

    // Member objects — declared in the order they must be CONSTRUCTED (top-down)
    // and DESTROYED (bottom-up, i.e. reverse order).
    // Sender must be alive before GPS (GPS keeps a pointer to sender_).
    Sender   sender_;    // ← constructed first
    Receiver receiver_;  // ← constructed second
    GPS      gps_;       // ← constructed third (borrows sender_)
    Database db_;

    // The GPS loop thread is owned by Bus, not by GPS.
    std::thread gps_thread_;

    // Internal helpers
    void start(const std::string& host, int data_port, int cmd_port,
               const std::vector<Waypoint>& waypoints, int start_index);
};

#endif // BUS_H
