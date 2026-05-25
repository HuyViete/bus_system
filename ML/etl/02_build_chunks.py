#!/usr/bin/env python3
"""
02_build_chunks.py — Convert cleaned GPS data into grid-cell travel time chunks.

For each vehicle, sorts GPS points by time, then for each consecutive pair:
  - Computes the grid cell (rounded to GRID_RESOLUTION)
  - Computes Haversine distance and elapsed time
  - Filters out GPS jitter, jumps, and trip breaks
  - Extracts temporal features (hour, day, rush hour, etc.)
  - Outputs one row per valid chunk

Usage:
    python etl/02_build_chunks.py
    python etl/02_build_chunks.py --sample   # use only sample batch
"""
import argparse
import glob
import math
import os
import sys
import time

import numpy as np
import pandas as pd
from tqdm import tqdm

sys.path.insert(0, os.path.dirname(__file__))
from config import (
    CLEANED_DIR, CHUNKS_DIR, GRID_RESOLUTION,
    MAX_GAP_SECONDS, MIN_GAP_SECONDS, MIN_DISTANCE_M,
    MAX_SPEED_KMH, MAX_CHUNK_TIME_S,
)


# ── Haversine distance (metres) ──────────────────────────────────────────────

_R = 6_371_000  # Earth radius in metres

def haversine_m(lat1, lon1, lat2, lon2):
    """Vectorised Haversine distance in metres."""
    d_lat = np.radians(lat2 - lat1)
    d_lon = np.radians(lon2 - lon1)
    a = (np.sin(d_lat / 2) ** 2 +
         np.cos(np.radians(lat1)) * np.cos(np.radians(lat2)) *
         np.sin(d_lon / 2) ** 2)
    return _R * 2 * np.arcsin(np.sqrt(a))


# ── Temporal feature extraction ──────────────────────────────────────────────

def extract_temporal_features(timestamps: np.ndarray) -> dict:
    """
    From a numpy array of unix timestamps, extract temporal features.
    Returns dict of arrays (same length as input).
    """
    # Convert to pandas datetime for easy extraction
    dt = pd.to_datetime(timestamps, unit='s', utc=True)
    # Convert to HCMC timezone (UTC+7)
    dt_local = dt.tz_convert('Asia/Ho_Chi_Minh')
    
    hour = dt_local.hour.values
    minute = dt_local.minute.values
    dow = dt_local.dayofweek.values  # 0=Mon, 6=Sun
    
    return {
        'hour_of_day':    hour,
        'minute_bucket':  (minute // 15).astype(np.int8),  # 0-3 (15-min buckets)
        'day_of_week':    dow,
        'is_weekend':     (dow >= 5).astype(np.int8),
        'is_rush_hour':   (((hour >= 7) & (hour <= 9)) | ((hour >= 16) & (hour <= 19))).astype(np.int8),
    }


def process_vehicle_group(group_df: pd.DataFrame) -> list[dict]:
    """
    Process all GPS points for a single vehicle.
    Returns a list of chunk dicts.
    """
    # Sort by timestamp
    df = group_df.sort_values('timestamp').reset_index(drop=True)
    
    if len(df) < 2:
        return []
    
    chunks = []
    
    # Vectorised computation of consecutive differences
    lat1 = df['lat'].values[:-1]
    lon1 = df['lon'].values[:-1]
    lat2 = df['lat'].values[1:]
    lon2 = df['lon'].values[1:]
    t1   = df['timestamp'].values[:-1]
    t2   = df['timestamp'].values[1:]
    
    distances = haversine_m(lat1, lon1, lat2, lon2)
    time_gaps = t2 - t1
    
    # Avoid division by zero
    safe_gaps = np.maximum(time_gaps, 1)
    speeds = distances / safe_gaps * 3.6  # m/s → km/h
    
    # Grid cells (for the starting point of each chunk)
    grid_lats = np.round(lat1 / GRID_RESOLUTION) * GRID_RESOLUTION
    grid_lons = np.round(lon1 / GRID_RESOLUTION) * GRID_RESOLUTION
    
    # Extract features from start-of-chunk timestamps
    temporal = extract_temporal_features(t1)
    
    # Door open and aircon from the starting point
    door_open = df['door_open'].values[:-1]
    aircon    = df['aircon'].values[:-1]
    
    # Filtering masks
    valid = (
        (time_gaps >= MIN_GAP_SECONDS) &
        (time_gaps <= MAX_GAP_SECONDS) &
        (distances >= MIN_DISTANCE_M) &
        (speeds <= MAX_SPEED_KMH) &
        (time_gaps <= MAX_CHUNK_TIME_S)
    )
    
    # Build chunk records for valid pairs
    indices = np.where(valid)[0]
    
    for i in indices:
        chunks.append({
            'grid_lat':       round(grid_lats[i], 4),
            'grid_lon':       round(grid_lons[i], 4),
            'distance_m':     round(float(distances[i]), 1),
            'time_seconds':   float(time_gaps[i]),
            'avg_speed_kmh':  round(float(speeds[i]), 1),
            'hour_of_day':    int(temporal['hour_of_day'][i]),
            'minute_bucket':  int(temporal['minute_bucket'][i]),
            'day_of_week':    int(temporal['day_of_week'][i]),
            'is_weekend':     int(temporal['is_weekend'][i]),
            'is_rush_hour':   int(temporal['is_rush_hour'][i]),
            'door_open':      int(door_open[i]),
            'aircon':         int(aircon[i]),
        })
    
    return chunks


def main():
    parser = argparse.ArgumentParser(description='Build travel-time chunks from cleaned GPS data')
    parser.add_argument('--sample', action='store_true', help='Process only sample batch')
    args = parser.parse_args()
    
    # Find cleaned Parquet files
    if args.sample:
        parquet_files = [os.path.join(CLEANED_DIR, 'sample.parquet')]
        parquet_files = [f for f in parquet_files if os.path.exists(f)]
    else:
        parquet_files = sorted(glob.glob(os.path.join(CLEANED_DIR, '*.parquet')))
        # Exclude summary files
        parquet_files = [f for f in parquet_files if not os.path.basename(f).startswith('_')]
    
    if not parquet_files:
        print(f'[ETL] No Parquet files found in {CLEANED_DIR}/')
        print(f'[ETL] Run 01_ingest_raw.py first.')
        sys.exit(1)
    
    print(f'[ETL] Found {len(parquet_files)} cleaned Parquet files')
    print(f'[ETL] Grid resolution: {GRID_RESOLUTION}° (~{GRID_RESOLUTION * 111_000:.0f} m)')
    print(f'[ETL] Output: {CHUNKS_DIR}/')
    print()
    
    all_chunks = []
    total_gps_points = 0
    start_time = time.time()
    
    for filepath in tqdm(parquet_files, desc='Building chunks'):
        try:
            df = pd.read_parquet(filepath)
            total_gps_points += len(df)
            
            # Process each vehicle independently
            for vehicle_id, group in df.groupby('vehicle_id'):
                chunks = process_vehicle_group(group)
                all_chunks.extend(chunks)
            
        except Exception as e:
            tqdm.write(f'  [ERROR] {os.path.basename(filepath)}: {e}')
            continue
    
    if not all_chunks:
        print('[ETL] No valid chunks produced. Check your data.')
        sys.exit(1)
    
    # Convert to DataFrame and save
    chunks_df = pd.DataFrame(all_chunks)
    
    # Summary stats
    elapsed = time.time() - start_time
    print()
    print(f'[ETL] ===========================================')
    print(f'[ETL] Done in {elapsed:.1f}s')
    print(f'[ETL] GPS points processed:   {total_gps_points:>12,}')
    print(f'[ETL] Chunks produced:        {len(chunks_df):>12,}')
    print(f'[ETL] Yield rate:             {len(chunks_df) / max(total_gps_points, 1) * 100:.1f}%')
    print()
    print(f'[ETL] Chunk stats:')
    print(f'  distance_m  — mean: {chunks_df["distance_m"].mean():.1f}, '
          f'median: {chunks_df["distance_m"].median():.1f}, '
          f'p95: {chunks_df["distance_m"].quantile(0.95):.1f}')
    print(f'  time_seconds — mean: {chunks_df["time_seconds"].mean():.1f}, '
          f'median: {chunks_df["time_seconds"].median():.1f}, '
          f'p95: {chunks_df["time_seconds"].quantile(0.95):.1f}')
    print(f'  avg_speed   — mean: {chunks_df["avg_speed_kmh"].mean():.1f} km/h, '
          f'median: {chunks_df["avg_speed_kmh"].median():.1f} km/h')
    
    # Save
    output_path = os.path.join(CHUNKS_DIR, 'travel_chunks.parquet')
    chunks_df.to_parquet(output_path, index=False, engine='pyarrow')
    size_mb = os.path.getsize(output_path) / 1024 / 1024
    print(f'\n[ETL] Saved: {output_path} ({size_mb:.1f} MB, {len(chunks_df):,} rows)')


if __name__ == '__main__':
    main()
