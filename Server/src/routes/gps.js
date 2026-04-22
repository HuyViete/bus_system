// POST /api/gps — bus telemetry ingestion endpoint.
import { Router } from 'express'
import { validateGPS } from '../middlewares/validateGPS.js'
import { receiveGPS } from '../controllers/gpsController.js'

const router = Router()

router.post('/', validateGPS, receiveGPS)

export default router
