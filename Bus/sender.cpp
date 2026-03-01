#include "sender.h"
#include <iostream>
#include <sstream>

Sender::Sender() : clientSocket(INVALID_SOCKET), running(false) {
    WSADATA wsaData;
    int result = WSAStartup(MAKEWORD(2, 2), &wsaData);
    if (result != 0) {
        std::cerr << "WSAStartup failed: " << result << std::endl;
    }
}

Sender::~Sender() {
    stop();
    WSACleanup();
}

void Sender::start() {
    clientSocket = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (clientSocket == INVALID_SOCKET) {
        std::cerr << "Socket creation failed: " << WSAGetLastError() << std::endl;
        return;
    }

    struct sockaddr_in serverAddr;
    serverAddr.sin_family = AF_INET;
    serverAddr.sin_port = htons(3000);
    serverAddr.sin_addr.s_addr = inet_addr("127.0.0.1");

    if (connect(clientSocket, (struct sockaddr*)&serverAddr, sizeof(serverAddr)) == SOCKET_ERROR) {
        std::cerr << "Connection to Node.js server failed: " << WSAGetLastError() << std::endl;
        closesocket(clientSocket);
        clientSocket = INVALID_SOCKET;
        return;
    }
    
    running = true;
    std::cout << "Connected to Node.js server at port 3000" << std::endl;
}

void Sender::stop() {
    running = false;
    if (clientSocket != INVALID_SOCKET) {
        closesocket(clientSocket);
        clientSocket = INVALID_SOCKET;
    }
}

void Sender::sendGPSData(GPSData &data) {
    if (!running || clientSocket == INVALID_SOCKET) return;

    std::stringstream jsonStream;
    jsonStream << "{\"vehicle_id\":\"" << data.vehicle_id << "\","
               << "\"route\":" << data.route << ","
               << "\"latitude\":" << data.latitude << ","
               << "\"longitude\":" << data.longitude << ","
               << "\"speed\":" << data.speed << ","
               << "\"heading\":" << data.heading << ","
               << "\"timestamp\":" << data.timestamp << ","
               << "\"synced\":" << data.synced << "}";
    
    std::string jsonStr = jsonStream.str();

    std::stringstream httpReq;
    httpReq << "POST /api/gps HTTP/1.1\r\n"
            << "Host: 127.0.0.1:3000\r\n"
            << "Content-Type: application/json\r\n"
            << "Content-Length: " << jsonStr.length() << "\r\n"
            << "Connection: keep-alive\r\n\r\n"
            << jsonStr;
    
    std::string reqStr = httpReq.str();
    if (send(clientSocket, reqStr.c_str(), reqStr.length(), 0) == SOCKET_ERROR) {
        std::cerr << "Failed to send GPS data" << std::endl;
    } else {
        char buffer[1024];
        recv(clientSocket, buffer, sizeof(buffer) - 1, 0); // read response
    }
}

void Sender::sendSensorData(SensorData &data) {
    if (!running || clientSocket == INVALID_SOCKET) return;

    std::stringstream jsonStream;
    jsonStream << "{\"vehicle_id\":\"" << data.vehicle_id << "\","
               << "\"passenger_count\":" << data.passenger_count << ","
               << "\"timestamp\":" << data.timestamp << ","
               << "\"synced\":" << data.synced << "}";
    
    std::string jsonStr = jsonStream.str();

    std::stringstream httpReq;
    httpReq << "POST /api/sensor HTTP/1.1\r\n"
            << "Host: 127.0.0.1:3000\r\n"
            << "Content-Type: application/json\r\n"
            << "Content-Length: " << jsonStr.length() << "\r\n"
            << "Connection: keep-alive\r\n\r\n"
            << jsonStr;
    
    std::string reqStr = httpReq.str();
    if (send(clientSocket, reqStr.c_str(), reqStr.length(), 0) == SOCKET_ERROR) {
        std::cerr << "Failed to send sensor data" << std::endl;
    } else {
        char buffer[1024];
        recv(clientSocket, buffer, sizeof(buffer) - 1, 0); // read response
    }
}

void Sender::sendEstimatedTime(int station) {
    if (!running || clientSocket == INVALID_SOCKET) return;

    std::stringstream jsonStream;
    jsonStream << "{\"station\":" << station << "}";
    
    std::string jsonStr = jsonStream.str();

    std::stringstream httpReq;
    httpReq << "POST /api/eta HTTP/1.1\r\n"
            << "Host: 127.0.0.1:3000\r\n"
            << "Content-Type: application/json\r\n"
            << "Content-Length: " << jsonStr.length() << "\r\n"
            << "Connection: keep-alive\r\n\r\n"
            << jsonStr;
    
    std::string reqStr = httpReq.str();
    if (send(clientSocket, reqStr.c_str(), reqStr.length(), 0) == SOCKET_ERROR) {
        std::cerr << "Failed to send ETA data" << std::endl;
    } else {
        char buffer[1024];
        recv(clientSocket, buffer, sizeof(buffer) - 1, 0); // read response
    }
}