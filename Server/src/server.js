import express from 'express'

const app = express()

app.use(express.json())

app.listen(3000, () => {
    console.log('Server is running on port 3000')
})

app.get('/', (req, res) => {
    res.send('Received!')
})

app.post('/api/gps', (req, res) => {
    console.log('Received GPS Data:', req.body)
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
