import express from 'express'
import dotenv from 'dotenv'

import { initSchema } from './libs/initDb.js'
import { loadStops }  from './libs/gpsProcessor.js'
import { startIngestionMetricsFlusher } from './libs/ingestionMetrics.js'

import gpsRoutes    from './routes/gps.js'
import eventsRoutes from './routes/events.js'

dotenv.config()

const app = express()
app.use(express.json())

// ── Mount routes ──────────────────────────────────────────────────────────────
app.use('/api/gps',    gpsRoutes)     // POST /api/gps        ← from buses
app.use('/api/events', eventsRoutes)  // GET  /api/events/*   ← from website/dashboard

app.get('/', (_req, res) => res.json({ status: 'ok' }))

// ── Startup ───────────────────────────────────────────────────────────────────
async function start() {
    // Create all DB tables (idempotent — safe to run every time)
    await initSchema()

    // Load stop list into memory for geofence checks
    await loadStops()

    // Persist in-memory ingestion counters to PostgreSQL every few seconds.
    startIngestionMetricsFlusher()

    app.listen(process.env.PORT, () => {
        console.log(`[Server] Running on port ${process.env.PORT}`)
        console.log(`[Server] GPS ingestion  → POST /api/gps`)
        console.log(`[Server] Events query   → GET  /api/events/{live,stops,dwell,trips,speed,headway,anomalies}`)
        console.log(`[Server] Metrics query  → GET  /api/events/ingestion-metrics?minutes=60&phase=baseline-http-postgres`)
    })
}

start().catch(err => {
    console.error('[Server] Failed to start:', err.message)
    process.exit(1)
})
