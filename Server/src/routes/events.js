import { Router } from 'express'
import {
    getStopEvents,
    getDwellStats,
    getTrips,
    getSpeedProfiles,
    getHeadway,
    getAnomalies,
    getLivePositions,
    getIngestionMetrics,
} from '../controllers/queryController.js'

const router = Router()

// Live map positions
router.get('/live',      getLivePositions)

// Derived event types
router.get('/stops',     getStopEvents)    // ?route=1&stop_id=STOP-42&limit=100
router.get('/dwell',     getDwellStats)    // ?route=1&stop_id=STOP-42
router.get('/trips',     getTrips)         // ?vehicle_id=BUS-2003&route=1&status=completed
router.get('/speed',     getSpeedProfiles) // ?route=1&hour_of_day=8
router.get('/headway',   getHeadway)       // ?route=1&stop_id=STOP-42
router.get('/anomalies', getAnomalies)     // ?vehicle_id=BUS-2003&anomaly_type=hard_brake&severity=warning

// Ingestion benchmarking and before/after architecture comparisons
router.get('/ingestion-metrics', getIngestionMetrics) // ?minutes=60&phase=baseline-http-postgres

export default router
