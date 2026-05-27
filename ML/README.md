# Ho Chi Minh City Real-Time Bus Transit: AI ETA Predictor & Spatial-Temporal Model

This document serves as the official technical documentation for the Machine Learning model, spatial-temporal ETL pipeline, and real-time inference engine. It is structured for direct inclusion in technical reports, academic documents, and slide presentations.

---

## 1. Executive Summary

A real-time GPS tracking platform for a city-scale transit network (Ho Chi Minh City, Vietnam). The core predictive intelligence is driven by an **XGBoost Regression Model** that provides real-time, traffic-aware **Estimated Time of Arrival (ETA)** predictions.

```
                  ┌──────────────────────────────────────────────┐
                  │          AI ETA PREDICTOR METRICS            │
                  ├──────────────────────┬───────────────────────┤
                  │ Peak GPS Ingestion   │ 2,100 packets/sec     │
                  │ Raw Telemetry Scale  │ 30 GB GPS Trajectories│
                  │ Active Fleet Size    │ 2,100 concurrent buses│
                  │ Core Algorithm       │ XGBoost Regressor     │
                  │ Model Runtime        │ ONNX Runtime Engine   │
                  │ Spatial Resolution   │ 0.001° (~111 meters)  │
                  └──────────────────────┴───────────────────────┘
```

* **The Problem:** Traditional physics-based ETA algorithms (Distance / Speed) fail in high-congestion, dynamic urban environments like HCMC. They cannot account for time-of-day traffic waves, bottlenecks, dwell times, and seasonal weather delays.
* **The Solution:** A hybrid pipeline combining high-performance edge computing with an offline XGBoost regression model. GPS trajectories are converted into grid-cell travel durations, optimized using Bayesian search (Optuna), and deployed in a Node.js microservice via **ONNX Runtime** for high-throughput, low-latency sub-millisecond inference.

---

## 2. System Architecture

```
                       ┌──────────────────────────────────────────────┐
                       │            OFFLINE TRAIN & DEPLOY            │
                       │                                              │
                       │  30GB Trajectories ──→ 01_ingest_raw.py      │
                       │                              ↓               │
                       │                       02_build_chunks.py     │
                       │                              ↓               │
                       │                    enriched_chunks.parquet   │
                       │                              ↓               │
                       │                     Train Set: 38.9M Rows    │
                       │                              ↓               │
                       │                    Bayesian Search: Optuna   │
                       │                              ↓               │
                       │                  XGBoost (RTX 3070 Ti CUDA)  │
                       │                              ↓               │
                       │                        eta_model.onnx        │
                       └──────────────────────────────┬───────────────┘
                                                      │ loaded at startup
                                                      ▼
                       ┌──────────────────────────────────────────────┐
                       │             CORE SERVER & INFERENCE          │
                       │                                              │
                       │             mlPredictorService.js            │
                       │                      │                       │
                       │                      ▼                       │
                       │              ONNX Runtime Session            │
                       │         (Sub-millisecond Inference)          │
                       └──────────────────────┬───────────────────────┘
                                              ▲
                                              │ GET /api/estimate
                                              │
                       ┌──────────────────────┴───────────────────────┐
                       │                  BFF GATEWAY                 │
                       │               Website Backend :5001          │
                       └──────────────────────┬───────────────────────┘
                                              ▲
                                              │ fetchETA()
                                              │
                       ┌──────────────────────┴───────────────────────┐
                       │               REACT WEB FRONTEND :5173        │
                       │          MapLibre GL / deck.gl Rendering     │
                       └──────────────────────────────────────────────┘
```

---

## 3. Spatial-Temporal Feature Engineering

To train a model capable of understanding urban traffic waves, raw trajectories are mapped into a high-dimensional spatial-temporal grid system.

### 3.1 Bounding Box & Spatial Resolution
The geographical focus is Ho Chi Minh City, defined by a bounding box:
* **Latitude:** `10.7000` to `10.8800`
* **Longitude:** `10.6000` to `10.8200`
* **Spatial Grid Resolution:** `0.001°` (approximately **111 meters x 111 meters**). Every coordinate pair $(lat, lon)$ is mapped to a discrete grid cell index $(grid\_lat, grid\_lon)$ using fast floor-division:
$$\text{grid\_lat} = \lfloor lat \times 1000 \rfloor, \quad \text{grid\_lon} = \lfloor lon \times 1000 \rfloor$$

### 3.2 Feature Matrix (11 Input Dimensions)
The XGBoost model processes the following 11 feature inputs for every chunk prediction:

| Feature Name | Data Type | Description | Purpose |
|---|---|---|---|
| `grid_lat` | `float32` | Discretized latitude cell coordinate | Encodes macro spatial localization |
| `grid_lon` | `float32` | Discretized longitude cell coordinate | Encodes macro spatial localization |
| `distance_m` | `float32` | Distance along the road segment in meters | Linear scaling factor of travel time |
| `hour_of_day` | `float32` | Hour when the segment was entered (0-23) | Encodes daily traffic schedules and peaks |
| `minute_bucket` | `float32` | 15-minute bucket index of the hour (0-3) | Encodes micro temporal traffic dynamics |
| `day_of_week` | `float32` | Day index (0 = Monday, 6 = Sunday) | Encodes weekly traffic differences (e.g. weekend vs weekday) |
| `is_weekend` | `float32` | Boolean flag (1 = Sat/Sun, 0 = Weekday) | Simplifies weekend traffic pattern isolation |
| `is_rush_hour` | `float32` | Boolean flag (7:00-9:00, 16:30-19:00) | Directly isolates heavy congestion hours |
| `door_open` | `float32` | Status of edge vehicle doors (1 = Open, 0 = Closed) | Encodes passenger boarding/dwell time |
| `aircon` | `float32` | Air conditioning compressor status (1 = On, 0 = Off) | Proxy indicator for engine load and bus model type |
| `near_station` | `float32` | Proximity to a bus stop (1 = Nearby, 0 = Far) | Encodes station dwell and deceleration overhead |

---

## 4. Model Training & Optimization

### 4.1 Dataset Properties
* **Total Rows:** `49,171,803` processed chunks.
* **Outlier Pruning:** Chunks with travel times exceeding the 99th percentile ($time > 38\text{ seconds}$) are pruned as anomalies.
* **Dataset Splits:** Time-based random partitioning to avoid temporal leakage:
  * **Train Set:** `38,951,941` rows ($80\%$)
  * **Validation Set:** `4,868,993` rows ($10\%$)
  * **Test Set:** `4,868,993` rows ($10\%$)

### 4.2 Optuna Bayesian Hyperparameter Optimization
To maximize generalization, **Optuna** is utilized to perform Bayesian hyperparameter tuning across 50 trials, optimizing:
* `max_depth` (Range: $[4, 12]$)
* `learning_rate` (Range: $[0.01, 0.2]$)
* `n_estimators` (Range: $[200, 1500]$)
* `subsample` & `colsample_bytree` (Range: $[0.6, 0.95]$)
* `reg_alpha` & `reg_lambda` (Range: $[10^{-8}, 1.0]$)

### 4.3 GPU Acceleration (RTX 3070 Ti Laptop)
To handle 38.9 million training rows efficiently without timeouts, the script automatically detects and integrates NVIDIA CUDA cores. On an **RTX 3070 Ti Laptop GPU** ($8\text{GB VRAM}, 5888\text{ CUDA cores}$), the training leverages **GPU Histogram algorithms (`device: 'cuda'` / `tree_method: 'gpu_hist'`)**. This provides a **30x-50x speedup** over CPU training, enabling high-quality models to compile in minutes.

---

## 5. Real-Time Node.js Inference Engine

The champion XGBoost model is exported to **ONNX (Open Neural Network Exchange)** format and loaded by the Core Server at startup via `onnxruntime-node`.

### 5.1 Sub-Millisecond Inference Flow
```
Client Request ──→ GET /api/distance/station-details?stop_id=3171491272
                      │
                      ▼
               getStopList() ──→ Retrieve Coordinates
                      │
                      ▼
               getEstimateTime() ──→ Parse Date/Hour Features
                      │
                      ▼
               onnxruntime-node ──→ Run Tensor Session (Sub-millisecond)
                      │
                      ▼
               Output Payload: { predicted_eta_seconds, confidence_range }
```

### 5.2 Dynamic Traffic Derivation
The inference engine compares the AI's predicted travel speed against the baseline free-flow speed to output an accurate traffic congestion metric:
* **Light Traffic:** Predicted speed is $>85\%$ of the speed limit.
* **Normal Traffic:** Predicted speed is between $45\% - 85\%$ of the speed limit.
* **Heavy Traffic:** Predicted speed is $<45\%$ of the speed limit.

### 5.3 95% Confidence Intervals
Since XGBoost is a deterministic regressor, standard deviations and $95\%$ confidence ranges are mathematically generated at runtime by analyzing the model's test-set Root Mean Squared Error (RMSE) against the output prediction $P$:
$$\text{Lower Bound} = \max(0, P - 1.96 \times \text{RMSE})$$
$$\text{Upper Bound} = P + 1.96 \times \text{RMSE}$$

---

## 6. Slide-Deck / Presentation Outline
*Feel free to copy and paste these bullet points directly into PowerPoint or technical slide decks.*

### Slide 1: The AI Transit Challenge
* **The Goal:** Real-time, ultra-precise Estimated Time of Arrival (ETA) predictions for 2,100 concurrent buses in Ho Chi Minh City.
* **The Barrier:** Standard distance-over-speed equations do not account for HCMC's complex traffic waves, rush hours, weather, and passenger boarding dwell times.
* **The Solution:** A high-throughput spatial-temporal machine learning model backed by C++ edge-computing devices.

### Slide 2: Big Data ETL & Feature Engineering
* **Dataset Scale:** 30 Gigabytes of raw GPS trajectories.
* **Spatial Grid:** Floor-division maps GPS coordinates to discrete 111m x 111m grid cells.
* **11-Dimensional Feature Matrix:** Encodes latitude, longitude, distance, hour of day, day of week, rush hour flags, door status, and bus stop proximity.
* **Partitioning:** 49 million total rows cleanly split into Train (38.9M), Val (4.8M), and Test (4.8M) without temporal leakage.

### Slide 3: Model Training & GPU Acceleration
* **Algorithm:** Gradient boosted decision trees using **XGBoost Regression**.
* **Automatic GPU Acceleration:** Harnesses CUDA hardware (tested on RTX 3070 Ti) to achieve up to **50x speedups** over CPU training.
* **Bayesian Optimization:** Optuna automatically searches 50 hyperparameter trials to find optimal learning rates, depths, and regularization constants.
* **Deployable Format:** Champion models are serialized into high-performance **ONNX** binaries.

### Slide 4: Real-Time Sub-Millisecond Inference
* **High Performance:** Deployed in Node.js via **ONNX Runtime**, executing complex predictions in **< 1 millisecond** per bus.
* **Real-time Traffic Classifier:** Automatically classifies segments into Light, Normal, or Heavy traffic based on predicted speed ratios.
* **Predictive Trust:** Calculates mathematical 95% Confidence Intervals using test-set RMSE to provide users with upper and lower arrival ranges.
* **Reliability:** Graceful physics-based fallback if the ONNX model is unlinked or missing.
