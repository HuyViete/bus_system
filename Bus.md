# Bus Module — Edge Computing Architecture

The C++ Bus simulator in `Bus/` models a fleet of edge devices that generate realistic telemetry with pre-computed events and anomalies.

## Architecture

Each Bus is an edge device that owns:
- **SpeedSimulator** — state machine producing realistic speed, events, and anomalies
- **Sender** — persistent TCP connection to server data port (3000)
- **Receiver** — persistent TCP connection to server command port (4000)
- **GPS** — 3-second tick loop using route waypoints + SpeedSimulator
- **Database** — optional local SQLite buffer per bus

## File Structure

```
Bus/
├── main.cpp           Fleet manager: REPL, spawn/stop, parallel management
├── bus.h / bus.cpp     Bus class: owns all components, lifecycle management
├── gps.h / gps.cpp     GPS loop: 3s tick, edge filter, builds enriched packets
├── speed_sim.h         Event-first speed state machine (DrivingState FSM)
├── sender.h / .cpp     Producer-consumer queue → HTTP POST /api/gps
├── receiver.h / .cpp   Persistent TCP to command port, handles STOP/REROUTE
├── database.h / .cpp   Per-bus SQLite buffer (WAL mode)
├── types.h             GPSData and SensorData structs
├── runtime_config.h    Compile-time toggles
├── route_loader.h      Loads routes.json into RouteMap
├── station_loader.h    Loads stations.json, finds nearby stops per route
├── bus_stats.h         Atomic error counters for fleet diagnostics
├── net_compat.h        Cross-platform socket abstraction
├── routes.json         Route waypoints (340 routes)
└── stations.json       Bus stops (~5,500 stations from OSM)
```

## Edge Computing: Event-First Simulation

The bus generates events first, then adjusts speed to match — not the other way around.

### DrivingState Machine

```
CRUISING ──→ HARD_BRAKING ──→ ACCELERATING ──→ CRUISING
    │                                              ↑
    ├──→ SPEEDING ──→ DECELERATING ────────────────┘
    │                                              ↑
    └──→ DECELERATING (approach stop) ──→ STOPPED_AT_STATION ──→ ACCELERATING
```

States:
- **CRUISING**: 15–45 km/h with small noise
- **ACCELERATING**: +3 km/h per tick toward target
- **DECELERATING**: -4 km/h per tick toward target
- **HARD_BRAKING**: sudden drop of 25–40 km/h, emits `hard_brake` anomaly
- **SPEEDING**: 82–100 km/h for 3–8 ticks, emits `speeding` anomaly
- **STOPPED_AT_STATION**: speed = 0 for 8–30 seconds, emits `arrival`/`departure` events

### What the Edge Computes

| Computation | Output | Server Impact |
|---|---|---|
| Hard brake | `edge_anomalies: ["hard_brake"]` | Server skips re-detection |
| Speeding | `edge_anomalies: ["speeding"]` | Server skips re-detection |
| Stop arrival | `stop_event: "arrival"` | Server writes event + headway |
| Stop departure + dwell | `stop_event: "departure", dwell_seconds: N` | Server writes event + dwell |

### What Stays on the Server

- **Headway / bunching** — requires cross-bus data
- **GPS loss** — edge can't detect its own absence
- **Off-route** — requires route geometry (future: transit graph)
- **Trip lifecycle** — central trip table

## Enriched Packet Format

```json
{
  "vehicle_id": "3001",
  "route": 3,
  "latitude": 10.7526,
  "longitude": 106.6694,
  "speed": 28.5,
  "heading": 185.3,
  "timestamp": 1747384800,
  "edge_anomalies": [],
  "stop_event": "arrival",
  "stop_event_id": 383552890
}
```

On departure:
```json
{
  "stop_event": "departure",
  "stop_event_id": 383552890,
  "dwell_seconds": 18.0
}
```

## Startup Flow

1. `main()` loads `routes.json` (340 routes) and `stations.json` (~5,500 stops)
2. Per-route stop zones are cached (stations within 200m of any route waypoint)
3. Each spawned Bus receives its route waypoints + nearby stop zones
4. SpeedSimulator initialized with stop zones for station detection

## Bus ID Scheme

`vehicle_id = route_id × 1000 + sequence`

Examples: route 3, bus 1 → 3001 | route 11, bus 2 → 11002

## Edge Filter

Packets are only sent when:
- First packet (register bus on server)
- Moved > 5m
- Speed changed > 3 km/h
- 30-second heartbeat (10 ticks)
- Anomaly detected
- Stop event occurred

## Threading Model

Per active bus: 3 threads (GPS loop, Sender worker, Receiver worker).
Plus temporary thread pools for parallel spawn/stop operations.

## Build & Run

```bash
# From project root
build.bat          # Compiles Bus/bus.exe
run.bat            # Starts the fleet manager REPL

# REPL commands
start -n 100              # Spawn 100 buses across all routes
start -r 3 -n 10          # Spawn 10 buses on route 3
list                      # Show active buses
stop -a                   # Stop all buses
exit                      # Shut down
```

## Server Compatibility

The server handles both packet formats:
- **New (edge-computed)**: `stop_event` and `edge_anomalies` present → server persists directly, only runs server-only detection (gps_loss, off_route)
- **Legacy**: fields missing → server runs full detection pipeline (backward compatible)
