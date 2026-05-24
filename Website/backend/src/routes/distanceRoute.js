import { Router } from 'express'
import { getDistance, getNearestBus, getEstimate } from '../controllers/distanceController.js'

const router = Router()

// GET /api/distance                — point-to-point | bus-to-point | nearest-stop
// GET /api/distance/nearest-bus   — nearest active bus on a route to a point
// GET /api/distance/estimate      — mock ETA for nearest bus on a route
router.get('/', getDistance)
router.get('/nearest-bus', getNearestBus)
router.get('/estimate', getEstimate)

export default router
