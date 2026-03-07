#include "gps.h"
#include "sender.h"
#include <chrono>
#include <cstdlib>
#include <ctime>

// ═════════════════════════════════════════════════════════════════════════════
//  CONCEPT — std::atomic<bool>  vs  plain bool  (recap)
//
//  The GPS loop runs on Thread A.
//  Bus::stop() is called from Thread B (the main thread or another thread).
//  Both threads touch `running_`.
//
//  Without atomic:
//    Thread B writes running_ = false.
//    The CPU might not flush this to main memory instantly — Thread A's cached
//    copy in its register still says true.  The loop never ends.  Bug.
//
//  With std::atomic<bool>:
//    The store (write) and load (read) are guaranteed to be immediately
//    visible across all threads.  No locks needed for a single bool.
// ═════════════════════════════════════════════════════════════════════════════

GPS::GPS()
    : route_id_(0), wp_index_(0), running_(false), sender_(nullptr) {}

GPS::~GPS() {
    stop();
}

// ─────────────────────────────────────────────────────────────────────────────
//  setRoute() — Dependency Injection
//  Instead of having GPS create its own Sender, we INJECT the Sender from
//  outside.  This is the "Dependency Injection" (DI) design pattern.
//  Benefits:
//    • GPS is easy to unit-test — pass in a mock Sender.
//    • The lifetime of Sender is managed by Bus, not GPS.
//    • Clear ownership: Bus owns Sender; GPS just borrows it (raw pointer).
// ─────────────────────────────────────────────────────────────────────────────
void GPS::setRoute(int rid,
                   const std::vector<Waypoint>& wps,
                   int start_index,
                   Sender& sender)
{
    route_id_      = rid;
    waypoints_     = wps;    // copy the waypoints into this GPS object
    wp_index_      = waypoints_.empty() ? 0 : (start_index % (int)waypoints_.size());
    vehicle_id_str_ = "BUS-" + std::to_string(rid);
    sender_        = &sender; // borrow; Bus guarantees Sender outlives GPS
}

// ─────────────────────────────────────────────────────────────────────────────
//  start() — the main GPS loop
//
//  CONCEPT — std::this_thread::sleep_for
//  Calling sleep_for puts the CURRENT thread to sleep for (at least) the given
//  duration.  The OS scheduler wakes it back up afterwards.
//  During sleep the thread uses ZERO CPU — perfect for a 1-second heartbeat.
//
//  std::chrono::seconds(1) is a type-safe duration.  Using plain int seconds
//  everywhere is error-prone (milliseconds, microseconds?). Chrono makes the
//  units explicit and lets the compiler catch unit mismatches.
// ─────────────────────────────────────────────────────────────────────────────
void GPS::start() {
    if (waypoints_.empty()) {
        std::cerr << "[GPS " << vehicle_id_str_ << "] No waypoints — exiting.\n";
        return;
    }

    running_ = true;

    while (running_) {
        // 1. Build a snapshot of current position.
        GPSData data = buildSnapshot();

        // 2. Hand the snapshot to the Sender's thread-safe queue.
        //    This returns IMMEDIATELY — we don't wait for the network.
        //    The Sender's worker thread handles the actual transmission.
        if (sender_) {
            sender_->enqueueGPS(data);
        }

        // 3. Advance to the next waypoint (wraps around at the end of the route).
        wp_index_ = (wp_index_ + 1) % (int)waypoints_.size();

        // 4. Sleep for 1 second before the next GPS tick.
        std::this_thread::sleep_for(std::chrono::seconds(1));
    }
}

void GPS::stop() {
    running_ = false;
    // No join here — the Bus thread owns the thread, so Bus is responsible
    // for joining it.
}

// ─────────────────────────────────────────────────────────────────────────────
//  buildSnapshot() — assemble a GPSData struct for the current position
// ─────────────────────────────────────────────────────────────────────────────
GPSData GPS::buildSnapshot() {
    const Waypoint& wp = waypoints_[wp_index_];

    GPSData d;
    d.vehicle_id = vehicle_id_str_;
    d.route      = route_id_;
    d.latitude   = wp.lat;
    d.longitude  = wp.lon;
    d.speed      = 20.0 + (std::rand() % 200) / 10.0; // 20 – 40 km/h
    d.heading    = std::rand() % 360;
    d.timestamp  = std::time(nullptr);  // Unix epoch seconds (UTC)
    d.synced     = 0;                   // not yet acknowledged by the server

    return d;
}