// CRUD for anomaly_events — detected operational anomalies.
import pool from '../libs/db.js'

export async function insert({ vehicle_id, route, anomaly_type, severity, latitude, longitude, detail, occurred_at }) {
    await pool.query(`
        INSERT INTO anomaly_events (vehicle_id, route, anomaly_type, severity, latitude, longitude, detail, occurred_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [vehicle_id, route, anomaly_type, severity, latitude, longitude, JSON.stringify(detail), occurred_at])
}

export async function findMany({ vehicle_id, anomaly_type, severity, limit = 100 }) {
    const params = []
    const conditions = []

    if (vehicle_id)   { params.push(vehicle_id);   conditions.push(`vehicle_id = $${params.length}`) }
    if (anomaly_type) { params.push(anomaly_type); conditions.push(`anomaly_type = $${params.length}`) }
    if (severity)     { params.push(severity);     conditions.push(`severity = $${params.length}`) }

    params.push(Math.min(Number(limit), 1000))
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const { rows } = await pool.query(`
        SELECT * FROM anomaly_events ${where} ORDER BY occurred_at DESC LIMIT $${params.length}
    `, params)
    return rows
}
