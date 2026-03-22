#ifndef GPS_H
#define GPS_H

#include <iostream>
#include <string>
#include <thread>
#include <vector>
#include <atomic>
#include "route_loader.h"
#include "types.h"

// Forward-declare Sender so GPS can call it without a circular include.
class Sender;
// Forward-declare Database for the same reason.
class Database;

// ─────────────────────────────────────────────────────────────────────────────
//  GPS
//  Responsibility: Walk along the assigned route waypoints once per second,
//  build a GPSData snapshot, and hand it to the Sender for transmission.
//
//  The GPS object does NOT own a thread — the Bus creates and runs the thread.
//  GPS just exposes start() and stop() so the thread can be controlled cleanly.
// ─────────────────────────────────────────────────────────────────────────────
class GPS {
public:
    GPS();
    ~GPS();

    // Inject the route data, a reference to the Sender (for transmission),
    // and a reference to the Database (for local offline buffering).
    // Must be called BEFORE start().
    void setRoute(int route_id,
                  const std::vector<Waypoint>& waypoints,
                  int start_index,
                  Sender&   sender,    // ← push data to server
                  Database& db);       // ← store data locally first

    // Blocking loop: advances waypoints, calls sender.enqueueGPS() every second.
    // Meant to be run on a dedicated std::thread.
    void start();

    // Signal the loop to exit on the next iteration.
    void stop();

private:
    int                   route_id_;
    std::vector<Waypoint> waypoints_;
    int                   wp_index_;

    // std::atomic<bool> is a thread-safe boolean.
    // CONCEPT — why not plain bool?
    // If two threads read/write the same plain bool simultaneously without
    // synchronisation, that is UNDEFINED BEHAVIOUR (the compiler can cache
    // the value in a register and the writing thread's change is never seen).
    // std::atomic guarantees that every read/write is immediately visible to
    // ALL threads — no caching, no reordering.
    std::atomic<bool>     running_;

    std::string           vehicle_id_str_;

    // Non-owning pointers — GPS doesn't manage the lifetimes of these objects.
    Sender*   sender_;   // transmit to server
    Database* db_;       // buffer locally

    GPSData buildSnapshot();
};

#endif // GPS_H