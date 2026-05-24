// GET /api/events/* — analytics and live data endpoints.
import { Router } from 'express'
import { getLivePositions } from '../controllers/liveController.js'
import { getStopEvents } from '../controllers/stopEventController.js'
import { getDwellStats } from '../controllers/dwellController.js'
import { getTrips } from '../controllers/tripController.js'
import { getSpeedProfiles } from '../controllers/speedController.js'
import { getHeadway } from '../controllers/headwayController.js'
import { getAnomalies } from '../controllers/anomalyController.js'
import { getIngestionMetrics } from '../controllers/metricsController.js'

const router = Router()

router.get('/live', getLivePositions)
router.get('/stops', getStopEvents)
router.get('/dwell', getDwellStats)
router.get('/trips', getTrips)
router.get('/speed', getSpeedProfiles)
router.get('/headway', getHeadway)
router.get('/anomalies', getAnomalies)
router.get('/ingestion-metrics', getIngestionMetrics)

// NOTE: router.post('/event', saveStopEvent) was removed — saveStopEvent was never
// defined or imported (known bug #1). Stop events are persisted internally by
// gpsIngestionService.js; no external write endpoint is needed at this time.

export default router
