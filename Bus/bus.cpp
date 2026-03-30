#include "bus.h"
#include "runtime_config.h"
#include <iostream>

// ═════════════════════════════════════════════════════════════════════════════
//  CONCEPT — Member Initialiser List
//
//  The syntax  : vehicle_id_(id), route_id_(rid), sender_(), ...
//  is the "member initialiser list".  It runs BEFORE the body of the
//  constructor { ... }.
//
//  WHY USE IT?
//    1. Objects are constructed EXACTLY ONCE in the right order.
//       Without it, the compiler first default-constructs each member,
//       then the body of the constructor would *assign* new values — that
//       is two operations instead of one.  For complex types like std::thread
//       the default construction followed by assignment can be wrong or slow.
//
//    2. ORDER: members are always constructed in the order they are DECLARED
//       in the class header — NOT in the order they appear in the initialiser
//       list.  That's why bus.h declares sender_ BEFORE gps_: GPS borrows a
//       reference to sender_, so sender_ must be fully alive first.
// ═════════════════════════════════════════════════════════════════════════════
Bus::Bus(int vehicle_id,
         int route_id,
         const std::vector<Waypoint>& waypoints,
         int start_index,
         const std::string& server_host,
         int data_port,
         int cmd_port)
    : vehicle_id_(vehicle_id),
      route_id_(route_id),
      sender_(),       // default-construct: no connection yet
      receiver_(),     // default-construct: no connection yet
      gps_(),          // default-construct
      db_()
{
    // After all members are constructed, wire them up and start everything.
    start(server_host, data_port, cmd_port, waypoints, start_index);
}

Bus::~Bus() {
    stop();
}

// ─────────────────────────────────────────────────────────────────────────────
//  start() — the orchestration function
//
//  CONCEPT — Separation of Concerns  (SoC)
//  Each class has ONE job:
//    Sender   → send data out
//    Receiver → receive commands in
//    GPS      → compute position and produce GPSData
//    Database → persist data locally
//  The Bus ties them together but does NOT implement the logic of any of them.
//  This makes each component testable and replaceable in isolation.
// ─────────────────────────────────────────────────────────────────────────────
void Bus::start(const std::string& host,
                int data_port,
                int cmd_port,
                const std::vector<Waypoint>& waypoints,
                int start_index)
{
    if (kVerboseBusLogs) {
        std::cout << "[Bus " << vehicle_id_ << "] Starting on route " << route_id_ << "\n";
    }

    // ── 1. Open local database for offline buffering ──────────────────────────
    //    Each bus opens its OWN file: "BUS-<vehicle_id>.db".
    //    This avoids file-locking conflicts when multiple buses run in the
    //    same process, and makes per-bus diagnostics trivial.
    if (kEnableLocalDatabase) {
        db_.open("BUS-" + std::to_string(vehicle_id_));
    }

    // ── 2. Connect the Sender to the server's data port ──────────────────────
    //    If the server is not reachable yet, we continue anyway (the bus can
    //    buffer data locally in SQLite and sync later — future improvement).
    sender_.start(host, data_port);

    // ── 3. Connect the Receiver to the server's command port ─────────────────
    //    Not fatal if this fails — the bus can still run and send data.
    receiver_.start(host, cmd_port);

    // ── 4. Give GPS its route data, the Sender, and the Database ────────────
    //    From this point GPS will:
    //      • call db_.insertGPSData()   → local buffer  (every tick)
    //      • call sender_.enqueueGPS()  → server        (every tick)
    gps_.setRoute(route_id_, waypoints, start_index, vehicle_id_, sender_, db_);

    // ── 5. Launch the GPS loop on its own thread ──────────────────────────────
    //
    //  CONCEPT — std::thread with a member function
    //  &GPS::start is the address of the GPS::start() member function.
    //  We pass &gps_ as the implicit "this" so the thread calls gps_.start().
    //
    //  We store the thread in gps_thread_ so we can .join() it later.
    //  DO NOT detach() — see the explanation in sender.cpp.
    gps_thread_ = std::thread(&GPS::start, &gps_);

    if (kVerboseBusLogs) {
        std::cout << "[Bus " << vehicle_id_ << "] All systems running.\n";
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  stop() — orderly shutdown
//
//  CONCEPT — Shutdown Order Matters
//  We must stop in REVERSE dependency order:
//    1. GPS first — so it stops producing new data.
//    2. Then join gps_thread_ — wait until the GPS loop has actually exited.
//    3. Sender — after GPS is done, no more items will be enqueued.
//               Sender drains the queue and closes the socket.
//    4. Receiver — close the command channel.
//    5. Database — flush and close SQLite.
//
//  If we closed the Sender socket FIRST while GPS was still producing data,
//  GPS would try to enqueue onto a queue being destroyed — undefined behaviour.
// ─────────────────────────────────────────────────────────────────────────────
void Bus::stop() {
    if (kVerboseBusLogs) {
        std::cout << "[Bus " << vehicle_id_ << "] Stopping...\n";
    }

    // 1. Tell the GPS loop to exit on its next iteration.
    gps_.stop();

    // 2. Wait for the GPS thread to finish.
    if (gps_thread_.joinable()) {
        gps_thread_.join();
    }

    // 3. Shut down sender (drains remaining queue, closes socket).
    sender_.stop();

    // 4. Shut down receiver (closes socket, joins listener thread).
    receiver_.stop();

    // 5. Close local database.
    if (kEnableLocalDatabase) {
        db_.close();
    }

    if (kVerboseBusLogs) {
        std::cout << "[Bus " << vehicle_id_ << "] Stopped cleanly.\n";
    }
}
