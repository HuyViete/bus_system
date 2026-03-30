#ifndef SENDER_H
#define SENDER_H

#include <iostream>
#include <string>
#include <thread>
#include <mutex>
#include <queue>
#include <condition_variable>
#include "net_compat.h"
#include "types.h"

// ─────────────────────────────────────────────────────────────────────────────
//  Sender
//  Responsibility: Maintain one persistent TCP connection to the central server
//  and send queued GPS / sensor data on a dedicated background thread.
//
//  KEY DESIGN DECISIONS explained in sender.cpp.
// ─────────────────────────────────────────────────────────────────────────────
class Sender {
public:
    Sender();
    ~Sender();

    // Connect to the server and start the background send-loop thread.
    // Returns true if the TCP connection was established successfully.
    bool start(const std::string& host, int port);

    // Signal the send-loop to stop and close the socket.
    void stop();

    // Thread-safe: push a GPS snapshot onto the outgoing queue.
    void enqueueGPS(const GPSData& data);

private:
    // The one and only socket this sender owns.
    SOCKET  socket_;

    // Guards socket_ and queue_ so two threads never write at the same moment.
    std::mutex              mtx_;

    // A condition variable lets the send-loop thread SLEEP efficiently instead
    // of busy-looping with while(true){} — it wakes up only when there is work.
    std::condition_variable cv_;

    // FIFO queue of outbound payloads waiting to be sent.
    std::queue<std::string> queue_;

    // Flip to false to tell the worker thread to exit gracefully.
    bool running_;

    // The actual thread that drains the queue and calls ::send().
    std::thread worker_;

    // Internal helpers
    void sendLoop();                        // runs on worker_ thread
    bool sendRaw(const std::string& data);  // calls ::send() on socket_
    std::string serializeGPS(const GPSData& d);
};

#endif // SENDER_H