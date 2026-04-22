// Read-only access to the stops reference table.
import pool from '../libs/db.js'

export async function findAll() {
    const { rows } = await pool.query(`
        SELECT stop_id, route, latitude, longitude
        FROM stops
        ORDER BY route, sequence
    `)
    return rows
}
