// mlPredictorService.js — Loads ONNX model at startup, provides predict() for ETA chunks.
//
// The model is trained offline (ML/models/train.py) and exported to ONNX format.
// This service loads it once at startup and provides fast inference via onnxruntime-node.
// If no model file exists, the service gracefully degrades — callers check isModelLoaded().

import { InferenceSession, Tensor } from 'onnxruntime-node'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ML_DIR = path.join(__dirname, '..', '..', '..', 'ML')

let session = null
let featureMeta = null

/**
 * Load the ONNX model from ML/artifacts/eta_model.onnx.
 * Called once at server startup. Non-blocking — returns false if model not found.
 */
export async function loadModel() {
    const modelPath = path.join(ML_DIR, 'artifacts', 'eta_model.onnx')
    const metaPath  = path.join(ML_DIR, 'artifacts', 'feature_meta.json')

    if (!fs.existsSync(modelPath)) {
        console.warn('[ML] No ONNX model found at', modelPath)
        console.warn('[ML] ETA predictions will use fallback mock. Train a model with: python ML/main.py all')
        return false
    }

    try {
        session = await InferenceSession.create(modelPath)
        console.log('[ML] ONNX model loaded:', modelPath)
    } catch (err) {
        console.error('[ML] Failed to load ONNX model:', err.message)
        session = null
        return false
    }

    if (fs.existsSync(metaPath)) {
        featureMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
        console.log(`[ML] Feature metadata loaded: ${featureMeta.n_features} features, model=${featureMeta.model_type}`)
    } else {
        console.warn('[ML] feature_meta.json not found — using default feature order')
        featureMeta = null
    }

    return true
}

/** Check if a trained model is loaded and ready for inference. */
export function isModelLoaded() {
    return session !== null
}

/** Get model metadata (version, metrics, etc.) */
export function getModelInfo() {
    if (!featureMeta) return null
    return {
        model_type:      featureMeta.model_type,
        n_features:      featureMeta.n_features,
        grid_resolution: featureMeta.grid_resolution,
        metrics:         featureMeta.metrics,
        onnx_exported:   featureMeta.onnx_exported,
    }
}

/**
 * Predict travel time for an array of geographic chunks.
 *
 * @param {Array<Object>} chunks — each chunk has:
 *   { lat, lon, distance_m, hour, minute_bucket, day_of_week,
 *     is_weekend, is_rush, door_open, aircon, near_station? }
 * @returns {Array<number>|null} — predicted time_seconds per chunk, or null if model not loaded
 */
export async function predictChunkTime(chunks) {
    if (!session || !chunks || chunks.length === 0) return null

    const gridRes = featureMeta?.grid_resolution || 0.001

    // Build feature matrix — order must match training feature order
    const featureVectors = chunks.map(c => {
        const features = [
            Math.round(c.lat / gridRes) * gridRes,    // grid_lat
            Math.round(c.lon / gridRes) * gridRes,    // grid_lon
            c.distance_m || 0,                         // distance_m
            c.hour ?? 12,                              // hour_of_day
            c.minute_bucket ?? 0,                      // minute_bucket
            c.day_of_week ?? 0,                        // day_of_week
            c.is_weekend ? 1 : 0,                      // is_weekend
            c.is_rush ? 1 : 0,                         // is_rush_hour
            c.door_open ? 1 : 0,                       // door_open
            c.aircon ? 1 : 0,                          // aircon
        ]

        // Add near_station if the model expects it
        if (featureMeta && featureMeta.features.includes('near_station')) {
            features.push(c.near_station ? 1 : 0)
        }

        return features
    })

    const nFeatures = featureVectors[0].length
    const flat = new Float32Array(chunks.length * nFeatures)
    for (let i = 0; i < chunks.length; i++) {
        for (let j = 0; j < nFeatures; j++) {
            flat[i * nFeatures + j] = featureVectors[i][j]
        }
    }

    try {
        // Determine the input name from the session
        const inputName = session.inputNames[0] || 'input'
        const tensor = new Tensor('float32', flat, [chunks.length, nFeatures])
        const results = await session.run({ [inputName]: tensor })

        // Get the output — name may vary
        const outputName = session.outputNames[0] || 'output'
        const output = results[outputName]

        // Clamp predictions to be non-negative
        return Array.from(output.data).map(v => Math.max(0, v))
    } catch (err) {
        console.error('[ML] Inference error:', err.message)
        return null
    }
}
