// CRUD for gps_latest — one row per active vehicle for live map.
import pool from '../libs/db.js'

export async function upsert({ vehicle_id, route, latitude, longitude, speed, heading, updated_at }) {
    await pool.query(`
        INSERT INTO gps_latest (vehicle_id, route, latitude, longitude, speed, heading, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (vehicle_id)
        DO UPDATE SET
            route      = EXCLUDED.route,
            latitude   = EXCLUDED.latitude,
            longitude  = EXCLUDED.longitude,
            speed      = EXCLUDED.speed,
            heading    = EXCLUDED.heading,
            updated_at = EXCLUDED.updated_at
    `, [vehicle_id, route, latitude, longitude, speed, heading, updated_at])
}

export async function findActive(route = null) {
    const params = []
    const conditions = [`updated_at > NOW() - INTERVAL '2 minutes'`]

    if (route) { params.push(route); conditions.push(`route = $${params.length}`) }

    const { rows } = await pool.query(`
        SELECT vehicle_id, route, latitude, longitude, speed, heading, updated_at
        FROM gps_latest
        WHERE ${conditions.join(' AND ')}
        ORDER BY vehicle_id
    `, params)
    return rows
}
