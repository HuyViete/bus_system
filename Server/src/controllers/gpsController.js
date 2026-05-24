// Handles POST /api/gps — validates, produces to Kafka, responds immediately.
import { produceGPS } from '../services/kafkaProducerService.js'
import {
    recordPacketReceived,
    recordPacketValid,
} from '../services/ingestionMetricsService.js'

export async function receiveGPS(req, res) {
    const packet = req.body

    recordPacketReceived()
    recordPacketValid()

    // Produce to Kafka — the consumer will handle DB writes.
    produceGPS(packet).catch(err => {
        console.error(`[GPS] Kafka produce error for ${packet.vehicle_id}: ${err.message}`)
    })

    // Respond immediately — bus must not wait for Kafka or DB writes.
    res.status(200).json({ ok: true })
}
