#include "sender.h"
#include "runtime_config.h"
#include "bus_stats.h"
#include <sstream>
#include <iomanip>

// =============================================================================
//  CONCEPT 1 — Constructor / Destructor (RAII)
//  "Resource Acquisition Is Initialization" is a core C++ idiom.
//  The rule: if you OWN a resource (socket, file, lock), acquire it in the
//  constructor and RELEASE it in the destructor.  That way the resource is
//  always cleaned up even if an exception happens.
// =============================================================================
Sender::Sender()
    : socket_(INVALID_SOCKET), running_(false)
{
    if (!net::initSockets()) {
        if (kVerboseBusLogs) {
            std::cerr << "[Sender] socket stack init failed.\n";
        }
    }
}

Sender::~Sender() {
    stop();          // guarantees the worker thread exits before we destroy
    net::cleanupSockets();
}

// =============================================================================
//  CONCEPT 2 — Persistent TCP Connection  ("Keep-Alive" pattern)
//  The OLD code called connect() every time it wanted to send one packet, then
//  closed the socket.  That is called a "short-lived" or "ephemeral" connection.
//  Problem: every connect() burns a local port number (there are only ~16 000
//  available by default on Windows).  With 2000 buses each sending once/second
//  that exhausts the port pool in under 10 seconds.
//
//  The FIX: connect ONCE, keep the socket OPEN, reuse it for every send.
//  This is exactly how HTTP/1.1 "Connection: keep-alive" works.
// =============================================================================
bool Sender::start(const std::string& host, int port) {
    socket_ = ::socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (socket_ == INVALID_SOCKET) {
        ++gBusErrorCounters.senderConnectFailures;
        if (kVerboseBusLogs)
            std::cerr << "[Sender] socket() failed: " << net::lastError() << "\n";
        return false;
    }

    struct sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port   = htons(port);
    inet_pton(AF_INET, host.c_str(), &addr.sin_addr);

    if (::connect(socket_, (struct sockaddr*)&addr, sizeof(addr)) == SOCKET_ERROR) {
        ++gBusErrorCounters.senderConnectFailures;
        if (kVerboseBusLogs)
            std::cerr << "[Sender] connect() failed: " << net::lastError() << "\n";
        net::closeSocket(socket_);
        socket_ = INVALID_SOCKET;
        return false;
    }

    if (kVerboseBusLogs)
        std::cout << "[Sender] Connected to " << host << ":" << port << "\n";

    running_ = true;
    worker_  = std::thread(&Sender::sendLoop, this);
    return true;
}

// =============================================================================
//  CONCEPT 4 — Graceful Shutdown with join()
// =============================================================================
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

// =============================================================================
//  CONCEPT 5 — Producer / Consumer with mutex + condition_variable
// =============================================================================
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
            sendRaw(payload);
            lock.lock();
        }
    }
}

bool Sender::sendRaw(const std::string& data) {
    if (socket_ == INVALID_SOCKET) return false;

    std::string body = data;
    std::ostringstream req;
    req << "POST /api/gps HTTP/1.1\r\n"
        << "Host: 127.0.0.1\r\n"
        << "Content-Type: application/json\r\n"
        << "Content-Length: " << body.size() << "\r\n"
        << "Connection: keep-alive\r\n"
        << "\r\n"
        << body;

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
    ::recv(socket_, buf, sizeof(buf) - 1, 0);
    return true;
}

// =============================================================================
//  serializeGPS() — convert a GPSData struct to a JSON HTTP body.
//
//  EDGE ANOMALIES:
//  If the GPS edge detector found anomalies (hard_brake, speeding), they are
//  stored in data.edgeAnomalies and serialised here as a JSON array:
//    "edge_anomalies": ["speeding"]
//  An empty vector produces:
//    "edge_anomalies": []
//  The server reads this field. If non-empty, it skips its own anomaly check
//  for those types and persists the pre-computed flag directly — saving 2-3
//  DB queries per packet.
// =============================================================================
std::string Sender::serializeGPS(const GPSData& d) {
    std::ostringstream ss;
    ss << std::fixed << std::setprecision(6)
       << "{\"vehicle_id\":\"" << d.vehicle_id << "\","
       << "\"route\":"         << d.route       << ","
       << "\"latitude\":"      << d.latitude    << ","
       << "\"longitude\":"     << d.longitude   << ","
       << "\"speed\":"         << d.speed       << ","
       << "\"heading\":"       << d.heading     << ","
       << "\"timestamp\":"     << d.timestamp   << ","
       << "\"synced\":"        << d.synced      << ","
       << "\"edge_anomalies\":[";

    for (size_t i = 0; i < d.edgeAnomalies.size(); ++i) {
        if (i > 0) ss << ",";
        ss << "\"" << d.edgeAnomalies[i] << "\"";
    }
    ss << "]}";

    return ss.str();
}