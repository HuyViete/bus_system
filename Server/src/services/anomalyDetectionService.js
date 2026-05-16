// Detects rule-based anomalies from a single GPS packet against vehicle state.
import { HARD_BRAKE_THRESHOLD, SPEED_LIMIT_KMH, GPS_LOSS_TIMEOUT_S, OFF_ROUTE_THRESHOLD_M } from '../libs/constants.js'
import { haversineM } from '../libs/geo.js'

// Full detection — used when edge does NOT send pre-computed anomalies (legacy path).
export function detect(state, packet, stopList) {
    const { speed, timestamp, latitude, longitude, route } = packet
    const anomalies = []

    const speedDrop = state.lastSpeed - speed
    if (state.lastSpeed > 0 && speedDrop >= HARD_BRAKE_THRESHOLD) {
        anomalies.push({
            type: 'hard_brake', severity: 'warning',
            detail: { prev_speed: state.lastSpeed, current_speed: speed, drop: speedDrop },
        })
    }

    if (speed > SPEED_LIMIT_KMH) {
        anomalies.push({ type: 'speeding', severity: 'warning', detail: { speed } })
    }

    const gapSeconds = timestamp - state.lastTimestamp
    if (gapSeconds > GPS_LOSS_TIMEOUT_S) {
        anomalies.push({ type: 'gps_loss', severity: 'critical', detail: { gap_seconds: gapSeconds } })
    }

    if (stopList.length > 0) {
        const routeStops = stopList.filter(s => s.route === route)
        if (routeStops.length > 0) {
            const minDist = Math.min(...routeStops.map(s => haversineM(latitude, longitude, s.latitude, s.longitude)))
            if (minDist > OFF_ROUTE_THRESHOLD_M) {
                anomalies.push({
                    type: 'off_route', severity: 'warning',
                    detail: { distance_from_route_m: Math.round(minDist) },
                })
            }
        }
    }

    return anomalies
}

// Server-only detection — used when edge already sent hard_brake/speeding.
// Only checks anomalies the edge cannot detect (gps_loss, off_route).
export function detectServerOnly(state, packet, stopList) {
    const { timestamp, latitude, longitude, route } = packet
    const anomalies = []

    const gapSeconds = timestamp - state.lastTimestamp
    if (gapSeconds > GPS_LOSS_TIMEOUT_S) {
        anomalies.push({ type: 'gps_loss', severity: 'critical', detail: { gap_seconds: gapSeconds } })
    }

    if (stopList.length > 0) {
        const routeStops = stopList.filter(s => s.route === route)
        if (routeStops.length > 0) {
            const minDist = Math.min(...routeStops.map(s => haversineM(latitude, longitude, s.latitude, s.longitude)))
            if (minDist > OFF_ROUTE_THRESHOLD_M) {
                anomalies.push({
                    type: 'off_route', severity: 'warning',
                    detail: { distance_from_route_m: Math.round(minDist) },
                })
            }
        }
    }

    return anomalies
}
