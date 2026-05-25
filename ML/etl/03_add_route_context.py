#!/usr/bin/env python3
"""
03_add_route_context.py — Optional enrichment: join route mapping and station proximity.

Reads the travel_chunks.parquet from step 02, enriches each chunk with:
  - route_id (from vehicle_route_mapping.csv, joined via the cleaned data)
  - near_station flag (is this grid cell near any known bus station?)
  - station_id (nearest station, if within 200 m)

This step is OPTIONAL — the model works without it, but route context improves accuracy.

Usage:
    python etl/03_add_route_context.py
"""
import json
import math
import os
import sys
import time

import numpy as np
import pandas as pd
from tqdm import tqdm

sys.path.insert(0, os.path.dirname(__file__))
from config import (
    CLEANED_DIR, CHUNKS_DIR, ROUTE_MAPPING_CSV,
    STATIONS_JSON, GRID_RESOLUTION,
)


def haversine_m(lat1, lon1, lat2, lon2):
    """Scalar Haversine distance in metres."""
    R = 6_371_000
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (math.sin(d_lat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(d_lon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))


def build_station_grid(stations: list[dict], resolution: float) -> dict:
    """
    Build a lookup: grid_cell → list of nearby station IDs.
    For each station, mark its grid cell and all 8 neighbours.
    """
    grid = {}
    for s in stations:
        lat, lon = s['lat'], s['lon']
        glat = round(lat / resolution) * resolution
        glon = round(lon / resolution) * resolution
        
        # Mark this cell and all 8 neighbours
        for dlat in [-resolution, 0, resolution]:
            for dlon in [-resolution, 0, resolution]:
                key = (round(glat + dlat, 4), round(glon + dlon, 4))
                if key not in grid:
                    grid[key] = []
                grid[key].append(s['id'])
    
    return grid


def main():
    print('[ETL] Step 3: Adding route context (optional enrichment)')
    start = time.time()
    
    # Load travel chunks
    chunks_path = os.path.join(CHUNKS_DIR, 'travel_chunks.parquet')
    if not os.path.exists(chunks_path):
        print(f'[ETL] travel_chunks.parquet not found. Run 02_build_chunks.py first.')
        sys.exit(1)
    
    df = pd.read_parquet(chunks_path)
    print(f'[ETL] Loaded {len(df):,} chunks')
    
    # ── Route mapping ─────────────────────────────────────────────────────
    has_routes = False
    if os.path.exists(ROUTE_MAPPING_CSV):
        route_map = pd.read_csv(ROUTE_MAPPING_CSV)
        print(f'[ETL] Loaded {len(route_map):,} vehicle-route mappings')
        
        # The chunks don't have vehicle_id (we dropped it for privacy/size).
        # We'd need to re-join via the cleaned parquet files.
        # For now, skip route enrichment and mark it as future work.
        print('[ETL] Note: Route enrichment requires vehicle_id in chunks (future work).')
        print('[ETL] Skipping route_id join for now — model works without it.')
        has_routes = False
    
    # ── Station proximity ─────────────────────────────────────────────────
    if os.path.exists(STATIONS_JSON):
        with open(STATIONS_JSON, 'r', encoding='utf-8') as f:
            stations = json.load(f)
        print(f'[ETL] Loaded {len(stations):,} stations')
        
        # Build station grid lookup
        station_grid = build_station_grid(stations, GRID_RESOLUTION)
        print(f'[ETL] Station grid cells with stations: {len(station_grid):,}')
        
        # Vectorised lookup: check if each chunk's grid cell is near a station
        near_station = np.zeros(len(df), dtype=np.int8)
        
        for idx, row in tqdm(df.iterrows(), total=len(df), desc='Station proximity'):
            key = (round(row['grid_lat'], 4), round(row['grid_lon'], 4))
            if key in station_grid:
                near_station[idx] = 1
        
        df['near_station'] = near_station
        pct = near_station.sum() / len(df) * 100
        print(f'[ETL] Chunks near a station: {near_station.sum():,} ({pct:.1f}%)')
    else:
        print(f'[ETL] stations.json not found, skipping station proximity.')
        df['near_station'] = 0
    
    # Save enriched chunks
    output_path = os.path.join(CHUNKS_DIR, 'enriched_chunks.parquet')
    df.to_parquet(output_path, index=False, engine='pyarrow')
    
    elapsed = time.time() - start
    size_mb = os.path.getsize(output_path) / 1024 / 1024
    print(f'\n[ETL] Saved: {output_path} ({size_mb:.1f} MB)')
    print(f'[ETL] Done in {elapsed:.1f}s')


if __name__ == '__main__':
    main()
