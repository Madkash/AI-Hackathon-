#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
[[ -f .runtime.env ]] || { echo 'Missing .runtime.env. Run preparation first.'; exit 1; }
source .runtime.env
: "${PROOFBID_SANDBOX:?Set PROOFBID_SANDBOX in .runtime.env}"
echo "Updating application bridge inside sandbox: $PROOFBID_SANDBOX"
# No new sandbox, credentials, database, or model is created here.
openshell sandbox exec -n "$PROOFBID_SANDBOX" -- mkdir -p /sandbox/proofbid
for file in agent_bridge.py configure_agent.py diagnostics.py; do
  openshell sandbox exec -n "$PROOFBID_SANDBOX" -- python3 -c \
    'import pathlib,sys; p=pathlib.Path("/sandbox/proofbid")/sys.argv[1]; p.write_bytes(sys.stdin.buffer.read())' "$file" < "$file"
done
openshell sandbox exec -n "$PROOFBID_SANDBOX" -- python3 /sandbox/proofbid/configure_agent.py
.venv/bin/python -c 'from sandbox_transport import check_bridge; print(check_bridge())'
echo 'Bridge and required CLI options checked. Live inference has not been tested.'
