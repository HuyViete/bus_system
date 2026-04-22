// Main GPS processing orchestrator — coordinates all event detection per packet.
import VehicleState from '../models/VehicleState.js'
import * as telemetryRawModel from '../models/telemetryRawModel.js'
import * as gpsLatestModel from '../models/gpsLatestModel.js'
import * as anomalyEventModel from '../models/anomalyEventModel.js'
import * as stopModel from '../models/stopModel.js'
import * as anomalyDetection from './anomalyDetectionService.js'
import * as stopDetection from './stopDetectionService.js'
import * as tripService from './tripService.js'
import {
    recordRawInsertOk,
    recordRawInsertFail,
    recordRawInsertDuplicate,
} from './ingestionMetricsService.js'
import { STALE_VEHICLE_TIMEOUT_S } from '../libs/constants.js'

// In-memory state — will migrate to Redis when caching layer is added.
const vehicleStates = new Map()
const lastArrivalPerStop = new Map()
let stopList = []

// Load stop coordinates into memory for geofence checks.
export async function loadStops() {
    try {
        stopList = await stopModel.findAll()
        console.log(`[Processor] Loaded ${stopList.length} stops into memory.`)
    } catch (err) {
        console.warn(`[Processor] Could not load stops (${err.message}). Stop detection disabled.`)
        stopList = []
    }
}

// Process one GPS packet — called after HTTP response is already sent.
export async function processGPS(packet) {
    const { vehicle_id, route, latitude, longitude, speed, heading, timestamp } = packet
    const now = new Date(timestamp * 1000)

    // Get or create vehicle state.
    let state = vehicleStates.get(vehicle_id)
    if (!state) {
        state = new VehicleState(vehicle_id, route, latitude, longitude, speed, timestamp)
        vehicleStates.set(vehicle_id, state)
        state.currentTripId = await tripService.startTrip(vehicle_id, route, now)
    }

    // Run all detection and persistence in parallel.
    const results = await Promise.allSettled([
        persistRaw(packet, now),
        gpsLatestModel.upsert({ vehicle_id, route, latitude, longitude, speed, heading, updated_at: now }),
        runAnomalyDetection(state, packet, now),
        stopDetection.detect(state, packet, now, stopList, lastArrivalPerStop),
    ])

    const firstReject = results.find(r => r.status === 'rejected')
    if (firstReject) throw firstReject.reason

    state.updatePosition(latitude, longitude, speed, timestamp)
}

// Persist raw telemetry and track insert metrics.
async function persistRaw(packet, deviceTime) {
    const { vehicle_id, route, seq_no, latitude, longitude, speed, heading } = packet
    try {
        const result = await telemetryRawModel.insert({
            vehicle_id, route, seq_no, latitude, longitude, speed, heading,
            device_timestamp: deviceTime,
        })
        if (result === 'duplicate') recordRawInsertDuplicate()
        else recordRawInsertOk()
    } catch (err) {
        recordRawInsertFail()
        throw err
    }
}

// Run anomaly checks and persist any detected anomalies.
async function runAnomalyDetection(state, packet, now) {
    const anomalies = anomalyDetection.detect(state, packet, stopList)
    for (const a of anomalies) {
        await anomalyEventModel.insert({
            vehicle_id: packet.vehicle_id, route: packet.route,
            anomaly_type: a.type, severity: a.severity,
            latitude: packet.latitude, longitude: packet.longitude,
            detail: a.detail, occurred_at: now,
        })
        console.log(`[Anomaly] ${packet.vehicle_id} — ${a.type} (${a.severity})`)
    }
}

// Start periodic cleanup of vehicles that stopped sending data.
export function startStaleCleanup() {
    setInterval(() => {
        tripService.cleanupStaleVehicles(vehicleStates).catch(err =>
            console.error(`[Processor] Stale cleanup error: ${err.message}`)
        )
    }, STALE_VEHICLE_TIMEOUT_S * 1000)
}
