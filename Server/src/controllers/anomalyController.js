// Handles GET /api/events/anomalies — anomaly event history.
import * as anomalyEventModel from '../models/anomalyEventModel.js'

export async function getAnomalies(req, res) {
    const rows = await anomalyEventModel.findMany(req.query)
    res.json(rows)
}
