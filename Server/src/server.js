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

app.post('/api/gps', (req, res) => {
    console.log('Received GPS Data:', req.body)
    const { vehicle_id, latitude, longitude, timestamp } = req.body
    const query = 'INSERT INTO gps (vehicle_id, latitude, longitude, timestamp) VALUES ($1, $2, $3, $4)'
    pool.query(query, [vehicle_id, latitude, longitude, timestamp])
    res.status(200).send('GPS Data received')
})

app.post('/api/sensor', (req, res) => {
    console.log('Received Sensor Data:', req.body)
    res.status(200).send('Sensor Data received')
})

app.post('/api/eta', (req, res) => {
    console.log('Received ETA Data:', req.body)
    res.status(200).send('ETA Data received')
})
