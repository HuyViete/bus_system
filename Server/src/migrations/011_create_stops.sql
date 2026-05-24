CREATE TABLE IF NOT EXISTS stops (
    stop_id    TEXT NOT NULL,
    route      INTEGER NOT NULL,
    latitude   DOUBLE PRECISION NOT NULL,
    longitude  DOUBLE PRECISION NOT NULL,
    sequence   INTEGER NOT NULL,
    PRIMARY KEY (stop_id, route)
);

CREATE INDEX IF NOT EXISTS idx_stops_route ON stops(route);
