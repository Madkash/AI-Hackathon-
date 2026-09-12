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
