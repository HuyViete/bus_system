// GET /api/distance/* — distance calculation endpoints.
import { Router } from 'express'
import { getDistance, getNearestBus } from '../controllers/distanceController.js'

const router = Router()

// GET /api/distance          — point-to-point | bus-to-point | nearest-stop
// GET /api/distance/nearest-bus — nearest active bus on a route to a point
router.get('/', getDistance)
router.get('/nearest-bus', getNearestBus)

export default router
