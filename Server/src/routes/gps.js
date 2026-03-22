import { Router } from 'express'
import { receiveGPS } from '../controllers/gpsController.js'

const router = Router()

// POST /api/gps — bus telemetry ingestion endpoint
router.post('/', receiveGPS)

export default router
