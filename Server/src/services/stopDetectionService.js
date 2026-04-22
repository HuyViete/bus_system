// Detects stop arrivals/departures and emits dwell, headway, and speed profile events.
import { STOP_RADIUS_M, BUNCHING_THRESHOLD_S } from '../libs/constants.js'
import { haversineM } from '../libs/geo.js'
import * as stopEventModel from '../models/stopEventModel.js'
import * as dwellTimeModel from '../models/dwellTimeModel.js'
import * as headwayRecordModel from '../models/headwayRecordModel.js'
import * as speedProfileModel from '../models/speedProfileModel.js'
import * as anomalyEventModel from '../models/anomalyEventModel.js'
import * as tripLogModel from '../models/tripLogModel.js'

export async function detect(state, packet, now, stopList, lastArrivalPerStop) {
    if (stopList.length === 0) return

    const { vehicle_id, route, latitude, longitude } = packet
    const routeStops = stopList.filter(s => s.route === route)
    if (routeStops.length === 0) return

    // Find nearest stop on this bus's route.
    let nearest = null
    let nearestDist = Infinity
    for (const stop of routeStops) {
        const d = haversineM(latitude, longitude, stop.latitude, stop.longitude)
        if (d < nearestDist) { nearestDist = d; nearest = stop }
    }

    const isAtStop = nearestDist <= STOP_RADIUS_M
    const wasAtStop = state.isAtStop()

    // ARRIVAL: bus just entered a stop's geofence.
    if (isAtStop && !wasAtStop) {
        const stopId = nearest.stop_id
        state.currentStopId = stopId
        state.arrivedAt = now

        await stopEventModel.insert({
            vehicle_id, route, stop_id: stopId,
            event_type: 'arrival', latitude, longitude, occurred_at: now,
        })
        console.log(`[Stop] ${vehicle_id} arrived at ${stopId}`)

        // Headway: gap since last bus arrived at this stop.
        const key = `${route}:${stopId}`
        const prev = lastArrivalPerStop.get(key)
        if (prev) {
            const headwaySec = Math.round((now - prev.arrivedAt) / 1000)
            await headwayRecordModel.insert({
                route, stop_id: stopId, vehicle_id,
                prev_vehicle_id: prev.vehicleId, headway_seconds: headwaySec, recorded_at: now,
            })

            // Bunching anomaly: buses arrived too close together.
            if (headwaySec < BUNCHING_THRESHOLD_S) {
                await anomalyEventModel.insert({
                    vehicle_id, route, anomaly_type: 'bunching', severity: 'warning',
                    latitude, longitude,
                    detail: { stop_id: stopId, headway_seconds: headwaySec, prev_vehicle: prev.vehicleId },
                    occurred_at: now,
                })
                console.log(`[Anomaly] Bunching at ${stopId}: ${vehicle_id} & ${prev.vehicleId} (${headwaySec}s apart)`)
            }
        }
        lastArrivalPerStop.set(key, { vehicleId: vehicle_id, arrivedAt: now })

        // Speed profile: segment from previous stop to this one.
        if (state.prevStopId && state.departedPrevAt) {
            const travelSec = Math.round((now - state.departedPrevAt) / 1000)
            if (travelSec > 0) {
                const prevStop = stopList.find(s => s.stop_id === state.prevStopId)
                const segDist = prevStop
                    ? haversineM(prevStop.latitude, prevStop.longitude, nearest.latitude, nearest.longitude)
                    : null

                await speedProfileModel.insert({
                    route, segment_from: state.prevStopId, segment_to: stopId,
                    avg_speed_kmh: segDist ? (segDist / 1000) / (travelSec / 3600) : null,
                    travel_seconds: travelSec,
                    distance_m: segDist ? Math.round(segDist) : null,
                    recorded_at: now, hour_of_day: now.getHours(), day_of_week: now.getDay(),
                })
            }
        }

        // Update trip stop counter.
        state.stopsVisited++
        if (state.hasTrip()) {
            await tripLogModel.updateStopsVisited(state.currentTripId, state.stopsVisited)
        }
    }

    // DEPARTURE: bus just left a stop's geofence.
    if (!isAtStop && wasAtStop) {
        const stopId = state.currentStopId

        await stopEventModel.insert({
            vehicle_id, route, stop_id: stopId,
            event_type: 'departure', latitude, longitude, occurred_at: now,
        })

        // Dwell time: how long the bus stayed at this stop.
        if (state.arrivedAt) {
            await dwellTimeModel.insert({
                vehicle_id, route, stop_id: stopId,
                arrived_at: state.arrivedAt, departed_at: now,
            })
            console.log(`[Stop] ${vehicle_id} departed ${stopId} — dwell: ${Math.round((now - state.arrivedAt) / 1000)}s`)
        }

        state.prevStopId     = stopId
        state.departedPrevAt = now
        state.currentStopId  = null
        state.arrivedAt      = null
    }
}
