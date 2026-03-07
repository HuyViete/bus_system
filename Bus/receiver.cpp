#include "receiver.h"
#include <sstream>

// ═════════════════════════════════════════════════════════════════════════════
//  CONCEPT — Why a Bus should be a TCP CLIENT for receiving commands
//
//  Think of walkie-talkies in a fleet:
//    • The dispatch centre (server) has ONE radio tower.
//    • Every bus TUNES IN to that tower.
//    • The tower pushes commands to whichever bus it wants.
//
//  In TCP terms:
//    • Server: bind() → listen() → accept()   (waits for connections)
//    • Client: connect()                       (initiates the connection)
//
//  The server holds one *accepted* socket per connected bus, so it can send
//  a message to BUS-42 specifically without disturbing the others.
//  The bus holds one *connected* socket it keeps open, blocking on recv()
//  until the server sends something.
// ═════════════════════════════════════════════════════════════════════════════

Receiver::Receiver()
    : socket_(INVALID_SOCKET), running_(false)
{
    WSADATA wsa;
    WSAStartup(MAKEWORD(2, 2), &wsa);
}

Receiver::~Receiver() {
    stop();
    WSACleanup();
}

// ─────────────────────────────────────────────────────────────────────────────
//  start() — connect to the server's command channel
// ─────────────────────────────────────────────────────────────────────────────
bool Receiver::start(const std::string& host, int port) {
    socket_ = ::socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (socket_ == INVALID_SOCKET) {
        std::cerr << "[Receiver] socket() failed\n";
        return false;
    }

    struct sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port   = htons(port);
    inet_pton(AF_INET, host.c_str(), &addr.sin_addr);

    if (::connect(socket_, (struct sockaddr*)&addr, sizeof(addr)) == SOCKET_ERROR) {
        std::cerr << "[Receiver] connect() to command channel failed: "
                  << WSAGetLastError() << "\n";
        ::closesocket(socket_);
        socket_ = INVALID_SOCKET;
        return false;
    }

    std::cout << "[Receiver] Command channel open to " << host << ":" << port << "\n";

    running_ = true;
    worker_  = std::thread(&Receiver::listenLoop, this);
    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
//  stop() — graceful shutdown (same join() pattern as Sender)
// ─────────────────────────────────────────────────────────────────────────────
void Receiver::stop() {
    running_ = false;

    // Closing the socket from THIS thread will cause recv() in the WORKER
    // thread to return immediately with an error, which makes the worker
    // exit its loop naturally.  This is the standard technique to unblock
    // a thread that is sleeping inside a blocking syscall.
    if (socket_ != INVALID_SOCKET) {
        ::closesocket(socket_);
        socket_ = INVALID_SOCKET;
    }

    if (worker_.joinable()) {
        worker_.join();  // wait for the listener thread to fully finish
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  listenLoop() — runs on the worker_ thread
//
//  CONCEPT — Blocking I/O
//  ::recv() is a *blocking* call: the CPU puts this thread to SLEEP and it
//  uses ZERO CPU until bytes arrive from the other end.  This is extremely
//  efficient — the thread only wakes up when there is actual work to do.
//  That's why spawning one "listener" thread per bus is affordable; they
//  spend 99.9% of their time sleeping inside recv().
// ─────────────────────────────────────────────────────────────────────────────
void Receiver::listenLoop() {
    char buf[1024];

    while (running_) {
        int bytesReceived = ::recv(socket_, buf, sizeof(buf) - 1, 0);

        if (bytesReceived > 0) {
            buf[bytesReceived] = '\0';
            std::string cmd(buf, bytesReceived);
            handleCommand(cmd);
        }
        else if (bytesReceived == 0) {
            // The server gracefully closed the connection.
            std::cout << "[Receiver] Server closed command channel.\n";
            break;
        }
        else {
            // recv() returned -1.  If we set running_=false and closed the
            // socket ourselves (in stop()), this is expected — not an error.
            if (running_) {
                std::cerr << "[Receiver] recv() error: " << WSAGetLastError() << "\n";
            }
            break;
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  handleCommand() — parse and act on a server command
//  Simple newline-delimited text protocol for now.
//  Example messages the server might send:
//    "STOP\n"
//    "REROUTE 7\n"
//    "SPEED_LIMIT 40\n"
// ─────────────────────────────────────────────────────────────────────────────
void Receiver::handleCommand(const std::string& raw) {
    // Trim whitespace / newline from the command string.
    std::string cmd = raw;
    while (!cmd.empty() && (cmd.back() == '\n' || cmd.back() == '\r' || cmd.back() == ' '))
        cmd.pop_back();

    std::cout << "[Receiver] Command received: \"" << cmd << "\"\n";

    if (cmd == "STOP") {
        std::cout << "[Receiver] Bus instructed to stop.\n";
        // TODO: set a flag that the GPS/Bus reads to halt movement
    }
    else if (cmd.rfind("REROUTE ", 0) == 0) {
        // rfind with position=0 is a fast startsWith check.
        int newRoute = std::stoi(cmd.substr(8));
        std::cout << "[Receiver] Bus instructed to switch to route " << newRoute << ".\n";
        // TODO: pass newRoute to GPS object
    }
    else {
        std::cout << "[Receiver] Unknown command: " << cmd << "\n";
    }
}