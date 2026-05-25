/**
 * api.js  —  Axios service layer
 *
 * Single source of truth for all HTTP calls in the frontend.
 * All components import from here — never call axios directly in components.
 *
 * In the future (Kafka + Redis era), the backend will push updates via WebSocket
 * instead of polling. Swapping this file is all that's needed on the frontend.
 */

import axios from 'axios'

// Base URL is empty — Vite's dev proxy forwards /api/* to the Website Backend.
// In production, set VITE_API_BASE_URL to the deployed backend URL.
const api = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || '',
    timeout: 5000,
})

// ── Bus data ──────────────────────────────────────────────────────────────────

/**
 * Fetch the latest position of every active bus.
 * @param {number|null} route  Optional route filter
 * @returns {Promise<Array<{ id, position:[lon,lat], speed, heading, route }>>}
 */
export async function fetchLiveBuses(route = null) {
    const params = route ? { route } : {}
    const { data } = await api.get('/api/buses/live', { params })
    return data.buses ?? []
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function login(credentials) {
    const { data } = await api.post('/api/auth/login', credentials)
    return data
}

export async function register(payload) {
    const { data } = await api.post('/api/auth/register', payload)
    return data
}

// ── ETA & Detour ──────────────────────────────────────────────────────────────

/**
 * Get ML-predicted ETA for the nearest bus on a route to reach a target point.
 * @param {number} route   Route ID
 * @param {number} lat     Target latitude
 * @param {number} lon     Target longitude
 * @returns {Promise<Object>} { eta_seconds, eta_minutes, basis, traffic_status, ... }
 */
export async function fetchETA(route, lat, lon) {
    const { data } = await api.get('/api/distance/estimate', {
        params: { route, lat, lon },
    })
    return data
}

/**
 * Get alternative detour paths between two points.
 * @param {number} fromLat  Start latitude
 * @param {number} fromLon  Start longitude
 * @param {number} toLat    End latitude
 * @param {number} toLon    End longitude
 * @returns {Promise<Object>} { is_congested, direct, alternatives }
 */
export async function fetchDetour(fromLat, fromLon, toLat, toLon) {
    const { data } = await api.get('/api/distance/detour', {
        params: { from_lat: fromLat, from_lon: fromLon, to_lat: toLat, to_lon: toLon },
    })
    return data
}

/**
 * Check if the direct path between two points is currently congested.
 * @param {number} fromLat  Start latitude
 * @param {number} fromLon  Start longitude
 * @param {number} toLat    End latitude
 * @param {number} toLon    End longitude
 * @returns {Promise<Object>} { is_congested, congestion_ratio, eta_seconds }
 */
export async function fetchDetourCheck(fromLat, fromLon, toLat, toLon) {
    const { data } = await api.get('/api/distance/detour/check', {
        params: { from_lat: fromLat, from_lon: fromLon, to_lat: toLat, to_lon: toLon },
    })
    return data
}

export default api
