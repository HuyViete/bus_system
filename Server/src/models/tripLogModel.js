// CRUD for trip_logs — lifecycle tracking per bus trip.
import pool from '../libs/db.js'

export async function insert({ vehicle_id, route, started_at, status = 'in_progress' }) {
    const { rows } = await pool.query(`
        INSERT INTO trip_logs (vehicle_id, route, started_at, status)
        VALUES ($1, $2, $3, $4)
        RETURNING id
    `, [vehicle_id, route, started_at, status])
    return rows[0].id
}

export async function updateStopsVisited(id, stopsVisited) {
    await pool.query(`UPDATE trip_logs SET stops_visited = $1 WHERE id = $2`, [stopsVisited, id])
}

export async function complete(id, endedAt) {
    await pool.query(`
        UPDATE trip_logs
        SET ended_at = $1,
            duration_seconds = EXTRACT(EPOCH FROM ($1 - started_at))::INTEGER,
            status = 'completed'
        WHERE id = $2
    `, [endedAt, id])
}

export async function abort(id) {
    await pool.query(`UPDATE trip_logs SET status = 'aborted', ended_at = NOW() WHERE id = $1`, [id])
}

export async function findMany({ vehicle_id, route, status, limit = 50 }) {
    const params = []
    const conditions = []

    if (vehicle_id) { params.push(vehicle_id); conditions.push(`vehicle_id = $${params.length}`) }
    if (route)      { params.push(route);      conditions.push(`route = $${params.length}`) }
    if (status)     { params.push(status);     conditions.push(`status = $${params.length}`) }

    params.push(Math.min(Number(limit), 500))
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const { rows } = await pool.query(`
        SELECT * FROM trip_logs ${where} ORDER BY started_at DESC LIMIT $${params.length}
    `, params)
    return rows
}
