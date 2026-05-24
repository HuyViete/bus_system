# AGENTS.md — System Context for AI Implementation

> Read **Bus.md**, **Server.md**, and **README.md** before implementing anything.

---

## 1. System Overview

A real-time GPS tracking platform for a city bus transit network (Ho Chi Minh City).
Buses stream live telemetry → a central server ingests, detects events, and stores data → a website displays everything on a GPU-rendered map.

**Scale targets:**
- 2,100 concurrent buses, 1 GPS packet every 3 seconds each.
- Peak ingestion: ~700 packets/second (with edge filtering; up to 2,100 without).
- 250,000 daily users, ~140 requests/second at peak.
- 340 transit routes, ~5,500 bus stations, ~10,000 waypoints per route.

---

## 2. Repository Structure

```
BigData/
├── Bus/                    # C++ edge device simulator (one process, many buses)
├── Server/                 # Node.js core ingestion & analytics server (Express + PostgreSQL)
├── Website/
│   ├── frontend/           # React + Vite + TailwindCSS + MapLibre GL + deck.gl
│   └── backend/            # Node.js BFF (Express + MongoDB + JWT auth)
├── scripts/                # Data pipeline scripts (transit graph generation)
├── simulation/             # Node.js simulation controller (placeholder, mostly empty)
├── Station/                # Empty — reserved for station data processing
├── benchmark/              # Shell scripts for load testing the ingestion pipeline
├── read/                   # Data reading utilities
├── Bus.md                  # Bus module & edge computing documentation
├── Server.md               # Server module & database schema documentation
├── README.md               # Architecture overview & statistics
├── Installation.md         # Build & run instructions
├── build.bat               # Windows build script for Bus/ (C++ → bus.exe)
├── build.sh                # Linux/WSL build script for Bus/ (C++ → bus.exe)
└── run.bat                 # Windows run script for bus fleet manager
```

---

## 3. Module Details

### 3.1 Bus (C++ Edge Devices) — `Bus/`

**Language:** C++17 | **Build:** `build.bat` (Windows) or `build.sh` (Linux) → `bus.exe` | **Deps:** SQLite3, Winsock2

**Key files:**
| File | Purpose |
|---|---|
| `main.cpp` | Fleet manager: REPL, spawn/stop commands, parallel bus management |
| `bus.h/cpp` | Bus class: owns Sender, Receiver, GPS, Database; lifecycle management |
| `gps.h/cpp` | GPS loop: 3-second tick, edge filtering, distance computation |
| `speed_sim.h` | Event-first speed state machine (DrivingState FSM) |
| `edge_geo.h` | Distance computation using precomputed route graph |
| `transit_graph_loader.h` | Loads `transit_graph.json` into C++ RouteGraph structs |
| `station_loader.h` | Loads `stations.json`, finds nearby stops per route |
| `sender.h/cpp` | Producer-consumer queue → HTTP POST `/api/gps` over persistent TCP |
| `receiver.h/cpp` | Persistent TCP to command port 4000, handles STOP/REROUTE commands |
| `database.h/cpp` | Per-bus SQLite buffer (`db/BUS-<id>.db`), WAL mode |
| `types.h` | `GPSData` and `SensorData` structs |
| `runtime_config.h` | Compile-time toggles: `kEnableLocalDatabase`, `kVerboseBusLogs` |
| `route_loader.h` | Loads `routes.json` into `RouteMap` with waypoints |
| `net_compat.h` | Cross-platform socket abstraction (Winsock/POSIX) |

**Key behaviors:**
- **Event-first simulation:** Speed state machine (`SpeedSimulator`) generates events (hard_brake, speeding, stop arrival/departure) first, then adjusts speed to match. Produces realistic telemetry patterns.
- **Edge distance computation:** Each bus loads its route's precomputed transit graph (`transit_graph.json`) and computes `dist_along_route`, `next_stop_id`, and `dist_to_next_stop` via O(1) lookups.
- **Edge stop detection:** SpeedSimulator detects station proximity and generates arrival/departure events with dwell times.
- **Bus ID scheme:** `vehicle_id = route_id × 1000 + sequence` (e.g., route 11, 2nd bus → `11002`).
- **Edge filtering:** Only sends packets when: first packet, moved >5m, speed changed >3 km/h, 30s heartbeat, anomaly, or stop event.
- **Threading:** 3 threads per bus (GPS loop, Sender worker, Receiver worker) + temp thread pools for bulk spawn/stop.
- **Offline-first:** Bus keeps running with warnings if server is unreachable.
- **GPS tick rate:** 3 seconds.

**Packet format (JSON sent by Sender):**
```json
{
  "vehicle_id": "11001",
  "route": 11,
  "latitude": 10.7721,
  "longitude": 106.6579,
  "speed": 32.5,
  "heading": 185.3,
  "timestamp": 1747387200,
  "edge_anomalies": ["hard_brake"],
  "dist_along_route": 4250.3,
  "next_stop_id": 383552890,
  "dist_to_next_stop": 320.7,
  "stop_event": "arrival",
  "stop_event_id": 383552890
}
```

---

### 3.2 Server (Core Ingestion) — `Server/`

**Language:** Node.js (ESM) | **Framework:** Express 5 | **DB:** PostgreSQL (pg) | **Port:** 3000

**Key files:**
| File | Purpose |
|---|---|
| `src/server.js` | Entry point: migrations → load stops → start flusher → Express listen |
| `src/config/index.js` | All env config (DB, Kafka brokers, pipeline phase, metrics interval) |
| `src/routes/gps.js` | `POST /api/gps` — bus telemetry ingestion |
| `src/routes/events.js` | `GET /api/events/*` — analytics read endpoints |
| `src/routes/dashboard.js` | `GET /dashboard/*` — admin dashboard endpoints |
| `src/routes/estimate.js` | `GET /api/estimate` — ETA estimation endpoint (mocked) |
| `src/routes/distance.js` | `GET /api/distance/*` — point-to-point, bus-to-point, or nearest-stop distance |
| `src/controllers/gpsController.js` | Responds 200 immediately, processes async in background |
| `src/services/gpsIngestionService.js` | Main processing orchestrator: raw persist, live upsert, anomaly detect, stop detect, trip manage |
| `src/services/anomalyDetectionService.js` | Rule-based anomaly detection: hard_brake, speeding, gps_loss, off_route |
| `src/services/stopDetectionService.js` | Geofence-based stop arrival/departure, dwell times, headway, speed profiles, bunching |
| `src/services/tripService.js` | Trip lifecycle: start, complete, abort, stale cleanup |
| `src/services/ingestionMetricsService.js` | In-memory counters flushed to PostgreSQL per minute |
| `src/services/dashboardService.js` | Composes model queries into dashboard API responses |
| `src/services/estimateService.js` | Mock ETA using nearest active bus distance and speed, and time-of-day traffic status |
| `src/services/distanceService.js` | Distance calculations: point-to-point, bus-to-point, nearest bus on route, and nearest stop |
| `src/models/` | One model file per table — all raw SQL via `pg` pool |
| `src/migrations/` | SQL migration files + transactional runner with history tracking |
| `src/middlewares/` | `validateGPS` (field check), `requestLogger`, `errorHandler` |
| `src/libs/db.js` | PostgreSQL connection pool singleton |
| `src/libs/geo.js` | `haversineM()` — Haversine distance in metres |
| `src/libs/constants.js` | Detection thresholds (stop radius, speed limit, bunching, etc.) |
| `src/libs/kafka.js` | KafkaJS client instance (created but **not yet used** in pipeline) |

**Detection thresholds (`constants.js`):**
| Constant | Value | Purpose |
|---|---|---|
| `STOP_RADIUS_M` | 50 | Geofence radius for stop arrival/departure |
| `GPS_LOSS_TIMEOUT_S` | 30 | Gap before flagging GPS loss |
| `HARD_BRAKE_THRESHOLD` | 20 | Speed drop (km/h) for hard brake anomaly |
| `SPEED_LIMIT_KMH` | 80 | Max bus speed before flagging speeding |
| `BUNCHING_THRESHOLD_S` | 60 | Min headway before flagging bus bunching |
| `STALE_VEHICLE_TIMEOUT_S` | 300 | Seconds before marking vehicle as stale/offline |
| `OFF_ROUTE_THRESHOLD_M` | 200 | Distance from nearest stop to flag off-route |

**In-memory state:**
- `vehicleStates` — `Map<vehicle_id, VehicleState>` — tracks last position, speed, stop state, trip context.
- `lastArrivalPerStop` — `Map<route:stop_id, { vehicleId, arrivedAt }>` — for headway calculations.
- `stopList` — Array of all stops loaded from PostgreSQL at startup.

**Processing pipeline (per packet):**

Edge-computed path (new packets with `edge_anomalies`/`stop_event`/`dist_along_route`):
1. Get/create `VehicleState`
2. Persist raw telemetry, upsert live state (with distance fields), persist edge anomalies, persist edge stop events + headway
3. Run server-only detection: `gps_loss`, `off_route`
4. Update in-memory position

Legacy path (old packets without edge fields):
1. Get/create `VehicleState`
2. Persist raw telemetry, upsert live state, full anomaly detection, full stop detection
3. Update in-memory position

**PostgreSQL tables (9 tables + migration history):**
| Table | Purpose | Key behavior |
|---|---|---|
| `gps_telemetry_raw` | Append-only raw history for ML training | Unique index on `(vehicle_id, device_timestamp)` |
| `gps_latest` | One row per bus, latest position + edge distances | Upsert by `vehicle_id`, includes `dist_along_route`, `next_stop_id`, `dist_to_next_stop` |
| `stop_events` | Arrival/departure events at stops | Written by stop detection |
| `dwell_times` | Duration bus spent at each stop | `departed_at - arrived_at` |
| `trip_logs` | Trip lifecycle (in_progress/completed/aborted) | Updated on stop visits |
| `speed_profiles` | Segment travel speed between stops | avg_speed, travel_seconds, distance |
| `headway_records` | Gap between consecutive bus arrivals at same stop | For bunching analytics |
| `anomaly_events` | All detected anomalies with type/severity | hard_brake, speeding, gps_loss, off_route, bunching |
| `ingest_metrics_minute` | Per-minute ingestion KPIs | Segmented by `phase` for before/after comparison |

**API endpoints:**

Ingestion:
- `POST /api/gps` — Bus telemetry ingestion (validates → 200 → async process)

Analytics reads:
- `GET /api/events/live` — Latest positions from `gps_latest`
- `GET /api/events/stops` — Stop event stream
- `GET /api/events/dwell` — Dwell time stats
- `GET /api/events/trips` — Trip logs
- `GET /api/events/speed` — Speed profiles
- `GET /api/events/headway` — Headway statistics
- `GET /api/events/anomalies` — Anomaly history
- `GET /api/events/ingestion-metrics` — Ingestion KPIs (`?minutes=60&phase=...`)

Distance & Geo-computations (newly implemented):
- `GET /api/distance` — Point-to-point, bus-to-point, or nearest-stop distance (`?lat1=&lon1=&lat2=&lon2=` or `?vehicle_id=&lat=&lon=` or `?mode=nearest-stop&lat=&lon=&route=`)
- `GET /api/distance/nearest-bus` — Finds the nearest active bus on a route to a given point (`?route=&lat=&lon=`)

Estimation:
- `GET /api/estimate` — Mock ETA & traffic status using nearest bus speed and distance (`?route=&lat=&lon=`)

Dashboard:
- `GET /dashboard/` — Full overview (fleet, telemetry, anomalies, trips, stops, dwell, headway, speed)
- `GET /dashboard/routes` — Per-route breakdown + health scores + bunching
- `GET /dashboard/live` — All vehicle positions snapshot
- `GET /dashboard/anomalies` — Anomaly detail panel
- `GET /dashboard/operations` — Dwell times, speed profiles, headway stats
- `GET /dashboard/ingestion` — Ingestion pipeline KPIs (`?minutes=60`)

**Environment variables (`Server/.env`):**
```
IP=127.0.0.1
PORT=3000
DB_HOST=localhost
DB_USER=postgres
DB_PASSWORD=<password>
DB_DATABASE=bus_system
DB_PORT=5432
PIPELINE_PHASE=baseline-http-postgres   # (optional, from config)
METRICS_FLUSH_MS=10000                  # (optional, from config)
KAFKA_BROKERS=localhost:9092            # (optional, from config)
```

---

### 3.3 Website Frontend — `Website/frontend/`

**Language:** JavaScript (ESM) | **Framework:** React 19 + Vite 7 | **Styling:** TailwindCSS 4 | **Map:** MapLibre GL + deck.gl 9

**Key files:**
| File | Purpose |
|---|---|
| `src/App.jsx` | React Router: `/` (Home), `/login`, `/register` |
| `src/pages/Home.jsx` | Main page: full-screen map + floating overlays (Navbar, SearchBar, Settings, RouteFilter) |
| `src/components/BusMap.jsx` | MapLibre + deck.gl IconLayer for 2,100 bus markers + route geometry |
| `src/components/RouteFilterPanel.jsx` | Route selection panel to filter displayed buses/routes |
| `src/components/Navbar.jsx` | Top navigation bar |
| `src/components/SearchBar.jsx` | Search functionality |
| `src/components/SettingPanel.jsx` | Settings panel (language, preferences) |
| `src/hooks/useLiveBuses.js` | Polling hook: fetches live bus positions every 3 seconds |
| `src/services/api.js` | Axios service layer: `fetchLiveBuses()`, `login()`, `register()` |

**Data flow:**
```
useLiveBuses (3s poll) → fetchLiveBuses() → GET /api/buses/live (BFF)
                                                    ↓
                                         BFF fetches GET /api/events/live (Server)
                                                    ↓
                                         Shape data → { id, position:[lon,lat], speed, heading, route }
                                                    ↓
                                         BusMap.jsx → deck.gl IconLayer → GPU render
```

**Dependencies:** react, react-dom, react-router-dom, axios, maplibre-gl, react-map-gl, deck.gl, @deck.gl/layers, @deck.gl/react, pmtiles, tailwindcss, zustand, zod, sonner

---

### 3.4 Website Backend (BFF) — `Website/backend/`

**Language:** Node.js (ESM) | **Framework:** Express 5 | **DB:** MongoDB (Mongoose) | **Auth:** JWT + bcrypt | **Port:** 5001

**Key files:**
| File | Purpose |
|---|---|
| `src/server.js` | Entry: CORS config, mount auth, bus & distance routes, connect MongoDB |
| `src/controllers/authController.js` | Register/login with bcrypt + JWT tokens |
| `src/controllers/busController.js` | Proxy live bus data from Server with 3s in-memory cache |
| `src/controllers/distanceController.js` | Proxy distance and mock ETA requests to Server |
| `src/routes/authRoute.js` | `POST /api/auth/login`, `POST /api/auth/register` |
| `src/routes/busRoute.js` | `GET /api/buses/live` (optional `?route=` filter) |
| `src/routes/distanceRoute.js` | `GET /api/distance/*` — proxies distance and mock ETA endpoints to Server |

**Architecture decision:** The BFF exists so the Big Server is never exposed to the public internet. The BFF:
- Handles user auth (MongoDB)
- Caches bus positions in memory (3s TTL) to absorb user request volume
- Shapes data payloads for frontend consumption
- Falls back to stale cached data when Server is unreachable

**Environment variables (`Website/backend/.env`):**
```
BIG_SERVER_URL=http://localhost:3000
PORT=5001
MONGODB_CONNECTIONSTRING=mongodb+srv://...
ACCESS_TOKEN_SECRET=<jwt-secret>
```

---

### 3.5 Simulation — `simulation/`

**Status:** Mostly placeholder. Contains Express server shell on port 3001 that doesn't do anything yet. Intended as a future simulation controller that can drive test scenarios.

---

### 3.6 Benchmark — `benchmark/`

**`baseline_benchmark.sh`:** Progressive load test script. Runs bus.exe at increasing counts (100, 300, 500, 700), measures PostgreSQL row insertion rates, and fetches ingestion metrics from the server API. Outputs results to `benchmark/baseline_results.txt`.

---

## 4. Network Topology

```
Bus (C++ edge devices)
  ├── Sender   → TCP → localhost:3000 → POST /api/gps        → Server
  └── Receiver → TCP → localhost:4000 → (command server, TODO)

Website Frontend (React)
  └── HTTP → localhost:5173 proxy → localhost:5001 → Website Backend (BFF)
                                        └── HTTP → localhost:3000 → Server (GET /api/events/live)

Server (Node.js)
  └── PostgreSQL → localhost:5432 → bus_system database

Website Backend (BFF)
  └── MongoDB Atlas → cloud connection
```

**Port assignments:**
| Service | Port | Protocol |
|---|---|---|
| Server (data ingestion + analytics) | 3000 | HTTP |
| Server (command channel) | 4000 | TCP (raw) |
| Simulation controller | 3001 | HTTP |
| Website Backend (BFF) | 5001 | HTTP |
| Website Frontend (Vite dev) | 5173 | HTTP |
| PostgreSQL | 5432 | TCP |
| MongoDB | Atlas cloud | TCP |

---

## 5. Current Implementation Status

### ✅ Working
- Event-first speed simulation with DrivingState FSM on edge
- Edge-computed anomalies (hard_brake, speeding) — server skips re-detection
- Edge-computed stop detection (arrival, departure, dwell times)
- Edge-computed distances (dist_along_route, next_stop_id, dist_to_next_stop)
- Precomputed transit graph generation (`scripts/build_transit_graph.js`)
- Dual processing pipeline: edge-computed path + legacy backward-compatible path
- Full bus fleet simulator with edge filtering
- GPS ingestion pipeline (HTTP POST → async processing → PostgreSQL)
- Raw telemetry persistence with deduplication
- Live vehicle state tracking (in-memory + `gps_latest` table with distance fields)
- Server-only anomaly detection (gps_loss, off_route, bunching)
- Headway computation from edge stop events
- Trip lifecycle management (start, complete, abort, stale cleanup)
- Ingestion metrics tracking per minute with phase segmentation
- Dashboard API endpoints with comprehensive analytics
- SQL migration system with transactional runner
- Website with GPU-rendered map (MapLibre + deck.gl)
- Live bus polling (3s interval) through BFF proxy
- User auth (register/login) with JWT
- Route filtering in frontend
- Benchmark scripts for progressive load testing
- **Point-to-point and bus-to-point distance calculations** via custom `distanceService`
- **Believable mock ETA and traffic estimation** based on nearest bus distance, speed, and time-of-day
- **Secure BFF proxy caching/routing** for distance and ETA endpoints under `/api/distance/*`

### 🚧 Stubs / Incomplete
- `Receiver` commands (STOP/REROUTE) — Logged but no actual bus state update
- `simulation/` — Only Express shell, no functionality
- `Station/` — Empty directory

### 🔮 Planned (Not Implemented)
- **Apache Kafka:** KafkaJS client exists (`libs/kafka.js`) but is not wired into the ingestion pipeline. Goal: decouple ingestion from processing.
- **Redis:** No Redis dependency yet. `gps_latest` in PostgreSQL is the current fallback. Goal: O(1) live reads.
- **Apache Spark:** No presence yet. Goal: offline batch feature generation.
- **WebSocket push:** Frontend currently polls. Upgrade path: replace `useLiveBuses` polling with `socket.on('bus:update')`.
- sync/retry logic for bus-side SQLite buffer
- Server-to-bus alternative route push via REROUTE command

---

## 6. Technology Stack Summary

| Layer | Technology |
|---|---|
| Edge devices | C++17, SQLite3, raw TCP sockets |
| Core server | Node.js, Express 5, PostgreSQL, pg driver |
| Message queue (planned) | Apache Kafka (KafkaJS) |
| Cache (planned) | Redis |
| Batch processing (planned) | Apache Spark |
| Website backend (BFF) | Node.js, Express 5, MongoDB (Mongoose), JWT, bcrypt |
| Website frontend | React 19, Vite 7, TailwindCSS 4, MapLibre GL JS, deck.gl 9 |
| Map rendering | MapLibre GL (base tiles) + deck.gl (data layers via WebGL/GPU) |
| State management | Zustand (frontend) |
| Validation | Zod (frontend) |

---

## 7. Data Flow (End-to-End)

```
Route waypoint (C++)
  → SpeedSimulator::tick() — event-first state machine
  → GPS::buildSnapshot() — attach speed, anomalies, stop events
  → computeDistances() — edge distance from transit graph
  → EdgeFilterState decision (send/drop)
  → SQLite insert (if enabled)
  → Sender queue (enqueueGPS)
  → HTTP POST /api/gps (persistent TCP, Connection: keep-alive)
  → Server validateGPS middleware
  → gpsController: respond 200 immediately
  → processGPS (async):
      IF edge-computed packet:
        ├── persistRaw → gps_telemetry_raw
        ├── upsert → gps_latest (with dist_along_route, next_stop_id, dist_to_next_stop)
        ├── persistEdgeAnomalies → anomaly_events
        ├── persistEdgeStopEvent → stop_events + dwell_times + headway_records
        └── detectServerOnly → gps_loss, off_route
      ELSE legacy packet:
        ├── persistRaw → gps_telemetry_raw
        ├── upsert → gps_latest
        ├── anomalyDetection.detect → anomaly_events
        └── stopDetection.detect → stop_events + dwell_times + headway_records
  → VehicleState.updatePosition()
```

---

## 8. How to Run

```bash
# 0. Generate transit graph (one-time, or when route/station data changes)
node scripts/build_transit_graph.js

# 1. PostgreSQL and Kafka container
docker compose up -d

# 2. Server
cd Server && npm install && npm run dev

# 3. Website Backend (BFF)
cd Website/backend && npm install && npm run dev

# 4. Website Frontend
cd Website/frontend && npm install && npm run dev

# 5. Build & run buses (Windows)
build.bat              # compiles Bus/bus.exe
run.bat                # starts fleet manager REPL
> start -n 100         # spawn 100 buses across all routes
> start -r 3 -n 10    # spawn 10 buses on route 3
> list                 # show active buses
> stop -a              # stop all buses
> exit
```

---

## 9. Coding Conventions

- **Server:** ESM modules (`import/export`), no semicolons, single quotes, functional style.
- **Bus (C++):** C++17 standard, snake_case for variables, PascalCase for classes, `_` suffix for private members.
- **Frontend:** JSX, functional components, hooks, TailwindCSS utility classes.
- **Database:** Raw SQL queries via `pg` pool (no ORM). One model file per table under `Server/src/models/`.
- **Migrations:** Numbered SQL files (`001_create_*.sql`). Runner applies unapplied ones transactionally.
- **Config:** Environment variables via `.env` + `dotenv`, centralized in `config/index.js`.

---

## 10. Known Bugs

1. **`Website/backend/package.json:5`** — `"main": "src/sever.js"` has a typo (`sever` instead of `server`). Does not affect `npm run dev` since the `scripts.dev` field is correct.

---

## 11. Implementation Phase Plan

The system is designed for incremental infrastructure rollout. Set `PIPELINE_PHASE` in the server `.env` to track metrics per phase:

| Phase | Value | What changes |
|---|---|---|
| Current baseline | `baseline-http-postgres` | Direct HTTP → in-process → PostgreSQL |
| Phase 1: Kafka | `kafka-v1` | HTTP → Kafka topic → consumer → PostgreSQL |
| Phase 2: Redis | `kafka-redis-v1` | + Redis cache for `gps_latest`, live reads from Redis |
| Phase 3: Spark | `kafka-redis-spark-v1` | + Spark batch jobs for feature tables |

Each phase's ingestion performance is comparable via `GET /api/events/ingestion-metrics?phase=<value>`.