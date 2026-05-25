/**
 * DetourPanel.jsx — Alternative inter-station detour suggestion panel.
 *
 * Shows the direct route vs alternative detour paths between two points.
 * User selects two points on the map → panel computes and displays detour options.
 * Congested segments flagged with red indicator, detour savings shown.
 */
import { useState, useEffect, useCallback } from 'react'
import { fetchDetour } from '../services/api'

export default function DetourPanel({ fromLat, fromLon, toLat, toLon, onSelectPath, onClose }) {
    const [result, setResult] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        if (!fromLat || !fromLon || !toLat || !toLon) return
        let cancelled = false

        setLoading(true)
        setError(null)

        fetchDetour(fromLat, fromLon, toLat, toLon)
            .then(data => {
                if (!cancelled) {
                    setResult(data)
                    setLoading(false)
                }
            })
            .catch(err => {
                if (!cancelled) {
                    setError(err.message || 'Failed to compute detour')
                    setLoading(false)
                }
            })

        return () => { cancelled = true }
    }, [fromLat, fromLon, toLat, toLon])

    const handleSelectDirect = useCallback(() => {
        if (result?.direct?.path) {
            onSelectPath?.(result.direct.path, 'direct')
        }
    }, [result, onSelectPath])

    const handleSelectAlt = useCallback((alt, idx) => {
        if (alt?.path) {
            onSelectPath?.(alt.path, `alt_${idx}`)
        }
    }, [onSelectPath])

    if (loading) {
        return (
            <div style={styles.panel}>
                <div style={styles.header}>
                    <span style={styles.title}>Route Options</span>
                    <button onClick={onClose} style={styles.closeBtn}>✕</button>
                </div>
                <div style={styles.loadingText}>Computing routes...</div>
            </div>
        )
    }

    if (error) {
        return (
            <div style={styles.panel}>
                <div style={styles.header}>
                    <span style={styles.title}>Route Options</span>
                    <button onClick={onClose} style={styles.closeBtn}>✕</button>
                </div>
                <div style={styles.errorText}>{error}</div>
            </div>
        )
    }

    if (!result) return null

    const directSaving = result.alternatives?.length
        ? result.direct.eta_seconds - result.alternatives[0].eta_seconds
        : 0

    return (
        <div style={styles.panel}>
            <div style={styles.header}>
                <span style={styles.title}>Route Options</span>
                <button onClick={onClose} style={styles.closeBtn}>✕</button>
            </div>

            {/* Congestion indicator */}
            {result.is_congested && (
                <div style={styles.congestionAlert}>
                    ⚠️ Congestion detected ({result.congestion_ratio}× slower than usual)
                </div>
            )}

            {/* Direct route card */}
            <div
                style={{
                    ...styles.routeCard,
                    borderColor: result.is_congested ? '#ef4444' : '#10b981',
                }}
                onClick={handleSelectDirect}
            >
                <div style={styles.routeCardHeader}>
                    <span style={styles.routeLabel}>
                        {result.is_congested ? '🔴 Direct (Congested)' : '🟢 Direct'}
                    </span>
                    <span style={styles.routeETA}>{result.direct.eta_minutes} min</span>
                </div>
                <div style={styles.routeCardMeta}>
                    {(result.direct.distance_m / 1000).toFixed(1)} km
                    {' · '}
                    {result.direct.basis === 'ml_model' ? '🤖 AI' : '📐 Est'}
                </div>
            </div>

            {/* Alternative routes */}
            {result.alternatives?.map((alt, idx) => {
                const savings = result.direct.eta_seconds - alt.eta_seconds

                return (
                    <div
                        key={idx}
                        style={{
                            ...styles.routeCard,
                            borderColor: '#6366f1',
                        }}
                        onClick={() => handleSelectAlt(alt, idx)}
                    >
                        <div style={styles.routeCardHeader}>
                            <span style={styles.routeLabel}>🔵 {alt.label}</span>
                            <span style={styles.routeETA}>{alt.eta_minutes} min</span>
                        </div>
                        <div style={styles.routeCardMeta}>
                            {(alt.distance_m / 1000).toFixed(1)} km
                            {' · '}
                            {alt.basis === 'ml_model' ? '🤖 AI' : '📐 Est'}
                            {savings > 0 && (
                                <span style={styles.savingsBadge}>
                                    Save {Math.round(savings / 60)} min
                                </span>
                            )}
                        </div>
                    </div>
                )
            })}

            {!result.is_congested && (
                <div style={styles.noCongest}>
                    ✅ No congestion detected — direct route is optimal
                </div>
            )}
        </div>
    )
}

const styles = {
    panel: {
        position: 'absolute',
        bottom: 24,
        left: 24,
        width: 320,
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        backdropFilter: 'blur(16px)',
        borderRadius: 16,
        padding: '16px 20px',
        color: '#f1f5f9',
        fontFamily: "'Inter', -apple-system, sans-serif",
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        border: '1px solid rgba(255,255,255,0.1)',
        zIndex: 1000,
        maxHeight: '60vh',
        overflowY: 'auto',
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
    congestionAlert: {
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: 10,
        padding: '8px 12px',
        fontSize: 12,
        fontWeight: 600,
        marginBottom: 12,
        color: '#fca5a5',
    },
    routeCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid',
        borderRadius: 12,
        padding: '12px 14px',
        marginBottom: 8,
        cursor: 'pointer',
        transition: 'background-color 0.2s, transform 0.15s',
    },
    routeCardHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    routeLabel: {
        fontSize: 13,
        fontWeight: 600,
    },
    routeETA: {
        fontSize: 16,
        fontWeight: 700,
        background: 'linear-gradient(135deg, #38bdf8, #818cf8)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
    },
    routeCardMeta: {
        fontSize: 11,
        color: '#64748b',
    },
    savingsBadge: {
        marginLeft: 6,
        backgroundColor: '#10b981',
        color: '#fff',
        padding: '1px 6px',
        borderRadius: 8,
        fontSize: 10,
        fontWeight: 600,
    },
    noCongest: {
        fontSize: 12,
        color: '#86efac',
        textAlign: 'center',
        padding: '8px 0',
        marginTop: 4,
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
