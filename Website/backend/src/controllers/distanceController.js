/**
 * distanceController.js — Website Backend (BFF)
 *
 * Proxies distance and ETA requests to the Big Server.
 * Why this layer exists (instead of frontend calling Big Server directly):
 *   • Security: Big Server is never exposed to the public internet.
 *   • Auth:     can be protected per-endpoint as needed.
 *   • Shaping:  add caching or field filtering in the future.
 */

const BIG_SERVER = process.env.BIG_SERVER_URL || 'http://localhost:3000'
const TIMEOUT_MS = 3000

/**
 * Generic proxy helper — forwards all query params to the Big Server path.
 */
async function proxyGet(bigServerPath, queryParams, res) {
    const url = new URL(`${BIG_SERVER}${bigServerPath}`)
    for (const [k, v] of Object.entries(queryParams)) {
        if (v !== undefined && v !== null) url.searchParams.append(k, v)
    }

    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
        const response = await fetch(url.toString(), { signal: controller.signal })
        clearTimeout(timeoutId)
        const data = await response.json()
        res.status(response.status).json(data)
    } catch (err) {
        clearTimeout(timeoutId)
        if (err.name === 'AbortError') {
            res.status(504).json({ ok: false, error: 'Big Server request timed out' })
        } else {
            res.status(502).json({ ok: false, error: `Big Server unreachable: ${err.message}` })
        }
    }
}

// ── GET /api/distance ─────────────────────────────────────────────────────────
// Proxies to GET /api/distance on the Big Server.
// Supports all three modes: point-to-point, bus-to-point, nearest-stop.
export async function getDistance(req, res) {
    await proxyGet('/api/distance', req.query, res)
}

// ── GET /api/distance/nearest-bus ─────────────────────────────────────────────
// Proxies to GET /api/distance/nearest-bus on the Big Server.
export async function getNearestBus(req, res) {
    await proxyGet('/api/distance/nearest-bus', req.query, res)
}

// ── GET /api/distance/estimate ────────────────────────────────────────────────
// Proxies to GET /api/estimate on the Big Server (mock ETA).
export async function getEstimate(req, res) {
    await proxyGet('/api/estimate', req.query, res)
}
