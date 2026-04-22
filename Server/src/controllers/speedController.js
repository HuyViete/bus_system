// Handles GET /api/events/speed — segment speed profiles.
import * as speedProfileModel from '../models/speedProfileModel.js'

export async function getSpeedProfiles(req, res) {
    const rows = await speedProfileModel.findAggregated(req.query)
    res.json(rows)
}
