// Handles GET /api/events/live — latest position of all active buses.
import * as gpsLatestModel from '../models/gpsLatestModel.js'

export async function getLivePositions(req, res) {
    const rows = await gpsLatestModel.findActive(req.query.route || null)
    res.json(rows)
}
