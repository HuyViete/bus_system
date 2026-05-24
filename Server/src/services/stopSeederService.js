import fs from 'fs'
import path from 'path'
import pool from '../libs/db.js'

/**
 * Automatically seeds the stops table from the C++ edge configurations
 * (transit_graph.json) if the database does not have any stop records.
 */
export async function seedStopsIfNeeded() {
    try {
        const { rows } = await pool.query('SELECT COUNT(*) FROM stops')
        const count = parseInt(rows[0].count, 10)
        if (count > 0) {
            // Already seeded, do nothing
            return
        }
    } catch (err) {
        console.error(`[Seeder] Error checking stops table status: ${err.message}`)
        throw err
    }

    console.log('[Seeder] stops table is empty. Starting automatic seeding...')

    // Resolve transit_graph.json path relative to server root
    const graphPath = path.join(process.cwd(), '../Bus/transit_graph.json')
    if (!fs.existsSync(graphPath)) {
        console.warn(`[Seeder] Warning: transit_graph.json not found at ${graphPath}. Skipping stops seeding.`)
        return
    }

    let graphData
    try {
        graphData = JSON.parse(fs.readFileSync(graphPath, 'utf8'))
    } catch (err) {
        console.error(`[Seeder] Error parsing transit_graph.json: ${err.message}`)
        return
    }

    const routes = graphData.routes || []
    if (routes.length === 0) {
        console.warn('[Seeder] No routes found in transit_graph.json. Skipping.')
        return
    }

    const client = await pool.connect()
    try {
        await client.query('BEGIN')

        let insertedCount = 0
        const values = []
        const valueStrings = []
        let paramIndex = 1

        for (const route of routes) {
            const routeId = route.id
            const stops = route.stops || []
            
            for (let i = 0; i < stops.length; i++) {
                const stop = stops[i]
                const stopId = String(stop.id)
                const lat = stop.lat
                const lon = stop.lon
                const seq = i + 1 // 1-based sequence

                values.push(stopId, routeId, lat, lon, seq)
                valueStrings.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4})`)
                paramIndex += 5
                insertedCount++

                // Chunk inserts to avoid exceeding PostgreSQL parameter limits
                if (values.length >= 1000) {
                    const query = `
                        INSERT INTO stops (stop_id, route, latitude, longitude, sequence)
                        VALUES ${valueStrings.join(', ')}
                        ON CONFLICT (stop_id, route) DO NOTHING
                    `
                    await client.query(query, values)
                    values.length = 0
                    valueStrings.length = 0
                    paramIndex = 1
                }
            }
        }

        // Insert remaining records
        if (values.length > 0) {
            const query = `
                INSERT INTO stops (stop_id, route, latitude, longitude, sequence)
                VALUES ${valueStrings.join(', ')}
                ON CONFLICT (stop_id, route) DO NOTHING
            `
            await client.query(query, values)
        }

        await client.query('COMMIT')
        console.log(`[Seeder] Successfully seeded ${insertedCount} stops into PostgreSQL.`)
    } catch (err) {
        await client.query('ROLLBACK')
        console.error(`[Seeder] Failed to seed stops table: ${err.message}`)
        throw err
    } finally {
        client.release()
    }
}
