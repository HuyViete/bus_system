// Handles GET /api/events/trips — trip log records.
import * as tripLogModel from '../models/tripLogModel.js'

export async function getTrips(req, res) {
    const rows = await tripLogModel.findMany(req.query)
    res.json(rows)
}
