CREATE TABLE IF NOT EXISTS stop_events (
    id            SERIAL PRIMARY KEY,
    vehicle_id    TEXT        NOT NULL,
    route         INTEGER     NOT NULL,
    stop_id       TEXT        NOT NULL,
    event_type    TEXT        NOT NULL,
    latitude      DOUBLE PRECISION,
    longitude     DOUBLE PRECISION,
    scheduled_at  TIMESTAMPTZ,
    occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delay_seconds INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_stop_events_vehicle  ON stop_events(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_stop_events_stop     ON stop_events(stop_id);
CREATE INDEX IF NOT EXISTS idx_stop_events_occurred ON stop_events(occurred_at DESC);
