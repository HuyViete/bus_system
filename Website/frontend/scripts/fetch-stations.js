/**
 * fetch-stations.js
 * Run once: node scripts/fetch-stations.js
 *
 * Queries the OpenStreetMap Overpass API for all bus stops inside
 * Ho Chi Minh City and writes a compact stations.json into public/.
 *
 * Output format (mirrors routes.json style — simple array):
 *   [
 *     { "id": 123, "name": "Trạm Bến Thành", "lat": 10.773, "lon": 106.698 },
 *     ...
 *   ]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'public', 'stations.json');

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

const QUERY = `
[out:json][timeout:60];
area["name"="Thành phố Hồ Chí Minh"]["admin_level"="4"]->.hcmc;
node["highway"="bus_stop"](area.hcmc);
out body;
`.trim();

console.log('Fetching HCMC bus stops from Overpass API...');

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

const stations = json.elements.map(el => ({
    id: el.id,
    name: el.tags?.name ?? el.tags?.['name:vi'] ?? el.tags?.['name:en'] ?? 'Bus Stop',
    lat: el.lat,
    lon: el.lon,
}));

fs.writeFileSync(OUT_PATH, JSON.stringify(stations));
console.log(`Done! Saved ${stations.length} stations to ${OUT_PATH}`);
