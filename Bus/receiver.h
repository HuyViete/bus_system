#ifndef RECEIVER_H
#define RECEIVER_H

#include <string>
#include <vector>
#include <thread>
#include <iostream>
#include <winsock2.h>
#include <ws2tcpip.h>

#pragma comment(lib, "ws2_32.lib")

class Receiver {
public:
    Receiver();
    ~Receiver();
    void startServer(int port);
    void stop();

private:
    SOCKET serverSocket;
    SOCKET clientSocket;
    bool running;
    void handleClient(SOCKET clientSocket);
};

#endif