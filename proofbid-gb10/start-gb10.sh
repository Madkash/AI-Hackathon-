#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
source .runtime.env
docker compose up -d --wait mongo
.venv/bin/python doctor.py
.venv/bin/python worker.py &
worker_pid=$!
.venv/bin/python -m uvicorn api:app --host 127.0.0.1 --port 8765 --workers 1 --limit-concurrency 32 --timeout-keep-alive 5 &
api_pid=$!
trap 'kill "$worker_pid" "$api_pid" 2>/dev/null || true' EXIT INT TERM
# Exit when either child exits, so a dead worker never leaves a deceptively live UI.
wait -n "$worker_pid" "$api_pid"
