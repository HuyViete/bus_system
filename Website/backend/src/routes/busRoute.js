import { Router } from 'express'
import { getLiveBuses } from '../controllers/busController.js'

const router = Router()

// GET /api/buses/live          — all active buses
// GET /api/buses/live?route=1  — only buses on route 1
router.get('/live', getLiveBuses)

export default router
