#include "receiver.h"
#include "runtime_config.h"
#include "bus_stats.h"
#include <iostream>
#include <sstream>

Receiver::Receiver()
    : socket_(INVALID_SOCKET), running_(false)
{
    if (!net::initSockets()) {
        if (kVerboseBusLogs)
            std::cerr << "[Receiver] socket stack init failed.\n";
    }
}

Receiver::~Receiver() {
    stop();
    net::cleanupSockets();
}

bool Receiver::start(const std::string& host, int port) {
    socket_ = ::socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (socket_ == INVALID_SOCKET) {
        ++gBusErrorCounters.receiverConnectFailures;
        if (kVerboseBusLogs)
            std::cerr << "[Receiver] socket() failed\n";
        return false;
    }

    struct sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port   = htons(port);
    inet_pton(AF_INET, host.c_str(), &addr.sin_addr);

    if (::connect(socket_, (struct sockaddr*)&addr, sizeof(addr)) == SOCKET_ERROR) {
        ++gBusErrorCounters.receiverConnectFailures;
        if (kVerboseBusLogs)
            std::cerr << "[Receiver] connect() failed: " << net::lastError() << "\n";
        net::closeSocket(socket_);
        socket_ = INVALID_SOCKET;
        return false;
    }

    if (kVerboseBusLogs)
        std::cout << "[Receiver] Command channel open to " << host << ":" << port << "\n";

    running_ = true;
    worker_  = std::thread(&Receiver::listenLoop, this);
    return true;
}

void Receiver::stop() {
    running_ = false;

    if (socket_ != INVALID_SOCKET) {
        net::closeSocket(socket_);
        socket_ = INVALID_SOCKET;
    }

    if (worker_.joinable())
        worker_.join();
}

void Receiver::listenLoop() {
    char buf[1024];
    while (running_) {
        int bytesReceived = ::recv(socket_, buf, sizeof(buf) - 1, 0);
        if (bytesReceived > 0) {
            buf[bytesReceived] = '\0';
            handleCommand(std::string(buf, bytesReceived));
        }
        else if (bytesReceived == 0) {
            if (kVerboseBusLogs)
                std::cout << "[Receiver] Server closed command channel.\n";
            break;
        }
        else {
            if (running_) {
                ++gBusErrorCounters.receiverRecvFailures;
                if (kVerboseBusLogs)
                    std::cerr << "[Receiver] recv() error: " << net::lastError() << "\n";
            }
            break;
        }
    }
}

void Receiver::handleCommand(const std::string& raw) {
    std::string cmd = raw;
    while (!cmd.empty() && (cmd.back() == '\n' || cmd.back() == '\r' || cmd.back() == ' '))
        cmd.pop_back();

    if (kVerboseBusLogs)
        std::cout << "[Receiver] Command: \"" << cmd << "\"\n";

    if (cmd == "STOP") {
        // TODO: signal GPS to halt
    }
    else if (cmd.rfind("REROUTE ", 0) == 0) {
        // TODO: pass new route to GPS
    }
}