// Dashboard routes — analytics and monitoring endpoints for admins.
import { Router } from 'express'
import {
    getOverview,
    getRoutes,
    getLive,
    getAnomalies,
    getOperations,
    getIngestion,
} from '../controllers/dashboard.js'

const router = Router()

router.get('/',           getOverview)    // Fleet + telemetry + anomaly + trip KPI summary
router.get('/routes',     getRoutes)      // Per-route fleet, health scores, trips
router.get('/live',       getLive)        // All vehicle positions (live map snapshot)
router.get('/anomalies',  getAnomalies)   // Anomaly counts, by-type breakdown, recent events
router.get('/operations', getOperations)  // Dwell times, speed profiles, headway stats
router.get('/ingestion',  getIngestion)   // Ingestion pipeline KPIs (?minutes=60)

export default router