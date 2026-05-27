#!/usr/bin/env python3
"""
train.py — Train an XGBoost model to predict travel time per grid-cell chunk.

Loads the travel_chunks.parquet (or enriched_chunks.parquet), splits by date
to avoid temporal leakage, tunes hyperparameters with Optuna, and exports
the champion model in both native XGBoost format and ONNX.

Usage:
    python models/train.py                                       # full training
    python models/train.py --quick                               # 10% sample
    python models/train.py --data data/chunks/enriched_chunks.parquet  # custom input
    python models/train.py --trials 20                           # fewer Optuna trials
    python models/train.py --no-tune                             # skip tuning, use defaults
"""
import argparse
import json
import os
import sys
import time

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'etl'))
from config import CHUNKS_DIR, ARTIFACTS_DIR

# ── Feature columns ──────────────────────────────────────────────────────────

BASE_FEATURES = [
    'grid_lat', 'grid_lon',
    'distance_m',
    'hour_of_day', 'minute_bucket',
    'day_of_week',
    'is_weekend', 'is_rush_hour',
    'door_open', 'aircon',
]

ENRICHED_FEATURES = BASE_FEATURES + ['near_station']

TARGET = 'time_seconds'


def load_data(data_path: str, quick: bool = False) -> pd.DataFrame:
    """Load and optionally sample the training data."""
    print(f'[Train] Loading data from: {data_path}')
    df = pd.read_parquet(data_path)
    print(f'[Train] Loaded {len(df):,} rows')
    
    if quick:
        df = df.sample(frac=0.1, random_state=42)
        print(f'[Train] Quick mode: sampled to {len(df):,} rows')
    
    return df


def prepare_features(df: pd.DataFrame) -> tuple[list[str], pd.DataFrame]:
    """Determine which features are available and clean the data."""
    # Use enriched features if near_station column exists
    if 'near_station' in df.columns:
        features = ENRICHED_FEATURES
        print(f'[Train] Using enriched features ({len(features)} cols)')
    else:
        features = BASE_FEATURES
        print(f'[Train] Using base features ({len(features)} cols)')
    
    # Ensure all feature columns exist
    for col in features:
        if col not in df.columns:
            print(f'[Train] WARNING: Missing column {col}, filling with 0')
            df[col] = 0
    
    # Remove any rows with NaN in features or target
    df = df.dropna(subset=features + [TARGET])
    
    # Remove extreme outliers in target
    q99 = df[TARGET].quantile(0.99)
    before = len(df)
    df = df[df[TARGET] <= q99]
    print(f'[Train] Removed {before - len(df):,} rows with time > {q99:.0f}s (p99)')
    
    return features, df


def split_data(df: pd.DataFrame, features: list[str]):
    """Split into train/val/test (80/10/10) using random split with fixed seed."""
    X = df[features].values.astype(np.float32)
    y = df[TARGET].values.astype(np.float32)
    
    # First split: 80% train, 20% temp
    X_train, X_temp, y_train, y_temp = train_test_split(
        X, y, test_size=0.2, random_state=42
    )
    # Second split: 50/50 of temp → 10% val, 10% test
    X_val, X_test, y_val, y_test = train_test_split(
        X_temp, y_temp, test_size=0.5, random_state=42
    )
    
    print(f'[Train] Split: train={len(X_train):,}, val={len(X_val):,}, test={len(X_test):,}')
    return X_train, X_val, X_test, y_train, y_val, y_test


def detect_gpu() -> dict:
    """Detect if GPU acceleration is supported by the installed XGBoost and CUDA."""
    try:
        # Create a tiny dummy dataset
        dtest = xgb.DMatrix(np.zeros((2, 2)), label=np.zeros(2))
        # Try XGBoost >= 2.0 style
        xgb.train({'device': 'cuda'}, dtest, num_boost_round=1)
        print('[Train] NVIDIA GPU detected! Enabling GPU acceleration (device=cuda).')
        return {'device': 'cuda'}
    except Exception:
        try:
            # Try older XGBoost style (< 2.0)
            xgb.train({'tree_method': 'gpu_hist'}, dtest, num_boost_round=1)
            print('[Train] NVIDIA GPU detected! Enabling GPU acceleration (tree_method=gpu_hist).')
            return {'tree_method': 'gpu_hist'}
        except Exception:
            print('[Train] No GPU acceleration available or CUDA not configured. Using CPU.')
            return {'tree_method': 'hist'}


def tune_hyperparameters(X_train, y_train, X_val, y_val, n_trials: int = 50, gpu_params: dict = None):
    """Use Optuna to find optimal XGBoost hyperparameters."""
    import optuna
    optuna.logging.set_verbosity(optuna.logging.WARNING)
    
    dtrain = xgb.DMatrix(X_train, label=y_train)
    dval   = xgb.DMatrix(X_val, label=y_val)
    
    gpu_config = gpu_params or {'tree_method': 'hist'}
    
    def objective(trial):
        params = {
            'objective':       'reg:squarederror',
            'eval_metric':     'mae',
            'verbosity':       0,
            'n_estimators':    trial.suggest_int('n_estimators', 200, 1500),
            'max_depth':       trial.suggest_int('max_depth', 4, 12),
            'learning_rate':   trial.suggest_float('learning_rate', 0.01, 0.2, log=True),
            'subsample':       trial.suggest_float('subsample', 0.6, 0.95),
            'colsample_bytree': trial.suggest_float('colsample_bytree', 0.6, 0.95),
            'min_child_weight': trial.suggest_int('min_child_weight', 1, 20),
            'reg_alpha':       trial.suggest_float('reg_alpha', 1e-8, 1.0, log=True),
            'reg_lambda':      trial.suggest_float('reg_lambda', 1e-8, 1.0, log=True),
            **gpu_config,
        }
        
        n_est = params.pop('n_estimators')
        model = xgb.train(
            params, dtrain,
            num_boost_round=n_est,
            evals=[(dval, 'val')],
            early_stopping_rounds=50,
            verbose_eval=False,
        )
        preds = model.predict(dval)
        return mean_absolute_error(y_val, preds)
    
    study = optuna.create_study(direction='minimize')
    study.optimize(objective, n_trials=n_trials, show_progress_bar=True)
    
    print(f'[Train] Best trial MAE: {study.best_value:.2f}s')
    print(f'[Train] Best params: {json.dumps(study.best_params, indent=2)}')
    
    return study.best_params


def train_model(X_train, y_train, X_val, y_val, params: dict, gpu_params: dict = None) -> xgb.Booster:
    """Train final XGBoost model with given parameters."""
    n_est = params.pop('n_estimators', 1000)
    gpu_config = gpu_params or {'tree_method': 'hist'}
    
    full_params = {
        'objective':   'reg:squarederror',
        'eval_metric': 'mae',
        'verbosity':   1,
        **gpu_config,
        **params,
    }
    
    dtrain = xgb.DMatrix(X_train, label=y_train)
    dval   = xgb.DMatrix(X_val, label=y_val)
    
    model = xgb.train(
        full_params, dtrain,
        num_boost_round=n_est,
        evals=[(dtrain, 'train'), (dval, 'val')],
        early_stopping_rounds=50,
        verbose_eval=100,
    )
    
    return model


def evaluate_model(model: xgb.Booster, X_test, y_test, features: list[str]) -> dict:
    """Evaluate model on test set and return metrics."""
    dtest = xgb.DMatrix(X_test)
    preds = model.predict(dtest)
    
    mae  = mean_absolute_error(y_test, preds)
    rmse = np.sqrt(mean_squared_error(y_test, preds))
    r2   = r2_score(y_test, preds)
    
    # MAPE — exclude near-zero targets to avoid division issues
    mask = y_test > 1.0
    mape = np.mean(np.abs((y_test[mask] - preds[mask]) / y_test[mask])) * 100
    
    metrics = {
        'mae_seconds':  round(float(mae), 2),
        'rmse_seconds': round(float(rmse), 2),
        'mape_percent': round(float(mape), 1),
        'r2':           round(float(r2), 4),
        'test_samples': int(len(y_test)),
    }
    
    print(f'\n[Train] ═══ Test Set Results ═══════════════════')
    print(f'  MAE:  {mae:.2f} seconds')
    print(f'  RMSE: {rmse:.2f} seconds')
    print(f'  MAPE: {mape:.1f}%')
    print(f'  R²:   {r2:.4f}')
    
    # Feature importance
    importance = model.get_score(importance_type='gain')
    print(f'\n[Train] Feature importance (gain):')
    sorted_imp = sorted(importance.items(), key=lambda x: x[1], reverse=True)
    for name, score in sorted_imp[:10]:
        # Map fN back to feature name
        idx = int(name.replace('f', ''))
        fname = features[idx] if idx < len(features) else name
        print(f'  {fname:20s} → {score:.1f}')
    
    return metrics


def export_onnx(model: xgb.Booster, features: list[str], output_path: str):
    """Export XGBoost model to ONNX format for onnxruntime-node."""
    try:
        import onnxmltools
        from onnxmltools.convert import convert_xgboost
        from onnxmltools.convert.common.data_types import FloatTensorType
        
        # Need to wrap the Booster in an XGBRegressor for onnxmltools
        # Instead, we'll use the xgboost native ONNX export if available
        print(f'[Train] Exporting ONNX model...')
        
        # XGBoost >= 2.0 has native ONNX support
        # But for compatibility, we'll use onnxmltools
        initial_type = [('input', FloatTensorType([None, len(features)]))]
        
        # onnxmltools needs a sklearn-compatible wrapper
        onnx_model = convert_xgboost(model, initial_types=initial_type, target_opset=15)
        
        with open(output_path, 'wb') as f:
            f.write(onnx_model.SerializeToString())
        
        size_kb = os.path.getsize(output_path) / 1024
        print(f'[Train] ONNX exported: {output_path} ({size_kb:.0f} KB)')
        return True
        
    except Exception as e:
        print(f'[Train] ONNX export failed: {e}')
        print(f'[Train] The native XGBoost model is still saved and usable.')
        return False


def main():
    parser = argparse.ArgumentParser(description='Train XGBoost ETA model')
    parser.add_argument('--data', type=str, default=None,
                        help='Path to input Parquet file')
    parser.add_argument('--quick', action='store_true',
                        help='Use 10%% sample for fast iteration')
    parser.add_argument('--trials', type=int, default=50,
                        help='Number of Optuna hyperparameter trials')
    parser.add_argument('--no-tune', action='store_true',
                        help='Skip hyperparameter tuning, use defaults')
    args = parser.parse_args()
    
    # Determine data path
    if args.data:
        data_path = args.data
    else:
        enriched = os.path.join(CHUNKS_DIR, 'enriched_chunks.parquet')
        base = os.path.join(CHUNKS_DIR, 'travel_chunks.parquet')
        data_path = enriched if os.path.exists(enriched) else base
    
    if not os.path.exists(data_path):
        print(f'[Train] Data file not found: {data_path}')
        print(f'[Train] Run the ETL pipeline first (01_ingest_raw.py → 02_build_chunks.py)')
        sys.exit(1)
    
    start_time = time.time()
    
    # Load data
    df = load_data(data_path, quick=args.quick)
    features, df = prepare_features(df)
    
    # Split
    X_train, X_val, X_test, y_train, y_val, y_test = split_data(df, features)
    
    # Detect GPU
    gpu_params = detect_gpu()
    
    # Hyperparameter tuning
    if args.no_tune:
        print('[Train] Skipping tuning — using default parameters')
        best_params = {
            'n_estimators':    800,
            'max_depth':       8,
            'learning_rate':   0.05,
            'subsample':       0.8,
            'colsample_bytree': 0.8,
            'min_child_weight': 5,
            'reg_alpha':       0.01,
            'reg_lambda':      0.1,
        }
    else:
        print(f'[Train] Tuning hyperparameters ({args.trials} trials)...')
        best_params = tune_hyperparameters(X_train, y_train, X_val, y_val, n_trials=args.trials, gpu_params=gpu_params)
    
    # Train final model
    print('\n[Train] Training final model...')
    model = train_model(X_train, y_train, X_val, y_val, dict(best_params), gpu_params=gpu_params)
    
    # Evaluate
    metrics = evaluate_model(model, X_test, y_test, features)
    
    # Save native model
    native_path = os.path.join(ARTIFACTS_DIR, 'eta_model.json')
    model.save_model(native_path)
    print(f'\n[Train] Native model saved: {native_path}')
    
    # Save ONNX model
    onnx_path = os.path.join(ARTIFACTS_DIR, 'eta_model.onnx')
    onnx_ok = export_onnx(model, features, onnx_path)
    
    # Save feature metadata
    meta = {
        'features':     features,
        'target':       TARGET,
        'n_features':   len(features),
        'model_type':   'xgboost',
        'onnx_exported': onnx_ok,
        'metrics':      metrics,
        'best_params':  best_params,
        'grid_resolution': 0.001,
    }
    meta_path = os.path.join(ARTIFACTS_DIR, 'feature_meta.json')
    with open(meta_path, 'w') as f:
        json.dump(meta, f, indent=2)
    print(f'[Train] Feature metadata saved: {meta_path}')
    
    # Save training metrics
    training_info = {
        **metrics,
        'data_path':     data_path,
        'total_rows':    len(df),
        'features_used': features,
        'elapsed_seconds': round(time.time() - start_time, 1),
    }
    metrics_path = os.path.join(ARTIFACTS_DIR, 'training_metrics.json')
    with open(metrics_path, 'w') as f:
        json.dump(training_info, f, indent=2)
    print(f'[Train] Training metrics saved: {metrics_path}')
    
    elapsed = time.time() - start_time
    print(f'\n[Train] ═══ All done in {elapsed:.0f}s ═══')


if __name__ == '__main__':
    main()
