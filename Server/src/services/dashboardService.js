// Dashboard service — composes model queries into structured dashboard sections.
import * as dashboard from '../models/dashboardModel.js'

// Full overview payload — used by GET /api/dashboard.
export async function getOverview() {
    const [
        fleetCounts,
        telemetryVolume,
        anomalyCounts,
        tripCounts,
        stopEventCounts,
        dwellSummary,
        headwaySummary,
        speedSummary,
    ] = await Promise.all([
        dashboard.getFleetCounts(),
        dashboard.getTelemetryVolume(),
        dashboard.getAnomalyCounts(),
        dashboard.getTripCounts(),
        dashboard.getStopEventCounts(),
        dashboard.getDwellSummary(),
        dashboard.getHeadwaySummary(),
        dashboard.getSpeedSummary(),
    ])

    return {
        fleet: fleetCounts,
        telemetry: telemetryVolume,
        anomalies: anomalyCounts,
        trips: tripCounts,
        stops: stopEventCounts,
        dwell: dwellSummary,
        headway: headwaySummary,
        speed: speedSummary,
    }
}

// Per-route breakdown — GET /api/dashboard/routes.
export async function getRoutes() {
    const [byRoute, healthScores, bunchedRoutes] = await Promise.all([
        dashboard.getFleetByRoute(),
        dashboard.getRouteHealthScores(),
        dashboard.getMostBunchedRoutes(),
    ])

    const tripsByRoute = await dashboard.getTripsByRoute()

    return { fleet: byRoute, health: healthScores, bunching: bunchedRoutes, trips: tripsByRoute }
}

// Live map data — GET /api/dashboard/live.
export async function getLive() {
    return dashboard.getFleetLiveSnapshot()
}

// Anomaly detail panel — GET /api/dashboard/anomalies.
export async function getAnomalies() {
    const [counts, byType, recent] = await Promise.all([
        dashboard.getAnomalyCounts(),
        dashboard.getAnomalyByType(),
        dashboard.getRecentAnomalies(20),
    ])
    return { counts, by_type: byType, recent }
}

// Operations performance — GET /api/dashboard/operations.
export async function getOperations() {
    const [dwell, slowestStops, speed, slowestSegments, headway] = await Promise.all([
        dashboard.getDwellSummary(),
        dashboard.getSlowestStops(10),
        dashboard.getSpeedSummary(),
        dashboard.getSlowestSegments(10),
        dashboard.getHeadwaySummary(),
    ])
    return {
        dwell: { summary: dwell, slowest_stops: slowestStops },
        speed: { summary: speed, slowest_segments: slowestSegments },
        headway,
    }
}

// Ingestion performance — GET /api/dashboard/ingestion?minutes=60.
export async function getIngestion(minutes = 60) {
    const [summary, series] = await Promise.all([
        dashboard.getIngestionSummary(minutes),
        dashboard.getIngestionTimeSeries(minutes),
    ])

    // Compute avg_processing_ms from totals since it's not stored directly.
    const summaryNormalized = summary.map(r => {
        const samples = Number(r.processing_samples || 0)
        const msTotal = Number(r.processing_ms_total || 0)
        return {
            ...r,
            packets_received: Number(r.packets_received || 0),
            packets_valid: Number(r.packets_valid || 0),
            packets_invalid: Number(r.packets_invalid || 0),
            processed_ok: Number(r.processed_ok || 0),
            processed_fail: Number(r.processed_fail || 0),
            raw_insert_ok: Number(r.raw_insert_ok || 0),
            raw_insert_duplicate: Number(r.raw_insert_duplicate || 0),
            processing_samples: samples,
            avg_processing_ms: samples > 0 ? Number((msTotal / samples).toFixed(2)) : 0,
            max_processing_ms: Number(r.processing_ms_max || 0),
        }
    })

    return { window_minutes: minutes, summary: summaryNormalized, series }
}