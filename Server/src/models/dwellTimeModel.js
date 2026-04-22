// CRUD for dwell_times — time a bus spent at each stop.
import pool from '../libs/db.js'

export async function insert({ vehicle_id, route, stop_id, arrived_at, departed_at }) {
    await pool.query(`
        INSERT INTO dwell_times (vehicle_id, route, stop_id, arrived_at, departed_at)
        VALUES ($1, $2, $3, $4, $5)
    `, [vehicle_id, route, stop_id, arrived_at, departed_at])
}

export async function findAggregated({ route, stop_id }) {
    const params = []
    const conditions = []

    if (route)   { params.push(route);   conditions.push(`route = $${params.length}`) }
    if (stop_id) { params.push(stop_id); conditions.push(`stop_id = $${params.length}`) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const { rows } = await pool.query(`
        SELECT
            stop_id, route,
            COUNT(*)                    AS samples,
            ROUND(AVG(dwell_seconds))   AS avg_dwell_s,
            MIN(dwell_seconds)          AS min_dwell_s,
            MAX(dwell_seconds)          AS max_dwell_s
        FROM dwell_times ${where}
        GROUP BY stop_id, route
        ORDER BY avg_dwell_s DESC
    `, params)
    return rows
}
