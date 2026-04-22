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
