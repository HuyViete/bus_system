/**
 * gpsController.js
 *
 * Handles POST /api/gps from buses.
 * Design principle: respond to the bus IMMEDIATELY (so its TCP thread doesn't block),
 * then do all the heavy DB work asynchronously afterwards.
 */

import pool from '../libs/db.js'
import { processGPS } from '../libs/gpsProcessor.js'

export async function receiveGPS(req, res) {
    const packet = req.body

    // ── Basic validation ───────────────────────────────────────────────────────
    const required = ['vehicle_id', 'route', 'latitude', 'longitude', 'timestamp']
    for (const field of required) {
        if (packet[field] === undefined || packet[field] === null) {
            return res.status(400).json({ error: `Missing field: ${field}` })
        }
    }

    // ── Respond immediately — bus must not wait for our DB writes ──────────────
    res.status(200).json({ ok: true })

    // ── Process asynchronously (fire-and-forget after response is sent) ────────
    // Any error here is logged server-side but does NOT affect the bus.
    processGPS(packet).catch(err => {
        console.error(`[GPS Controller] processGPS error for ${packet.vehicle_id}: ${err.message}`)
    })
}
