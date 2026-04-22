CREATE TABLE IF NOT EXISTS trip_logs (
    id               SERIAL PRIMARY KEY,
    vehicle_id       TEXT        NOT NULL,
    route            INTEGER     NOT NULL,
    started_at       TIMESTAMPTZ NOT NULL,
    ended_at         TIMESTAMPTZ,
    duration_seconds INTEGER,
    stops_visited    INTEGER DEFAULT 0,
    status           TEXT DEFAULT 'in_progress'
);
CREATE INDEX IF NOT EXISTS idx_trip_vehicle ON trip_logs(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_trip_route   ON trip_logs(route);
CREATE INDEX IF NOT EXISTS idx_trip_status  ON trip_logs(status);
