#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  Baseline Benchmark Script
#  Tests server throughput at increasing bus counts.
#  Usage: bash benchmark/baseline_benchmark.sh
# ─────────────────────────────────────────────────────────────────────────────

SERVER_URL="http://localhost:3000"
BUS_EXE="Bus/bus.exe"
DURATION=180   # seconds to run each test (3 minutes)
RESULTS_FILE="benchmark/baseline_results.txt"

mkdir -p benchmark

echo "========================================" | tee "$RESULTS_FILE"
echo "  BASELINE BENCHMARK — $(date)" | tee -a "$RESULTS_FILE"
echo "  Server: $SERVER_URL" | tee -a "$RESULTS_FILE"  
echo "  Duration per test: ${DURATION}s" | tee -a "$RESULTS_FILE"
echo "  Tick rate: 1 second (current default)" | tee -a "$RESULTS_FILE"
echo "========================================" | tee -a "$RESULTS_FILE"

# Function to run one benchmark round
run_test() {
    local NUM_BUSES=$1
    local LABEL="baseline-${NUM_BUSES}buses"
    
    echo "" | tee -a "$RESULTS_FILE"
    echo "──────────────────────────────────────" | tee -a "$RESULTS_FILE"
    echo "TEST: $NUM_BUSES buses for ${DURATION}s" | tee -a "$RESULTS_FILE"
    echo "──────────────────────────────────────" | tee -a "$RESULTS_FILE"
    
    # Record table size BEFORE
    local SIZE_BEFORE=$(PGPASSWORD=Huy270905 psql -U postgres -d bus_system -t -c \
        "SELECT pg_size_pretty(pg_total_relation_size('gps_telemetry_raw'));")
    local ROWS_BEFORE=$(PGPASSWORD=Huy270905 psql -U postgres -d bus_system -t -c \
        "SELECT COUNT(*) FROM gps_telemetry_raw;")
    echo "  Before — rows: $ROWS_BEFORE, size: $SIZE_BEFORE" | tee -a "$RESULTS_FILE"
    
    # Start buses in non-interactive mode (background)
    echo "  Starting $NUM_BUSES buses..."
    cd Bus
    echo "start -n $NUM_BUSES" | timeout $DURATION ./bus.exe > /dev/null 2>&1 &
    local BUS_PID=$!
    cd ..
    
    echo "  Buses running (PID: $BUS_PID), waiting ${DURATION}s..."
    sleep $DURATION
    
    # Kill bus process
    kill $BUS_PID 2>/dev/null
    wait $BUS_PID 2>/dev/null
    echo "  Buses stopped."
    
    # Wait a moment for server to finish processing in-flight packets
    sleep 5
    
    # Record table size AFTER
    local SIZE_AFTER=$(PGPASSWORD=Huy270905 psql -U postgres -d bus_system -t -c \
        "SELECT pg_size_pretty(pg_total_relation_size('gps_telemetry_raw'));")
    local ROWS_AFTER=$(PGPASSWORD=Huy270905 psql -U postgres -d bus_system -t -c \
        "SELECT COUNT(*) FROM gps_telemetry_raw;")
    echo "  After  — rows: $ROWS_AFTER, size: $SIZE_AFTER" | tee -a "$RESULTS_FILE"
    
    local ROWS_INSERTED=$((ROWS_AFTER - ROWS_BEFORE))
    local RATE=$(echo "scale=1; $ROWS_INSERTED / $DURATION" | bc)
    echo "  Rows inserted: $ROWS_INSERTED" | tee -a "$RESULTS_FILE"
    echo "  Effective rate: ${RATE} rows/second" | tee -a "$RESULTS_FILE"
    echo "  Expected rate:  $NUM_BUSES rows/second (1 tick/s)" | tee -a "$RESULTS_FILE"
    
    # Fetch ingestion metrics from the server
    echo "" | tee -a "$RESULTS_FILE"
    echo "  Ingestion metrics (last ${DURATION}s):" | tee -a "$RESULTS_FILE"
    local METRICS=$(curl -s "$SERVER_URL/api/events/ingestion-metrics?minutes=$((DURATION / 60 + 1))")
    echo "  $METRICS" | tee -a "$RESULTS_FILE"
    
    # Extract key numbers
    local PKT_RECV=$(echo "$METRICS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['summary'][0]['packets_received'] if d['summary'] else 0)" 2>/dev/null || echo "N/A")
    local PKT_OK=$(echo "$METRICS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['summary'][0]['processed_ok'] if d['summary'] else 0)" 2>/dev/null || echo "N/A")
    local PKT_FAIL=$(echo "$METRICS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['summary'][0]['processed_fail'] if d['summary'] else 0)" 2>/dev/null || echo "N/A")
    local AVG_MS=$(echo "$METRICS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['summary'][0]['avg_processing_ms'] if d['summary'] else 0)" 2>/dev/null || echo "N/A")
    local MAX_MS=$(echo "$METRICS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['summary'][0]['max_processing_ms'] if d['summary'] else 0)" 2>/dev/null || echo "N/A")
    
    echo "" | tee -a "$RESULTS_FILE"
    echo "  SUMMARY:" | tee -a "$RESULTS_FILE"
    echo "    Packets received:  $PKT_RECV" | tee -a "$RESULTS_FILE"
    echo "    Processed OK:      $PKT_OK" | tee -a "$RESULTS_FILE"
    echo "    Processed FAIL:    $PKT_FAIL" | tee -a "$RESULTS_FILE"
    echo "    Avg processing ms: $AVG_MS" | tee -a "$RESULTS_FILE"
    echo "    Max processing ms: $MAX_MS" | tee -a "$RESULTS_FILE"
    
    echo "" | tee -a "$RESULTS_FILE"
    
    # Clear metrics for next run (but keep raw data to see total growth)
    PGPASSWORD=Huy270905 psql -U postgres -d bus_system -c \
        "TRUNCATE ingest_metrics_minute RESTART IDENTITY;" > /dev/null 2>&1
    
    # Small pause between tests
    sleep 3
}

# ─── Run progressive load tests ─────────────────────────────────────────────

# First clear everything for a clean start
PGPASSWORD=Huy270905 psql -U postgres -d bus_system -c \
    "TRUNCATE gps_telemetry_raw, gps_latest, ingest_metrics_minute, trip_logs, anomaly_events, stop_events, dwell_times, speed_profiles, headway_records RESTART IDENTITY;" > /dev/null 2>&1

echo ""
echo "Starting progressive load tests..."
echo ""

run_test 100
run_test 300
run_test 500
run_test 700

# ─── Final summary ──────────────────────────────────────────────────────────

echo "" | tee -a "$RESULTS_FILE"
echo "========================================" | tee -a "$RESULTS_FILE"
echo "  FINAL DATABASE STATE" | tee -a "$RESULTS_FILE"
echo "========================================" | tee -a "$RESULTS_FILE"

PGPASSWORD=Huy270905 psql -U postgres -d bus_system -c \
    "SELECT relname, pg_size_pretty(pg_total_relation_size(schemaname||'.'||relname)) AS total_size, n_live_tup AS rows FROM pg_stat_user_tables ORDER BY pg_total_relation_size(schemaname||'.'||relname) DESC;" \
    | tee -a "$RESULTS_FILE"

echo "" | tee -a "$RESULTS_FILE"
echo "Benchmark complete! Results saved to $RESULTS_FILE"
