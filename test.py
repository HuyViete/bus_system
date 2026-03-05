import json
import csv

def convert_json_to_csv(json_file, csv_file):
    print(f"Loading {json_file}...")
    
    try:
        with open(json_file, 'r') as f:
            routes_data = json.load(f)
    except FileNotFoundError:
        print(f"Error: {json_file} not found.")
        return

    print(f"Converting {len(routes_data)} routes to CSV format...")
    
    # Open the CSV file for writing
    with open(csv_file, 'w', newline='') as f:
        writer = csv.writer(f)
        
        # Write the header row
        writer.writerow(['route_id', 'sequence', 'lat', 'lon'])
        
        # Flatten the JSON hierarchy into rows
        row_count = 0
        for route_id, coords in routes_data.items():
            for sequence_index, (lat, lon) in enumerate(coords):
                # Write each coordinate as a flat row
                writer.writerow([route_id, sequence_index, lat, lon])
                row_count += 1
                
    print(f"✅ Successfully wrote {row_count} coordinates to {csv_file}.")

if __name__ == "__main__":
    convert_json_to_csv('Bus/routes.json', 'Bus/routes.csv')