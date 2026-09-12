# Local Software for the GB10

All packages, container images, browser binaries, rules, and advisory databases should be installed or copied to the GB10 during setup. Assessment runs must not download updates or call remote services.

## Core runtime

- **Docker Engine and Docker Compose:** run OpenShell and isolated local services.
- **NemoClaw:** provision and manage the OpenClaw agent inside OpenShell.
- **OpenShell:** enforce filesystem, process, target, and network boundaries.
- **Node.js and npm:** run OpenClaw skills and the LocalProof CLI. NemoClaw may install its own compatible Node.js runtime.
- **MongoDB Community:** store targets, evidence, findings, and assessment state. The existing Compose file uses a local MongoDB container.
- **One NemoClaw-supported local inference backend and model:** perform all model inference on the GB10. Install one compatible backend rather than several competing servers.

## Recommended assessment tools

- **Playwright with a preinstalled Chromium browser:** local browser automation.
- **axe-core:** automated WCAG checks inside Playwright. Human review remains necessary.
- **OWASP ZAP:** passive scans and explicitly authorized active web tests.
- **Semgrep Community Edition:** static analysis using locally stored, version-pinned rules.
- **Gitleaks:** local secret scanning with secret values redacted from evidence.
- **Syft:** local software bill of materials generation.
- **Grype or Trivy:** vulnerability matching using a preloaded offline advisory database. One is sufficient for the MVP.
- **Nmap:** bounded inspection of only the local hosts and ports listed in `compliance-target.yaml`.
- **ripgrep, Git, and curl:** repository inspection, revision evidence, and controlled local HTTP checks.
- **Poppler and Tesseract:** optional local extraction and OCR for audit reports, certificates, policies, and scanned evidence.

SOC 2 and ISO/IEC 27001 do not have a scanner that can establish certification. Their suites primarily require document evidence, operating-history exports, sampling, interviews, and professional judgment. Local tools assist with inventory, consistency, freshness, and technical configuration checks.

## Offline execution flags for assessment tools

Several of the tools above call home by default. Every adapter must set these before it is trusted to run inside OpenShell:

- **OWASP ZAP:** pass `-config start.checkForUpdates=false -config start.checkAddonUpdates=false`. Without this, ZAP checks its marketplace for addon and application updates on startup.
- **Semgrep:** always invoke with an explicit local `--config <path>` to a pinned rule file or directory, never a registry shorthand such as `p/ci`, and set `SEMGREP_SEND_METRICS=off`. A local `--config` avoids the registry fetch, but upstream has an open report of residual network calls even with a local config (semgrep/semgrep#8793), so treat this as risk reduction, not a guarantee, and verify with a network-isolated run.
- **Syft:** set `SYFT_CHECK_FOR_APP_UPDATE=false` to stop its startup update check.
- **Grype:** set `GRYPE_DB_AUTO_UPDATE=false` and `GRYPE_DB_VALIDATE_AGE=false` so a database that looks stale does not trigger a fetch.
- **Trivy:** pass `--skip-db-update --skip-java-db-update --offline-scan`, adding `--skip-check-update` when the misconfiguration database is also preloaded.
- **Playwright:** set `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` before `npm install`, pre-provision browsers on a connected machine, and point `PLAYWRIGHT_BROWSERS_PATH` at the copied cache. Never let `npx playwright install` run during an assessment.
- **axe-core:** runs inside the Playwright browser context as a bundled script; install it from the local npm cache rather than a CDN `<script>` tag.
- **Gitleaks and Nmap:** no known telemetry or update-check behavior. Still bind Nmap's targets to `scope.allowed_hosts` and `scope.allowed_ports` from the approved YAML, never to operator-supplied ranges.

OpenShell's network deny-list is the actual enforcement boundary. These flags reduce the number of tools that ever attempt an outbound call in the first place; they do not replace OpenShell blocking egress.

## Local specifications and data

Prepare these before disconnecting the runtime from external networks:

- A licensed local copy of the applicable ISO/IEC 27001 materials
- Versioned AICPA SOC 2 criteria and organization-approved mappings
- OWASP ASVS and WSTG files
- WCAG 2.2 specification and evaluation guidance
- Pinned Semgrep rules
- Offline Grype or Trivy advisory database
- Container images and application dependencies
- Playwright browser binaries
- Model weights and embedding models

Record versions and hashes so assessment reports identify exactly which references and tools were used.

## Check the current device

The checker performs local `--version` commands only:

```bash
cd agent-runtime
npm run tools
```

It does not install software or access the network.
