// Handles POST /api/gps — responds immediately, processes asynchronously.
import { processGPS } from '../services/gpsIngestionService.js'
import {
    recordPacketReceived,
    recordPacketValid,
    recordProcessingResult,
} from '../services/ingestionMetricsService.js'

export async function receiveGPS(req, res) {
    const packet = req.body
    const startedAt = Date.now()

    recordPacketReceived()
    recordPacketValid()

    // Respond immediately — bus must not wait for DB writes.
    res.status(200).json({ ok: true })

    // Fire-and-forget: process in background after response is sent.
    processGPS(packet)
        .then(() => recordProcessingResult(true, Date.now() - startedAt))
        .catch(err => {
            recordProcessingResult(false, Date.now() - startedAt)
            console.error(`[GPS] processGPS error for ${packet.vehicle_id}: ${err.message}`)
        })
}
