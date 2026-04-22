// CRUD for stop_events — arrival/departure events at bus stops.
import pool from '../libs/db.js'

export async function insert({ vehicle_id, route, stop_id, event_type, latitude, longitude, occurred_at }) {
    await pool.query(`
        INSERT INTO stop_events (vehicle_id, route, stop_id, event_type, latitude, longitude, occurred_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [vehicle_id, route, stop_id, event_type, latitude, longitude, occurred_at])
}

export async function findMany({ route, stop_id, limit = 100 }) {
    const params = []
    const conditions = []

    if (route)   { params.push(route);   conditions.push(`route = $${params.length}`) }
    if (stop_id) { params.push(stop_id); conditions.push(`stop_id = $${params.length}`) }

    params.push(Math.min(Number(limit), 1000))
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const { rows } = await pool.query(`
        SELECT * FROM stop_events ${where} ORDER BY occurred_at DESC LIMIT $${params.length}
    `, params)
    return rows
}
