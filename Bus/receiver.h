#ifndef RECEIVER_H
#define RECEIVER_H

#include <string>
#include <thread>
#include <iostream>
#include "net_compat.h"

// ─────────────────────────────────────────────────────────────────────────────
//  Receiver
//  Responsibility: Connect to the central command server and listen for
//  incoming commands (e.g. "STOP", "REROUTE 5") on a dedicated background
//  thread.
//
//  WHY IS THIS A CLIENT, NOT A SERVER?
//  The old code tried to make each Bus act as a TCP *server* — meaning it
//  called bind() and listen() to wait for incoming connections. That forces
//  every bus to have its own unique port number, which is fine for 1 bus but
//  completely impossible when you have 2000+ buses all trying to bind on the
//  same machine.  Port 8080 can only be bound by ONE process at a time.
//
//  The correct model for an IoT / fleet-management system is:
//
//    Central server  →  listens on ONE port (e.g. 4000) for command channel
//    Bus (edge)      →  connects OUT to that port (each bus is a TCP client)
//
//  All 2000 buses can connect to the same server port simultaneously.
//  The server uses a different socket per connection (that's what accept() does).
// ─────────────────────────────────────────────────────────────────────────────
class Receiver {
public:
    Receiver();
    ~Receiver();

    // Connect to the command channel of the central server and start
    // the background listener thread.
    bool start(const std::string& host, int port);

    // Signal the listener thread to stop and close the socket.
    void stop();

private:
    SOCKET      socket_;   // the ONE socket connecting us to the server
    bool        running_;
    std::thread worker_;

    // Runs on worker_: blocks on recv() waiting for server commands.
    void listenLoop();

    // Processes a raw command string received from the server.
    void handleCommand(const std::string& cmd);
};

#endif // RECEIVER_H