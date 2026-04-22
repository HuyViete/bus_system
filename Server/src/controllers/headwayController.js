// Handles GET /api/events/headway — headway statistics per stop.
import * as headwayRecordModel from '../models/headwayRecordModel.js'

export async function getHeadway(req, res) {
    const rows = await headwayRecordModel.findAggregated(req.query)
    res.json(rows)
}
