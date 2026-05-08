// Dashboard controllers — one handler per endpoint, delegates to service.
import * as dashboardService from '../services/dashboardService.js'

// GET /api/dashboard — high-level KPI overview for the main dashboard page.
export async function getOverview(req, res) {
    const data = await dashboardService.getOverview()
    res.json(data)
}

// GET /api/dashboard/routes — per-route fleet, trip, and health breakdown.
export async function getRoutes(req, res) {
    const data = await dashboardService.getRoutes()
    res.json(data)
}

// GET /api/dashboard/live — full live vehicle snapshot for map rendering.
export async function getLive(req, res) {
    const data = await dashboardService.getLive()
    res.json(data)
}

// GET /api/dashboard/anomalies — anomaly counts, types, and recent events.
export async function getAnomalies(req, res) {
    const data = await dashboardService.getAnomalies()
    res.json(data)
}

// GET /api/dashboard/operations — dwell, speed, and headway performance data.
export async function getOperations(req, res) {
    const data = await dashboardService.getOperations()
    res.json(data)
}

// GET /api/dashboard/ingestion — ingestion pipeline KPIs for ops monitoring.
export async function getIngestion(req, res) {
    const minutes = Math.min(Math.max(Number(req.query.minutes || 60), 1), 1440)
    const data = await dashboardService.getIngestion(minutes)
    res.json(data)
}