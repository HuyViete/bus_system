ALTER TABLE gps_latest
    ADD COLUMN IF NOT EXISTS dist_along_route    DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS next_stop_id        INTEGER,
    ADD COLUMN IF NOT EXISTS dist_to_next_stop   DOUBLE PRECISION;
