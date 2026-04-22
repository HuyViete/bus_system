// CRUD for ingest_metrics_minute — per-minute ingestion KPIs by pipeline phase.
import pool from '../libs/db.js'

export async function upsert(bucket) {
    await pool.query(`
        INSERT INTO ingest_metrics_minute (
            phase, bucket_start, packets_received, packets_valid, packets_invalid,
            processed_ok, processed_fail, raw_insert_ok, raw_insert_fail,
            raw_insert_duplicate, processing_samples, processing_ms_total, processing_ms_max
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (phase, bucket_start)
        DO UPDATE SET
            packets_received     = EXCLUDED.packets_received,
            packets_valid        = EXCLUDED.packets_valid,
            packets_invalid      = EXCLUDED.packets_invalid,
            processed_ok         = EXCLUDED.processed_ok,
            processed_fail       = EXCLUDED.processed_fail,
            raw_insert_ok        = EXCLUDED.raw_insert_ok,
            raw_insert_fail      = EXCLUDED.raw_insert_fail,
            raw_insert_duplicate = EXCLUDED.raw_insert_duplicate,
            processing_samples   = EXCLUDED.processing_samples,
            processing_ms_total  = EXCLUDED.processing_ms_total,
            processing_ms_max    = EXCLUDED.processing_ms_max
    `, [
        bucket.phase, bucket.bucket_start,
        bucket.packets_received, bucket.packets_valid, bucket.packets_invalid,
        bucket.processed_ok, bucket.processed_fail,
        bucket.raw_insert_ok, bucket.raw_insert_fail, bucket.raw_insert_duplicate,
        bucket.processing_samples, bucket.processing_ms_total, bucket.processing_ms_max,
    ])
}

export async function findSummary(minutes, phase) {
    const { rows } = await pool.query(`
        SELECT
            phase,
            SUM(packets_received)     AS packets_received,
            SUM(packets_valid)        AS packets_valid,
            SUM(packets_invalid)      AS packets_invalid,
            SUM(processed_ok)         AS processed_ok,
            SUM(processed_fail)       AS processed_fail,
            SUM(raw_insert_ok)        AS raw_insert_ok,
            SUM(raw_insert_fail)      AS raw_insert_fail,
            SUM(raw_insert_duplicate) AS raw_insert_duplicate,
            SUM(processing_samples)   AS processing_samples,
            SUM(processing_ms_total)  AS processing_ms_total,
            MAX(processing_ms_max)    AS processing_ms_max
        FROM ingest_metrics_minute
        WHERE bucket_start >= NOW() - ($1::int * INTERVAL '1 minute')
          AND ($2::text IS NULL OR phase = $2)
        GROUP BY phase
        ORDER BY phase
    `, [minutes, phase])
    return rows
}

export async function findSeries(minutes, phase) {
    const { rows } = await pool.query(`
        SELECT
            phase, bucket_start, packets_received, packets_valid, packets_invalid,
            processed_ok, processed_fail, raw_insert_ok, raw_insert_fail,
            raw_insert_duplicate, processing_samples, processing_ms_total, processing_ms_max
        FROM ingest_metrics_minute
        WHERE bucket_start >= NOW() - ($1::int * INTERVAL '1 minute')
          AND ($2::text IS NULL OR phase = $2)
        ORDER BY bucket_start ASC, phase ASC
    `, [minutes, phase])
    return rows
}
