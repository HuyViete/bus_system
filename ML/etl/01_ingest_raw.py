#!/usr/bin/env python3
"""
01_ingest_raw.py — Parse the 30GB bus GPS dataset (520 JSON files) into clean Parquet.

Reads each sub_raw_XXX.json file one at a time (each ~60-100 MB, fits in memory),
extracts fields from the msgBusWayPoint wrapper, filters outliers, and writes
cleaned Parquet batches.

Usage:
    python etl/01_ingest_raw.py                   # process all files
    python etl/01_ingest_raw.py --sample           # process only sample.json (for testing)
    python etl/01_ingest_raw.py --limit 5          # process first 5 files only
"""
import argparse
import glob
import json
import os
import sys
import time

import numpy as np
import pandas as pd
from tqdm import tqdm

# Add parent to path so we can import config
sys.path.insert(0, os.path.dirname(__file__))
from config import (
    DATASET_DIR, CLEANED_DIR,
    LAT_MIN, LAT_MAX, LON_MIN, LON_MAX,
)


def parse_json_file(filepath: str) -> pd.DataFrame:
    """
    Load a single JSON file and extract msgBusWayPoint records into a DataFrame.
    
    The JSON structure is:
    [
      { "msgType": "MsgType_BusWayPoint", "msgBusWayPoint": { ... } },
      ...
    ]
    """
    with open(filepath, 'r', encoding='utf-8') as f:
        raw = json.load(f)
    
    records = []
    for entry in raw:
        if entry.get('msgType') != 'MsgType_BusWayPoint':
            continue
        wp = entry.get('msgBusWayPoint', {})
        if not wp:
            continue
        
        # Extract fields — many are optional
        records.append({
            'vehicle_id':  wp.get('vehicle', ''),
            'speed_kmh':   float(wp.get('speed', 0.0)),
            'timestamp':   int(wp.get('datetime', 0)),
            'lon':         float(wp.get('x', 0.0)),
            'lat':         float(wp.get('y', 0.0)),
            'heading':     wp.get('heading'),  # nullable
            'ignition':    bool(wp.get('ignition', False)),
            'aircon':      bool(wp.get('aircon', False)),
            'working':     wp.get('working'),  # nullable — not always present
            'door_open':   bool(wp.get('door_up', False) or wp.get('door_down', False)),
        })
    
    return pd.DataFrame(records)


def clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Apply filtering and cleaning rules."""
    original_len = len(df)
    
    # 1. Drop records with missing vehicle_id or timestamp
    df = df[df['vehicle_id'].str.len() > 0]
    df = df[df['timestamp'] > 0]
    
    # 2. Filter out non-ignition records (bus is off)
    df = df[df['ignition'] == True]
    
    # 3. Filter out breakdowns — only if 'working' is explicitly False
    #    (None means field was absent → keep the record)
    df = df[df['working'] != False]
    
    # 4. Filter GPS outliers — must be within HCMC bounding box
    df = df[
        (df['lat'] >= LAT_MIN) & (df['lat'] <= LAT_MAX) &
        (df['lon'] >= LON_MIN) & (df['lon'] <= LON_MAX)
    ]
    
    # 5. Drop exact coordinate duplicates for same vehicle+timestamp
    df = df.drop_duplicates(subset=['vehicle_id', 'timestamp'])
    
    # 6. Clean up types
    df['heading'] = pd.to_numeric(df['heading'], errors='coerce')
    df['speed_kmh'] = df['speed_kmh'].clip(lower=0)
    
    # 7. Drop the 'working' column (used only for filtering, nullable causes issues)
    df = df.drop(columns=['working'], errors='ignore')
    
    filtered = original_len - len(df)
    return df, filtered


def main():
    parser = argparse.ArgumentParser(description='Ingest raw bus GPS JSON files into Parquet')
    parser.add_argument('--sample', action='store_true', help='Process only sample.json')
    parser.add_argument('--limit', type=int, default=0, help='Process only first N files')
    args = parser.parse_args()
    
    # Discover JSON files
    if args.sample:
        files = [os.path.join(DATASET_DIR, 'sample.json')]
    else:
        files = sorted(glob.glob(os.path.join(DATASET_DIR, 'sub_raw_*.json')))
    
    if args.limit > 0:
        files = files[:args.limit]
    
    if not files:
        print(f'[ETL] No JSON files found in {DATASET_DIR}')
        sys.exit(1)
    
    print(f'[ETL] Found {len(files)} JSON files to process')
    print(f'[ETL] Output directory: {CLEANED_DIR}')
    print(f'[ETL] HCMC bounding box: lat=[{LAT_MIN}, {LAT_MAX}], lon=[{LON_MIN}, {LON_MAX}]')
    print()
    
    total_records = 0
    total_filtered = 0
    total_kept = 0
    start_time = time.time()
    
    for filepath in tqdm(files, desc='Processing files'):
        filename = os.path.basename(filepath)
        batch_name = filename.replace('.json', '')
        
        try:
            # Parse JSON
            df = parse_json_file(filepath)
            if df.empty:
                tqdm.write(f'  [SKIP] {filename} — no records')
                continue
            
            total_records += len(df)
            
            # Clean
            df_clean, filtered = clean_dataframe(df)
            total_filtered += filtered
            total_kept += len(df_clean)
            
            if df_clean.empty:
                tqdm.write(f'  [SKIP] {filename} — all records filtered out')
                continue
            
            # Write Parquet
            output_path = os.path.join(CLEANED_DIR, f'{batch_name}.parquet')
            df_clean.to_parquet(output_path, index=False, engine='pyarrow')
            
        except Exception as e:
            tqdm.write(f'  [ERROR] {filename}: {e}')
            continue
    
    elapsed = time.time() - start_time
    print()
    print(f'[ETL] ═══════════════════════════════════════════')
    print(f'[ETL] Done in {elapsed:.1f}s')
    print(f'[ETL] Total records parsed:   {total_records:>12,}')
    print(f'[ETL] Records filtered out:   {total_filtered:>12,}')
    print(f'[ETL] Records kept:           {total_kept:>12,}')
    print(f'[ETL] Filter rate:            {total_filtered / max(total_records, 1) * 100:.1f}%')
    print(f'[ETL] Output: {CLEANED_DIR}/')
    
    # Write summary
    summary = {
        'total_records': total_records,
        'filtered_out': total_filtered,
        'kept': total_kept,
        'files_processed': len(files),
        'elapsed_seconds': round(elapsed, 1),
    }
    summary_path = os.path.join(CLEANED_DIR, '_summary.json')
    with open(summary_path, 'w') as f:
        json.dump(summary, f, indent=2)
    print(f'[ETL] Summary written to {summary_path}')


if __name__ == '__main__':
    main()
