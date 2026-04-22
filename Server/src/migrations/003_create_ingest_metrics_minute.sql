CREATE TABLE IF NOT EXISTS ingest_metrics_minute (
    id                    BIGSERIAL PRIMARY KEY,
    phase                 TEXT        NOT NULL,
    bucket_start          TIMESTAMPTZ NOT NULL,
    packets_received      INTEGER     NOT NULL DEFAULT 0,
    packets_valid         INTEGER     NOT NULL DEFAULT 0,
    packets_invalid       INTEGER     NOT NULL DEFAULT 0,
    processed_ok          INTEGER     NOT NULL DEFAULT 0,
    processed_fail        INTEGER     NOT NULL DEFAULT 0,
    raw_insert_ok         INTEGER     NOT NULL DEFAULT 0,
    raw_insert_fail       INTEGER     NOT NULL DEFAULT 0,
    raw_insert_duplicate  INTEGER     NOT NULL DEFAULT 0,
    processing_samples    INTEGER     NOT NULL DEFAULT 0,
    processing_ms_total   BIGINT      NOT NULL DEFAULT 0,
    processing_ms_max     INTEGER     NOT NULL DEFAULT 0,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (phase, bucket_start)
);
CREATE INDEX IF NOT EXISTS idx_metrics_phase_bucket ON ingest_metrics_minute(phase, bucket_start DESC);
