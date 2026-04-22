// Handles GET /api/events/stops — recent stop arrival/departure events.
import * as stopEventModel from '../models/stopEventModel.js'

export async function getStopEvents(req, res) {
    const rows = await stopEventModel.findMany(req.query)
    res.json(rows)
}
