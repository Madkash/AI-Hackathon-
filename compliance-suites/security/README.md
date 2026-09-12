# Local Application Security Suites

This directory scaffolds application penetration-testing readiness checks for the local compliance agent. It uses OWASP ASVS 5.0.0 as the verification baseline and OWASP WSTG 4.2 as the supporting test-method reference.

The catalog is not a penetration-test attestation and does not establish that an application is secure. It records repeatable readiness checks, their evidence, and their limits. A qualified human tester must review material findings, business-logic risks, and any formal attestation.

## Official sources

- [OWASP ASVS 5.0.0 release](https://github.com/OWASP/ASVS/tree/v5.0.0)
- [OWASP ASVS 5.0.0 machine-readable CSV](https://raw.githubusercontent.com/OWASP/ASVS/v5.0.0/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.csv)
- [OWASP WSTG 4.2](https://wstg.owasp.org/v4.2/)

OWASP recommends version-qualified ASVS references such as `v5.0.0-8.2.2`. WSTG recommends versioned scenario links and identifiers such as `WSTG-v42-INFO-06`. The catalog follows both conventions.

## Subagent suites

The orchestrator delegates bounded work to seven local subagents:

1. `attack-surface-agent` inventories endpoints, services, and administrative interfaces.
2. `authentication-agent` reviews authentication paths and runs explicitly authorized account tests.
3. `authorization-agent` builds a permission matrix and compares access across supplied test roles.
4. `session-agent` inspects cookies, token rotation, logout, and timeout behavior.
5. `input-validation-agent` combines source review with bounded, inert runtime observations.
6. `configuration-dependencies-agent` checks deployment settings, secrets, SBOMs, and offline advisories.
7. `api-security-agent` maps OpenAPI or GraphQL interfaces to safe local checks.

Each subagent returns observations and evidence to a validation stage. Subagents cannot expand scope, enable active tests, or communicate with public services.

## Execution policy

- All inference runs through the approved local GB10 model route.
- Internet egress is denied by OpenShell.
- The target must resolve to an allowlisted local hostname and port.
- Passive source, document, manifest, and recorded-traffic inspection may run by default.
- Every `safe-active` and `intrusive` test has `default_enabled: false`.
- Active tests require explicit written scope, an isolated non-production target, request limits, test accounts, and a reset plan.
- Intrusive tests are queued for specialist approval even when the target is in scope.
- Tests must not cause denial of service, persist access, extract real data, or invoke destructive operations.
- Evidence must redact credentials, tokens, personal data, and secret values.

The checked-in source URLs are provenance. Runtime execution must use locally stored copies of specifications, rules, browser binaries, and advisory databases; the agent does not fetch them while assessing software.

## Catalog structure

[`catalog.json`](./catalog.json) contains suite metadata and test scaffolds. Every test includes:

- `id` and `title`
- `safety_level`: `passive`, `safe-active`, or `intrusive`
- `default_enabled`
- required `inputs`
- a `suggested_local_tool`
- expected `evidence`
- known `limitations`
- versioned OWASP references where supportable

These entries describe test contracts. Implementations should live in separate scripts or adapters and return normalized results such as `pass`, `fail`, `needs-review`, `not-applicable`, `unsupported`, or `skipped`.

## Recommended local software

Install or preload these on the GB10 before the offline assessment runtime:

- Docker Engine with Compose for isolated targets and services.
- OWASP ZAP for passive web inspection and bounded local automation.
- Playwright plus locally installed browser binaries for repeatable UI flows.
- Semgrep with pinned local rules for static analysis.
- Gitleaks for offline secret detection.
- Syft for software bills of materials.
- Grype or Trivy with a preloaded, timestamped vulnerability database for offline dependency scanning.
- Nmap for allowlisted local service inventory.
- A local HTTP client such as `curl`.

Not every tool is needed for the first MVP. ZAP, Playwright, Semgrep, Gitleaks, and Syft plus one offline vulnerability scanner provide the broadest initial coverage. Pin tool and rule versions, store installers and databases locally, record hashes, and disable update checks and telemetry during judged runs.

## Current implementation status

The shared catalog validator and local runner are implemented. Initial passive adapters inspect route definitions, secret indicators, dependency manifests, and local HTTP security headers. The runner refuses undeclared hosts and ports, keeps active checks disabled unless the target manifest permits them, and never executes intrusive checks.

The next step is to connect the remaining test contracts to version-pinned local tools and store normalized evidence in MongoDB.
