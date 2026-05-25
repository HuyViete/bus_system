# Installation & Run Guide

This document outlines the setup, build, and execution steps for all components of the real-time GPS transit platform, including the C++ edge simulator, the Node.js core server, the BFF website backend, the React frontend, and the offline Python machine learning pipeline.

---

## 1. Prerequisites

- **Node.js** v18+ and **npm**
- **C++17 Compiler** (MSVC on Windows, GCC/Clang on Linux)
- **Python** 3.8 - 3.11 (for the ML pipeline)
- **Docker** and **Docker Compose** (for PostgreSQL and Kafka)
- **MongoDB Atlas** or local instance (for BFF authentication)

---

## 2. Ingestion & Analytics Server (`Server/`)

### Installation

```bash
cd Server
npm install

# IMPORTANT: Install the native ONNX runtime for server-side ML inference
npm install onnxruntime-node
```

### Configuration
Create `Server/.env` with your PostgreSQL database credentials:
```env
IP=127.0.0.1
PORT=3000
DB_HOST=localhost
DB_USER=postgres
DB_PASSWORD=your_password
DB_DATABASE=bus_system
DB_PORT=5432
PIPELINE_PHASE=baseline-http-postgres
```

### Running

First, start the local database containers:
```bash
docker compose up -d
```

Then start the ingestion server in development mode:
```bash
npm run dev
```
*The server will run migrations, preload stations, load the ONNX model (if present), and listen on port `3000`.*

---

## 3. Website Stack (`Website/`)

### Website Backend (BFF Gateway)

#### Installation
```bash
cd Website/backend
npm install
```

#### Configuration
Create `Website/backend/.env` with the following variables:
```env
BIG_SERVER_URL=http://localhost:3000
PORT=5001
MONGODB_CONNECTIONSTRING=your_mongodb_atlas_connection_string
ACCESS_TOKEN_SECRET=your_jwt_secret_key
```

#### Running
```bash
npm run dev
```

---

### Website Frontend

#### Installation
```bash
cd Website/frontend
npm install
```

#### Running
```bash
npm run dev
```
*Access the interactive GPU map application at `http://localhost:5173`.*

---

## 4. Bus Edge Devices (`Bus/`)

Before launching the edge simulator, you must precompute the transit graph.

### Precomputation
```bash
# From the project root
node scripts/build_transit_graph.js
```
*This reads route and station coordinates and outputs `Bus/transit_graph.json`.*

### Compilation

- **Windows:**
  ```bash
  build.bat
  ```
- **Linux / WSL:**
  ```bash
  bash build.sh
  ```
*This compiles `Bus/` source files into a unified `bus.exe` (or `bus` binary).*

### Running
```bash
# Launch the fleet manager CLI
run.bat  # (or ./Bus/bus)
```
**REPL Commands:**
- `start -n 100` — Spawn 100 buses distributed across active routes.
- `start -r 3 -n 10` — Spawn 10 buses specifically on Route 3.
- `list` — List all active bus IDs and operational states.
- `stop -a` — Stop all simulated buses.
- `exit` — Exit the fleet manager.

---

## 5. Machine Learning Pipeline (`ML/`)

Processes historical telemetry data to train travel time predictions and compile ONNX model files.

### Installation
Ensure you have Python 3 installed. Navigate to the `ML/` folder and install dependencies:
```bash
cd ML
pip install -r etl/requirements.txt -r models/requirements.txt
```

### Running the End-to-End Pipeline

1. **Verify Raw Dataset:** Place HCMC GPS JSON files in `C:\Coding\MYBK\BusDataset` (or configure paths in `ML/etl/config.py`).
2. **Execute Ingestion, Travel Chunking, and Training:**
   ```bash
   # Run quick verification training (single sample, no hyperparameter tuning)
   python main.py all --sample --quick --no-tune
   
   # Run the full pipeline over 30GB of raw dataset (hyperparameter optimized)
   python main.py all
   ```
*Upon completion, the trained XGBoost model is exported to `Server/src/artifacts/eta_model.onnx` along with feature metadata `Server/src/artifacts/feature_meta.json`.*

3. **Restart the Core Ingestion Server:**
   Restart the Server via `npm run dev` to auto-load the trained ONNX model and activate ML-backed live ETA estimations.