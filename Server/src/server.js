import express from 'express'
import dotenv from 'dotenv'
import pool from './db.js'

dotenv.config()

const app = express()


app.use(express.json())

app.listen(process.env.PORT, () => {
    console.log('Server is running on port ', process.env.PORT)
})

app.get('/', (req, res) => {
    res.send('Received!')
})

app.post('/api/gps', async (req, res) => {
    console.log('Received GPS Data:', req.body)
    res.status(200).send('GPS Data received')   // always respond so the bus doesn't hang

    // Try to persist to PostgreSQL — if DB is offline, just log and continue.
    const { vehicle_id, route, latitude, longitude, speed, heading, timestamp, synced } = req.body
    const query = `
        INSERT INTO gps (vehicle_id, route, latitude, longitude, speed, heading, timestamp, synced)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `
    try {
        await pool.query(query, [vehicle_id, route, latitude, longitude, speed, heading, timestamp, synced ?? 0])
        console.log(`[DB] Saved GPS for ${vehicle_id}`)
    } catch (err) {
        console.warn(`[DB] PostgreSQL unavailable — data logged but not persisted: ${err.message}`)
    }
})

app.post('/api/sensor', (req, res) => {
    console.log('Received Sensor Data:', req.body)
    res.status(200).send('Sensor Data received')
})

app.post('/api/eta', (req, res) => {
    console.log('Received ETA Data:', req.body)
    res.status(200).send('ETA Data received')
})
