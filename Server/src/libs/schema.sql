-- ─────────────────────────────────────────────────────────────────────────────
--  schema.sql  —  Derived event tables for the Bus Tracking System
--
--  PHILOSOPHY:
--  1) Keep one lean typed raw history table as training source-of-truth.
--  2) Keep derived event tables for analytics dashboards.
--  3) Keep ingestion metrics by minute/phase so we can compare architecture
--     changes (baseline vs Kafka vs Redis vs Spark, etc.) with real numbers.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. RAW GPS — latest position only (used for live map, short TTL in Redis in prod)
--    Kept here as a simple fallback/reference; production would use Redis for this.
CREATE TABLE IF NOT EXISTS gps_latest (
    vehicle_id  TEXT PRIMARY KEY,
    route       INTEGER,
    latitude    DOUBLE PRECISION,
    longitude   DOUBLE PRECISION,
    speed       DOUBLE PRECISION,
    heading     DOUBLE PRECISION,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 1b. RAW GPS TELEMETRY HISTORY — append-only training/replay dataset.
--     This is the source-of-truth history for model training and backfills.
CREATE TABLE IF NOT EXISTS gps_telemetry_raw (
    id                BIGSERIAL PRIMARY KEY,
    vehicle_id        TEXT        NOT NULL,
    route             INTEGER     NOT NULL,
    seq_no            BIGINT,
    latitude          DOUBLE PRECISION NOT NULL,
    longitude         DOUBLE PRECISION NOT NULL,
    speed             DOUBLE PRECISION,
    heading           DOUBLE PRECISION,
    device_timestamp  TIMESTAMPTZ NOT NULL,
    ingested_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    quality_flags     JSONB
);
CREATE INDEX IF NOT EXISTS idx_gps_raw_vehicle_time ON gps_telemetry_raw(vehicle_id, device_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_gps_raw_route_time   ON gps_telemetry_raw(route, device_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_gps_raw_ingested     ON gps_telemetry_raw(ingested_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_gps_raw_vehicle_ts ON gps_telemetry_raw(vehicle_id, device_timestamp);

-- Ingestion metrics sampled per minute for architecture before/after analysis.
CREATE TABLE IF NOT EXISTS ingest_metrics_minute (
    id                    BIGSERIAL PRIMARY KEY,
    phase                 TEXT        NOT NULL,
    bucket_start          TIMESTAMPTZ NOT NULL,
    packets_received      INTEGER     NOT NULL DEFAULT 0,
    packets_valid         INTEGER     NOT NULL DEFAULT 0,
    packets_invalid       INTEGER     NOT NULL DEFAULT 0,
    processed_ok          INTEGER     NOT NULL DEFAULT 0,
    processed_fail        INTEGER     NOT NULL DEFAULT 0,
    raw_insert_ok         INTEGER     NOT NULL DEFAULT 0,
    raw_insert_fail       INTEGER     NOT NULL DEFAULT 0,
    raw_insert_duplicate  INTEGER     NOT NULL DEFAULT 0,
    processing_samples    INTEGER     NOT NULL DEFAULT 0,
    processing_ms_total   BIGINT      NOT NULL DEFAULT 0,
    processing_ms_max     INTEGER     NOT NULL DEFAULT 0,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (phase, bucket_start)
);
CREATE INDEX IF NOT EXISTS idx_metrics_phase_bucket ON ingest_metrics_minute(phase, bucket_start DESC);

-- 2. STOP EVENTS — when a bus arrives at / departs from a stop
--    Derived by checking if GPS position enters/exits a stop's geofence radius.
CREATE TABLE IF NOT EXISTS stop_events (
    id          SERIAL PRIMARY KEY,
    vehicle_id  TEXT        NOT NULL,
    route       INTEGER     NOT NULL,
    stop_id     TEXT        NOT NULL,   -- e.g. "STOP-042"
    event_type  TEXT        NOT NULL,   -- 'arrival' | 'departure'
    latitude    DOUBLE PRECISION,       -- bus position when event was detected
    longitude   DOUBLE PRECISION,
    scheduled_at TIMESTAMPTZ,           -- planned time (future: from GTFS)
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delay_seconds INTEGER DEFAULT 0    -- positive = late, negative = early
);
CREATE INDEX IF NOT EXISTS idx_stop_events_vehicle  ON stop_events(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_stop_events_stop     ON stop_events(stop_id);
CREATE INDEX IF NOT EXISTS idx_stop_events_occurred ON stop_events(occurred_at DESC);

-- 3. DWELL TIMES — derived from paired arrival+departure stop_events
--    How long did the bus spend at each stop? (boarding/alighting time)
CREATE TABLE IF NOT EXISTS dwell_times (
    id              SERIAL PRIMARY KEY,
    vehicle_id      TEXT        NOT NULL,
    route           INTEGER     NOT NULL,
    stop_id         TEXT        NOT NULL,
    arrived_at      TIMESTAMPTZ NOT NULL,
    departed_at     TIMESTAMPTZ NOT NULL,
    dwell_seconds   INTEGER     GENERATED ALWAYS AS
                    (EXTRACT(EPOCH FROM (departed_at - arrived_at))::INTEGER) STORED
);
CREATE INDEX IF NOT EXISTS idx_dwell_stop    ON dwell_times(stop_id);
CREATE INDEX IF NOT EXISTS idx_dwell_vehicle ON dwell_times(vehicle_id);

-- 4. TRIP LOGS — one row per completed full route run by a bus
CREATE TABLE IF NOT EXISTS trip_logs (
    id              SERIAL PRIMARY KEY,
    vehicle_id      TEXT        NOT NULL,
    route           INTEGER     NOT NULL,
    started_at      TIMESTAMPTZ NOT NULL,
    ended_at        TIMESTAMPTZ,
    duration_seconds INTEGER,           -- filled when ended_at is set
    stops_visited   INTEGER DEFAULT 0,
    status          TEXT DEFAULT 'in_progress'  -- 'in_progress' | 'completed' | 'aborted'
);
CREATE INDEX IF NOT EXISTS idx_trip_vehicle ON trip_logs(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_trip_route   ON trip_logs(route);
CREATE INDEX IF NOT EXISTS idx_trip_status  ON trip_logs(status);

-- 5. SPEED PROFILES — average speed per road segment at different time windows
--    A "segment" is defined by two consecutive stop IDs on a route.
--    Aggregated every time a bus travels between two stops.
CREATE TABLE IF NOT EXISTS speed_profiles (
    id              SERIAL PRIMARY KEY,
    route           INTEGER     NOT NULL,
    segment_from    TEXT        NOT NULL,   -- stop_id of segment start
    segment_to      TEXT        NOT NULL,   -- stop_id of segment end
    avg_speed_kmh   DOUBLE PRECISION,
    min_speed_kmh   DOUBLE PRECISION,
    max_speed_kmh   DOUBLE PRECISION,
    travel_seconds  INTEGER,                -- time to cross this segment
    distance_m      DOUBLE PRECISION,       -- straight-line distance (approx)
    recorded_at     TIMESTAMPTZ DEFAULT NOW(),
    hour_of_day     SMALLINT,               -- 0–23, for time-of-day analysis
    day_of_week     SMALLINT                -- 0=Sun … 6=Sat
);
CREATE INDEX IF NOT EXISTS idx_speed_segment ON speed_profiles(route, segment_from, segment_to);
CREATE INDEX IF NOT EXISTS idx_speed_hour    ON speed_profiles(hour_of_day);

-- 6. HEADWAY — gap (in seconds) between successive buses at the same stop
--    Computed each time a new bus arrives at a stop that another bus recently left.
CREATE TABLE IF NOT EXISTS headway_records (
    id              SERIAL PRIMARY KEY,
    route           INTEGER     NOT NULL,
    stop_id         TEXT        NOT NULL,
    vehicle_id      TEXT        NOT NULL,   -- the arriving bus
    prev_vehicle_id TEXT,                   -- the previous bus at this stop
    headway_seconds INTEGER     NOT NULL,   -- gap between arrivals
    recorded_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_headway_stop  ON headway_records(stop_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_headway_route ON headway_records(route);

-- 7. ANOMALY EVENTS — unusual conditions detected by the processing engine
CREATE TABLE IF NOT EXISTS anomaly_events (
    id              SERIAL PRIMARY KEY,
    vehicle_id      TEXT        NOT NULL,
    route           INTEGER,
    anomaly_type    TEXT        NOT NULL,
    -- Types: 'hard_brake'     — speed dropped >20 km/h in one tick
    --        'off_route'       — GPS position >100m from nearest route waypoint
    --        'gps_loss'        — no packet received for >30s
    --        'speeding'        — speed >80 km/h (bus speed limit)
    --        'bunching'        — two buses at same stop with headway < 60s
    severity        TEXT        DEFAULT 'warning',  -- 'info' | 'warning' | 'critical'
    latitude        DOUBLE PRECISION,
    longitude       DOUBLE PRECISION,
    detail          JSONB,                          -- extra context (e.g. { speed: 95 })
    occurred_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_anomaly_vehicle  ON anomaly_events(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_type     ON anomaly_events(anomaly_type);
CREATE INDEX IF NOT EXISTS idx_anomaly_occurred ON anomaly_events(occurred_at DESC);
