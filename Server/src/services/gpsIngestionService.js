// Main GPS processing orchestrator — coordinates all event detection per packet.
import VehicleState from '../models/VehicleState.js'
import * as telemetryRawModel from '../models/telemetryRawModel.js'
import * as gpsLatestModel from '../models/gpsLatestModel.js'
import * as anomalyEventModel from '../models/anomalyEventModel.js'
import * as stopEventModel from '../models/stopEventModel.js'
import * as dwellTimeModel from '../models/dwellTimeModel.js'
import * as headwayRecordModel from '../models/headwayRecordModel.js'
import * as tripLogModel from '../models/tripLogModel.js'
import * as stopModel from '../models/stopModel.js'
import * as anomalyDetection from './anomalyDetectionService.js'
import * as stopDetection from './stopDetectionService.js'
import * as tripService from './tripService.js'
import {
    recordRawInsertOk,
    recordRawInsertFail,
    recordRawInsertDuplicate,
} from './ingestionMetricsService.js'
import { STALE_VEHICLE_TIMEOUT_S, BUNCHING_THRESHOLD_S } from '../libs/constants.js'

const vehicleStates = new Map()
const lastArrivalPerStop = new Map()
let stopList = []

export async function loadStops() {
    try {
        stopList = await stopModel.findAll()
        console.log(`[Processor] Loaded ${stopList.length} stops into memory.`)
    } catch (err) {
        console.warn(`[Processor] Could not load stops (${err.message}). Stop detection disabled.`)
        stopList = []
    }
}

export async function processGPS(packet) {
    const { vehicle_id, route, latitude, longitude, speed, heading, timestamp } = packet
    const now = new Date(timestamp * 1000)

    let state = vehicleStates.get(vehicle_id)
    if (!state) {
        state = new VehicleState(vehicle_id, route, latitude, longitude, speed, timestamp)
        vehicleStates.set(vehicle_id, state)
        state.currentTripId = await tripService.startTrip(vehicle_id, route, now)
    }

    const hasEdgeEvents = packet.stop_event || (packet.edge_anomalies && packet.edge_anomalies.length > 0)

    if (hasEdgeEvents) {
        // Edge-computed path: bus already detected events/anomalies
        const results = await Promise.allSettled([
            persistRaw(packet, now),
            gpsLatestModel.upsert({ vehicle_id, route, latitude, longitude, speed, heading, updated_at: now }),
            persistEdgeAnomalies(packet, now),
            persistEdgeStopEvent(state, packet, now),
            detectServerOnlyAnomalies(state, packet, now),
        ])

        const firstReject = results.find(r => r.status === 'rejected')
        if (firstReject) throw firstReject.reason
    } else {
        // Legacy path: server computes everything (backward compatible)
        const results = await Promise.allSettled([
            persistRaw(packet, now),
            gpsLatestModel.upsert({ vehicle_id, route, latitude, longitude, speed, heading, updated_at: now }),
            runAnomalyDetection(state, packet, now),
            stopDetection.detect(state, packet, now, stopList, lastArrivalPerStop),
        ])

        const firstReject = results.find(r => r.status === 'rejected')
        if (firstReject) throw firstReject.reason
    }

    state.updatePosition(latitude, longitude, speed, timestamp)
}

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

// Persist anomalies pre-detected by the edge (hard_brake, speeding).
async function persistEdgeAnomalies(packet, now) {
    const { vehicle_id, route, latitude, longitude, edge_anomalies } = packet
    if (!edge_anomalies || edge_anomalies.length === 0) return

    for (const anomalyType of edge_anomalies) {
        await anomalyEventModel.insert({
            vehicle_id, route,
            anomaly_type: anomalyType,
            severity: anomalyType === 'speeding' ? 'warning' : 'warning',
            latitude, longitude,
            detail: { source: 'edge', speed: packet.speed },
            occurred_at: now,
        })
        console.log(`[Anomaly] ${vehicle_id} — ${anomalyType} (edge)`)
    }
}

// Persist stop events pre-detected by the edge (arrival, departure + dwell).
async function persistEdgeStopEvent(state, packet, now) {
    const { vehicle_id, route, latitude, longitude, stop_event, stop_event_id, dwell_seconds } = packet
    if (!stop_event) return

    await stopEventModel.insert({
        vehicle_id, route, stop_id: stop_event_id,
        event_type: stop_event, latitude, longitude, occurred_at: now,
    })
    console.log(`[Stop] ${vehicle_id} ${stop_event} at ${stop_event_id} (edge)`)

    if (stop_event === 'arrival') {
        state.currentStopId = stop_event_id
        state.arrivedAt = now

        // Headway: gap since last bus arrived at this stop
        const key = `${route}:${stop_event_id}`
        const prev = lastArrivalPerStop.get(key)
        if (prev) {
            const headwaySec = Math.round((now - prev.arrivedAt) / 1000)
            await headwayRecordModel.insert({
                route, stop_id: stop_event_id, vehicle_id,
                prev_vehicle_id: prev.vehicleId, headway_seconds: headwaySec, recorded_at: now,
            })

            if (headwaySec < BUNCHING_THRESHOLD_S) {
                await anomalyEventModel.insert({
                    vehicle_id, route, anomaly_type: 'bunching', severity: 'warning',
                    latitude, longitude,
                    detail: { stop_id: stop_event_id, headway_seconds: headwaySec, prev_vehicle: prev.vehicleId },
                    occurred_at: now,
                })
                console.log(`[Anomaly] Bunching at ${stop_event_id}: ${vehicle_id} & ${prev.vehicleId} (${headwaySec}s)`)
            }
        }
        lastArrivalPerStop.set(key, { vehicleId: vehicle_id, arrivedAt: now })

        state.stopsVisited++
        if (state.hasTrip()) {
            await tripLogModel.updateStopsVisited(state.currentTripId, state.stopsVisited)
        }
    }

    if (stop_event === 'departure') {
        if (dwell_seconds && dwell_seconds > 0 && state.arrivedAt) {
            await dwellTimeModel.insert({
                vehicle_id, route, stop_id: stop_event_id,
                arrived_at: state.arrivedAt,
                departed_at: now,
            })
            console.log(`[Stop] ${vehicle_id} departed ${stop_event_id} — dwell: ${Math.round(dwell_seconds)}s (edge)`)
        }

        state.prevStopId     = stop_event_id
        state.departedPrevAt = now
        state.currentStopId  = null
        state.arrivedAt      = null
    }
}

// Server-only anomaly detection: gps_loss and off_route cannot be detected on the edge.
async function detectServerOnlyAnomalies(state, packet, now) {
    const serverAnomalies = anomalyDetection.detectServerOnly(state, packet, stopList)
    for (const a of serverAnomalies) {
        await anomalyEventModel.insert({
            vehicle_id: packet.vehicle_id, route: packet.route,
            anomaly_type: a.type, severity: a.severity,
            latitude: packet.latitude, longitude: packet.longitude,
            detail: a.detail, occurred_at: now,
        })
        console.log(`[Anomaly] ${packet.vehicle_id} — ${a.type} (${a.severity})`)
    }
}

// Legacy server-side anomaly detection (for old-format packets without edge_anomalies)
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

export function startStaleCleanup() {
    setInterval(() => {
        tripService.cleanupStaleVehicles(vehicleStates).catch(err =>
            console.error(`[Processor] Stale cleanup error: ${err.message}`)
        )
    }, STALE_VEHICLE_TIMEOUT_S * 1000)
}
