#include "sender.h"
#include <sstream>
#include <iomanip>
#include <ws2tcpip.h>
#pragma comment(lib, "ws2_32.lib")

// ═════════════════════════════════════════════════════════════════════════════
//  CONCEPT 1 — Constructor / Destructor (RAII)
//  "Resource Acquisition Is Initialization" is a core C++ idiom.
//  The rule: if you OWN a resource (socket, file, lock), acquire it in the
//  constructor and RELEASE it in the destructor.  That way the resource is
//  always cleaned up even if an exception happens.
// ═════════════════════════════════════════════════════════════════════════════
Sender::Sender()
    : socket_(INVALID_SOCKET), running_(false)
{
    // Winsock must be initialised once before any socket calls.
    WSADATA wsa;
    WSAStartup(MAKEWORD(2, 2), &wsa);
}

Sender::~Sender() {
    stop();          // guarantees the worker thread exits before we destroy
    WSACleanup();    // release the Winsock library reference
}

// ═════════════════════════════════════════════════════════════════════════════
//  CONCEPT 2 — Persistent TCP Connection  ("Keep-Alive" pattern)
//  The OLD code called connect() every time it wanted to send one packet, then
//  closed the socket.  That is called a "short-lived" or "ephemeral" connection.
//  Problem: every connect() burns a local port number (there are only ~16 000
//  available by default on Windows).  With 2000 buses each sending once/second
//  that exhausts the port pool in under 10 seconds.
//
//  The FIX: connect ONCE, keep the socket OPEN, reuse it for every send.
//  This is exactly how HTTP/1.1 "Connection: keep-alive" works.
// ═════════════════════════════════════════════════════════════════════════════
bool Sender::start(const std::string& host, int port) {
    // Create a TCP socket.
    // AF_INET      = IPv4 address family
    // SOCK_STREAM  = reliable, ordered byte-stream (TCP)
    // IPPROTO_TCP  = explicitly choose TCP (not UDP)
    socket_ = ::socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (socket_ == INVALID_SOCKET) {
        std::cerr << "[Sender] socket() failed: " << WSAGetLastError() << "\n";
        return false;
    }

    // Fill in the server address struct.
    struct sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port   = htons(port);          // htons = host-to-network-short
                                             // converts the port number to
                                             // "big-endian" byte order that
                                             // the network expects.
    inet_pton(AF_INET, host.c_str(), &addr.sin_addr); // text IP -> binary

    if (::connect(socket_, (struct sockaddr*)&addr, sizeof(addr)) == SOCKET_ERROR) {
        std::cerr << "[Sender] connect() failed: " << WSAGetLastError() << "\n";
        ::closesocket(socket_);
        socket_ = INVALID_SOCKET;
        return false;
    }

    std::cout << "[Sender] Connected to " << host << ":" << port << "\n";

    // ─── Start the background worker thread ──────────────────────────────────
    // CONCEPT 3 — std::thread with a lambda capturing 'this'
    // &Sender::sendLoop is a pointer-to-member-function.  We pass 'this' so
    // the thread knows which Sender object it belongs to.
    running_ = true;
    worker_  = std::thread(&Sender::sendLoop, this);
    // NOTE: we DO NOT detach() — we join() in stop() instead.
    // Detached threads are like "fire and forget": you lose the ability to
    // wait for them to finish.  If main() exits before a detached thread
    // finishes writing to the socket, you get corruption / crashes.

    return true;
}

// ═════════════════════════════════════════════════════════════════════════════
//  CONCEPT 4 — Graceful Shutdown with join()
//  stop() must do two things in order:
//    1. Signal the worker thread to stop  (running_ = false, cv_.notify_all())
//    2. WAIT for the worker thread to actually finish  (worker_.join())
//  If we closed the socket BEFORE join(), the thread might still be in the
//  middle of ::send() — that would be a use-after-free bug.
// ═════════════════════════════════════════════════════════════════════════════
void Sender::stop() {
    {
        // std::lock_guard is a RAII mutex wrapper.
        // It LOCKS mtx_ on construction and UNLOCKS it when it goes out of
        // scope (the closing brace).  You never forget to unlock.
        std::lock_guard<std::mutex> lock(mtx_);
        running_ = false;
    }
    cv_.notify_all();   // wake the sleeping worker so it can see running_=false

    if (worker_.joinable()) {
        worker_.join();  // block HERE until the worker thread has fully exited
    }

    if (socket_ != INVALID_SOCKET) {
        ::closesocket(socket_);
        socket_ = INVALID_SOCKET;
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  CONCEPT 5 — Producer / Consumer with std::queue + std::mutex + std::condition_variable
//
//  The GPS thread PRODUCES data every second and calls enqueueGPS().
//  The Sender worker thread CONSUMES data from the queue and sends it.
//  These two threads run concurrently, so we need:
//
//    std::mutex          — only ONE thread touches the queue at a time (mutual exclusion)
//    std::condition_variable — the consumer sleeps when the queue is empty
//                              and wakes up ONLY when new data arrives,
//                              instead of wasting CPU in a busy-loop.
// ═════════════════════════════════════════════════════════════════════════════
void Sender::enqueueGPS(const GPSData& data) {
    std::string payload = serializeGPS(data);

    {
        std::lock_guard<std::mutex> lock(mtx_);
        queue_.push(std::move(payload)); // std::move avoids copying the string
    }
    cv_.notify_one(); // wake the worker — there is something to send
}

// ─────────────────────────────────────────────────────────────────────────────
//  sendLoop() — runs on the worker_ thread
//  This is the CONSUMER side of the producer/consumer pattern.
// ─────────────────────────────────────────────────────────────────────────────
void Sender::sendLoop() {
    // std::unique_lock is like lock_guard but more flexible — it can
    // temporarily UNLOCK so cv_.wait() can sleep without holding the lock.
    std::unique_lock<std::mutex> lock(mtx_);

    while (running_) {
        // cv_.wait() atomically:
        //   1. Releases the mutex (so enqueueGPS() can push items)
        //   2. Suspends this thread (no CPU wasted)
        //   3. Re-acquires the mutex when woken up
        // The lambda [&]{ ... } is the "predicate" — wait() checks it to
        // guard against "spurious wakeups" (the OS can sometimes wake a
        // thread for no reason).
        cv_.wait(lock, [&]{ return !queue_.empty() || !running_; });

        // Drain every message that has accumulated since we last woke.
        while (!queue_.empty()) {
            std::string payload = std::move(queue_.front());
            queue_.pop();

            // Unlock while doing the slow network I/O so enqueueGPS()
            // can keep pushing new items without being blocked.
            lock.unlock();
            sendRaw(payload);
            lock.lock();
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  sendRaw() — the actual syscall that gives bytes to the OS network stack
// ─────────────────────────────────────────────────────────────────────────────
bool Sender::sendRaw(const std::string& data) {
    if (socket_ == INVALID_SOCKET) return false;

    // Build a minimal HTTP/1.1 POST request.
    // "Connection: keep-alive" tells the server: don't close the socket.
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

    // ::send() may not send ALL bytes in one call on a busy socket.
    // We loop until every byte is delivered.
    int totalSent = 0;
    int toSend    = (int)reqStr.size();
    const char* ptr = reqStr.c_str();

    while (totalSent < toSend) {
        int sent = ::send(socket_, ptr + totalSent, toSend - totalSent, 0);
        if (sent == SOCKET_ERROR) {
            std::cerr << "[Sender] send() error: " << WSAGetLastError() << "\n";
            return false;
        }
        totalSent += sent;
    }

    // Read and discard the HTTP response (e.g. "200 OK").
    // We must drain the response or the server's TCP buffer will fill up
    // and stop accepting new data from us.
    char buf[512];
    ::recv(socket_, buf, sizeof(buf) - 1, 0);

    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
//  serializeGPS() — convert a GPSData struct to a JSON string
//  std::ostringstream works exactly like std::cout but writes to a string.
// ─────────────────────────────────────────────────────────────────────────────
std::string Sender::serializeGPS(const GPSData& d) {
    std::ostringstream ss;
    ss << std::fixed << std::setprecision(6)   // e.g. 106.700123 not 106.7
       << "{\"vehicle_id\":\"" << d.vehicle_id << "\","
       << "\"route\":"         << d.route       << ","
       << "\"latitude\":"      << d.latitude    << ","
       << "\"longitude\":"     << d.longitude   << ","
       << "\"speed\":"         << d.speed       << ","
       << "\"heading\":"       << d.heading     << ","
       << "\"timestamp\":"     << d.timestamp   << ","
       << "\"synced\":"        << d.synced      << "}";
    return ss.str();
}