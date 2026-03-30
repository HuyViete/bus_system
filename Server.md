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
4. Start metrics flusher (`startIngestionMetricsFlusher`) to persist per-minute ingest stats.
5. Start Express server on `PORT`.

If PostgreSQL is unreachable, startup fails and the server exits.

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

For each packet, the server executes these steps:

1. Maintain in-memory vehicle state (last speed/location/timestamp, stop/trip state).
2. Persist raw telemetry row to `gps_telemetry_raw`.
3. Upsert current live state into `gps_latest`.
4. Detect anomalies and write `anomaly_events`.
5. Detect stop arrivals/departures and write:
	- `stop_events`
	- `dwell_times`
	- `headway_records`
	- `speed_profiles`
6. Update trip lifecycle in `trip_logs`.

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

- Fast latest snapshot per bus for live map APIs.

Behavior:

- Upsert by `vehicle_id` (one row per active bus).
- Updated for each packet.

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

## 7. Why this storage design fits prediction/analysis

For future ML models, this design gives:

1. Stable raw truth (`gps_telemetry_raw`) for supervised and unsupervised training.
2. Ready-made derived labels/features (`dwell_times`, `headway_records`, `speed_profiles`, `anomaly_events`).
3. Experiment tracking across infrastructure phases (`ingest_metrics_minute` + `phase`).

## 8. Current limitations (important)

1. No Kafka queue yet: ingestion and processing are still in the same service.
2. No Redis cache yet: live reads come from Postgres fallback table (`gps_latest`).
3. No Spark layer yet: feature jobs are still online/transactional rather than offline batch.

These are expected and can be compared quantitatively later using `ingest_metrics_minute`.

## 9. Suggested phase naming convention

Set `PIPELINE_PHASE` per rollout so metrics are comparable:

- `baseline-http-postgres`
- `kafka-v1`
- `kafka-redis-v1`
- `kafka-redis-spark-v1`

Then query:

- `GET /api/events/ingestion-metrics?minutes=60`
- `GET /api/events/ingestion-metrics?minutes=60&phase=kafka-v1`

This gives direct before/after numbers with the same schema.
