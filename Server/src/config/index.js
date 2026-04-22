// Single source of truth for all environment configuration.
import dotenv from 'dotenv'
dotenv.config()

const config = Object.freeze({
    port: Number(process.env.PORT) || 3000,
    ip: process.env.IP || '127.0.0.1',
    db: Object.freeze({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_DATABASE || 'bus_system',
        port: Number(process.env.DB_PORT) || 5432,
    }),
    pipelinePhase: process.env.PIPELINE_PHASE || 'baseline-http-postgres',
    metricsFlushIntervalMs: Number(process.env.METRICS_FLUSH_MS) || 10000,
})

export default config
