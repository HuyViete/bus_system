// Validates required fields in GPS ingestion payload.
import { recordPacketInvalid } from '../services/ingestionMetricsService.js'

const REQUIRED_FIELDS = ['vehicle_id', 'route', 'latitude', 'longitude', 'timestamp']

export function validateGPS(req, res, next) {
    for (const field of REQUIRED_FIELDS) {
        if (req.body[field] === undefined || req.body[field] === null) {
            recordPacketInvalid()
            return res.status(400).json({ error: `Missing field: ${field}` })
        }
    }
    next()
}
