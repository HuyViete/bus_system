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
- **Technologies:** Node.js (Express / Fastify), Apache Kafka, PostgreSQL, Redis.
- **Role:** The heavy-lifter responsible for telemetry ingestion. It holds persistent WebSocket connections open with all 2,100 edge nodes. Upon receiving a coordinate payload, it immediately publishes the message to an **Apache Kafka** topic. Kafka enables high-throughput, fault-tolerant message queuing to effortlessly handle the peak network load (~700 msgs/second) without dropping data or overwhelming downstream handlers. Worker threads consume the Kafka stream to immediately update the latest bus state in **Redis** (for instantaneous O(1) retrieval) and efficiently batch-insert historical tracking data into **PostgreSQL**.

### 3. Website Backend (API Gateway / BFF)
- **Technologies:** Node.js, Express, MongoDB, Redis.
- **Role:** Acts as a Backend-For-Frontend (BFF). Instead of exposing the Big Data Server directly to public web users (which introduces heavy security risks, CORS complexities, and redundant querying), this server acts as an intelligent proxy. It manages user authentication state (via **MongoDB**) and rate limits user requests. To serve bus locations, it interacts with the Big Server's **Redis** cache, shapes the data payload efficiently for UI consumption, and delivers it to the frontend, successfully absorbing the ~140 client requests/second.

### 4. Website Frontend
- **Technologies:** ReactJS, TailwindCSS, MapLibre GL JS, deck.gl.
- **Role:** The user-facing map application. Because rendering 2,100 active vehicles, 340 dense transit routes (with ~10,000 vertices each), and 5,500 bus stations would catastrophically freeze a standard DOM-based map application, we implemented a hardware-accelerated approach. The app utilizes **MapLibre GL JS** to render the base street map and uses **deck.gl** to composite the thousands of data points and polygons. Deck.gl passes data directly to WebGL, shifting the immense calculation load to the user's GPU to effortlessly maintain smooth 60fps animations.

## How the System Works (End-to-End Workflow)

1. **Data Generation:** Every 3 seconds, the C++ client running on each of the 2,100 buses reads the current GPS coordinate, speed, and heading, and constructs a tightly packed JSON payload.
2. **Data Ingestion:** The bus transmits this payload over its persistent WebSocket connection to the Core Ingestion Server.
3. **Stream Processing:** The Ingestion Server accepts the payload and immediately writes it to an Apache Kafka event stream. This step isolates and protects the database layers from sudden traffic spikes.
4. **State Management:** Kafka Consumer workers read the data stream in real-time. They overwrite a specific Redis key map with the *absolute latest* position of each bus for blazing-fast reads. They also asynchronously batch-insert this new data point into PostgreSQL for long-term analytics and historical playback.
5. **Client Request:** A user opens the Web Application. The application logs the user in (validating credentials against the Website Backend's MongoDB).
6. **Data Delivery:** The frontend requests the latest map layout from the Website Express Backend. Rather than executing heavy queries, the Website Backend efficiently sweeps the pre-calculated, real-time vehicle state from Redis and compresses it back into a single payload for the user.
7. **GPU Rendering:** The React frontend receives the array of 2,100 active coordinates. It passes this array directly to deck.gl as a new data prop. Deck.gl recalculates the 3D projection matrix based on the user's current zoom and pan state, and re-renders the vehicles onto the canvas using the GPU, presenting a perfectly smooth map to the user.

## Geo-Spatial Data
- **Scale:** 150 primary routes, up to ~10,000 vertices per route.
- **Source:** Extracted using the OpenStreetMap API. We have successfully scraped and normalized the precise GPS traces of **340 unique transit routes** and exact geographical coordinates of **5,500 bus stations** stored in our local file structures and databases.


### Problem and Solution
1. Buses' database on simulation
**Problem:** When the number of buses scales to thousands, running insert query every second will overwhelm the system. Even there is a database file (.db) for each bus, still everything is running on a single machine and OS cannot handle thousands of I/O operations at the exact same time. Causing SQLite creates a temporary Write-Ahead Log (-wal) file for every single bus, and we easily hit 10GBs just for this.

**Solution:**
- Store in memory: In-memory SQLite
- Random delays for write cycle
- Change the storing strategy: Store events instead of states