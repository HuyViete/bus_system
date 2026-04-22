// Server entry point — mounts middleware, routes, and starts services.
import express from 'express'
import config from './config/index.js'
import { runMigrations } from './migrations/runner.js'
import { loadStops, startStaleCleanup } from './services/gpsIngestionService.js'
import { startFlusher } from './services/ingestionMetricsService.js'
import { requestLogger } from './middlewares/requestLogger.js'
import { errorHandler } from './middlewares/errorHandler.js'
import gpsRoutes from './routes/gps.js'
import eventsRoutes from './routes/events.js'

const app = express()

app.use(express.json())
app.use(requestLogger)

// Mount routes.
app.use('/api/gps',    gpsRoutes)
app.use('/api/events', eventsRoutes)
app.get('/', (_req, res) => res.json({ status: 'ok' }))

// Global error handler — must be last.
app.use(errorHandler)

async function start() {
    await runMigrations()
    await loadStops()
    startStaleCleanup()
    startFlusher()

    app.listen(config.port, () => {
        console.log(`[Server] Running on port ${config.port}`)
        console.log(`[Server] GPS ingestion  → POST /api/gps`)
        console.log(`[Server] Events query   → GET  /api/events/{live,stops,dwell,trips,speed,headway,anomalies}`)
        console.log(`[Server] Metrics query  → GET  /api/events/ingestion-metrics`)
    })
}

start().catch(err => {
    console.error('[Server] Failed to start:', err.message)
    process.exit(1)
})
