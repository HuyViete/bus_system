CREATE TABLE IF NOT EXISTS anomaly_events (
    id              SERIAL PRIMARY KEY,
    vehicle_id      TEXT        NOT NULL,
    route           INTEGER,
    anomaly_type    TEXT        NOT NULL,
    severity        TEXT        DEFAULT 'warning',
    latitude        DOUBLE PRECISION,
    longitude       DOUBLE PRECISION,
    detail          JSONB,
    occurred_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_anomaly_vehicle  ON anomaly_events(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_type     ON anomaly_events(anomaly_type);
CREATE INDEX IF NOT EXISTS idx_anomaly_occurred ON anomaly_events(occurred_at DESC);
