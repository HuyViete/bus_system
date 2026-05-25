/**
 * ETAPanel.jsx — ML-backed ETA display panel.
 *
 * Floating panel shown when user selects a bus or destination point.
 * Displays: estimated time (from ML model or fallback), traffic status badge,
 * model basis indicator, and confidence interval.
 */
import { useState, useEffect } from 'react'
import { fetchETA } from '../services/api'

const trafficColors = {
    light:  { bg: '#10b981', label: '🟢 Light Traffic' },
    normal: { bg: '#f59e0b', label: '🟡 Moderate Traffic' },
    heavy:  { bg: '#ef4444', label: '🔴 Heavy Traffic' },
}

export default function ETAPanel({ route, lat, lon, onClose }) {
    const [eta, setEta] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        if (!route || !lat || !lon) return
        let cancelled = false

        setLoading(true)
        setError(null)

        fetchETA(route, lat, lon)
            .then(data => {
                if (!cancelled) {
                    setEta(data)
                    setLoading(false)
                }
            })
            .catch(err => {
                if (!cancelled) {
                    setError(err.message || 'Failed to fetch ETA')
                    setLoading(false)
                }
            })

        return () => { cancelled = true }
    }, [route, lat, lon])

    if (loading) {
        return (
            <div style={styles.panel}>
                <div style={styles.header}>
                    <span style={styles.title}>Estimated Time</span>
                    <button onClick={onClose} style={styles.closeBtn}>✕</button>
                </div>
                <div style={styles.loadingText}>Calculating ETA...</div>
            </div>
        )
    }

    if (error) {
        return (
            <div style={styles.panel}>
                <div style={styles.header}>
                    <span style={styles.title}>Estimated Time</span>
                    <button onClick={onClose} style={styles.closeBtn}>✕</button>
                </div>
                <div style={styles.errorText}>{error}</div>
            </div>
        )
    }

    if (!eta) return null

    const traffic = trafficColors[eta.traffic_status] || trafficColors.normal
    const isML = eta.basis === 'ml_model'

    return (
        <div style={styles.panel}>
            <div style={styles.header}>
                <span style={styles.title}>Estimated Time</span>
                <button onClick={onClose} style={styles.closeBtn}>✕</button>
            </div>

            {/* Main ETA display */}
            <div style={styles.etaMain}>
                <span style={styles.etaValue}>{eta.eta_minutes}</span>
                <span style={styles.etaUnit}>min</span>
            </div>

            {/* Traffic badge */}
            <div style={{ ...styles.trafficBadge, backgroundColor: traffic.bg }}>
                {traffic.label}
            </div>

            {/* Details */}
            <div style={styles.details}>
                <div style={styles.detailRow}>
                    <span style={styles.detailLabel}>Distance</span>
                    <span style={styles.detailValue}>
                        {eta.distance_to_bus_m
                            ? `${(eta.distance_to_bus_m / 1000).toFixed(1)} km`
                            : '—'
                        }
                    </span>
                </div>
                <div style={styles.detailRow}>
                    <span style={styles.detailLabel}>Nearest Bus</span>
                    <span style={styles.detailValue}>{eta.nearest_bus_id || '—'}</span>
                </div>
                {eta.confidence && (
                    <div style={styles.detailRow}>
                        <span style={styles.detailLabel}>Range</span>
                        <span style={styles.detailValue}>
                            {Math.round(eta.confidence.low_seconds / 60)}–
                            {Math.round(eta.confidence.high_seconds / 60)} min
                        </span>
                    </div>
                )}
            </div>

            {/* Basis indicator */}
            <div style={styles.basisBar}>
                <span style={{
                    ...styles.basisTag,
                    backgroundColor: isML ? '#6366f1' : '#6b7280',
                }}>
                    {isML ? '🤖 AI Predicted' : '📐 Estimated'}
                </span>
                {eta.model_version && (
                    <span style={styles.versionTag}>{eta.model_version}</span>
                )}
            </div>
        </div>
    )
}

const styles = {
    panel: {
        position: 'absolute',
        bottom: 24,
        right: 24,
        width: 280,
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        backdropFilter: 'blur(16px)',
        borderRadius: 16,
        padding: '16px 20px',
        color: '#f1f5f9',
        fontFamily: "'Inter', -apple-system, sans-serif",
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        border: '1px solid rgba(255,255,255,0.1)',
        zIndex: 1000,
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    title: {
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
        color: '#94a3b8',
    },
    closeBtn: {
        background: 'none',
        border: 'none',
        color: '#94a3b8',
        fontSize: 16,
        cursor: 'pointer',
        padding: '2px 6px',
        borderRadius: 4,
    },
    etaMain: {
        display: 'flex',
        alignItems: 'baseline',
        gap: 6,
        marginBottom: 12,
    },
    etaValue: {
        fontSize: 40,
        fontWeight: 700,
        lineHeight: 1,
        background: 'linear-gradient(135deg, #38bdf8, #818cf8)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
    },
    etaUnit: {
        fontSize: 18,
        fontWeight: 500,
        color: '#94a3b8',
    },
    trafficBadge: {
        display: 'inline-block',
        padding: '4px 12px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        marginBottom: 14,
    },
    details: {
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        marginBottom: 12,
    },
    detailRow: {
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 13,
    },
    detailLabel: {
        color: '#64748b',
    },
    detailValue: {
        color: '#e2e8f0',
        fontWeight: 500,
    },
    basisBar: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        borderTop: '1px solid rgba(255,255,255,0.08)',
        paddingTop: 10,
    },
    basisTag: {
        fontSize: 11,
        fontWeight: 600,
        padding: '3px 10px',
        borderRadius: 12,
        color: '#fff',
    },
    versionTag: {
        fontSize: 10,
        color: '#64748b',
        fontFamily: 'monospace',
    },
    loadingText: {
        fontSize: 14,
        color: '#94a3b8',
        textAlign: 'center',
        padding: '20px 0',
    },
    errorText: {
        fontSize: 13,
        color: '#f87171',
        textAlign: 'center',
        padding: '16px 0',
    },
}
