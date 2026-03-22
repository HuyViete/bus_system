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

export default api
