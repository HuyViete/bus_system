import { Router } from 'express'
import { getDistance, getNearestBus, getEstimate, getDetour, getDetourCheck, getStationDetails } from '../controllers/distanceController.js'

const router = Router()

// GET /api/distance                — point-to-point | bus-to-point | nearest-stop
// GET /api/distance/nearest-bus   — nearest active bus on a route to a point
// GET /api/distance/estimate      — ML-backed ETA (or mock fallback)
// GET /api/distance/detour        — alternative route suggestions
// GET /api/distance/detour/check  — congestion check only
// GET /api/distance/station-details — details, nearest buses, and ETAs for all routes passing through a station
router.get('/', getDistance)
router.get('/nearest-bus', getNearestBus)
router.get('/estimate', getEstimate)
router.get('/detour', getDetour)
router.get('/detour/check', getDetourCheck)
router.get('/station-details', getStationDetails)

export default router

