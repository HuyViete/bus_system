// All dashboard read queries — one function per data section, no business logic.
import pool from '../libs/db.js'

// ── Fleet Status ──────────────────────────────────────────────────────────────

export async function getFleetCounts() {
    const { rows } = await pool.query(`
        SELECT
            COUNT(*)                                                          AS total,
            COUNT(*) FILTER (WHERE updated_at > NOW() - INTERVAL '2 minutes') AS active,
            COUNT(*) FILTER (WHERE updated_at <= NOW() - INTERVAL '2 minutes') AS inactive
        FROM gps_latest
    `)
    return rows[0]
}

export async function getFleetByRoute() {
    const { rows } = await pool.query(`
        SELECT
            route,
            COUNT(*)                                                           AS total,
            COUNT(*) FILTER (WHERE updated_at > NOW() - INTERVAL '2 minutes')  AS active
        FROM gps_latest
        GROUP BY route
        ORDER BY route
    `)
    return rows
}

export async function getFleetLiveSnapshot() {
    const { rows } = await pool.query(`
        SELECT vehicle_id, route, latitude, longitude, speed, heading, updated_at
        FROM gps_latest
        ORDER BY vehicle_id
    `)
    return rows
}

// ── Telemetry Volume ──────────────────────────────────────────────────────────

export async function getTelemetryVolume() {
    const { rows } = await pool.query(`
        SELECT
            COUNT(*)                                                              AS total_packets,
            COUNT(*) FILTER (WHERE ingested_at > NOW() - INTERVAL '1 hour')      AS packets_last_hour,
            COUNT(*) FILTER (WHERE ingested_at > NOW() - INTERVAL '1 day')       AS packets_today,
            COUNT(*) FILTER (WHERE ingested_at > NOW() - INTERVAL '7 days')      AS packets_week,
            ROUND(AVG(speed)::numeric, 2)                                         AS avg_speed_kmh,
            MAX(ingested_at)                                                       AS last_packet_at
        FROM gps_telemetry_raw
    `)
    return rows[0]
}

// ── Anomaly Summary ───────────────────────────────────────────────────────────

export async function getAnomalyCounts() {
    const { rows } = await pool.query(`
        SELECT
            COUNT(*)                                                                AS total,
            COUNT(*) FILTER (WHERE occurred_at > NOW() - INTERVAL '1 hour')        AS last_hour,
            COUNT(*) FILTER (WHERE occurred_at > NOW() - INTERVAL '1 day')         AS today,
            COUNT(*) FILTER (WHERE occurred_at > NOW() - INTERVAL '7 days')        AS this_week,
            COUNT(*) FILTER (WHERE occurred_at > NOW() - INTERVAL '30 days')       AS this_month,
            COUNT(*) FILTER (WHERE severity = 'critical')                           AS critical_total,
            COUNT(*) FILTER (WHERE severity = 'critical'
                             AND occurred_at > NOW() - INTERVAL '1 day')           AS critical_today
        FROM anomaly_events
    `)
    return rows[0]
}

export async function getAnomalyByType() {
    const { rows } = await pool.query(`
        SELECT
            anomaly_type,
            severity,
            COUNT(*)                                                           AS total,
            COUNT(*) FILTER (WHERE occurred_at > NOW() - INTERVAL '1 day')    AS today
        FROM anomaly_events
        GROUP BY anomaly_type, severity
        ORDER BY total DESC
    `)
    return rows
}

export async function getRecentAnomalies(limit = 20) {
    const { rows } = await pool.query(`
        SELECT vehicle_id, route, anomaly_type, severity, latitude, longitude, detail, occurred_at
        FROM anomaly_events
        ORDER BY occurred_at DESC
        LIMIT $1
    `, [limit])
    return rows
}

// ── Trip Summary ──────────────────────────────────────────────────────────────

export async function getTripCounts() {
    const { rows } = await pool.query(`
        SELECT
            COUNT(*)                                              AS total,
            COUNT(*) FILTER (WHERE status = 'in_progress')       AS in_progress,
            COUNT(*) FILTER (WHERE status = 'completed')         AS completed,
            COUNT(*) FILTER (WHERE status = 'aborted')           AS aborted,
            COUNT(*) FILTER (WHERE started_at > NOW() - INTERVAL '1 day') AS started_today,
            ROUND(AVG(duration_seconds) FILTER (WHERE status = 'completed')) AS avg_duration_s
        FROM trip_logs
    `)
    return rows[0]
}

export async function getTripsByRoute() {
    const { rows } = await pool.query(`
        SELECT
            route,
            COUNT(*)                                            AS total,
            COUNT(*) FILTER (WHERE status = 'completed')       AS completed,
            COUNT(*) FILTER (WHERE status = 'aborted')         AS aborted,
            ROUND(AVG(duration_seconds) FILTER (WHERE status = 'completed')) AS avg_duration_s
        FROM trip_logs
        GROUP BY route
        ORDER BY route
    `)
    return rows
}

// ── Stop & Dwell Summary ──────────────────────────────────────────────────────

export async function getStopEventCounts() {
    const { rows } = await pool.query(`
        SELECT
            COUNT(*)                                                               AS total,
            COUNT(*) FILTER (WHERE occurred_at > NOW() - INTERVAL '1 hour')       AS last_hour,
            COUNT(*) FILTER (WHERE occurred_at > NOW() - INTERVAL '1 day')        AS today,
            COUNT(*) FILTER (WHERE event_type = 'arrival')                         AS arrivals,
            COUNT(*) FILTER (WHERE event_type = 'departure')                       AS departures
        FROM stop_events
    `)
    return rows[0]
}

export async function getDwellSummary() {
    const { rows } = await pool.query(`
        SELECT
            COUNT(*)                        AS total_samples,
            ROUND(AVG(dwell_seconds))       AS avg_dwell_s,
            MIN(dwell_seconds)              AS min_dwell_s,
            MAX(dwell_seconds)              AS max_dwell_s,
            ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dwell_seconds)) AS median_dwell_s,
            ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY dwell_seconds)) AS p95_dwell_s
        FROM dwell_times
    `)
    return rows[0]
}

export async function getSlowestStops(limit = 10) {
    const { rows } = await pool.query(`
        SELECT
            stop_id,
            route,
            COUNT(*)                    AS samples,
            ROUND(AVG(dwell_seconds))   AS avg_dwell_s,
            MAX(dwell_seconds)          AS max_dwell_s
        FROM dwell_times
        GROUP BY stop_id, route
        HAVING COUNT(*) >= 3
        ORDER BY avg_dwell_s DESC
        LIMIT $1
    `, [limit])
    return rows
}

// ── Headway / Bunching ────────────────────────────────────────────────────────

export async function getHeadwaySummary() {
    const { rows } = await pool.query(`
        SELECT
            COUNT(*)                    AS total_samples,
            ROUND(AVG(headway_seconds)) AS avg_headway_s,
            MIN(headway_seconds)        AS min_headway_s,
            MAX(headway_seconds)        AS max_headway_s,
            COUNT(*) FILTER (WHERE headway_seconds < 60) AS bunching_events
        FROM headway_records
    `)
    return rows[0]
}

export async function getMostBunchedRoutes(limit = 10) {
    const { rows } = await pool.query(`
        SELECT
            route,
            COUNT(*) FILTER (WHERE headway_seconds < 60) AS bunching_count,
            COUNT(*)                                       AS total_arrivals,
            ROUND(AVG(headway_seconds))                    AS avg_headway_s
        FROM headway_records
        GROUP BY route
        ORDER BY bunching_count DESC
        LIMIT $1
    `, [limit])
    return rows
}

// ── Speed & Segment Performance ───────────────────────────────────────────────

export async function getSpeedSummary() {
    const { rows } = await pool.query(`
        SELECT
            COUNT(*)                               AS total_segments,
            ROUND(AVG(avg_speed_kmh)::numeric, 1)  AS avg_speed_kmh,
            ROUND(MIN(avg_speed_kmh)::numeric, 1)  AS min_speed_kmh,
            ROUND(MAX(avg_speed_kmh)::numeric, 1)  AS max_speed_kmh
        FROM speed_profiles
        WHERE avg_speed_kmh IS NOT NULL
    `)
    return rows[0]
}

export async function getSlowestSegments(limit = 10) {
    const { rows } = await pool.query(`
        SELECT
            route,
            segment_from,
            segment_to,
            COUNT(*)                               AS samples,
            ROUND(AVG(avg_speed_kmh)::numeric, 1)  AS avg_speed_kmh,
            ROUND(AVG(travel_seconds))             AS avg_travel_s
        FROM speed_profiles
        WHERE avg_speed_kmh IS NOT NULL
        GROUP BY route, segment_from, segment_to
        HAVING COUNT(*) >= 3
        ORDER BY avg_speed_kmh ASC
        LIMIT $1
    `, [limit])
    return rows
}

// ── Ingestion Performance ─────────────────────────────────────────────────────

export async function getIngestionSummary(minutes = 60) {
    const { rows } = await pool.query(`
        SELECT
            phase,
            SUM(packets_received)                                AS packets_received,
            SUM(packets_valid)                                   AS packets_valid,
            SUM(packets_invalid)                                 AS packets_invalid,
            SUM(processed_ok)                                    AS processed_ok,
            SUM(processed_fail)                                  AS processed_fail,
            SUM(raw_insert_ok)                                   AS raw_insert_ok,
            SUM(raw_insert_duplicate)                            AS raw_insert_duplicate,
            SUM(processing_samples)                              AS processing_samples,
            SUM(processing_ms_total)                             AS processing_ms_total,
            MAX(processing_ms_max)                               AS processing_ms_max
        FROM ingest_metrics_minute
        WHERE bucket_start >= NOW() - ($1::int * INTERVAL '1 minute')
        GROUP BY phase
        ORDER BY phase
    `, [minutes])
    return rows
}

export async function getIngestionTimeSeries(minutes = 60) {
    const { rows } = await pool.query(`
        SELECT
            bucket_start,
            phase,
            packets_received,
            processed_ok,
            processed_fail,
            raw_insert_duplicate,
            processing_ms_max
        FROM ingest_metrics_minute
        WHERE bucket_start >= NOW() - ($1::int * INTERVAL '1 minute')
        ORDER BY bucket_start ASC
    `, [minutes])
    return rows
}

// ── Route Health Score (composite) ───────────────────────────────────────────
// Combines anomaly rate + bunching + avg dwell into a per-route health score.
// NOTE: "users" / customer data is not yet available (requires website backend integration).

export async function getRouteHealthScores() {
    const { rows } = await pool.query(`
        SELECT
            r.route,
            COALESCE(anm.anomaly_count, 0)                                     AS anomaly_count,
            COALESCE(hw.bunching_count, 0)                                      AS bunching_count,
            COALESCE(ROUND(dw.avg_dwell_s::numeric), 0)                         AS avg_dwell_s,
            COALESCE(ROUND(sp.avg_speed_kmh::numeric, 1), 0)                    AS avg_speed_kmh,
            COALESCE(tr.completed, 0)                                           AS trips_completed,
            COALESCE(tr.aborted, 0)                                             AS trips_aborted
        FROM (SELECT DISTINCT route FROM gps_latest)     AS r
        LEFT JOIN (
            SELECT route, COUNT(*) AS anomaly_count
            FROM anomaly_events
            WHERE occurred_at > NOW() - INTERVAL '1 day'
            GROUP BY route
        ) anm ON anm.route = r.route
        LEFT JOIN (
            SELECT route, COUNT(*) FILTER (WHERE headway_seconds < 60) AS bunching_count
            FROM headway_records
            GROUP BY route
        ) hw ON hw.route = r.route
        LEFT JOIN (
            SELECT route, AVG(dwell_seconds) AS avg_dwell_s
            FROM dwell_times
            GROUP BY route
        ) dw ON dw.route = r.route
        LEFT JOIN (
            SELECT route, AVG(avg_speed_kmh) AS avg_speed_kmh
            FROM speed_profiles WHERE avg_speed_kmh IS NOT NULL
            GROUP BY route
        ) sp ON sp.route = r.route
        LEFT JOIN (
            SELECT
                route,
                COUNT(*) FILTER (WHERE status = 'completed') AS completed,
                COUNT(*) FILTER (WHERE status = 'aborted')   AS aborted
            FROM trip_logs
            GROUP BY route
        ) tr ON tr.route = r.route
        ORDER BY r.route
    `)
    return rows
}
