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
