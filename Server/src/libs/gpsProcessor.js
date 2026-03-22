/**
 * gpsProcessor.js  —  Real-Time GPS Event Detection Engine
 *
 * This is the "brain" of the ingestion pipeline. Every GPS packet that arrives
 * from a bus is passed through this module. It maintains in-memory state for
 * every active vehicle and emits derived EVENTS to PostgreSQL when meaningful
 * transitions are detected.
 *
 * EVENTS DETECTED:
 *   1. Stop Arrival / Departure  — geofence crossing
 *   2. Dwell Time                — derived from arrival+departure pair
 *   3. Trip Completion           — bus wraps around its full route
 *   4. Speed Profile             — avg speed logged per stop-to-stop segment
 *   5. Headway                   — gap between consecutive buses at a stop
 *   6. Anomalies                 — hard brake, speeding, off-route, GPS loss, bunching
 */

import pool from './db.js'

// ─────────────────────────────────────────────────────────────────────────────
//  CONSTANTS  (tune these for your system)
// ─────────────────────────────────────────────────────────────────────────────
const STOP_RADIUS_M         = 50      // meters — bus is "at a stop" within this radius
const GPS_LOSS_TIMEOUT_S    = 30      // seconds before we flag a GPS loss anomaly
const HARD_BRAKE_THRESHOLD  = 20      // km/h drop in one tick = hard brake
const SPEED_LIMIT_KMH       = 80      // bus speed limit
const BUNCHING_THRESHOLD_S  = 60      // headway < 60s = buses are bunching

// ─────────────────────────────────────────────────────────────────────────────
//  IN-MEMORY STATE
//  These Maps hold the live state for every active vehicle.
//  In production this would live in Redis so multiple server instances share it.
// ─────────────────────────────────────────────────────────────────────────────

/** @type {Map<string, VehicleState>} keyed by vehicle_id */
const vehicleState = new Map()

/**
 * @typedef {Object} VehicleState
 * @property {string}  vehicleId
 * @property {number}  route
 * @property {number}  lastLat
 * @property {number}  lastLon
 * @property {number}  lastSpeed
 * @property {number}  lastTimestamp        Unix seconds
 * @property {string|null} currentStopId    stop the bus is currently AT (null = in transit)
 * @property {Date|null}   arrivedAt        when it arrived at currentStopId
 * @property {string|null} prevStopId       last stop it departed FROM
 * @property {Date|null}   departedPrevAt   when it departed prevStopId
 * @property {number|null} currentTripId    active trip_log row id
 * @property {number}      stopsVisited     counter for current trip
 */

/**
 * @type {Map<string, { vehicleId: string, arrivedAt: Date }>}
 * Tracks the LAST ARRIVAL at each stop for headway calculation.
 * Key: `${route}:${stop_id}`
 */
const lastArrivalPerStop = new Map()

// ─────────────────────────────────────────────────────────────────────────────
//  STOP DATA  (loaded at startup from DB or a static file)
//  In a real system you'd load the 5,500 stops from your DB.
//  Format: { stop_id, route, latitude, longitude }
// ─────────────────────────────────────────────────────────────────────────────
let stopList = []

/**
 * Load stops from PostgreSQL into memory so geofence checks are O(n) in-process.
 * Call this once at server startup.
 */
export async function loadStops() {
    try {
        const res = await pool.query(`
            SELECT stop_id, route, latitude, longitude
            FROM stops
            ORDER BY route, sequence
        `)
        stopList = res.rows
        console.log(`[Processor] Loaded ${stopList.length} stops into memory.`)
    } catch (err) {
        // The stops table may not exist yet in a dev environment — that's okay.
        // Geofence detection will simply be skipped until stops are loaded.
        console.warn(`[Processor] Could not load stops (${err.message}). Stop detection disabled.`)
        stopList = []
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Process one incoming GPS packet. This is called by gpsController after
 * the HTTP response has already been sent to the bus (fast path first).
 *
 * @param {{ vehicle_id, route, latitude, longitude, speed, heading, timestamp }} packet
 */
export async function processGPS(packet) {
    const { vehicle_id, route, latitude, longitude, speed, heading, timestamp } = packet
    const now = new Date(timestamp * 1000)

    // ── Get or create state for this vehicle ─────────────────────────────────
    let state = vehicleState.get(vehicle_id)
    const isNewVehicle = !state

    if (isNewVehicle) {
        state = {
            vehicleId:       vehicle_id,
            route,
            lastLat:         latitude,
            lastLon:         longitude,
            lastSpeed:       speed,
            lastTimestamp:   timestamp,
            currentStopId:   null,
            arrivedAt:       null,
            prevStopId:      null,
            departedPrevAt:  null,
            currentTripId:   null,
            stopsVisited:    0,
        }
        vehicleState.set(vehicle_id, state)

        // Start a new trip log for this vehicle
        state.currentTripId = await startTrip(vehicle_id, route, now)
    }

    // ── Run all detection checks in parallel ─────────────────────────────────
    await Promise.allSettled([
        updateLatestPosition(packet, now),
        detectAnomalies(state, packet, now),
        detectStopEvents(state, packet, now),
    ])

    // ── Update in-memory state ────────────────────────────────────────────────
    state.lastLat       = latitude
    state.lastLon       = longitude
    state.lastSpeed     = speed
    state.lastTimestamp = timestamp
}

// ─────────────────────────────────────────────────────────────────────────────
//  1. LATEST POSITION  (upsert — one row per vehicle, always overwritten)
// ─────────────────────────────────────────────────────────────────────────────
async function updateLatestPosition(packet, now) {
    const { vehicle_id, route, latitude, longitude, speed, heading } = packet
    await pool.query(`
        INSERT INTO gps_latest (vehicle_id, route, latitude, longitude, speed, heading, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (vehicle_id)
        DO UPDATE SET
            route      = EXCLUDED.route,
            latitude   = EXCLUDED.latitude,
            longitude  = EXCLUDED.longitude,
            speed      = EXCLUDED.speed,
            heading    = EXCLUDED.heading,
            updated_at = EXCLUDED.updated_at
    `, [vehicle_id, route, latitude, longitude, speed, heading, now])
}

// ─────────────────────────────────────────────────────────────────────────────
//  2. ANOMALY DETECTION
// ─────────────────────────────────────────────────────────────────────────────
async function detectAnomalies(state, packet, now) {
    const { vehicle_id, route, latitude, longitude, speed, timestamp } = packet
    const anomalies = []

    // Hard brake: speed dropped by more than HARD_BRAKE_THRESHOLD in one tick
    const speedDrop = state.lastSpeed - speed
    if (state.lastSpeed > 0 && speedDrop >= HARD_BRAKE_THRESHOLD) {
        anomalies.push({
            type: 'hard_brake', severity: 'warning',
            detail: { prev_speed: state.lastSpeed, current_speed: speed, drop: speedDrop }
        })
    }

    // Speeding
    if (speed > SPEED_LIMIT_KMH) {
        anomalies.push({
            type: 'speeding', severity: 'warning',
            detail: { speed }
        })
    }

    // GPS loss: timestamp gap is larger than GPS_LOSS_TIMEOUT_S
    const gapSeconds = timestamp - state.lastTimestamp
    if (gapSeconds > GPS_LOSS_TIMEOUT_S) {
        anomalies.push({
            type: 'gps_loss', severity: 'critical',
            detail: { gap_seconds: gapSeconds }
        })
    }

    // Off-route: if stops are loaded, check if bus is far from ALL stops on its route
    if (stopList.length > 0) {
        const routeStops = stopList.filter(s => s.route === route)
        if (routeStops.length > 0) {
            const minDist = Math.min(...routeStops.map(s => haversineM(latitude, longitude, s.latitude, s.longitude)))
            if (minDist > 200) { // 200m from any stop on the route
                anomalies.push({
                    type: 'off_route', severity: 'warning',
                    detail: { distance_from_route_m: Math.round(minDist) }
                })
            }
        }
    }

    if (anomalies.length === 0) return

    // Batch insert all anomalies detected in this tick
    for (const a of anomalies) {
        await pool.query(`
            INSERT INTO anomaly_events (vehicle_id, route, anomaly_type, severity, latitude, longitude, detail, occurred_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [vehicle_id, route, a.type, a.severity, latitude, longitude, JSON.stringify(a.detail), now])
        console.log(`[Anomaly] ${vehicle_id} — ${a.type} (${a.severity})`)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  3. STOP ARRIVAL / DEPARTURE + DWELL TIME + SPEED PROFILE + HEADWAY
// ─────────────────────────────────────────────────────────────────────────────
async function detectStopEvents(state, packet, now) {
    if (stopList.length === 0) return

    const { vehicle_id, route, latitude, longitude } = packet

    // Find the nearest stop on this bus's route
    const routeStops = stopList.filter(s => s.route === route)
    if (routeStops.length === 0) return

    let nearest = null
    let nearestDist = Infinity
    for (const stop of routeStops) {
        const d = haversineM(latitude, longitude, stop.latitude, stop.longitude)
        if (d < nearestDist) { nearestDist = d; nearest = stop }
    }

    const isAtStop = nearestDist <= STOP_RADIUS_M
    const wasAtStop = state.currentStopId !== null

    // ── ARRIVAL: bus just entered a stop's geofence ───────────────────────────
    if (isAtStop && !wasAtStop) {
        const stopId = nearest.stop_id
        state.currentStopId = stopId
        state.arrivedAt = now

        await pool.query(`
            INSERT INTO stop_events (vehicle_id, route, stop_id, event_type, latitude, longitude, occurred_at)
            VALUES ($1, $2, $3, 'arrival', $4, $5, $6)
        `, [vehicle_id, route, stopId, latitude, longitude, now])

        console.log(`[Stop] ${vehicle_id} arrived at ${stopId}`)

        // ── HEADWAY calculation ────────────────────────────────────────────────
        const key = `${route}:${stopId}`
        const prev = lastArrivalPerStop.get(key)
        if (prev) {
            const headwaySec = Math.round((now - prev.arrivedAt) / 1000)
            await pool.query(`
                INSERT INTO headway_records (route, stop_id, vehicle_id, prev_vehicle_id, headway_seconds, recorded_at)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [route, stopId, vehicle_id, prev.vehicleId, headwaySec, now])

            // Bunching anomaly: two buses arrived at the same stop too close together
            if (headwaySec < BUNCHING_THRESHOLD_S) {
                await pool.query(`
                    INSERT INTO anomaly_events (vehicle_id, route, anomaly_type, severity, latitude, longitude, detail, occurred_at)
                    VALUES ($1, $2, 'bunching', 'warning', $3, $4, $5, $6)
                `, [vehicle_id, route, latitude, longitude,
                    JSON.stringify({ stop_id: stopId, headway_seconds: headwaySec, prev_vehicle: prev.vehicleId }),
                    now])
                console.log(`[Anomaly] Bunching at ${stopId}: ${vehicle_id} & ${prev.vehicleId} (${headwaySec}s apart)`)
            }
        }
        lastArrivalPerStop.set(key, { vehicleId: vehicle_id, arrivedAt: now })

        // ── SPEED PROFILE: log segment from previous stop to this one ─────────
        if (state.prevStopId && state.departedPrevAt) {
            const travelSec = Math.round((now - state.departedPrevAt) / 1000)
            if (travelSec > 0) {
                const prevStop = stopList.find(s => s.stop_id === state.prevStopId)
                const segDist = prevStop ? haversineM(prevStop.latitude, prevStop.longitude, nearest.latitude, nearest.longitude) : null

                await pool.query(`
                    INSERT INTO speed_profiles
                        (route, segment_from, segment_to, avg_speed_kmh, travel_seconds, distance_m, recorded_at, hour_of_day, day_of_week)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `, [
                    route,
                    state.prevStopId,
                    stopId,
                    segDist ? (segDist / 1000) / (travelSec / 3600) : null,  // km/h
                    travelSec,
                    segDist ? Math.round(segDist) : null,
                    now,
                    now.getHours(),
                    now.getDay()
                ])
            }
        }

        // Increment stops visited for the current trip
        state.stopsVisited++
        if (state.currentTripId) {
            await pool.query(`UPDATE trip_logs SET stops_visited = $1 WHERE id = $2`,
                [state.stopsVisited, state.currentTripId])
        }
    }

    // ── DEPARTURE: bus just left a stop's geofence ────────────────────────────
    if (!isAtStop && wasAtStop) {
        const stopId = state.currentStopId

        await pool.query(`
            INSERT INTO stop_events (vehicle_id, route, stop_id, event_type, latitude, longitude, occurred_at)
            VALUES ($1, $2, $3, 'departure', $4, $5, $6)
        `, [vehicle_id, route, stopId, latitude, longitude, now])

        // ── DWELL TIME: insert the arrival+departure pair ───────────────────────
        if (state.arrivedAt) {
            await pool.query(`
                INSERT INTO dwell_times (vehicle_id, route, stop_id, arrived_at, departed_at)
                VALUES ($1, $2, $3, $4, $5)
            `, [vehicle_id, route, stopId, state.arrivedAt, now])
            console.log(`[Stop] ${vehicle_id} departed ${stopId} — dwell: ${Math.round((now - state.arrivedAt) / 1000)}s`)
        }

        // Update state for the next segment's speed profile
        state.prevStopId     = stopId
        state.departedPrevAt = now
        state.currentStopId  = null
        state.arrivedAt      = null
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  4. TRIP MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────
async function startTrip(vehicleId, route, startedAt) {
    const res = await pool.query(`
        INSERT INTO trip_logs (vehicle_id, route, started_at, status)
        VALUES ($1, $2, $3, 'in_progress')
        RETURNING id
    `, [vehicleId, route, startedAt])
    console.log(`[Trip] Started trip #${res.rows[0].id} for ${vehicleId} on route ${route}`)
    return res.rows[0].id
}

export async function completeTrip(vehicleId) {
    const state = vehicleState.get(vehicleId)
    if (!state || !state.currentTripId) return

    const now = new Date()
    await pool.query(`
        UPDATE trip_logs
        SET ended_at = $1,
            duration_seconds = EXTRACT(EPOCH FROM ($1 - started_at))::INTEGER,
            status = 'completed'
        WHERE id = $2
    `, [now, state.currentTripId])
    console.log(`[Trip] Completed trip #${state.currentTripId} for ${vehicleId}`)
    vehicleState.delete(vehicleId)
}

// ─────────────────────────────────────────────────────────────────────────────
//  UTILITY — Haversine distance in metres between two lat/lon points
// ─────────────────────────────────────────────────────────────────────────────
function haversineM(lat1, lon1, lat2, lon2) {
    const R = 6_371_000  // Earth radius in metres
    const toRad = deg => deg * Math.PI / 180
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const a = Math.sin(dLat / 2) ** 2
            + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
    return R * 2 * Math.asin(Math.sqrt(a))
}

// ─────────────────────────────────────────────────────────────────────────────
//  STALE VEHICLE CLEANUP
//  Every 5 minutes, remove vehicles that haven't sent a packet in >5 minutes
//  and mark their trips as aborted.
// ─────────────────────────────────────────────────────────────────────────────
setInterval(async () => {
    const cutoff = Math.floor(Date.now() / 1000) - 300  // 5 minutes ago
    for (const [vehicleId, state] of vehicleState.entries()) {
        if (state.lastTimestamp < cutoff) {
            console.log(`[Processor] ${vehicleId} went offline — marking trip aborted.`)
            if (state.currentTripId) {
                await pool.query(`UPDATE trip_logs SET status='aborted', ended_at=NOW() WHERE id=$1`,
                    [state.currentTripId])
            }
            vehicleState.delete(vehicleId)
        }
    }
}, 5 * 60 * 1000)
