CREATE TABLE IF NOT EXISTS headway_records (
    id              SERIAL PRIMARY KEY,
    route           INTEGER     NOT NULL,
    stop_id         TEXT        NOT NULL,
    vehicle_id      TEXT        NOT NULL,
    prev_vehicle_id TEXT,
    headway_seconds INTEGER     NOT NULL,
    recorded_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_headway_stop  ON headway_records(stop_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_headway_route ON headway_records(route);
