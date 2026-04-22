// CRUD for gps_telemetry_raw — append-only training/replay dataset.
import pool from '../libs/db.js'

export async function insert({ vehicle_id, route, seq_no = null, latitude, longitude, speed, heading, device_timestamp }) {
    try {
        const result = await pool.query(`
            INSERT INTO gps_telemetry_raw
                (vehicle_id, route, seq_no, latitude, longitude, speed, heading, device_timestamp)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (vehicle_id, device_timestamp) DO NOTHING
            RETURNING id
        `, [vehicle_id, route, seq_no, latitude, longitude, speed, heading, device_timestamp])
        return result.rowCount === 0 ? 'duplicate' : 'ok'
    } catch (err) {
        // Fallback: if schema lacks seq_no column, retry without it.
        if (err?.code === '42703' && String(err.message || '').includes('seq_no')) {
            const legacy = await pool.query(`
                INSERT INTO gps_telemetry_raw
                    (vehicle_id, route, latitude, longitude, speed, heading, device_timestamp)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (vehicle_id, device_timestamp) DO NOTHING
                RETURNING id
            `, [vehicle_id, route, latitude, longitude, speed, heading, device_timestamp])
            return legacy.rowCount === 0 ? 'duplicate' : 'ok'
        }
        throw err
    }
}
