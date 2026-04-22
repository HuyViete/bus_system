// CRUD for speed_profiles — segment travel speed between consecutive stops.
import pool from '../libs/db.js'

export async function insert({ route, segment_from, segment_to, avg_speed_kmh, travel_seconds, distance_m, recorded_at, hour_of_day, day_of_week }) {
    await pool.query(`
        INSERT INTO speed_profiles
            (route, segment_from, segment_to, avg_speed_kmh, travel_seconds, distance_m, recorded_at, hour_of_day, day_of_week)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [route, segment_from, segment_to, avg_speed_kmh, travel_seconds, distance_m, recorded_at, hour_of_day, day_of_week])
}

export async function findAggregated({ route, hour_of_day }) {
    const params = []
    const conditions = []

    if (route)       { params.push(route);       conditions.push(`route = $${params.length}`) }
    if (hour_of_day) { params.push(hour_of_day); conditions.push(`hour_of_day = $${params.length}`) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const { rows } = await pool.query(`
        SELECT
            route, segment_from, segment_to, hour_of_day,
            COUNT(*)                               AS samples,
            ROUND(AVG(avg_speed_kmh)::numeric, 1)  AS avg_speed_kmh,
            ROUND(AVG(travel_seconds))             AS avg_travel_s,
            ROUND(AVG(distance_m))                 AS avg_distance_m
        FROM speed_profiles ${where}
        GROUP BY route, segment_from, segment_to, hour_of_day
        ORDER BY route, segment_from, hour_of_day
    `, params)
    return rows
}
