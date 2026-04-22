CREATE TABLE IF NOT EXISTS speed_profiles (
    id              SERIAL PRIMARY KEY,
    route           INTEGER     NOT NULL,
    segment_from    TEXT        NOT NULL,
    segment_to      TEXT        NOT NULL,
    avg_speed_kmh   DOUBLE PRECISION,
    min_speed_kmh   DOUBLE PRECISION,
    max_speed_kmh   DOUBLE PRECISION,
    travel_seconds  INTEGER,
    distance_m      DOUBLE PRECISION,
    recorded_at     TIMESTAMPTZ DEFAULT NOW(),
    hour_of_day     SMALLINT,
    day_of_week     SMALLINT
);
CREATE INDEX IF NOT EXISTS idx_speed_segment ON speed_profiles(route, segment_from, segment_to);
CREATE INDEX IF NOT EXISTS idx_speed_hour    ON speed_profiles(hour_of_day);
