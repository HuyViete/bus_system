#ifndef SENDER_H
#define SENDER_H

#include <string>
#include <thread>
#include <mutex>
#include <queue>
#include <condition_variable>
#include "net_compat.h"
#include "types.h"

class Sender {
public:
    Sender();
    ~Sender();

    bool start(const std::string& host, int port);
    void stop();
    void enqueueGPS(const GPSData& data);

private:
    SOCKET  socket_;
    std::string host_;
    int port_;
    std::mutex              mtx_;
    std::condition_variable cv_;
    std::queue<std::string> queue_;
    bool running_;
    std::thread worker_;

    void sendLoop();
    bool sendRaw(const std::string& data);
    std::string serializeGPS(const GPSData& d);
};

#endif // SENDER_H