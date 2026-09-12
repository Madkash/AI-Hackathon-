#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
if [[ "$(uname -s)" != Linux || "$(uname -m)" != aarch64 ]]; then
  echo 'This package targets Linux ARM64 (DGX Spark/GB10).'; exit 1
fi
for command in python3 node npm docker nvidia-smi ollama openshell nemoclaw; do
  command -v "$command" >/dev/null || { echo "Missing prerequisite: $command. See GB10-README.md."; exit 1; }
done
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-gb10.txt
npm install --ignore-scripts
npm run build
if [[ ! -f .runtime.env ]]; then .venv/bin/python initialize.py; fi
docker compose up -d --wait mongo
source .runtime.env
bash refresh-bridge.sh
echo 'Application prepared. Run bash start-gb10.sh. Read LOGIN.txt locally for the browser password.'
