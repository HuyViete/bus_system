// Handles GET /api/events/ingestion-metrics — ingestion KPI report.
import * as ingestionMetricModel from '../models/ingestionMetricModel.js'

export async function getIngestionMetrics(req, res) {
    const minutes = Math.min(Math.max(Number(req.query.minutes || 60), 1), 24 * 60)
    const phase = req.query.phase || null

    const [summaryRows, seriesRows] = await Promise.all([
        ingestionMetricModel.findSummary(minutes, phase),
        ingestionMetricModel.findSeries(minutes, phase),
    ])

    // Normalize numeric types from PostgreSQL bigint strings.
    const summary = summaryRows.map(r => {
        const samples = Number(r.processing_samples || 0)
        const msTotal = Number(r.processing_ms_total || 0)
        return {
            phase:                r.phase,
            packets_received:     Number(r.packets_received || 0),
            packets_valid:        Number(r.packets_valid || 0),
            packets_invalid:      Number(r.packets_invalid || 0),
            processed_ok:         Number(r.processed_ok || 0),
            processed_fail:       Number(r.processed_fail || 0),
            raw_insert_ok:        Number(r.raw_insert_ok || 0),
            raw_insert_fail:      Number(r.raw_insert_fail || 0),
            raw_insert_duplicate: Number(r.raw_insert_duplicate || 0),
            processing_samples:   samples,
            avg_processing_ms:    samples > 0 ? Number((msTotal / samples).toFixed(2)) : 0,
            max_processing_ms:    Number(r.processing_ms_max || 0),
        }
    })

    res.json({ window_minutes: minutes, phase, summary, series: seriesRows })
}
