// estimateController.js — ETA estimation endpoint handler.
import { getEstimateTime, getTrafficStatus } from '../services/estimateService.js'

/**
 * GET /api/estimate
 *
 * Returns a mock ETA for the nearest bus on a route to a given point.
 * Required query params: route, lat, lon
 *
 * Example: GET /api/estimate?route=11&lat=10.78&lon=106.66
 */
export async function getEstimate(req, res) {
    try {
        const { route, lat, lon } = req.query

        if (!route || lat === undefined || lon === undefined) {
            return res.status(400).json({ ok: false, error: 'route, lat, and lon are required' })
        }

        const routeNum  = Number(route)
        const targetLat = parseFloat(lat)
        const targetLon = parseFloat(lon)

        if (isNaN(routeNum) || isNaN(targetLat) || isNaN(targetLon)) {
            return res.status(400).json({ ok: false, error: 'route must be a number; lat and lon must be valid coordinates' })
        }

        const eta     = await getEstimateTime(routeNum, targetLat, targetLon)
        const traffic = getTrafficStatus()

        if (!eta) {
            return res.status(404).json({
                ok: false,
                error: `No active buses found on route ${routeNum}`,
                traffic_status: traffic,
            })
        }

        res.json({
            ok: true,
            route: routeNum,
            ...eta,
            traffic_status: traffic,
        })

    } catch (err) {
        console.error('[EstimateController] getEstimate error:', err.message)
        res.status(500).json({ ok: false, error: err.message })
    }
}