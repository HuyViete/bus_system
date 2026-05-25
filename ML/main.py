#!/usr/bin/env python3
"""
ML Pipeline CLI — single entrypoint for all ML operations.

Usage:
    python main.py etl          # Run full ETL pipeline (all 3 steps)
    python main.py etl --sample # Run ETL on sample.json only
    python main.py train        # Train the model
    python main.py train --quick --no-tune  # Quick training with defaults
    python main.py all          # ETL + Train (full pipeline)
    python main.py all --sample --quick     # Sample ETL + quick train
"""
import argparse
import subprocess
import sys
import os

ML_DIR = os.path.dirname(os.path.abspath(__file__))


def run_script(script_path: str, extra_args: list[str] = None):
    """Run a Python script, forwarding extra args."""
    cmd = [sys.executable, script_path] + (extra_args or [])
    print(f'\n{"=" * 60}')
    print(f'Running: {" ".join(cmd)}')
    print(f'{"=" * 60}\n')
    result = subprocess.run(cmd, cwd=ML_DIR)
    if result.returncode != 0:
        print(f'\n[ML] Script failed with exit code {result.returncode}')
        sys.exit(result.returncode)


def cmd_etl(args):
    """Run the full ETL pipeline."""
    extra = []
    if args.sample:
        extra.append('--sample')
    if hasattr(args, 'limit') and args.limit:
        extra.extend(['--limit', str(args.limit)])
    
    run_script(os.path.join(ML_DIR, 'etl', '01_ingest_raw.py'), extra)
    
    chunk_extra = ['--sample'] if args.sample else []
    run_script(os.path.join(ML_DIR, 'etl', '02_build_chunks.py'), chunk_extra)
    run_script(os.path.join(ML_DIR, 'etl', '03_add_route_context.py'))


def cmd_train(args):
    """Train the model."""
    extra = []
    if args.quick:
        extra.append('--quick')
    if args.no_tune:
        extra.append('--no-tune')
    if hasattr(args, 'trials') and args.trials:
        extra.extend(['--trials', str(args.trials)])
    if hasattr(args, 'data') and args.data:
        extra.extend(['--data', args.data])
    
    run_script(os.path.join(ML_DIR, 'models', 'train.py'), extra)


def cmd_all(args):
    """Run ETL + Train."""
    cmd_etl(args)
    cmd_train(args)


def main():
    parser = argparse.ArgumentParser(description='ML Pipeline CLI')
    subparsers = parser.add_subparsers(dest='command', help='Command to run')
    
    # ETL command
    etl_parser = subparsers.add_parser('etl', help='Run ETL pipeline')
    etl_parser.add_argument('--sample', action='store_true', help='Use sample.json only')
    etl_parser.add_argument('--limit', type=int, help='Process first N files only')
    
    # Train command
    train_parser = subparsers.add_parser('train', help='Train the model')
    train_parser.add_argument('--quick', action='store_true', help='10%% sample')
    train_parser.add_argument('--no-tune', action='store_true', help='Skip Optuna tuning')
    train_parser.add_argument('--trials', type=int, help='Optuna trial count')
    train_parser.add_argument('--data', type=str, help='Custom data path')
    
    # All command
    all_parser = subparsers.add_parser('all', help='ETL + Train')
    all_parser.add_argument('--sample', action='store_true', help='Use sample.json only')
    all_parser.add_argument('--quick', action='store_true', help='10%% sample for training')
    all_parser.add_argument('--no-tune', action='store_true', help='Skip Optuna tuning')
    all_parser.add_argument('--limit', type=int, help='Process first N ETL files')
    all_parser.add_argument('--trials', type=int, help='Optuna trial count')
    all_parser.add_argument('--data', type=str, help='Custom data path')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(1)
    
    commands = {'etl': cmd_etl, 'train': cmd_train, 'all': cmd_all}
    commands[args.command](args)


if __name__ == '__main__':
    main()
