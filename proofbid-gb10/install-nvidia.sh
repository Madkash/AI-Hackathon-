#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
[[ "$(uname -s)" == Linux && "$(uname -m)" == aarch64 ]] || { echo 'Requires Linux ARM64 GB10'; exit 1; }
command -v docker >/dev/null || { echo 'Install Docker Engine first; see GB10-README.md.'; exit 1; }
command -v nvidia-smi >/dev/null || { echo 'GB10 NVIDIA driver is required.'; exit 1; }
mkdir -p installers
curl --fail --location --proto '=https' --tlsv1.2 https://www.nvidia.com/nemoclaw.sh -o installers/nemoclaw.sh
echo 'Downloaded NVIDIA installer to installers/nemoclaw.sh.'
echo 'Review it, then run the command documented in GB10-README.md.'
