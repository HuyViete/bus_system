// estimateService.js — ML-backed ETA estimation with mock fallback.
//
// Strategy:
//   1. Find nearest active bus on the route.
//   2. Compute the path from bus → target point.
//   3. Divide into ~100m chunks.
//   4. If ML model loaded → predict travel time per chunk → sum.
//   5. If ML not available → fallback to physics mock (distance / speed).
//   6. Derive traffic_status from predicted vs free-flow speed.

import { getNearestBusOnRoute } from './distanceService.js'
import { isModelLoaded, predictChunkTime, getModelInfo } from './mlPredictorService.js'

const FALLBACK_SPEED_KMH = 25   // assumed average when bus is stopped / no speed data
const KMH_TO_MS = 1000 / 3600   // convert km/h → m/s
const CHUNK_SIZE_M = 100         // target chunk distance in metres
const R = 6_371_000              // Earth radius in metres

// ── Haversine helpers ────────────────────────────────────────────────────────

function haversineM(lat1, lon1, lat2, lon2) {
    const toRad = d => d * Math.PI / 180
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const a = Math.sin(dLat / 2) ** 2
            + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
    return R * 2 * Math.asin(Math.sqrt(a))
}

function interpolatePoint(lat1, lon1, lat2, lon2, fraction) {
    return {
        lat: lat1 + (lat2 - lat1) * fraction,
        lon: lon1 + (lon2 - lon1) * fraction,
    }
}

// ── Chunk builder ────────────────────────────────────────────────────────────

function buildChunks(fromLat, fromLon, toLat, toLon) {
    const totalDist = haversineM(fromLat, fromLon, toLat, toLon)
    const nChunks = Math.max(1, Math.round(totalDist / CHUNK_SIZE_M))
    const chunkDist = totalDist / nChunks

    const now = new Date()
    const hour = now.getHours()
    const minute = now.getMinutes()
    const dow = now.getDay() === 0 ? 6 : now.getDay() - 1  // JS Sun=0 → Mon=0 format
    const isWeekend = dow >= 5
    const isRush = (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19)

    const chunks = []
    for (let i = 0; i < nChunks; i++) {
        const frac = i / nChunks
        const point = interpolatePoint(fromLat, fromLon, toLat, toLon, frac)
        chunks.push({
            lat:           point.lat,
            lon:           point.lon,
            distance_m:    chunkDist,
            hour:          hour,
            minute_bucket: Math.floor(minute / 15),
            day_of_week:   dow,
            is_weekend:    isWeekend,
            is_rush:       isRush,
            door_open:     false,
            aircon:        true,
            near_station:  false,
        })
    }

    return { chunks, totalDist, nChunks }
}

// ── ML-backed ETA ────────────────────────────────────────────────────────────

/**
 * Get estimated travel time from the nearest bus on a route to a target point.
 * Uses ML model if available, otherwise falls back to mock physics model.
 */
export async function getEstimateTime(route, lat, lon) {
    const bus = await getNearestBusOnRoute(route, lat, lon)
    if (!bus) return null

    const fromLat = parseFloat(bus.latitude)
    const fromLon = parseFloat(bus.longitude)
    const { chunks, totalDist, nChunks } = buildChunks(fromLat, fromLon, lat, lon)

    // ── Try ML prediction ────────────────────────────────────────────────
    if (isModelLoaded()) {
        const predictions = await predictChunkTime(chunks)

        if (predictions && predictions.length === nChunks) {
            const totalSeconds = predictions.reduce((sum, s) => sum + s, 0)
            const etaSeconds = Math.round(totalSeconds)
            const etaMinutes = Math.round((totalSeconds / 60) * 10) / 10

            // Derive traffic status from average predicted speed
            const avgSpeedKmh = totalSeconds > 0
                ? (totalDist / 1000) / (totalSeconds / 3600)
                : FALLBACK_SPEED_KMH

            const modelInfo = getModelInfo()

            return {
                eta_seconds:       etaSeconds,
                eta_minutes:       etaMinutes,
                basis:             'ml_model',
                model_version:     modelInfo?.model_type || 'xgboost',
                traffic_status:    deriveTrafficStatus(avgSpeedKmh),
                confidence:        {
                    low_seconds:  Math.round(etaSeconds * 0.7),
                    high_seconds: Math.round(etaSeconds * 1.4),
                },
                per_chunk:         chunks.map((c, i) => ({
                    lat:       Math.round(c.lat * 1000) / 1000,
                    lon:       Math.round(c.lon * 1000) / 1000,
                    seconds:   Math.round(predictions[i] * 10) / 10,
                    distance_m: Math.round(c.distance_m),
                })),
                nearest_bus_id:    bus.vehicle_id,
                distance_to_bus_m: bus.distance_m,
            }
        }
    }

    // ── Fallback: mock physics model ─────────────────────────────────────
    return getMockEstimate(bus, totalDist)
}

function getMockEstimate(bus, distM) {
    const speedKmh = (bus.speed && bus.speed > 1) ? bus.speed : FALLBACK_SPEED_KMH
    const speedMs  = speedKmh * KMH_TO_MS
    const etaSeconds = Math.round(distM / speedMs)
    const etaMinutes = Math.round((etaSeconds / 60) * 10) / 10

    return {
        eta_seconds:       etaSeconds,
        eta_minutes:       etaMinutes,
        basis:             bus.speed > 1 ? 'mock_nearest_bus_speed' : 'mock_fallback_average',
        traffic_status:    getTrafficStatus(),
        nearest_bus_id:    bus.vehicle_id,
        distance_to_bus_m: bus.distance_m,
    }
}

// ── Traffic status ───────────────────────────────────────────────────────────

/**
 * Derive traffic status from average predicted speed.
 * More accurate than time-of-day heuristic when ML model is active.
 */
function deriveTrafficStatus(avgSpeedKmh) {
    if (avgSpeedKmh < 10) return 'heavy'
    if (avgSpeedKmh < 25) return 'normal'
    return 'light'
}

/**
 * Fallback traffic status — time-of-day heuristic.
 * Used when ML model is not available.
 */
export function getTrafficStatus() {
    const hour = new Date().getHours()
    const isMorningRush = hour >= 7  && hour <= 9
    const isEveningRush = hour >= 16 && hour <= 19
    const isOffPeak     = hour >= 22 || hour <= 5

    if (isOffPeak)                      return 'light'
    if (isMorningRush || isEveningRush) return 'heavy'
    return 'normal'
}