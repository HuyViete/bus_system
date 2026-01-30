#include "receiver.h"

Receiver::Receiver() : serverSocket(INVALID_SOCKET), clientSocket(INVALID_SOCKET), running(false) {
    // Initialize Winsock
    WSADATA wsaData;
    int result = WSAStartup(MAKEWORD(2, 2), &wsaData);
    if (result != 0) {
        std::cerr << "WSAStartup failed: " << result << std::endl;
    }
}

Receiver::~Receiver() {
    stop();
    WSACleanup();
}

void Receiver::stop() {
    running = false;
    if (clientSocket != INVALID_SOCKET) {
        closesocket(clientSocket);
        clientSocket = INVALID_SOCKET;
    }
    if (serverSocket != INVALID_SOCKET) {
        closesocket(serverSocket);
        serverSocket = INVALID_SOCKET;
    }
}

void Receiver::handleClient(SOCKET client) {
    char buffer[1024];
    int bytesReceived;

    while (running) {
        bytesReceived = recv(client, buffer, sizeof(buffer) - 1, 0);
        if (bytesReceived > 0) {
            buffer[bytesReceived] = '\0';
            std::cout << "Received GPS data: " << buffer << std::endl;
        } else if (bytesReceived == 0) {
            std::cout << "Client disconnected" << std::endl;
            break;
        } else {
            std::cerr << "recv failed: " << WSAGetLastError() << std::endl;
            break;
        }
    }
    closesocket(client);
}

void Receiver::startServer(int port) {
    struct sockaddr_in serverAddr, clientAddr;
    int clientAddrLen = sizeof(clientAddr);

    // Create socket
    serverSocket = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (serverSocket == INVALID_SOCKET) {
        std::cerr << "Socket creation failed: " << WSAGetLastError() << std::endl;
        return;
    }

    // Setup server address
    serverAddr.sin_family = AF_INET;
    serverAddr.sin_addr.s_addr = INADDR_ANY;
    serverAddr.sin_port = htons(port);

    // Bind socket
    if (bind(serverSocket, (struct sockaddr*)&serverAddr, sizeof(serverAddr)) == SOCKET_ERROR) {
        std::cerr << "Bind failed: " << WSAGetLastError() << std::endl;
        closesocket(serverSocket);
        return;
    }

    // Listen for connections
    if (listen(serverSocket, SOMAXCONN) == SOCKET_ERROR) {
        std::cerr << "Listen failed: " << WSAGetLastError() << std::endl;
        closesocket(serverSocket);
        return;
    }

    std::cout << "Server listening on port " << port << std::endl;
    running = true;

    // Accept and handle clients
    while (running) {
        clientSocket = accept(serverSocket, (struct sockaddr*)&clientAddr, &clientAddrLen);
        if (clientSocket == INVALID_SOCKET) {
            if (running) {
                std::cerr << "Accept failed: " << WSAGetLastError() << std::endl;
            }
            continue;
        }

        std::cout << "Client connected!" << std::endl;
        
        // Handle client in a new thread
        std::thread clientThread(&Receiver::handleClient, this, clientSocket);
        clientThread.detach();
    }
}