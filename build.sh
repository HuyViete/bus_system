#!/usr/bin/env bash
set -euo pipefail

cd Bus

UNAME="$(uname -s)"

# If running under WSL, build a native Windows executable so it can run in cmd/PowerShell.
if grep -qi microsoft /proc/version 2>/dev/null && command -v powershell.exe >/dev/null 2>&1; then
	if command -v wslpath >/dev/null 2>&1; then
		WIN_BUS_PATH="$(wslpath -w "$(pwd)")"
	else
		echo "[build] WSL detected but wslpath is unavailable. Falling back to Linux binary."
		WIN_BUS_PATH=""
	fi

	if [ -n "${WIN_BUS_PATH}" ]; then
		echo "[build] WSL detected. Building Windows executable: bus.exe"
		powershell.exe -NoProfile -Command "Set-Location -LiteralPath '$WIN_BUS_PATH'; g++ -std=c++17 -pthread -o bus.exe main.cpp bus.cpp receiver.cpp sender.cpp database.cpp gps.cpp -L. -lsqlite3 -lws2_32"
		exit 0
	fi
fi

LIBS="-L. -lsqlite3"
OUTPUT="bus"
case "$UNAME" in
	MINGW*|MSYS*|CYGWIN*)
		LIBS="$LIBS -lws2_32"
		OUTPUT="bus.exe"
		;;
esac

echo "[build] Building $OUTPUT"
g++ -std=c++17 -pthread -o "$OUTPUT" main.cpp bus.cpp receiver.cpp sender.cpp database.cpp gps.cpp $LIBS