import requests
import json
import time

OVERPASS_URL = "http://overpass-api.de/api/interpreter"
# Tighter bounding box around Ho Chi Minh City proper
HCMC_BBOX = "(10.6,106.4,10.95,106.95)"
# Wikidata ID for the HCMC public bus network — filters out routes from neighboring provinces
HCMC_NETWORK_WD = "Q30919670"


def _query_overpass(ref_str):
    """Run a single Overpass query for the given ref string and return coordinate list."""
    overpass_query = f"""
    [out:json][timeout:30];
    relation["type"="route"]["route"="bus"]["ref"="{ref_str}"]["network:wikidata"="{HCMC_NETWORK_WD}"]{HCMC_BBOX};
    out geom;
    """
    try:
        response = requests.post(OVERPASS_URL, data={'data': overpass_query}, timeout=35)
    except requests.exceptions.RequestException as e:
        print(f"  Network error: {e}")
        return None

    if response.status_code != 200:
        print(f"  HTTP error: {response.status_code}")
        return None

    data = response.json()
    coords = []
    for element in data.get('elements', []):
        if element['type'] == 'relation':
            for member in element.get('members', []):
                if 'geometry' in member:
                    for point in member['geometry']:
                        coords.append([point['lat'], point['lon']])
            break  # Take the first matched relation (outbound direction)
    return coords if coords else None


def fetch_hcmc_bus_route(route_ref):
    """
    Fetches the geometry of a specific HCMC bus route from OpenStreetMap.
    HCMC routes in OSM use zero-padded refs for numbers < 100 (e.g. route 1 -> ref="01").
    We try the zero-padded form first, then fall back to the plain form.
    """
    print(f"Fetching Route {route_ref} from OpenStreetMap...")

    # Build candidate ref strings to try
    refs_to_try = []
    if route_ref.isdigit() and len(route_ref) < 3:
        # Try zero-padded first (e.g. "1" -> "01"), then plain
        refs_to_try.append(route_ref.zfill(2))
    refs_to_try.append(route_ref)  # always try the original form

    for ref_str in refs_to_try:
        coords = _query_overpass(ref_str)
        if coords:
            print(f"  Found {len(coords)} points using ref='{ref_str}'")
            return coords

    return None

def build_routes_database(route_list, filename="routes.json"):
    """
    Fetches multiple routes and saves them to a single JSON file.
    """
    database = {}
    
    for route in route_list:
        coords = fetch_hcmc_bus_route(route)
        if coords:
            # Downsample: Keep every 2nd or 3rd point if the array is too massive
            # coords = coords[::2] 
            database[f"route_{route}"] = coords
            print(f"✅ Route {route} saved with {len(coords)} waypoints.")
        else:
            print(f"❌ Route {route} not found or failed.")
            
        # Be polite to the free Overpass API to avoid IP bans
        time.sleep(2) 

    # Save to file
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(database, f, indent=2)
    print(f"\nSuccessfully saved all routes to {filename}")
    
# --- Run the Extractor ---
if __name__ == "__main__":
    # HCMC bus routes 1-150 (plain numbers; the script auto-pads where needed)
    hcmc_routes_to_fetch = [str(n) for n in range(1, 151)]
    
    build_routes_database(hcmc_routes_to_fetch)