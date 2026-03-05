"""
gps_retry.py
------------
Re-fetches specific HCMC bus routes that failed (429 / 504) and appends
their GPS waypoints directly to Bus/routes.csv in the existing format:

    route_id, sequence, lat, lon

Key features
• Skips any route already present in the CSV (safe to re-run).
• Adds a mandatory GLOBAL_DELAY between every API call to avoid rate-limits.
• On 429  → exponential back-off starting at 60 s (doubles each time, cap 300 s).
• On 5xx  → exponential back-off starting at 15 s.
• Each route number is tried zero-padded first ('03') then plain ('3').
• Routes that genuinely don't exist in OSM are reported but don't stop the run.
"""

import csv
import os
import random
import time

import requests

# ── Tunable constants ──────────────────────────────────────────────────────────
OVERPASS_URL    = "http://overpass-api.de/api/interpreter"
HCMC_BBOX       = "(10.6,106.4,10.95,106.95)"
HCMC_NETWORK_WD = "Q30919670"
OUTPUT_CSV      = "Bus/routes.csv"

# Routes still missing from the CSV (update this list when you re-run)
FAILED_ROUTES = [11, 26, 31, 32, 35, 38, 40, 57, 82, 95, 98, 108, 120, 123]

GLOBAL_DELAY   = 8    # seconds between every single Overpass call (be polite)
MAX_RETRIES    = 5    # retry attempts per (route, ref) pair
DELAY_429      = 60   # initial back-off on rate-limit (seconds)
DELAY_5XX      = 15   # initial back-off on server error (seconds)
MAX_DELAY      = 300  # hard cap on any single sleep


# ── Core ───────────────────────────────────────────────────────────────────────

def _build_query(ref_str: str) -> str:
    return (
        f'[out:json][timeout:45];\n'
        f'relation["type"="route"]["route"="bus"]'
        f'["ref"="{ref_str}"]'
        f'["network:wikidata"="{HCMC_NETWORK_WD}"]'
        f'{HCMC_BBOX};\n'
        f'out geom;\n'
    )


def _call_overpass(ref_str: str) -> list | None:
    """
    Make ONE Overpass API call with retry logic.
    Returns list of [lat, lon] on success, None on permanent failure.
    A mandatory GLOBAL_DELAY sleep happens BEFORE every request.
    """
    delay_429 = DELAY_429
    delay_5xx = DELAY_5XX

    for attempt in range(1, MAX_RETRIES + 1):
        # Always sleep before hitting the API to stay within rate limits
        time.sleep(GLOBAL_DELAY)

        try:
            resp = requests.post(
                OVERPASS_URL,
                data={"data": _build_query(ref_str)},
                timeout=55,
            )
        except requests.exceptions.RequestException as exc:
            print(f"    [attempt {attempt}/{MAX_RETRIES}] Network error: {exc}")
            if attempt == MAX_RETRIES:
                return None
            time.sleep(delay_5xx)
            delay_5xx = min(delay_5xx * 2, MAX_DELAY)
            continue

        # ── 200 OK ────────────────────────────────────────────────────────────
        if resp.status_code == 200:
            coords = []
            for el in resp.json().get("elements", []):
                if el["type"] == "relation":
                    for member in el.get("members", []):
                        for pt in member.get("geometry", []):
                            coords.append([pt["lat"], pt["lon"]])
                    break  # first relation = outbound direction
            return coords if coords else None

        # ── 429 Rate-limited ──────────────────────────────────────────────────
        elif resp.status_code == 429:
            jitter = random.uniform(0, delay_429 * 0.2)
            wait = delay_429 + jitter
            print(f"    [attempt {attempt}/{MAX_RETRIES}] 429 — waiting {wait:.0f}s ...")
            time.sleep(wait)
            delay_429 = min(delay_429 * 2, MAX_DELAY)

        # ── 5xx Server errors ─────────────────────────────────────────────────
        elif resp.status_code in (500, 502, 503, 504):
            wait = delay_5xx + random.uniform(0, 5)
            print(f"    [attempt {attempt}/{MAX_RETRIES}] {resp.status_code} — waiting {wait:.0f}s ...")
            time.sleep(wait)
            delay_5xx = min(delay_5xx * 2, MAX_DELAY)

        # ── Other errors ──────────────────────────────────────────────────────
        else:
            print(f"    [attempt {attempt}/{MAX_RETRIES}] HTTP {resp.status_code} — giving up on ref='{ref_str}'.")
            return None

    print(f"    Exhausted {MAX_RETRIES} attempts for ref='{ref_str}'.")
    return None


def fetch_route(route_num: int) -> tuple[str | None, list | None]:
    """
    Try zero-padded ref first ('03'), then plain ('3').
    Returns (ref_string_used, coords_list) or (None, None).
    """
    candidates = []
    if route_num < 100:
        candidates.append(str(route_num).zfill(2))  # '03'
    candidates.append(str(route_num))               # '3'

    for ref in candidates:
        print(f"  Trying ref='{ref}' ...", end=" ", flush=True)
        coords = _call_overpass(ref)
        if coords:
            print(f"✅ {len(coords)} points")
            return ref, coords
        print("not found")

    return None, None


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    # Load existing route IDs to avoid duplicates
    existing: set[str] = set()
    if os.path.exists(OUTPUT_CSV):
        with open(OUTPUT_CSV, newline="", encoding="utf-8") as f:
            for row in csv.reader(f):
                if row and row[0] != "route_id":
                    existing.add(row[0])
    print(f"Routes already in CSV: {len(existing)}")

    still_needed = [r for r in FAILED_ROUTES if f"route_{r}" not in existing]
    print(f"Routes to fetch: {still_needed}\n")

    if not still_needed:
        print("Nothing to do — all routes already present!")
        return

    succeeded, genuinely_missing = [], []

    with open(OUTPUT_CSV, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)

        for route_num in still_needed:
            route_id = f"route_{route_num}"
            print(f"\n{'─'*40}")
            print(f"[Route {route_num}]")

            ref_used, coords = fetch_route(route_num)

            if coords:
                for seq, point in enumerate(coords):
                    writer.writerow([route_id, seq, point[0], point[1]])
                f.flush()
                succeeded.append(route_num)
                print(f"  → Saved {len(coords)} rows as '{route_id}'.")
            else:
                genuinely_missing.append(route_num)
                print(f"  ❌ Route {route_num} — not in OSM or all retries failed.")

    print(f"\n{'='*50}")
    print(f"✅ Saved:   {succeeded}")
    print(f"❌ Missing: {genuinely_missing}")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()
