// alternativeRouteController.js — handles detour API requests.

import { findDetour, checkCongestion } from '../services/alternativeRouteService.js'

/**
 * GET /api/routes/detour
 * Query params: from_lat, from_lon, to_lat, to_lon
 * Returns: direct path + alternative detour paths with ML-predicted ETAs.
 */
export async function getDetour(req, res, next) {
    try {
        const { from_lat, from_lon, to_lat, to_lon } = req.query

        if (!from_lat || !from_lon || !to_lat || !to_lon) {
            return res.status(400).json({
                error: 'Missing required query params: from_lat, from_lon, to_lat, to_lon',
            })
        }

        const fromLat = parseFloat(from_lat)
        const fromLon = parseFloat(from_lon)
        const toLat   = parseFloat(to_lat)
        const toLon   = parseFloat(to_lon)

        if ([fromLat, fromLon, toLat, toLon].some(isNaN)) {
            return res.status(400).json({ error: 'Invalid coordinate values' })
        }

        const result = await findDetour(fromLat, fromLon, toLat, toLon)
        res.json({ ok: true, ...result })
    } catch (err) {
        next(err)
    }
}

/**
 * GET /api/routes/detour/check
 * Query params: from_lat, from_lon, to_lat, to_lon
 * Returns: congestion check only (no alternative paths computed).
 */
export async function getCheckCongestion(req, res, next) {
    try {
        const { from_lat, from_lon, to_lat, to_lon } = req.query

        if (!from_lat || !from_lon || !to_lat || !to_lon) {
            return res.status(400).json({
                error: 'Missing required query params: from_lat, from_lon, to_lat, to_lon',
            })
        }

        const fromLat = parseFloat(from_lat)
        const fromLon = parseFloat(from_lon)
        const toLat   = parseFloat(to_lat)
        const toLon   = parseFloat(to_lon)

        if ([fromLat, fromLon, toLat, toLon].some(isNaN)) {
            return res.status(400).json({ error: 'Invalid coordinate values' })
        }

        const result = await checkCongestion(fromLat, fromLon, toLat, toLon)
        res.json({ ok: true, ...result })
    } catch (err) {
        next(err)
    }
}
