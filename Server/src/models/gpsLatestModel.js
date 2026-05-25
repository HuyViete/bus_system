// CRUD for gps_latest — one row per active vehicle for live map.
import pool from '../libs/db.js'

export async function upsert({ vehicle_id, route, latitude, longitude, speed, heading, updated_at,
    dist_along_route, next_stop_id, dist_to_next_stop }) {
    await pool.query(`
        INSERT INTO gps_latest
            (vehicle_id, route, latitude, longitude, speed, heading, updated_at,
             dist_along_route, next_stop_id, dist_to_next_stop)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (vehicle_id)
        DO UPDATE SET
            route              = EXCLUDED.route,
            latitude           = EXCLUDED.latitude,
            longitude          = EXCLUDED.longitude,
            speed              = EXCLUDED.speed,
            heading            = EXCLUDED.heading,
            updated_at         = EXCLUDED.updated_at,
            dist_along_route   = EXCLUDED.dist_along_route,
            next_stop_id       = EXCLUDED.next_stop_id,
            dist_to_next_stop  = EXCLUDED.dist_to_next_stop
    `, [vehicle_id, route, latitude, longitude, speed, heading, updated_at,
        dist_along_route ?? null, next_stop_id ?? null, dist_to_next_stop ?? null])
}

export async function findActive(route = null) {
    const params = []
    const conditions = [`updated_at > NOW() - INTERVAL '1 minutes'`]

    if (route) { params.push(route); conditions.push(`route = $${params.length}`) }

    const { rows } = await pool.query(`
        SELECT vehicle_id, route, latitude, longitude, speed, heading, updated_at,
               dist_along_route, next_stop_id, dist_to_next_stop
        FROM gps_latest
        WHERE ${conditions.join(' AND ')}
        ORDER BY vehicle_id
    `, params)
    return rows
}

export async function removeActive(vehicle_id) {
    await pool.query(`DELETE FROM gps_latest WHERE vehicle_id = $1`, [vehicle_id])
}
