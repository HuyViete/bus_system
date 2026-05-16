@echo off
echo [build] Compiling bus.exe...
cd /d "%~dp0Bus"
g++ -std=c++17 -O2 -pthread -o bus.exe main.cpp bus.cpp receiver.cpp sender.cpp database.cpp gps.cpp -L. -lsqlite3 -lws2_32
if %errorlevel% neq 0 (
    echo [build] FAILED
    exit /b 1
)
echo [build] OK - Bus/bus.exe
