@echo off
cd /d "%~dp0Bus"
if not exist bus.exe (
    echo [run] bus.exe not found. Run build.bat first.
    exit /b 1
)
echo [run] Starting bus fleet manager...
bus.exe %*
