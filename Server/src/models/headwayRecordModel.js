// CRUD for headway_records — gap between consecutive buses at a stop.
import pool from '../libs/db.js'

export async function insert({ route, stop_id, vehicle_id, prev_vehicle_id, headway_seconds, recorded_at }) {
    await pool.query(`
        INSERT INTO headway_records (route, stop_id, vehicle_id, prev_vehicle_id, headway_seconds, recorded_at)
        VALUES ($1, $2, $3, $4, $5, $6)
    `, [route, stop_id, vehicle_id, prev_vehicle_id, headway_seconds, recorded_at])
}

export async function findAggregated({ route, stop_id }) {
    const params = []
    const conditions = []

    if (route)   { params.push(route);   conditions.push(`route = $${params.length}`) }
    if (stop_id) { params.push(stop_id); conditions.push(`stop_id = $${params.length}`) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const { rows } = await pool.query(`
        SELECT
            route, stop_id,
            COUNT(*)                        AS samples,
            ROUND(AVG(headway_seconds))     AS avg_headway_s,
            MIN(headway_seconds)            AS min_headway_s,
            MAX(headway_seconds)            AS max_headway_s
        FROM headway_records ${where}
        GROUP BY route, stop_id
        ORDER BY avg_headway_s DESC
    `, params)
    return rows
}
