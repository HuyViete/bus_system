// estimateService.js — mock ETA estimation using nearest-bus speed + distance.
import { getNearestBusOnRoute } from './distanceService.js'

const FALLBACK_SPEED_KMH = 25   // assumed average when bus is stopped / no speed data
const KMH_TO_MS = 1000 / 3600  // convert km/h → m/s

/**
 * Mock ETA from a lat/lon point to the nearest bus on a route.
 *
 * Strategy:
 *   1. Find nearest active bus on the route.
 *   2. Use its current speed (or fallback) to estimate travel time across the gap.
 *   3. Return seconds + minutes + what data we based it on.
 *
 * This is intentionally a mock — a real implementation would use historical
 * speed_profiles per segment and dwell_times.
 */
export async function getEstimateTime(route, lat, lon) {
    const bus = await getNearestBusOnRoute(route, lat, lon)
    if (!bus) return null

    const speedKmh = (bus.speed && bus.speed > 1) ? bus.speed : FALLBACK_SPEED_KMH
    const speedMs  = speedKmh * KMH_TO_MS

    // Distance the bus needs to cover to reach the query point
    const distM       = bus.distance_m
    const etaSeconds  = Math.round(distM / speedMs)
    const etaMinutes  = Math.round((etaSeconds / 60) * 10) / 10

    return {
        eta_seconds:       etaSeconds,
        eta_minutes:       etaMinutes,
        basis:             bus.speed > 1 ? 'nearest_bus_speed' : 'fallback_average',
        nearest_bus_id:    bus.vehicle_id,
        distance_to_bus_m: bus.distance_m,
    }
}

/**
 * Mock traffic status — returns a plausible value based on time of day.
 * Real implementation would aggregate recent speed_profiles vs free-flow baseline.
 *
 * Rush hours (07:00-09:00, 16:00-19:00) → heavier traffic.
 */
export function getTrafficStatus() {
    const hour = new Date().getHours()
    const isMorningRush  = hour >= 7  && hour <= 9
    const isEveningRush  = hour >= 16 && hour <= 19
    const isOffPeak      = hour >= 22 || hour <= 5

    if (isOffPeak)                      return 'light'
    if (isMorningRush || isEveningRush) return 'heavy'
    return 'normal'
}