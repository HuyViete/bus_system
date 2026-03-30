/**
 * queryController.js
 *
 * Read endpoints for all derived event data.
 * These are used by the Website Backend (BFF) to fetch analytics,
 * dashboards, and map overlays.
 */

import pool from '../libs/db.js'

// ── GET /api/events/stops ──────────────────────────────────────────────────
// Recent stop arrival/departure events. Filter by route or stop_id.
export async function getStopEvents(req, res) {
    const { route, stop_id, limit = 100 } = req.query
    const conditions = []
    const params = []

    if (route)   { params.push(route);   conditions.push(`route = $${params.length}`) }
    if (stop_id) { params.push(stop_id); conditions.push(`stop_id = $${params.length}`) }

    params.push(Math.min(Number(limit), 1000))
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const result = await pool.query(`
        SELECT * FROM stop_events
        ${where}
        ORDER BY occurred_at DESC
        LIMIT $${params.length}
    `, params)

    res.json(result.rows)
}

// ── GET /api/events/dwell ──────────────────────────────────────────────────
// Average dwell time per stop (useful for scheduling analysis).
export async function getDwellStats(req, res) {
    const { route, stop_id } = req.query
    const conditions = []
    const params = []

    if (route)   { params.push(route);   conditions.push(`route = $${params.length}`) }
    if (stop_id) { params.push(stop_id); conditions.push(`stop_id = $${params.length}`) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const result = await pool.query(`
        SELECT
            stop_id,
            route,
            COUNT(*)                            AS samples,
            ROUND(AVG(dwell_seconds))           AS avg_dwell_s,
            MIN(dwell_seconds)                  AS min_dwell_s,
            MAX(dwell_seconds)                  AS max_dwell_s
        FROM dwell_times
        ${where}
        GROUP BY stop_id, route
        ORDER BY avg_dwell_s DESC
    `, params)

    res.json(result.rows)
}

// ── GET /api/events/trips ──────────────────────────────────────────────────
// Trip log records. Filter by vehicle_id or route, limit results.
export async function getTrips(req, res) {
    const { vehicle_id, route, status, limit = 50 } = req.query
    const conditions = []
    const params = []

    if (vehicle_id) { params.push(vehicle_id); conditions.push(`vehicle_id = $${params.length}`) }
    if (route)      { params.push(route);      conditions.push(`route = $${params.length}`) }
    if (status)     { params.push(status);     conditions.push(`status = $${params.length}`) }

    params.push(Math.min(Number(limit), 500))
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const result = await pool.query(`
        SELECT * FROM trip_logs
        ${where}
        ORDER BY started_at DESC
        LIMIT $${params.length}
    `, params)

    res.json(result.rows)
}

// ── GET /api/events/speed ──────────────────────────────────────────────────
// Speed profiles per road segment. Aggregated by hour for heatmap overlays.
export async function getSpeedProfiles(req, res) {
    const { route, hour_of_day } = req.query
    const conditions = []
    const params = []

    if (route)        { params.push(route);        conditions.push(`route = $${params.length}`) }
    if (hour_of_day)  { params.push(hour_of_day);  conditions.push(`hour_of_day = $${params.length}`) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const result = await pool.query(`
        SELECT
            route,
            segment_from,
            segment_to,
            hour_of_day,
            COUNT(*)                            AS samples,
            ROUND(AVG(avg_speed_kmh)::numeric, 1)  AS avg_speed_kmh,
            ROUND(AVG(travel_seconds))          AS avg_travel_s,
            ROUND(AVG(distance_m))              AS avg_distance_m
        FROM speed_profiles
        ${where}
        GROUP BY route, segment_from, segment_to, hour_of_day
        ORDER BY route, segment_from, hour_of_day
    `, params)

    res.json(result.rows)
}

// ── GET /api/events/headway ────────────────────────────────────────────────
// Average headway per stop. Identifies gaps in service.
export async function getHeadway(req, res) {
    const { route, stop_id } = req.query
    const conditions = []
    const params = []

    if (route)   { params.push(route);   conditions.push(`route = $${params.length}`) }
    if (stop_id) { params.push(stop_id); conditions.push(`stop_id = $${params.length}`) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const result = await pool.query(`
        SELECT
            route,
            stop_id,
            COUNT(*)                            AS samples,
            ROUND(AVG(headway_seconds))         AS avg_headway_s,
            MIN(headway_seconds)                AS min_headway_s,
            MAX(headway_seconds)                AS max_headway_s
        FROM headway_records
        ${where}
        GROUP BY route, stop_id
        ORDER BY avg_headway_s DESC
    `, params)

    res.json(result.rows)
}

// ── GET /api/events/anomalies ──────────────────────────────────────────────
// Recent anomaly events. Filter by type, vehicle, or severity.
export async function getAnomalies(req, res) {
    const { vehicle_id, anomaly_type, severity, limit = 100 } = req.query
    const conditions = []
    const params = []

    if (vehicle_id)   { params.push(vehicle_id);   conditions.push(`vehicle_id = $${params.length}`) }
    if (anomaly_type) { params.push(anomaly_type); conditions.push(`anomaly_type = $${params.length}`) }
    if (severity)     { params.push(severity);     conditions.push(`severity = $${params.length}`) }

    params.push(Math.min(Number(limit), 1000))
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const result = await pool.query(`
        SELECT * FROM anomaly_events
        ${where}
        ORDER BY occurred_at DESC
        LIMIT $${params.length}
    `, params)

    res.json(result.rows)
}

// ── GET /api/events/live ───────────────────────────────────────────────────
// Latest position of every active bus (from gps_latest).
// This is what the map calls every few seconds.
export async function getLivePositions(req, res) {
    const { route } = req.query
    const params = []
    const conditions = [`updated_at > NOW() - INTERVAL '2 minutes'`]

    if (route) {
        params.push(route)
        conditions.push(`route = $${params.length}`)
    }

    const result = await pool.query(`
        SELECT vehicle_id, route, latitude, longitude, speed, heading, updated_at
        FROM gps_latest
        WHERE ${conditions.join(' AND ')}
        ORDER BY vehicle_id
    `, params)

    res.json(result.rows)
}

// ── GET /api/events/ingestion-metrics ─────────────────────────────────────
// Compare ingest statistics by architecture phase.
// Query: ?minutes=60&phase=baseline-http-postgres
export async function getIngestionMetrics(req, res) {
    const minutes = Math.min(Math.max(Number(req.query.minutes || 60), 1), 24 * 60)
    const phase = req.query.phase || null

    const summary = await pool.query(`
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

    const series = await pool.query(`
        SELECT
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
        FROM ingest_metrics_minute
        WHERE bucket_start >= NOW() - ($1::int * INTERVAL '1 minute')
          AND ($2::text IS NULL OR phase = $2)
        ORDER BY bucket_start ASC, phase ASC
    `, [minutes, phase])

    const summaryNormalized = summary.rows.map((r) => {
        const samples = Number(r.processing_samples || 0)
        const msTotal = Number(r.processing_ms_total || 0)
        return {
            phase: r.phase,
            packets_received: Number(r.packets_received || 0),
            packets_valid: Number(r.packets_valid || 0),
            packets_invalid: Number(r.packets_invalid || 0),
            processed_ok: Number(r.processed_ok || 0),
            processed_fail: Number(r.processed_fail || 0),
            raw_insert_ok: Number(r.raw_insert_ok || 0),
            raw_insert_fail: Number(r.raw_insert_fail || 0),
            raw_insert_duplicate: Number(r.raw_insert_duplicate || 0),
            processing_samples: samples,
            avg_processing_ms: samples > 0 ? Number((msTotal / samples).toFixed(2)) : 0,
            max_processing_ms: Number(r.processing_ms_max || 0),
        }
    })

    res.json({
        window_minutes: minutes,
        phase,
        summary: summaryNormalized,
        series: series.rows,
    })
}
