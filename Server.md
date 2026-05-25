# Server System Guide

This document explains how the current Server module works, how GPS data is stored in PostgreSQL, and what each table is used for.

## 1. Current server responsibilities

The server has 3 main responsibilities:

1. Ingest GPS packets from buses.
2. Persist training and analytics data to PostgreSQL.
3. Serve read APIs for live map and event analytics.

Current runtime architecture (as implemented now):

- Transport: HTTP POST from bus to `POST /api/gps`.
- Processing: Node.js in-process pipeline (`gpsProcessor.js`).
- Storage: PostgreSQL.
- Caching/stream infra (Redis/Kafka/Spark): planned for next phases.

## 2. Startup sequence

On startup (`src/server.js`):

1. Load environment variables from `.env`.
2. Run `initSchema()` to create tables/indexes if missing.
3. Run `loadStops()` to preload stop coordinates into memory.
4. Load the offline-trained XGBoost ONNX model (if `Server/src/artifacts/eta_model.onnx` exists) using `mlPredictorService.js`.
5. Start the metrics flusher (`startIngestionMetricsFlusher`) to persist per-minute ingest stats.
6. Start the Express server on `PORT`.

If PostgreSQL is unreachable, startup fails and the server exits. If the ONNX model is missing, the server outputs a warning and gracefully activates the deterministic mock ETA fallback.

## 3. Request flow (GPS ingestion)

### 3.1 Endpoint

- Route: `POST /api/gps`
- Handler: `receiveGPS` in `src/controllers/gpsController.js`

### 3.2 Ingestion behavior

1. Validate required fields:
	- `vehicle_id`, `route`, `latitude`, `longitude`, `timestamp`
2. Immediately return `200 { ok: true }` to the bus.
3. Continue processing asynchronously in background via `processGPS(packet)`.

This design keeps bus-side latency low and avoids blocking on DB writes.

### 3.3 Processing pipeline (`processGPS`)

The server supports two processing paths based on packet contents:

**Edge-computed path** (new packets with `edge_anomalies` or `stop_event`):
1. Maintain in-memory vehicle state.
2. Persist raw telemetry to `gps_telemetry_raw`.
3. Upsert live state to `gps_latest` (including `dist_along_route`, `next_stop_id`, `dist_to_next_stop`).
4. Persist edge anomalies directly (hard_brake, speeding) — no re-detection.
5. Persist edge stop events directly (arrival, departure, dwell) + compute headway/bunching.
6. Run server-only detection: `gps_loss` and `off_route` only.

**Legacy path** (old packets without edge fields):
1. Same steps 1-3.
4. Full server-side anomaly detection (hard_brake, speeding, gps_loss, off_route).
5. Full server-side stop detection with geofencing.
6. Update trip lifecycle.

If any step fails, processing is marked failed and logged.

## 4. Database storage model (current)

The schema supports 3 layers:

1. Raw telemetry (training source-of-truth).
2. Derived event/feature tables (analytics-ready).
3. Ingestion performance metrics (before/after technology rollout comparison).

---

## 5. Table-by-table purpose

### `gps_telemetry_raw`

Purpose:

- Canonical raw history for model training, replay, and auditing data quality.

Stored fields:

- Bus identity: `vehicle_id`, `route`, optional `seq_no`
- GPS signal: `latitude`, `longitude`, `speed`, `heading`
- Time: `device_timestamp` (from bus), `ingested_at` (server time)
- Optional quality metadata: `quality_flags` (JSONB)

Important behavior:

- Unique index on `(vehicle_id, device_timestamp)` prevents duplicate rows.

---

### `gps_latest`

Purpose:

- Fast latest snapshot per bus for live map and ETA APIs.

Stored fields:

- GPS: `vehicle_id`, `route`, `latitude`, `longitude`, `speed`, `heading`, `updated_at`
- Edge distances: `dist_along_route`, `next_stop_id`, `dist_to_next_stop` (from bus)

Behavior:

- Upsert by `vehicle_id` (one row per active bus).
- Updated for each packet.
- Distance fields are NULL for legacy packets.

---

### `stop_events`

Purpose:

- Discrete arrival/departure events at stops from geofence transitions.

Typical use:

- Timeline analytics, stop-level operations, and downstream dwell/headway calculations.

---

### `dwell_times`

Purpose:

- Time bus spent at each stop.

Key field:

- `dwell_seconds` generated from `departed_at - arrived_at`.

Typical use:

- Boarding/alighting analysis, congestion/operational delay analysis.

---

### `trip_logs`

Purpose:

- Lifecycle for each bus trip (`in_progress`, `completed`, `aborted`).

Typical use:

- Trip completion stats, route-level reliability, model labels for trip outcomes.

---

### `speed_profiles`

Purpose:

- Segment-level travel and speed characteristics between stops.

Typical use:

- ETA feature generation and route performance analysis by hour/day.

---

### `headway_records`

Purpose:

- Time gap between consecutive bus arrivals at the same stop.

Typical use:

- Service regularity and bunching analytics.

---

### `anomaly_events`

Purpose:

- Store rule-based anomalies detected from stream:
  - `hard_brake`
  - `speeding`
  - `gps_loss`
  - `off_route`
  - `bunching`

Typical use:

- Safety alerts, operations monitoring, feature enrichment.

---

### `ingest_metrics_minute`

Purpose:

- Per-minute ingest KPIs by architecture phase (baseline/Kafka/Redis/Spark).

Key fields:

- Volume: `packets_received`, `packets_valid`, `packets_invalid`
- Reliability: `processed_ok`, `processed_fail`, `raw_insert_ok`, `raw_insert_fail`, `raw_insert_duplicate`
- Performance: `processing_ms_total`, `processing_ms_max`, `processing_samples`
- Segmentation: `phase`, `bucket_start`

Typical use:

- Before/after comparison when introducing Kafka, Redis, Spark, etc.

## 6. Read APIs (analytics/live)

Routes under `GET /api/events/*`:

- `/live`        -> latest positions (`gps_latest`)
- `/stops`       -> stop event stream
- `/dwell`       -> dwell stats
- `/trips`       -> trip logs
- `/speed`       -> segment speed profiles
- `/headway`     -> headway statistics
- `/anomalies`   -> anomaly history
- `/ingestion-metrics` -> ingestion KPIs for benchmarking

Routes under `GET /api/distance/*` (newly implemented):

- `/`            -> point-to-point (Haversine), bus-to-point (live), or nearest-stop distance
- `/nearest-bus` -> nearest active bus on a route to a specific lat/lon

Routes under `GET /api/estimate` (fully upgraded):

- `/`            -> ML-backed travel time prediction, confidence intervals, and traffic index calculated via the preloaded ONNX model (falls back to deterministic physics-based mock if model is absent).

Routes under `GET /api/routes/detour/*` (newly implemented):

- `/`            -> generates alternative Bezier detour routes between consecutive stations, evaluates detour segment travel times via ML predictor, and compares savings.
- `/check`      -> returns congestion check flags for specified coordinates.

## 7. Why this storage design fits prediction/analysis

For future ML models, this design gives:

1. Stable raw truth (`gps_telemetry_raw`) for supervised and unsupervised training.
2. Ready-made derived labels/features (`dwell_times`, `headway_records`, `speed_profiles`, `anomaly_events`).
3. Experiment tracking across infrastructure phases (`ingest_metrics_minute` + `phase`).

## 8. Preprocessing

The transit graph must be generated before buses can compute distances:

```bash
node scripts/build_transit_graph.js
```

This reads `Bus/routes.json` + `Bus/stations.json` and outputs `Bus/transit_graph.json` (~5 MB).
Regenerate only when route or station data changes.

## 9. Current limitations (important)

1. No Kafka queue yet: ingestion and processing are still in the same service.
2. No Redis cache yet: live reads come from Postgres fallback table (`gps_latest`).
3. No Spark layer yet: feature jobs are still online/transactional rather than offline batch.

These are expected and can be compared quantitatively later using `ingest_metrics_minute`.

## 10. Suggested phase naming convention

Set `PIPELINE_PHASE` per rollout so metrics are comparable:

- `baseline-http-postgres`
- `kafka-v1`
- `kafka-redis-v1`
- `kafka-redis-spark-v1`

Then query:

- `GET /api/events/ingestion-metrics?minutes=60`
- `GET /api/events/ingestion-metrics?minutes=60&phase=kafka-v1`

This gives direct before/after numbers with the same schema.

---

## 11. Machine Learning & Bezier Detour Routing Architecture

The core server integrates high-performance spatial-temporal forecasting and alternative routing without external pathfinding engines:

### 11.1 ML Inference (`src/services/mlPredictorService.js`)
- Uses `onnxruntime-node` to load the pre-trained XGBoost `.onnx` model asynchronously at startup.
- Feeds real-time features (`latitude`, `longitude`, `speed`, `heading`, `hour_of_day`, `day_of_week`, and destination points) into the inference session.
- Maps spatial coordinates to grid cells to look up traffic profiles.
- Generates travel time predictions (seconds) with a calculated 95% confidence interval based on historical error distributions.

### 11.2 Bezier Detour Generator (`src/services/alternativeRouteService.js`)
- Dynamically calculates alternative route waypoints using a **perpendicular Bezier interpolation algorithm** to create smooth, curved pathways between coordinates.
- Determines detours based on:
  - Congestion levels on the standard path (speed less than `15 km/h` on active buses).
  - Geometry interpolation (scales the Bezier control point perpendicular to the direct chord path).
- Predicts detour segment travel times via the ML predictor to compute comparative travel time savings.
