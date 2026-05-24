// distanceService.js — distance calculations between geographic points and buses.
import { haversineM } from '../libs/geo.js'
import * as gpsLatestModel from '../models/gpsLatestModel.js'

/**
 * Straight-line (Haversine) distance between two lat/lon points.
 * Returns metres.
 */
export function getDistanceBetweenPoints(lat1, lon1, lat2, lon2) {
    return haversineM(lat1, lon1, lat2, lon2)
}

/**
 * Distance from a specific bus (by vehicle_id) to an arbitrary point.
 * Reads the bus's current position from gps_latest.
 * Returns null if the bus is not found / not active.
 */
export async function getDistanceBusToPoint(vehicleId, lat, lon) {
    const buses = await gpsLatestModel.findActive()
    const bus = buses.find(b => String(b.vehicle_id) === String(vehicleId))
    if (!bus) return null

    const distM = haversineM(parseFloat(bus.latitude), parseFloat(bus.longitude), lat, lon)
    return {
        vehicle_id: bus.vehicle_id,
        bus_lat: parseFloat(bus.latitude),
        bus_lon: parseFloat(bus.longitude),
        speed: bus.speed,
        dist_to_next_stop: bus.dist_to_next_stop,
        distance_m: Math.round(distM * 10) / 10,
        distance_km: Math.round(distM / 100) / 10,
    }
}

/**
 * Find the nearest active bus on a given route to a lat/lon point.
 * Queries gps_latest, computes Haversine from each bus to the target.
 * Returns null if no active buses on the route.
 */
export async function getNearestBusOnRoute(route, lat, lon) {
    const buses = await gpsLatestModel.findActive(route)
    if (!buses.length) return null

    let nearest = null
    let minDist = Infinity

    for (const bus of buses) {
        const d = haversineM(parseFloat(bus.latitude), parseFloat(bus.longitude), lat, lon)
        if (d < minDist) {
            minDist = d
            nearest = bus
        }
    }

    return {
        vehicle_id: nearest.vehicle_id,
        latitude: parseFloat(nearest.latitude),
        longitude: parseFloat(nearest.longitude),
        speed: nearest.speed,
        heading: nearest.heading,
        dist_along_route: nearest.dist_along_route,
        dist_to_next_stop: nearest.dist_to_next_stop,
        next_stop_id: nearest.next_stop_id,
        distance_m: Math.round(minDist * 10) / 10,
        distance_km: Math.round(minDist / 100) / 10,
    }
}

/**
 * Find the nearest stop (on an optionally-specified route) to a lat/lon point.
 * Uses the pre-loaded stopList passed in — avoids an extra DB query.
 * If route is null, searches all stops across all routes.
 */
export function getNearestStop(stopList, route, lat, lon) {
    const candidates = route
        ? stopList.filter(s => Number(s.route) === Number(route))
        : stopList

    if (!candidates.length) return null

    let nearest = null
    let minDist = Infinity

    for (const stop of candidates) {
        const d = haversineM(parseFloat(stop.latitude), parseFloat(stop.longitude), lat, lon)
        if (d < minDist) {
            minDist = d
            nearest = stop
        }
    }

    return {
        stop_id: nearest.stop_id,
        route: nearest.route,
        latitude: parseFloat(nearest.latitude),
        longitude: parseFloat(nearest.longitude),
        distance_m: Math.round(minDist * 10) / 10,
        distance_km: Math.round(minDist / 100) / 10,
    }
}