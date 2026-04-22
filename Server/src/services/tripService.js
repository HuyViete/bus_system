// Trip lifecycle: start, complete, abort, and stale vehicle cleanup.
import * as tripLogModel from '../models/tripLogModel.js'
import { STALE_VEHICLE_TIMEOUT_S } from '../libs/constants.js'

export async function startTrip(vehicleId, route, startedAt) {
    const id = await tripLogModel.insert({ vehicle_id: vehicleId, route, started_at: startedAt })
    console.log(`[Trip] Started trip #${id} for ${vehicleId} on route ${route}`)
    return id
}

export async function completeTrip(vehicleId, vehicleStates) {
    const state = vehicleStates.get(vehicleId)
    if (!state?.hasTrip()) return

    await tripLogModel.complete(state.currentTripId, new Date())
    console.log(`[Trip] Completed trip #${state.currentTripId} for ${vehicleId}`)
    vehicleStates.delete(vehicleId)
}

// Mark trips as aborted for vehicles that stopped sending data.
export async function cleanupStaleVehicles(vehicleStates) {
    const cutoff = Math.floor(Date.now() / 1000) - STALE_VEHICLE_TIMEOUT_S
    for (const [vehicleId, state] of vehicleStates.entries()) {
        if (state.isStale(cutoff)) {
            console.log(`[Trip] ${vehicleId} went offline — marking trip aborted.`)
            if (state.hasTrip()) await tripLogModel.abort(state.currentTripId)
            vehicleStates.delete(vehicleId)
        }
    }
}
