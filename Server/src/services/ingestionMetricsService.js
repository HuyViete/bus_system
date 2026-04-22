// In-memory ingestion counters flushed to PostgreSQL periodically.
import config from '../config/index.js'
import * as ingestionMetricModel from '../models/ingestionMetricModel.js'

const phase = config.pipelinePhase
let flusher = null

function minuteBucketStart(date = new Date()) {
    const d = new Date(date)
    d.setSeconds(0, 0)
    return d
}

function emptyBucket(startedAt = minuteBucketStart()) {
    return {
        phase, bucket_start: startedAt,
        packets_received: 0, packets_valid: 0, packets_invalid: 0,
        processed_ok: 0, processed_fail: 0,
        raw_insert_ok: 0, raw_insert_fail: 0, raw_insert_duplicate: 0,
        processing_samples: 0, processing_ms_total: 0, processing_ms_max: 0,
    }
}

let current = emptyBucket()
let completed = []

function rotateIfNeeded(now = new Date()) {
    const bucket = minuteBucketStart(now)
    if (bucket.getTime() !== current.bucket_start.getTime()) {
        completed.push({ ...current })
        current = emptyBucket(bucket)
    }
}

export function recordPacketReceived()     { rotateIfNeeded(); current.packets_received++ }
export function recordPacketValid()        { rotateIfNeeded(); current.packets_valid++ }
export function recordPacketInvalid()      { rotateIfNeeded(); current.packets_invalid++ }
export function recordRawInsertOk()        { rotateIfNeeded(); current.raw_insert_ok++ }
export function recordRawInsertFail()      { rotateIfNeeded(); current.raw_insert_fail++ }
export function recordRawInsertDuplicate() { rotateIfNeeded(); current.raw_insert_duplicate++ }

export function recordProcessingResult(ok, durationMs) {
    rotateIfNeeded()
    if (ok) current.processed_ok++
    else current.processed_fail++
    current.processing_samples++
    const ms = Math.max(0, Number(durationMs) || 0)
    current.processing_ms_total += ms
    current.processing_ms_max = Math.max(current.processing_ms_max, ms)
}

// Flush all completed + current buckets to PostgreSQL.
export async function flush() {
    rotateIfNeeded()
    const snapshots = [...completed, { ...current }]
    completed = []

    for (const bucket of snapshots) {
        const hasTraffic = bucket.packets_received > 0 || bucket.raw_insert_ok > 0 || bucket.raw_insert_fail > 0
        if (!hasTraffic) continue
        await ingestionMetricModel.upsert(bucket)
    }
}

export function startFlusher(intervalMs = config.metricsFlushIntervalMs) {
    if (flusher) return
    flusher = setInterval(() => {
        flush().catch(err => console.error(`[Metrics] flush failed: ${err.message}`))
    }, intervalMs)
    if (typeof flusher.unref === 'function') flusher.unref()
}
