// GET /api/distance/* — distance calculation endpoints.
import { Router } from 'express'
import { getDistance, getNearestBus, getStationDetails } from '../controllers/distanceController.js'

const router = Router()

// GET /api/distance                — point-to-point | bus-to-point | nearest-stop
// GET /api/distance/nearest-bus   — nearest active bus on a route to a point
// GET /api/distance/station-details — details, nearest buses, and ETAs for all routes passing through a station
router.get('/', getDistance)
router.get('/nearest-bus', getNearestBus)
router.get('/station-details', getStationDetails)

export default router
