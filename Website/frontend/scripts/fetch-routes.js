/**
 * fetch-routes.js
 * Run once: node scripts/fetch-routes.js
 *
 * Queries the OpenStreetMap Overpass API for all bus route relations inside
 * Ho Chi Minh City and writes a structured routes.json into public/.
 *
 * Output format (array, not object — supports per-route metadata):
 *   [
 *     {
 *       "id": "12345678",          // OSM relation ID (stable, use as React key)
 *       "ref": "1",                // Official route number shown on bus
 *       "name": "Bến Thành - ...", // Full route name
 *       "color": [0, 114, 255],    // [r,g,b] — consistent per-route color
 *       "path": [[lon,lat], ...]   // deck.gl PathLayer coordinate order
 *     },
 *     ...
 *   ]
 *
 * Why this format?
 *   - `id`    → stable key for React + filtering by route selection
 *   - `ref`   → shown in future route-picker UI ("Route 1", "Route 13B")
 *   - `name`  → tooltip / search label
 *   - `color` → each route gets a distinct, consistent color
 *   - `path`  → already in [lon,lat] order so BusMap needs zero conversion
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'public', 'routes.json');

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Curated palette — 12 perceptually distinct colors for route lines.
// Routes cycle through this list, so each route always gets the same color.
const ROUTE_COLORS = [
    [0, 114, 255],   // blue
    [255, 60, 60],   // red
    [0, 192, 140],   // teal
    [255, 165, 0],   // amber
    [160, 60, 220],   // purple
    [50, 200, 85],   // green
    [255, 110, 30],   // orange
    [20, 190, 230],   // cyan
    [230, 55, 130],   // pink
    [130, 185, 0],   // lime
    [255, 220, 0],   // yellow
    [100, 100, 255],   // indigo
];

// Request all bus route *relations* in HCMC with full member geometry.
// `out geom` tells Overpass to embed each way's coordinates directly in the
// relation members — so we never need a second round-trip to resolve way IDs.
const QUERY = `
[out:json][timeout:120];
area["name"="Thành phố Hồ Chí Minh"]["admin_level"="4"]->.hcmc;
relation["type"="route"]["route"="bus"](area.hcmc);
out geom;
`.trim();

console.log('Fetching HCMC bus routes from Overpass API...');
console.log('(This may take 30–120 s — route geometry is large)\n');

const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(QUERY)}`,
});

if (!res.ok) {
    console.error(`Overpass API error: ${res.status} ${res.statusText}`);
    process.exit(1);
}

const json = await res.json();

const routes = json.elements
    .filter(el => el.type === 'relation')
    .map((rel, index) => {
        // Each member way carries a `geometry` array of {lat, lon} objects.
        // Concatenating them in member order gives the full route polyline.
        // Note: OSM way order is generally correct for bus routes but may have
        // small gaps at stops — visually imperceptible at city-map zoom levels.
        const path = (rel.members ?? [])
            .filter(m => m.type === 'way' && Array.isArray(m.geometry))
            .flatMap(m => m.geometry.map(pt => [pt.lon, pt.lat])); // lon,lat for deck.gl

        return {
            id: String(rel.id),
            ref: rel.tags?.ref ?? String(index + 1),
            name: rel.tags?.name ?? rel.tags?.['name:vi'] ?? `Bus ${rel.tags?.ref ?? index + 1}`,
            color: ROUTE_COLORS[index % ROUTE_COLORS.length],
            path,
        };
    })
    .filter(r => r.path.length >= 2); // drop entries with no geometry

// Sort by route ref so the UI list is in natural order (1, 2, 3 ... 10, 13B …)
routes.sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true }));

fs.writeFileSync(OUT_PATH, JSON.stringify(routes));
console.log(`Done!  Saved ${routes.length} routes → ${OUT_PATH}`);
console.log('Sample routes:');
routes.slice(0, 3).forEach(r =>
    console.log(`  [${r.ref}] ${r.name}  (${r.path.length} pts)`));
