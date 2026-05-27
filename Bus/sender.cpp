#include "sender.h"
#include "runtime_config.h"
#include "bus_stats.h"
#include <iostream>
#include <sstream>
#include <iomanip>

Sender::Sender()
    : socket_(INVALID_SOCKET), running_(false)
{
    if (!net::initSockets()) {
        if (kVerboseBusLogs)
            std::cerr << "[Sender] socket stack init failed.\n";
    }
}

Sender::~Sender() {
    stop();
    net::cleanupSockets();
}

bool Sender::start(const std::string& host, int port) {
    host_ = host;
    port_ = port;

    socket_ = ::socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (socket_ != INVALID_SOCKET) {
        struct sockaddr_in addr{};
        addr.sin_family = AF_INET;
        addr.sin_port   = htons(port);
        inet_pton(AF_INET, host.c_str(), &addr.sin_addr);

        if (::connect(socket_, (struct sockaddr*)&addr, sizeof(addr)) == SOCKET_ERROR) {
            net::closeSocket(socket_);
            socket_ = INVALID_SOCKET;
        }
    }

    if (socket_ != INVALID_SOCKET) {
        if (kVerboseBusLogs)
            std::cout << "[Sender] Connected to " << host << ":" << port << "\n";
    } else {
        if (kVerboseBusLogs)
            std::cerr << "[Sender] Could not connect to " << host << ":" << port << ". Will retry in background...\n";
    }

    running_ = true;
    worker_  = std::thread(&Sender::sendLoop, this);
    return true;
}

void Sender::stop() {
    {
        std::lock_guard<std::mutex> lock(mtx_);
        running_ = false;
    }
    cv_.notify_all();

    if (worker_.joinable())
        worker_.join();

    if (socket_ != INVALID_SOCKET) {
        net::closeSocket(socket_);
        socket_ = INVALID_SOCKET;
    }
}

void Sender::enqueueGPS(const GPSData& data) {
    std::string payload = serializeGPS(data);
    {
        std::lock_guard<std::mutex> lock(mtx_);
        queue_.push(std::move(payload));
    }
    cv_.notify_one();
}

void Sender::sendLoop() {
    std::unique_lock<std::mutex> lock(mtx_);
    while (running_) {
        cv_.wait(lock, [&]{ return !queue_.empty() || !running_; });
        while (!queue_.empty()) {
            std::string payload = std::move(queue_.front());
            queue_.pop();
            lock.unlock();
            
            bool success = sendRaw(payload);
            if (!success && running_) {
                bool was_connected = (socket_ != INVALID_SOCKET);
                if (kVerboseBusLogs) {
                    if (was_connected) {
                        std::cerr << "[Sender] Connection lost. Reconnecting...\n";
                    } else {
                        std::cerr << "[Sender] Connecting to server...\n";
                    }
                }
                
                if (was_connected) {
                    net::closeSocket(socket_);
                    socket_ = INVALID_SOCKET;
                }

                int backoff_ms = 500;
                while (running_ && socket_ == INVALID_SOCKET) {
                    socket_ = ::socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
                    if (socket_ != INVALID_SOCKET) {
                        struct sockaddr_in addr{};
                        addr.sin_family = AF_INET;
                        addr.sin_port   = htons(port_);
                        inet_pton(AF_INET, host_.c_str(), &addr.sin_addr);

                        if (::connect(socket_, (struct sockaddr*)&addr, sizeof(addr)) == SOCKET_ERROR) {
                            net::closeSocket(socket_);
                            socket_ = INVALID_SOCKET;
                        }
                    }
                    if (socket_ == INVALID_SOCKET) {
                        std::this_thread::sleep_for(std::chrono::milliseconds(backoff_ms));
                        backoff_ms = std::min(backoff_ms * 2, 5000);
                    }
                }
                if (socket_ != INVALID_SOCKET) {
                    if (kVerboseBusLogs)
                        std::cout << "[Sender] Reconnected successfully.\n";
                    sendRaw(payload); // Retry the dropped payload
                }
            }

            lock.lock();
        }
    }
}

bool Sender::sendRaw(const std::string& data) {
    if (socket_ == INVALID_SOCKET) return false;

    std::ostringstream req;
    req << "POST /api/gps HTTP/1.1\r\n"
        << "Host: 127.0.0.1\r\n"
        << "Content-Type: application/json\r\n"
        << "Content-Length: " << data.size() << "\r\n"
        << "Connection: keep-alive\r\n"
        << "\r\n"
        << data;

    std::string reqStr = req.str();
    int totalSent = 0;
    int toSend    = (int)reqStr.size();
    const char* ptr = reqStr.c_str();

    while (totalSent < toSend) {
        int sent = ::send(socket_, ptr + totalSent, toSend - totalSent, 0);
        if (sent == SOCKET_ERROR) {
            ++gBusErrorCounters.senderSendFailures;
            if (kVerboseBusLogs)
                std::cerr << "[Sender] send() error: " << net::lastError() << "\n";
            return false;
        }
        totalSent += sent;
    }

    char buf[512];
    int bytesRecv = ::recv(socket_, buf, sizeof(buf) - 1, 0);
    if (bytesRecv <= 0) {
        ++gBusErrorCounters.senderSendFailures;
        if (kVerboseBusLogs)
            std::cerr << "[Sender] recv() error or connection closed: " << net::lastError() << "\n";
        return false;
    }
    return true;
}

std::string Sender::serializeGPS(const GPSData& d) {
    std::ostringstream ss;
    ss << std::fixed << std::setprecision(6)
       << "{\"vehicle_id\":\"" << d.vehicle_id << "\","
       << "\"route\":" << d.route << ","
       << "\"latitude\":" << d.latitude << ","
       << "\"longitude\":" << d.longitude << ","
       << "\"speed\":" << std::setprecision(1) << d.speed << ","
       << "\"heading\":" << std::setprecision(1) << d.heading << ","
       << "\"timestamp\":" << d.timestamp << ","
       << "\"edge_anomalies\":[";

    for (size_t i = 0; i < d.edgeAnomalies.size(); ++i) {
        if (i > 0) ss << ",";
        ss << "\"" << d.edgeAnomalies[i] << "\"";
    }
    ss << "]";

    if (!d.stopEvent.empty()) {
        ss << ",\"stop_event\":\"" << d.stopEvent << "\""
           << ",\"stop_event_id\":" << d.stopEventId;
        if (d.stopEvent == "departure") {
            ss << std::setprecision(1) << ",\"dwell_seconds\":" << d.dwellSeconds;
        }
    }

    if (d.distAlongRoute >= 0) {
        ss << std::setprecision(1)
           << ",\"dist_along_route\":" << d.distAlongRoute;
    }
    if (d.nextStopId >= 0) {
        ss << ",\"next_stop_id\":" << d.nextStopId;
    }
    if (d.distToNextStop >= 0) {
        ss << std::setprecision(1)
           << ",\"dist_to_next_stop\":" << d.distToNextStop;
    }
    
    if (!d.status.empty()) {
        ss << ",\"status\":\"" << d.status << "\"";
    }

    ss << "}";
    return ss.str();
}