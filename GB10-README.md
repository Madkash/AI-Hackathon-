# ProofBid — GB10 deployment source

This is the retained deployment of ProofBid for a Linux ARM64 GB10 / DGX Spark. The older Windows prototype has been moved to an external backup. This source has not been installed, built, or integration-tested on a GB10. It must not be represented as production-validated or guaranteed compatible. Machine-specific onboarding and the checks below remain necessary.

## Components and actual execution path

Browser (React, locally bundled) → authenticated FastAPI → MongoDB job queue → host worker → OpenShell sandbox exec → OpenClaw agent exec → NemoClaw-managed local inference route → Ollama → nemotron-3-nano:30b.

MongoDB stores results and review events. FastAPI and the worker run on the trusted GB10 host; the model-facing OpenClaw turns run inside the NVIDIA sandbox. This does not claim that the entire application is sandboxed. Source data crosses into that sandbox through stdin, not shared host folders. The sandbox receives no database password or Docker socket. It has no need to execute arbitrary audit commands; configuration checks run deterministically in the host worker.

NemoClaw owns sandbox creation and inference routing. ProofBid does not recreate its gateway or overwrite its managed configuration. `configure_agent.py` derives a separate one-provider, tool-denied configuration from onboarding. An unfamiliar route, different model, malformed output, or unsupported CLI fails explicitly; there is no cloud or rules fallback.

## 1. GB10 prerequisites

Use the GB10's supported Linux installation and NVIDIA driver. Do not replace its driver with a generic desktop CUDA package. You need Python 3.10+ with venv support, Node.js 20+, npm, Docker Engine with Compose v2, and NVIDIA's container runtime prerequisites. The host account must be permitted to use Docker and own the NemoClaw installation. Do not run the application as root.

If missing, follow the vendor installation instructions:

- [Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
- [NemoClaw prerequisites](https://docs.nvidia.com/nemoclaw/latest/user-guide/openclaw/get-started/prerequisites)

On an otherwise prepared Ubuntu host, install the Python prerequisites with `sudo apt-get install python3-venv python3-pip`. Use your approved Node distribution for Node/npm. This package intentionally does not remove existing Docker packages or alter the GB10 driver.

## 2. Install the NVIDIA stack and onboard local Ollama

Copy this entire gb10 folder to the GB10 and open a terminal in it. The installer downloader does not execute its download:

```bash
bash install-nvidia.sh
less installers/nemoclaw.sh
```

After reviewing the installer and accepting NVIDIA's third-party software terms, run:

```bash
NEMOCLAW_AGENT=openclaw \
NEMOCLAW_PROVIDER=ollama \
NEMOCLAW_MODEL=nemotron-3-nano:30b \
NEMOCLAW_SANDBOX_NAME=cody \
NEMOCLAW_ACCEPT_THIRD_PARTY_SOFTWARE=1 \
bash installers/nemoclaw.sh
```

Follow onboarding until it reports the `cody` sandbox ready. If `cody` already exists, use that sandbox instead of creating another one. Select the LOCAL 30B tag explicitly. If the installed model is absent, download it on the GB10 with `ollama pull nemotron-3-nano:30b`. Your Windows model installation does not automatically exist on the GB10. Keep cloud disabled in the Ollama service (`OLLAMA_NO_CLOUD=1`), not just in the application shell. Do not expose unauthenticated Ollama on 0.0.0.0; let the NVIDIA installer configure its managed route.

Current instructions: [NemoClaw quickstart](https://docs.nvidia.com/nemoclaw/latest/user-guide/openclaw/get-started/quickstart), [Ollama setup](https://docs.nvidia.com/nemoclaw/latest/user-guide/openclaw/inference/local-inference/set-up-ollama).

NVIDIA releases and CLI contracts change rapidly. Use the installer's maintained release selection, and retain the installed versions after validation. This package does not pin an invented compatible NVIDIA release. Do not upgrade a working competition installation immediately before demonstrating it.

## 3. Prepare and start ProofBid

The sandbox name defaults to `cody`. For an existing installation, edit `.runtime.env` so it contains `export PROOFBID_SANDBOX=cody` before running preparation. Existing environment files are preserved, so updating the source does not change a previously saved sandbox name. The `/sandbox/proofbid` paths are application directories inside `cody`, not sandbox names; keep those paths unchanged.

```bash
bash prepare-gb10.sh
bash start-gb10.sh
```

Preparation creates a Python virtual environment, installs dependencies, builds React, initializes unique passwords, starts MongoDB and copies the two small bridge/configuration scripts into the existing sandbox. It requires internet for dependencies/images; normal inference does not require cloud APIs. MongoDB's image supports ARM64; Docker selects the host architecture. Dependency ranges are not a validated lockfile. Retain `package-lock.json` and capture `.venv/bin/python -m pip freeze` after your successful target deployment.

Open http://127.0.0.1:8765 on the GB10. Read LOGIN.txt locally: username is `proofbid`, with a generated password. Do not send this file or the environment files to anyone. Basic authentication is intended only for loopback/SSH access, not unencrypted public access.

From a laptop, use an SSH tunnel:

```bash
ssh -L 8765:127.0.0.1:8765 YOUR_USER@YOUR_GB10
```

Then open the same localhost URL on the laptop. Keep the terminal running. Ctrl+C stops the foreground application and worker; MongoDB remains running with its persistent volume. `docker compose stop mongo` stops the database without deleting it. Do not delete the volume or regenerate passwords when restarting.

## 4. Demonstrate real operation

Upload sample/rfp.txt and sample/supplier.txt. The product-configuration upload is optional: structured JSON enables deterministic configuration checks, while TXT, Markdown, PDF, or CSV is reviewed as an additional supplier-evidence document. Click Analyze with local AI. A job ID is persisted before inference. The page polls progress and reconnects to its saved job after refresh in the same browser tab. It displays actual results or a failure; no simulation path exists in this deployment.

Open each requirement's evidence, record review notes, and mark it reviewed. Review events are saved with the single operator identity. A review mark does not alter the machine status or authenticate compliance. Export CSV or Markdown. The source RFP can be edited before submission; correcting the extracted requirement list as a separate intermediate phase is not implemented.

## Diagnostics

For a job that reports AgentUnavailable, use [REPAIR-STEPS.md](REPAIR-STEPS.md). This update reports safe failure categories and checks the sandbox bridge during preparation/startup.

```bash
source .runtime.env
.venv/bin/python doctor.py
.venv/bin/python doctor.py --inference
nemoclaw cody status
openshell sandbox exec -n cody -- openclaw agent exec --help
```

The doctor checks host architecture, local model metadata, database connectivity and the sandbox bridge CLI. With `--inference`, it additionally sends one small real request through OpenClaw. Neither mode proves GPU residency or sandbox isolation. The browser sample exercises the full analysis path. Record `ollama ps` during inference to inspect runtime placement and retain the installed version outputs with your deployment evidence.

The bridge expects Python 3 and current OpenClaw `agent exec` inside the sandbox. If preparation cannot read the generated OpenClaw JSON config, or onboarding uses a different provider alias/endpoint, stop and inspect that installed release; do not change the guard to accept arbitrary URLs.

## Security and operational boundaries

The host application and sandbox control CLI are trusted. OpenShell's active filesystem/network policy comes from NemoClaw onboarding; this package does not assert a custom RFP-only OS policy or tested isolation. Tool-denial configuration is an additional application control, not a replacement for that policy. Before demonstrating isolation, inspect the active policy and run permitted-access and denied-access probes against designated test paths, including denied network egress. A failed read of a nonexistent path is not proof of a sandbox denial. Do not mount your home directory or database secrets into the sandbox.

Inputs are capped at 24,000 RFP characters, 24,000 total supplier-document characters, 200 requirements and 2 MB per HTTP request. One worker performs model calls serially. A process interruption marks incomplete jobs failed on worker restart; it does not silently re-run inference. The web service has one local operator account, not multi-tenant isolation. Review history retains the latest 1,000 events per analysis. Data is not encrypted at rest by the app; use host disk encryption and backups appropriate to the documents.

Remaining production work includes target compatibility and accuracy testing, sandbox-policy verification, dependency/image locking, service supervision across reboot, backup/restore validation, an identity provider for multiple reviewers, and any competition-specific runtime-audit adapters. The current job queue is a bounded single-machine implementation, not a distributed high-availability system. Installing the stack does not convert static configuration checks into runtime attestation.

## File map

- api.py: FastAPI authentication, jobs, upload limits and review endpoints.
- pdf_input.py: text-based PDF extraction without the legacy web server.
- worker.py / store.py: durable MongoDB queue consumer and persistence.
- frontend.jsx / build.mjs: React interface and local asset build.
- sandbox_transport.py: host-to-sandbox request transport.
- agent_bridge.py / configure_agent.py: scoped OpenClaw execution inside the sandbox.
- local_llm.py / engine.py: source validation and conservative configuration comparisons.
- prepare-gb10.sh / start-gb10.sh / compose.yaml: deployment and startup.

Additional interface references: [OpenShell command execution](https://docs.nvidia.com/openshell/sandboxes/manage-sandboxes), [OpenClaw agent execution](https://docs.openclaw.ai/cli/agent).
