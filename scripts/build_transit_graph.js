#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const ROUTES_PATH   = path.join(ROOT, 'Bus', 'routes.json')
const STATIONS_PATH = path.join(ROOT, 'Bus', 'stations.json')
const OUTPUT_PATH   = path.join(ROOT, 'Bus', 'transit_graph.json')

const SNAP_THRESHOLD_M = 30

function haversineM(lat1, lon1, lat2, lon2) {
    const R = 6_371_000
    const toRad = d => d * Math.PI / 180
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const a = Math.sin(dLat / 2) ** 2
            + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
    return R * 2 * Math.asin(Math.sqrt(a))
}

function pointToSegmentProjection(pLat, pLon, aLat, aLon, bLat, bLon) {
    const cosLat = Math.cos(pLat * Math.PI / 180)
    const px = (pLon - aLon) * cosLat * 111320
    const py = (pLat - aLat) * 111320
    const bx = (bLon - aLon) * cosLat * 111320
    const by = (bLat - aLat) * 111320

    const dot = px * bx + py * by
    const lenSq = bx * bx + by * by
    let fraction = lenSq > 0 ? dot / lenSq : 0
    fraction = Math.max(0, Math.min(1, fraction))

    const projX = fraction * bx
    const projY = fraction * by
    const perpDistM = Math.sqrt((px - projX) ** 2 + (py - projY) ** 2)

    return { fraction, perpDistM }
}

console.log('[build-graph] Loading routes...')
const rawRoutes = JSON.parse(fs.readFileSync(ROUTES_PATH, 'utf-8'))

console.log('[build-graph] Loading stations...')
const rawStations = JSON.parse(fs.readFileSync(STATIONS_PATH, 'utf-8'))

// Group routes by ref (multiple JSON objects can share the same ref)
const routesByRef = new Map()
for (const r of rawRoutes) {
    const ref = parseInt(r.ref, 10)
    if (isNaN(ref)) continue
    if (!routesByRef.has(ref)) routesByRef.set(ref, [])
    routesByRef.get(ref).push(r.path)
}

console.log(`[build-graph] Processing ${routesByRef.size} routes...`)

const outputRoutes = []

for (const [routeId, paths] of routesByRef) {
    // Merge all paths for this route
    const merged = []
    for (const p of paths) {
        for (const [lon, lat] of p) {
            merged.push({ lat, lon })
        }
    }
    if (merged.length < 2) continue

    // Build cumulative distances
    const cumDist = [0]
    for (let i = 1; i < merged.length; i++) {
        const d = haversineM(merged[i-1].lat, merged[i-1].lon, merged[i].lat, merged[i].lon)
        cumDist.push(cumDist[i-1] + d)
    }
    const totalDist = cumDist[cumDist.length - 1]

    // Snap stations to this route
    const snappedStops = []
    for (const station of rawStations) {
        let bestDist = Infinity
        let bestAlongRoute = 0

        for (let i = 0; i < merged.length - 1; i++) {
            const { fraction, perpDistM } = pointToSegmentProjection(
                station.lat, station.lon,
                merged[i].lat, merged[i].lon,
                merged[i+1].lat, merged[i+1].lon
            )
            if (perpDistM < bestDist) {
                bestDist = perpDistM
                bestAlongRoute = cumDist[i] + fraction * (cumDist[i+1] - cumDist[i])
            }
        }

        if (bestDist <= SNAP_THRESHOLD_M) {
            snappedStops.push({
                id: station.id,
                name: station.name,
                lat: station.lat,
                lon: station.lon,
                dist_along_route: Math.round(bestAlongRoute * 10) / 10,
                snap_distance: Math.round(bestDist * 10) / 10,
            })
        }
    }

    // Sort stops by distance along route
    snappedStops.sort((a, b) => a.dist_along_route - b.dist_along_route)

    // Round cumulative distances
    const cumDistRounded = cumDist.map(d => Math.round(d * 10) / 10)

    outputRoutes.push({
        id: routeId,
        total_distance_m: Math.round(totalDist * 10) / 10,
        waypoint_count: merged.length,
        cumulative_dist: cumDistRounded,
        stops: snappedStops,
    })
}

// Sort routes by ID
outputRoutes.sort((a, b) => a.id - b.id)

const totalStopsSnapped = outputRoutes.reduce((sum, r) => sum + r.stops.length, 0)

const output = {
    generated_at: new Date().toISOString(),
    route_count: outputRoutes.size,
    total_stops_snapped: totalStopsSnapped,
    routes: outputRoutes,
}

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output))

const fileSizeMB = (fs.statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(2)
console.log(`[build-graph] Done!`)
console.log(`  Routes:  ${outputRoutes.length}`)
console.log(`  Stops:   ${totalStopsSnapped} snapped across all routes`)
console.log(`  Output:  ${OUTPUT_PATH} (${fileSizeMB} MB)`)
