// In-memory vehicle state — tracks live position, stop events, and trip context.
export default class VehicleState {
    constructor(vehicleId, route, latitude, longitude, speed, timestamp) {
        this.vehicleId      = vehicleId
        this.route          = route
        this.lastLat        = latitude
        this.lastLon        = longitude
        this.lastSpeed      = speed
        this.lastTimestamp   = timestamp
        this.currentStopId  = null
        this.arrivedAt      = null
        this.prevStopId     = null
        this.departedPrevAt = null
        this.currentTripId  = null
        this.stopsVisited   = 0
    }

    // Update position fields after a packet is fully processed.
    updatePosition(latitude, longitude, speed, timestamp) {
        this.lastLat       = latitude
        this.lastLon       = longitude
        this.lastSpeed     = speed
        this.lastTimestamp  = timestamp
    }

    isAtStop()                { return this.currentStopId !== null }
    isStale(cutoffTimestamp)  { return this.lastTimestamp < cutoffTimestamp }
    hasTrip()                { return this.currentTripId !== null }
}
