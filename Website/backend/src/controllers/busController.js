/**
 * busController.js  —  Website Backend (BFF)
 *
 * Proxies bus data from the Big Server to the frontend.
 * In the future this layer will read from Redis instead of polling HTTP.
 *
 * WHY this layer exists (instead of frontend calling Big Server directly):
 *   • Security: Big Server never exposed to public internet
 *   • Shaping: we can trim/rename fields for the frontend
 *   • Caching: one poll to Big Server satisfies ALL connected web users
 *   • Auth:    only authenticated users can call these endpoints
 */



const BIG_SERVER = process.env.BIG_SERVER_URL || 'http://localhost:3000'

// ── Simple in-memory cache ────────────────────────────────────────────────────
// In production this would be a Redis GET/SET with a 3-second TTL.
// For now: one plain object that holds the last successful response.
let cachedBuses = []
let cacheTimestamp = 0
const CACHE_TTL_MS = 3000   // 3 seconds — matches the bus GPS tick interval

// ── GET /api/buses/live ───────────────────────────────────────────────────────
// Returns the latest position of every active bus.
// Optional query param: ?route=1  to filter by route
export async function getLiveBuses(req, res) {
    try {
        const now = Date.now()

        // Serve from cache if it's still fresh
        if (now - cacheTimestamp < CACHE_TTL_MS && cachedBuses.length > 0) {
            return res.json({ ok: true, buses: cachedBuses, cached: true })
        }

        // Cache is stale — fetch fresh data from the Big Server
        const url = new URL(`${BIG_SERVER}/api/events/live`)
        if (req.query.route) {
            url.searchParams.append('route', req.query.route)
        }

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 2000)

        const response = await fetch(url.toString(), {
            signal: controller.signal
        })
        clearTimeout(timeoutId)

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
        }
        
        const data = await response.json()

        // Shape the data for the frontend:
        // BusMap.jsx IconLayer expects: { id, position: [lon, lat], speed, heading, route }
        cachedBuses = data.map(bus => ({
            id:       bus.vehicle_id,
            position: [parseFloat(bus.longitude), parseFloat(bus.latitude)],
            speed:    bus.speed,
            heading:  bus.heading,
            route:    bus.route,
        }))
        cacheTimestamp = now

        res.json({ ok: true, buses: cachedBuses, cached: false })

    } catch (err) {
        // Big Server is down — return the last cached snapshot rather than an error.
        // This way the frontend map doesn't suddenly clear all buses.
        console.warn(`[BusController] Big Server unreachable: ${err.message}. Serving cached data.`)
        res.json({ ok: true, buses: cachedBuses, cached: true, stale: true })
    }
}
