#ifndef RECEIVER_H
#define RECEIVER_H

#include <string>
#include <thread>
#include "net_compat.h"

class Receiver {
public:
    Receiver();
    ~Receiver();

    bool start(const std::string& host, int port);
    void stop();

private:
    SOCKET      socket_;
    bool        running_;
    std::thread worker_;

    void listenLoop();
    void handleCommand(const std::string& cmd);
};

#endif // RECEIVER_H