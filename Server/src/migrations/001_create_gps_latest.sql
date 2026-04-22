CREATE TABLE IF NOT EXISTS gps_latest (
    vehicle_id  TEXT PRIMARY KEY,
    route       INTEGER,
    latitude    DOUBLE PRECISION,
    longitude   DOUBLE PRECISION,
    speed       DOUBLE PRECISION,
    heading     DOUBLE PRECISION,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
