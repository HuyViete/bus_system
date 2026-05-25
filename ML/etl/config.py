"""
Central configuration for the ML ETL pipeline.
All paths, thresholds, and grid parameters live here.
"""
import os

# ── HCMC bounding box — GPS points outside this are filtered as outliers ──
LAT_MIN, LAT_MAX = 10.3, 11.2
LON_MIN, LON_MAX = 106.3, 107.0

# ── Grid cell size ────────────────────────────────────────────────────────
# 0.001° latitude ≈ 111 m at the equator (≈ 110 m at HCMC latitude 10.7°)
# 0.001° longitude ≈ 109 m at HCMC latitude
# This gives roughly 100-110 m grid cells.
GRID_RESOLUTION = 0.001

# ── Trip segmentation thresholds ──────────────────────────────────────────
MAX_GAP_SECONDS = 300      # 5 min gap → new trip
MIN_GAP_SECONDS = 1        # skip duplicates
MIN_DISTANCE_M  = 5        # skip GPS jitter (< 5 m movement)
MAX_SPEED_KMH   = 100      # skip GPS jumps (unrealistic speed)
MAX_CHUNK_TIME_S = 300     # cap single-chunk travel time at 5 min (outlier)

# ── Dataset paths ─────────────────────────────────────────────────────────
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DATASET_DIR  = r'C:\Coding\MYBK\BusDataset'
ROUTE_MAPPING_CSV = os.path.join(DATASET_DIR, 'vehicle_route_mapping.csv')

# ── Project data paths ────────────────────────────────────────────────────
BUS_DIR         = os.path.join(PROJECT_ROOT, 'Bus')
TRANSIT_GRAPH   = os.path.join(BUS_DIR, 'transit_graph.json')
STATIONS_JSON   = os.path.join(BUS_DIR, 'stations.json')
ROUTES_JSON     = os.path.join(BUS_DIR, 'routes.json')

# ── Output paths ──────────────────────────────────────────────────────────
ML_DIR       = os.path.join(PROJECT_ROOT, 'ML')
DATA_DIR     = os.path.join(ML_DIR, 'data')
CLEANED_DIR  = os.path.join(DATA_DIR, 'cleaned')
CHUNKS_DIR   = os.path.join(DATA_DIR, 'chunks')
ARTIFACTS_DIR = os.path.join(ML_DIR, 'artifacts')

# Ensure output directories exist
for d in [CLEANED_DIR, CHUNKS_DIR, ARTIFACTS_DIR]:
    os.makedirs(d, exist_ok=True)
