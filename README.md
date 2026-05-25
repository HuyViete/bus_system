## Statistics
### 1. Buses
- 2,100 buses running concurrently
- JSON data size: less than 500 Bytes / message
- Current bus tick: 1 message every second

-> Peak Load: 2,100 / 1 = **2,100 messages / second**
-> Daily volume: 2,100 * 86,400 = **181,440,000 messages / day**

Estimated raw ingress storage from bus telemetry (upper bound using 500 Bytes/message):

-> Per second: 2,100 * 500 = **1,050,000 Bytes / second** (~**1.05 MB/s**)
-> Per minute: 1.05 MB * 60 = **63 MB / minute**
-> Per hour: 63 MB * 60 = **3.78 GB / hour**
-> Per day: 3.78 GB * 24 = **90.72 GB / day**

Note: this is payload-only estimation. Real PostgreSQL disk usage will be higher due to indexes, WAL, row headers, and metadata.

### 2. Users
- 250,000 users daily (14 hours / day)
- 80% users use the app during peak hours (assume 4 hours)
-> Peak Load: 250,000 * 0.8 / 4 = 50,000 users / hour = ~ **14 users / second**
-> 14 * 10 = **140 message / second**

-> Total request pressure (bus ingress + user traffic): 2,100 + 140 = **2,240 requests / second**
-> So the system should target at least **2,500 requests / second** baseline capacity.

## Architecture & Technologies

The system follows a highly resilient, distributed, and event-driven architecture designed to handle large-scale, real-time GPS streaming from thousands of concurrent devices while maintaining high performance for end-web users.

### 1. Edge Devices (Buses)
- **Technologies:** C++, WebSockets, SQLite.
- **Role:** Represents the telemetry collectors running on 2,100 buses. Each edge node captures its current GPS location and streams a lightweight JSON payload (< 500 Bytes) every 3 seconds to the central data ingestion server. We utilize WebSockets to keep a persistent, low-latency connection alive. SQLite serves as a robust local fallback database to queue messages in the event of network blackouts.

### 2. Core Ingestion Server ("Big Server")
- **Technologies:** Node.js (Express / Fastify), Apache Kafka, PostgreSQL, Redis, ONNX Runtime (`onnxruntime-node`).
- **Role:** The heavy-lifter responsible for telemetry ingestion. It holds persistent WebSocket connections open with all 2,100 edge nodes. Upon receiving a coordinate payload, it immediately publishes the message to an **Apache Kafka** topic. Worker threads consume the Kafka stream to immediately update the latest bus state in **Redis** (for instantaneous O(1) retrieval) and efficiently batch-insert historical tracking data into **PostgreSQL**. Crucially, it loads a pre-trained **XGBoost ONNX model** at startup to serve real-time ML-backed ETA queries and dynamically calculates alternative detour routes when congestion is detected.

### 3. Website Backend (API Gateway / BFF)
- **Technologies:** Node.js, Express, MongoDB, Redis.
- **Role:** Acts as a Backend-For-Frontend (BFF). Instead of exposing the Big Data Server directly to public web users (which introduces heavy security risks, CORS complexities, and redundant querying), this server acts as an intelligent proxy. It manages user authentication state (via **MongoDB**) and rate limits user requests. To serve bus locations and ETA/detour predictions, it interacts with the Big Server's **Redis** cache and proxies telemetry/routing endpoints under `/api/distance/*`.

### 4. Website Frontend
- **Technologies:** ReactJS, TailwindCSS, MapLibre GL JS, deck.gl.
- **Role:** The user-facing map application. The app utilizes **MapLibre GL JS** to render the base street map and uses **deck.gl** to composite the thousands of data points and polygons. Deck.gl passes data directly to WebGL, shifting the immense calculation load to the user's GPU. The frontend features rich overlays including an **ETAPanel** (presenting ML-backed arrival predictions, confidence intervals, and real-time traffic levels) and a **DetourPanel** (displaying alternative inter-station routing recommendations with time-saving comparisons).

### 5. Offline Machine Learning Module — `ML/`
- **Technologies:** Python 3, Pandas, PyArrow, XGBoost, Optuna, ONNX, MMLTools.
- **Role:** Handles ETL pipelines and training loops over the 30GB historical GPS trajectory dataset (~180M records). The ETL pipeline divides the city of HCMC into a precise grid system (0.001° spatial resolution ≈ 111m grid cells) to compile cell-level travel speeds. The model utilizes temporal (hour of day, day of week), spatial (origin/destination grid cells), and physical (live speed, heading, distance) features, optimizing hyperparameters via **Optuna** before compiling the model into a unified `.onnx` model for low-latency Node.js server side predictions.

## How the System Works (End-to-End Workflow)

1. **Data Generation:** Every 3 seconds, the C++ client running on each of the 2,100 buses reads the current GPS coordinate, speed, and heading, and constructs a tightly packed JSON payload.
2. **Data Ingestion:** The bus transmits this payload over its persistent WebSocket connection to the Core Ingestion Server.
3. **Stream Processing:** The Ingestion Server accepts the payload and immediately writes it to an Apache Kafka event stream. This step isolates and protects the database layers from sudden traffic spikes.
4. **State Management:** Kafka Consumer workers read the data stream in real-time. They overwrite a specific Redis key map with the *absolute latest* position of each bus for blazing-fast reads. They also asynchronously batch-insert this new data point into PostgreSQL for long-term analytics and historical playback.
5. **Client Request & Map Load:** A user opens the Web Application, logging in via the Website Backend's MongoDB auth gateway.
6. **Data Delivery & Live Update:** The Website Backend sweeps the real-time vehicle state from Redis and compresses it back into a single payload for the user.
7. **GPU Map Rendering:** The React frontend passes the active coordinates directly to deck.gl as a new data prop to render smooth 60fps animations.
8. **Real-Time ML Ingest & Detours:** When a user requests the estimated arrival time for a bus or plans a route:
   - The Core Server utilizes its loaded ONNX model to generate a live, ML-backed ETA prediction, returning a confidence range and traffic status.
   - If severe congestion is detected on a segment (speed below threshold), the server's alternative routing engine dynamically interpolates a perpendicular Bezier curve detour route between consecutive stops, evaluates it via the ML model, and returns a time-saving route card recommendation to the user.

## Geo-Spatial Data
- **Scale:** 150 primary routes, up to ~10,000 vertices per route.
- **Source:** Extracted using the OpenStreetMap API. We have successfully scraped and normalized the precise GPS traces of **340 unique transit routes** and exact geographical coordinates of **5,500 bus stations** stored in our local file structures and databases.

### Events Generation | Traffic Status | Tracking Strategy

## Distance & Geo-computations
1. **Point-to-Point Distance:** Uses the Haversine formula to compute straight-line distance in meters between any two latitude/longitude points.
2. **Bus-to-Point Distance:** Computes the distance from a live bus (queried from PostgreSQL's `gps_latest` table) to any arbitrary latitude/longitude point.
3. **Nearest-Stop Distance:** Finds the closest bus stop on a given route relative to a coordinate point using preloaded in-memory stops.
4. **Nearest-Bus Search:** Finds the closest active bus on a specific route to a target location.

## Traffic Status & ETA
1. **ML-Backed ETA Prediction:** Performs live chunk-level travel time estimations using the pre-loaded XGBoost ONNX model based on current segment location, live speed, heading, temporal profiles, and destination. If the model is not found, it gracefully degrades to a deterministic physics model fallback.
2. **Alternative inter-station Routing:** When congestion is flagged, calculates a perpendicular Bezier detour path, predicts its ETA using the ONNX model, and renders visual savings comparisons against the congested standard route.
3. **Time-of-Day Traffic Profiles:** Dynamically computes traffic indices (`light`, `normal`, or `heavy`) based on actual predicted grid cell speeds vs. baseline speed limits.

### Problem and Solution
1. Buses' database on simulation
**Problem:** When the number of buses scales to thousands, running insert query every second will overwhelm the system. Even there is a database file (.db) for each bus, still everything is running on a single machine and OS cannot handle thousands of I/O operations at the exact same time. Causing SQLite creates a temporary Write-Ahead Log (-wal) file for every single bus, and we easily hit 10GBs just for this.

**Solution:**
- Store in memory: In-memory SQLite
- Random delays for write cycle
- Change the storing strategy: Store events instead of states