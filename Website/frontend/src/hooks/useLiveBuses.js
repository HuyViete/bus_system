/**
 * useLiveBuses.js  —  Live bus polling hook
 *
 * Polls the Website Backend every POLL_INTERVAL_MS and returns the latest
 * array of bus positions formatted for deck.gl's IconLayer.
 *
 * FUTURE UPGRADE PATH:
 *   When Redis + WebSocket push is ready, replace the setInterval inside
 *   this hook with a socket.on('bus:update', ...) listener.
 *   The rest of the app (BusMap, etc.) stays unchanged.
 */

import { useState, useEffect, useRef } from 'react'
import { fetchLiveBuses } from '../services/api'

const POLL_INTERVAL_MS = 3000   // matches the GPS tick interval from buses

/**
 * @param {number|null} route  Optional route filter (null = all routes)
 * @returns {{ buses: Array, isConnected: boolean, busCount: number }}
 */
export function useLiveBuses(route = null) {
    const [buses, setBuses] = useState([])
    const [isConnected, setIsConnected] = useState(false)
    const intervalRef = useRef(null)

    useEffect(() => {
        let isMounted = true

        const poll = async () => {
            try {
                const data = await fetchLiveBuses(route)
                if (isMounted) {
                    setBuses(data)
                    setIsConnected(true)
                }
            } catch {
                if (isMounted) setIsConnected(false)
            }
        }

        // Fetch immediately on mount, then on every interval
        poll()
        intervalRef.current = setInterval(poll, POLL_INTERVAL_MS)

        return () => {
            isMounted = false
            clearInterval(intervalRef.current)
        }
    }, [route])

    return { buses, isConnected, busCount: buses.length }
}
