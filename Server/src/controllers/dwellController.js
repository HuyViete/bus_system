// Handles GET /api/events/dwell — aggregated dwell time stats.
import * as dwellTimeModel from '../models/dwellTimeModel.js'

export async function getDwellStats(req, res) {
    const rows = await dwellTimeModel.findAggregated(req.query)
    res.json(rows)
}
