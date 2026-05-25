// Detour routes — /api/routes/detour

import { Router } from 'express'
import { getDetour, getCheckCongestion } from '../controllers/alternativeRouteController.js'

const router = Router()

// GET /api/routes/detour?from_lat=&from_lon=&to_lat=&to_lon=
router.get('/', getDetour)

// GET /api/routes/detour/check?from_lat=&from_lon=&to_lat=&to_lon=
router.get('/check', getCheckCongestion)

export default router
