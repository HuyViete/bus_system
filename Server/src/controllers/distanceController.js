// distanceController.js — handles distance calculation API endpoints on the Server.
import {
    getDistanceBetweenPoints,
    getDistanceBusToPoint,
    getNearestBusOnRoute,
    getNearestStop,
} from '../services/distanceService.js'
import { getStopList } from '../services/gpsIngestionService.js'

/**
 * GET /api/distance
 *
 * Mode A — point-to-point (straight-line Haversine):
 *   ?lat1=10.77&lon1=106.65&lat2=10.78&lon2=106.66
 *
 * Mode B — bus-to-point (live bus position from gps_latest):
 *   ?vehicle_id=11001&lat=10.78&lon=106.66
 *
 * Mode C — nearest stop to a point (optionally filtered by route):
 *   ?mode=nearest-stop&lat=10.78&lon=106.66
 *   ?mode=nearest-stop&lat=10.78&lon=106.66&route=11
 */
export async function getDistance(req, res) {
    try {
        const { lat1, lon1, lat2, lon2, vehicle_id, lat, lon, route, mode } = req.query

        // Mode C: nearest stop
        if (mode === 'nearest-stop') {
            const targetLat = parseFloat(lat)
            const targetLon = parseFloat(lon)
            if (isNaN(targetLat) || isNaN(targetLon)) {
                return res.status(400).json({ ok: false, error: 'lat and lon are required for nearest-stop mode' })
            }
            const stopList = getStopList()
            const result = getNearestStop(stopList, route ? Number(route) : null, targetLat, targetLon)
            if (!result) {
                return res.status(404).json({ ok: false, error: 'No stops found' })
            }
            return res.json({ ok: true, mode: 'nearest-stop', ...result })
        }

        // Mode B: bus-to-point
        if (vehicle_id) {
            const targetLat = parseFloat(lat)
            const targetLon = parseFloat(lon)
            if (isNaN(targetLat) || isNaN(targetLon)) {
                return res.status(400).json({ ok: false, error: 'lat and lon are required' })
            }
            const result = await getDistanceBusToPoint(vehicle_id, targetLat, targetLon)
            if (!result) {
                return res.status(404).json({ ok: false, error: `Vehicle ${vehicle_id} not found or not active` })
            }
            return res.json({ ok: true, mode: 'bus-to-point', ...result })
        }

        // Mode A: point-to-point
        const p1Lat = parseFloat(lat1)
        const p1Lon = parseFloat(lon1)
        const p2Lat = parseFloat(lat2)
        const p2Lon = parseFloat(lon2)

        if ([p1Lat, p1Lon, p2Lat, p2Lon].some(isNaN)) {
            return res.status(400).json({
                ok: false,
                error: 'Provide lat1, lon1, lat2, lon2 for point-to-point; or vehicle_id, lat, lon for bus-to-point; or mode=nearest-stop, lat, lon',
            })
        }

        const distM = getDistanceBetweenPoints(p1Lat, p1Lon, p2Lat, p2Lon)
        return res.json({
            ok: true,
            mode: 'point-to-point',
            point_a: { lat: p1Lat, lon: p1Lon },
            point_b: { lat: p2Lat, lon: p2Lon },
            distance_m:  Math.round(distM * 10) / 10,
            distance_km: Math.round(distM / 100) / 10,
        })

    } catch (err) {
        console.error('[DistanceController] getDistance error:', err.message)
        res.status(500).json({ ok: false, error: err.message })
    }
}

/**
 * GET /api/distance/nearest-bus
 *
 * Find the nearest active bus on a route to a given point.
 * Required: ?route=11&lat=10.78&lon=106.66
 */
export async function getNearestBus(req, res) {
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

        const result = await getNearestBusOnRoute(routeNum, targetLat, targetLon)
        if (!result) {
            return res.status(404).json({ ok: false, error: `No active buses found on route ${routeNum}` })
        }

        res.json({ ok: true, route: routeNum, nearest_bus: result })

    } catch (err) {
        console.error('[DistanceController] getNearestBus error:', err.message)
        res.status(500).json({ ok: false, error: err.message })
    }
}
