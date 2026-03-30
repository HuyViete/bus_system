import pool from './db.js'

const phase = process.env.PIPELINE_PHASE || 'baseline-http-postgres'

function minuteBucketStart(date = new Date()) {
    const d = new Date(date)
    d.setSeconds(0, 0)
    return d
}

function emptyBucket(startedAt = minuteBucketStart()) {
    return {
        phase,
        bucket_start: startedAt,
        packets_received: 0,
        packets_valid: 0,
        packets_invalid: 0,
        processed_ok: 0,
        processed_fail: 0,
        raw_insert_ok: 0,
        raw_insert_fail: 0,
        raw_insert_duplicate: 0,
        processing_samples: 0,
        processing_ms_total: 0,
        processing_ms_max: 0,
    }
}

let current = emptyBucket()
let completed = []
let flusher = null

function rotateIfNeeded(now = new Date()) {
    const bucket = minuteBucketStart(now)
    if (bucket.getTime() !== current.bucket_start.getTime()) {
        completed.push({ ...current })
        current = emptyBucket(bucket)
    }
}

export function recordPacketReceived() {
    rotateIfNeeded()
    current.packets_received++
}

export function recordPacketValid() {
    rotateIfNeeded()
    current.packets_valid++
}

export function recordPacketInvalid() {
    rotateIfNeeded()
    current.packets_invalid++
}

export function recordProcessingResult(ok, durationMs) {
    rotateIfNeeded()
    if (ok) current.processed_ok++
    else current.processed_fail++

    current.processing_samples++
    current.processing_ms_total += Math.max(0, Number(durationMs) || 0)
    current.processing_ms_max = Math.max(current.processing_ms_max, Math.max(0, Number(durationMs) || 0))
}

export function recordRawInsertOk() {
    rotateIfNeeded()
    current.raw_insert_ok++
}

export function recordRawInsertFail() {
    rotateIfNeeded()
    current.raw_insert_fail++
}

export function recordRawInsertDuplicate() {
    rotateIfNeeded()
    current.raw_insert_duplicate++
}

async function upsertBucket(bucket) {
    await pool.query(`
        INSERT INTO ingest_metrics_minute (
            phase,
            bucket_start,
            packets_received,
            packets_valid,
            packets_invalid,
            processed_ok,
            processed_fail,
            raw_insert_ok,
            raw_insert_fail,
            raw_insert_duplicate,
            processing_samples,
            processing_ms_total,
            processing_ms_max
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
        )
        ON CONFLICT (phase, bucket_start)
        DO UPDATE SET
            packets_received    = EXCLUDED.packets_received,
            packets_valid       = EXCLUDED.packets_valid,
            packets_invalid     = EXCLUDED.packets_invalid,
            processed_ok        = EXCLUDED.processed_ok,
            processed_fail      = EXCLUDED.processed_fail,
            raw_insert_ok       = EXCLUDED.raw_insert_ok,
            raw_insert_fail     = EXCLUDED.raw_insert_fail,
            raw_insert_duplicate= EXCLUDED.raw_insert_duplicate,
            processing_samples  = EXCLUDED.processing_samples,
            processing_ms_total = EXCLUDED.processing_ms_total,
            processing_ms_max   = EXCLUDED.processing_ms_max
    `, [
        bucket.phase,
        bucket.bucket_start,
        bucket.packets_received,
        bucket.packets_valid,
        bucket.packets_invalid,
        bucket.processed_ok,
        bucket.processed_fail,
        bucket.raw_insert_ok,
        bucket.raw_insert_fail,
        bucket.raw_insert_duplicate,
        bucket.processing_samples,
        bucket.processing_ms_total,
        bucket.processing_ms_max,
    ])
}

export async function flushIngestionMetrics() {
    rotateIfNeeded()

    const snapshots = [...completed, { ...current }]
    completed = []

    for (const bucket of snapshots) {
        const hasTraffic = bucket.packets_received > 0 || bucket.raw_insert_ok > 0 || bucket.raw_insert_fail > 0
        if (!hasTraffic) continue
        await upsertBucket(bucket)
    }
}

export function startIngestionMetricsFlusher(intervalMs = 10000) {
    if (flusher) return

    flusher = setInterval(() => {
        flushIngestionMetrics().catch((err) => {
            console.error(`[Metrics] flush failed: ${err.message}`)
        })
    }, intervalMs)

    if (typeof flusher.unref === 'function') {
        flusher.unref()
    }
}
