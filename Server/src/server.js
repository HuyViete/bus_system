// Server entry point — mounts middleware, routes, and starts services.
import express from 'express'
import config from './config/index.js'
import { runMigrations } from './migrations/runner.js'
import { loadStops, startStaleCleanup } from './services/gpsIngestionService.js'
import { startFlusher } from './services/ingestionMetricsService.js'
import { init as initKafkaProducer, disconnect as disconnectProducer } from './services/kafkaProducerService.js'
import { start as startKafkaConsumer, disconnect as disconnectConsumer } from './services/kafkaConsumerService.js'
import { requestLogger } from './middlewares/requestLogger.js'
import { errorHandler } from './middlewares/errorHandler.js'
import gpsRoutes from './routes/gps.js'
import eventsRoutes from './routes/events.js'
import estimateRoutes from './routes/estimate.js'
import dashboardRoutes from './routes/dashboard.js'
import distanceRoutes from './routes/distance.js'

const app = express()

app.use(express.json())
app.use(requestLogger)

// Mount routes.
app.use('/api/gps', gpsRoutes)
app.use('/api/events', eventsRoutes)
app.use('/api/estimate', estimateRoutes)
app.use('/api/distance', distanceRoutes)
app.use('/dashboard', dashboardRoutes)
app.get('/', (_req, res) => res.json({ status: 'ok' }))

// Global error handler — must be last.
app.use(errorHandler)

async function start() {
    await runMigrations()
    await loadStops()
    startStaleCleanup()
    startFlusher()

    // Connect Kafka producer so gpsController can stream packets.
    await initKafkaProducer()

    // Start Kafka consumer to pull from topic and process into PostgreSQL.
    await startKafkaConsumer()

    app.listen(config.port, config.ip, () => {
        console.log(`[Server] Running on port ${config.port}`)
        console.log(`[Server] Pipeline phase  → ${config.pipelinePhase}`)
        console.log(`[Server] GPS ingestion  → POST /api/gps → Kafka → PostgreSQL`)
        console.log(`[Server] Events query   → GET  /api/events/{live,stops,dwell,trips,speed,headway,anomalies}`)
        console.log(`[Server] Metrics query  → GET  /api/events/ingestion-metrics`)
        console.log(`[Server] Dashboard      → GET  /api/dashboard/{,routes,live,anomalies,operations,ingestion}`)
    })
}

// Graceful shutdown — disconnect Kafka before exiting.
async function shutdown(signal) {
    console.log(`\n[Server] ${signal} received, shutting down...`)
    await disconnectConsumer()
    await disconnectProducer()
    process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

start().catch(err => {
    console.error('[Server] Failed to start:', err.message)
    process.exit(1)
})
