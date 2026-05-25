// alternativeRouteService.js — Inter-station detour finder.
//
// When the direct road between two bus stations (or any two GPS points)
// is congested or blocked, this service generates alternative road paths.
//
// Tier 1 (always available): Perpendicular waypoint deviation
//   - Offsets a midpoint perpendicular to the direct bearing
//   - Creates a smooth curved detour that looks logically correct on a map
//
// Tier 2 (future): OSRM integration for real road-level routing

import { haversineM } from '../libs/geo.js'
import { isModelLoaded, predictChunkTime } from './mlPredictorService.js'

const CHUNK_SIZE_M = 100               // prediction chunk size
const CONGESTION_RATIO = 2.0           // flag congestion when ETA > 2× free-flow
const FREE_FLOW_SPEED_KMH = 25        // assumed free-flow speed for bus transit
const DETOUR_OFFSETS_M = [300, 500]    // perpendicular offset distances for alternatives
const R = 6_371_000                    // Earth radius in metres

// ── Geometry helpers ─────────────────────────────────────────────────────────

/**
 * Compute initial bearing (degrees) from point A to point B.
 */
function bearing(lat1, lon1, lat2, lon2) {
    const toRad = d => d * Math.PI / 180
    const toDeg = r => r * 180 / Math.PI
    const dLon = toRad(lon2 - lon1)
    const y = Math.sin(dLon) * Math.cos(toRad(lat2))
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2))
            - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon)
    return (toDeg(Math.atan2(y, x)) + 360) % 360
}

/**
 * Move a point by a given distance (metres) along a bearing (degrees).
 */
function movePoint(lat, lon, distM, bearingDeg) {
    const toRad = d => d * Math.PI / 180
    const toDeg = r => r * 180 / Math.PI
    const brng = toRad(bearingDeg)
    const angDist = distM / R
    const lat1 = toRad(lat)
    const lon1 = toRad(lon)

    const lat2 = Math.asin(
        Math.sin(lat1) * Math.cos(angDist) +
        Math.cos(lat1) * Math.sin(angDist) * Math.cos(brng)
    )
    const lon2 = lon1 + Math.atan2(
        Math.sin(brng) * Math.sin(angDist) * Math.cos(lat1),
        Math.cos(angDist) - Math.sin(lat1) * Math.sin(lat2)
    )
    return { lat: toDeg(lat2), lon: toDeg(lon2) }
}

/**
 * Interpolate N points along a straight line between two points.
 */
function interpolatePath(lat1, lon1, lat2, lon2, nPoints) {
    const points = []
    for (let i = 0; i <= nPoints; i++) {
        const frac = i / nPoints
        points.push({
            lat: lat1 + (lat2 - lat1) * frac,
            lon: lon1 + (lon2 - lon1) * frac,
        })
    }
    return points
}

/**
 * Build a smooth curved path through 3 waypoints.
 * Uses simple Catmull-Rom-like interpolation.
 */
function buildCurvedPath(start, mid, end, nSegments = 10) {
    const points = []
    for (let i = 0; i <= nSegments; i++) {
        const t = i / nSegments
        // Quadratic Bezier interpolation: B(t) = (1-t)²·P0 + 2(1-t)t·P1 + t²·P2
        const lat = (1-t)*(1-t) * start.lat + 2*(1-t)*t * mid.lat + t*t * end.lat
        const lon = (1-t)*(1-t) * start.lon + 2*(1-t)*t * mid.lon + t*t * end.lon
        points.push([lon, lat])  // [lon, lat] for GeoJSON/map compatibility
    }
    return points
}

// ── ETA helpers ──────────────────────────────────────────────────────────────

/**
 * Estimate travel time along a path (array of [lon, lat] points) using ML or fallback.
 */
async function estimatePathTime(path) {
    // Compute total distance along the path
    let totalDist = 0
    for (let i = 1; i < path.length; i++) {
        totalDist += haversineM(path[i-1][1], path[i-1][0], path[i][1], path[i][0])
    }

    // If ML model loaded, use chunk-based prediction
    if (isModelLoaded()) {
        const nChunks = Math.max(1, Math.round(totalDist / CHUNK_SIZE_M))
        const chunkDist = totalDist / nChunks

        const now = new Date()
        const hour = now.getHours()
        const dow = now.getDay() === 0 ? 6 : now.getDay() - 1

        const chunks = []
        for (let i = 0; i < nChunks; i++) {
            const frac = i / nChunks
            const idx = Math.min(Math.floor(frac * (path.length - 1)), path.length - 2)
            chunks.push({
                lat:           path[idx][1],
                lon:           path[idx][0],
                distance_m:    chunkDist,
                hour:          hour,
                minute_bucket: Math.floor(now.getMinutes() / 15),
                day_of_week:   dow,
                is_weekend:    dow >= 5,
                is_rush:       (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19),
                door_open:     false,
                aircon:        true,
                near_station:  false,
            })
        }

        const predictions = await predictChunkTime(chunks)
        if (predictions) {
            return {
                seconds: Math.round(predictions.reduce((s, v) => s + v, 0)),
                distance_m: Math.round(totalDist),
                basis: 'ml_model',
            }
        }
    }

    // Fallback: distance / free-flow speed
    const seconds = Math.round(totalDist / (FREE_FLOW_SPEED_KMH * 1000 / 3600))
    return {
        seconds,
        distance_m: Math.round(totalDist),
        basis: 'mock_free_flow',
    }
}

// ── Main API ─────────────────────────────────────────────────────────────────

/**
 * Find alternative detour paths between two points.
 *
 * @param {number} fromLat - Start latitude
 * @param {number} fromLon - Start longitude
 * @param {number} toLat   - End latitude
 * @param {number} toLon   - End longitude
 * @returns {Object} { is_congested, direct, alternatives }
 */
export async function findDetour(fromLat, fromLon, toLat, toLon) {
    // 1. Compute direct path
    const directDist = haversineM(fromLat, fromLon, toLat, toLon)
    const nPoints = Math.max(2, Math.round(directDist / CHUNK_SIZE_M))
    const directPathPoints = interpolatePath(fromLat, fromLon, toLat, toLon, nPoints)
    const directPath = directPathPoints.map(p => [p.lon, p.lat])

    // 2. Estimate direct path travel time
    const directEst = await estimatePathTime(directPath)

    // 3. Compute free-flow reference time
    const freeFlowSeconds = directDist / (FREE_FLOW_SPEED_KMH * 1000 / 3600)
    const congestionRatio = directEst.seconds / Math.max(freeFlowSeconds, 1)
    const isCongested = congestionRatio > CONGESTION_RATIO

    // 4. Build alternatives by perpendicular offset
    const brng = bearing(fromLat, fromLon, toLat, toLon)
    const midLat = (fromLat + toLat) / 2
    const midLon = (fromLon + toLon) / 2

    const alternatives = []
    const labels = ['Detour Left', 'Detour Right', 'Wide Detour Left', 'Wide Detour Right']
    let labelIdx = 0

    for (const offset of DETOUR_OFFSETS_M) {
        for (const side of [90, -90]) {  // perpendicular left and right
            const perpBearing = (brng + side + 360) % 360
            const midOffset = movePoint(midLat, midLon, offset, perpBearing)

            // Build curved path through offset midpoint
            const curvedPath = buildCurvedPath(
                { lat: fromLat, lon: fromLon },
                midOffset,
                { lat: toLat, lon: toLon },
                nPoints
            )

            const altEst = await estimatePathTime(curvedPath)

            alternatives.push({
                label:       labels[labelIdx] || `Detour ${labelIdx + 1}`,
                path:        curvedPath,
                eta_seconds: altEst.seconds,
                eta_minutes: Math.round((altEst.seconds / 60) * 10) / 10,
                distance_m:  altEst.distance_m,
                basis:       altEst.basis,
                offset_m:    offset,
            })
            labelIdx++
        }
    }

    // Sort alternatives by ETA (fastest first)
    alternatives.sort((a, b) => a.eta_seconds - b.eta_seconds)

    return {
        is_congested:    isCongested,
        congestion_ratio: Math.round(congestionRatio * 10) / 10,
        direct: {
            path:        directPath,
            eta_seconds: directEst.seconds,
            eta_minutes: Math.round((directEst.seconds / 60) * 10) / 10,
            distance_m:  directEst.distance_m,
            basis:       directEst.basis,
        },
        alternatives:    alternatives.slice(0, 3),  // return top 3
    }
}

/**
 * Check if a direct path between two points is currently congested.
 * Lightweight version of findDetour — no alternatives computed.
 */
export async function checkCongestion(fromLat, fromLon, toLat, toLon) {
    const directDist = haversineM(fromLat, fromLon, toLat, toLon)
    const nPoints = Math.max(2, Math.round(directDist / CHUNK_SIZE_M))
    const directPathPoints = interpolatePath(fromLat, fromLon, toLat, toLon, nPoints)
    const directPath = directPathPoints.map(p => [p.lon, p.lat])

    const directEst = await estimatePathTime(directPath)
    const freeFlowSeconds = directDist / (FREE_FLOW_SPEED_KMH * 1000 / 3600)
    const congestionRatio = directEst.seconds / Math.max(freeFlowSeconds, 1)

    return {
        is_congested:     congestionRatio > CONGESTION_RATIO,
        congestion_ratio: Math.round(congestionRatio * 10) / 10,
        eta_seconds:      directEst.seconds,
        distance_m:       Math.round(directDist),
        basis:            directEst.basis,
    }
}
