# LocalProof Agent Runtime

This is the primary, headless interface for OpenClaw. The Next.js console is optional.

## Commands

```bash
node bin/localproof.mjs plan --target ../compliance-target.yaml --suite all
node bin/localproof.mjs run --target ../compliance-target.yaml --suite wcag --output ../results
node bin/rfp-export.mjs --assessment ../results/assessment.json --output ../results/rfp-summary.json
```

`plan` resolves applicable tests without executing them. `run` executes implemented local checks and creates JSON evidence files.
`rfp-export` transforms a completed assessment into a buyer-safe RFP security summary that omits raw findings, source locations, request/response details, secrets, internal hosts, ports, and command output.

## Runtime guarantees

- No remote API calls
- No remote model calls
- Localhost and private target hosts must be declared in the target YAML
- Active tests remain disabled unless `scope.active_testing` is `true`
- Intrusive tests are never executed by this scaffold
- Missing tools produce `not-run` results rather than attempted downloads

## Implemented local test handlers

`localproof run` currently executes these catalog handlers:

| Handler | Purpose |
| --- | --- |
| `file-presence` | Finds required local files such as policy, config, manifest, or evidence artifacts. |
| `source-pattern` | Performs bounded source matching for deterministic readiness signals. |
| `local-http` | Calls approved local HTTP URLs and captures selected headers or lightweight document observations. |
| `local-tcp-probe` | Checks only approved local host and port combinations. |
| `local-command` | Runs explicit catalog commands without a shell, with bounded output and timeout. |
| `semgrep` | Runs Semgrep with a local pinned rules/config path. |
| `gitleaks` | Runs local secret detection with redacted JSON output. |
| `syft` | Generates local SBOM inventory evidence. |
| `grype` | Performs local vulnerability matching with auto-update disabled. |
| `trivy` | Performs local filesystem vulnerability, secret, and misconfiguration checks with offline flags. |
| `zap-baseline` | Runs an OWASP ZAP baseline scan against the approved local web URL. |
| `axe-cli` | Runs axe CLI against the approved local web URL for automated accessibility findings. |

The external scanner handlers require their tools, rules, browser support, and advisory databases to be installed before the assessment starts. The adapters parse JSON output into compact evidence, redact obvious secrets, preserve tool limitations, and return `not-run` when a required executable is missing.

Install dependencies during device setup, before offline assessment:

```bash
npm ci
```

## Existing SOC 2 and ISO evidence

The runtime can import local evidence documents, evaluate whether reviewed evidence
covers SOC 2 or ISO 27001 readiness work, and include that coverage in assessment
plans. Evidence import and evaluation are local-only.

Import a local text, Markdown, JSON, YAML, or text-based PDF document:

```bash
node bin/evidence.mjs import --target ../compliance-target.yaml --document ../evidence/certificate.pdf --metadata ../evidence/certificate-review.yaml --library ../evidence/library
node bin/evidence.mjs evaluate --target ../compliance-target.yaml --library ../evidence/library
node bin/localproof.mjs plan --target ../compliance-target.yaml --suite all --evidence-library ../evidence/library
```

The repository includes runnable ISO 27001 and SOC 2 examples:

```bash
node bin/evidence.mjs import --target ../examples/localproof-console-target.yaml --document ../examples/evidence-document.example.txt --metadata ../examples/evidence-metadata.example.yaml --library ../examples/evidence-library
node bin/evidence.mjs import --target ../examples/localproof-console-target.yaml --document ../examples/soc2-evidence-document.example.txt --metadata ../examples/soc2-evidence-metadata.example.yaml --library ../examples/evidence-library
node bin/evidence.mjs evaluate --target ../examples/localproof-console-target.yaml --library ../examples/evidence-library
node bin/localproof.mjs plan --target ../examples/localproof-console-target.yaml --suite all --evidence-library ../examples/evidence-library
```

The importer extracts the evidence kind, subject, product, scope, issuer, dates,
validity, and certificate number. PDF extraction uses a locally installed
`pdftotext`. Scanned documents should first be OCRed locally with Tesseract.

Reviewed metadata can be supplied as YAML or JSON. The important review fields
are:

| Field | Purpose |
| --- | --- |
| `fields.kind` | `iso27001-certificate` or `soc2-type2-report` |
| `covered_target_names` | Target names or aliases covered by the document |
| `scope_covers_target` | Must be `true` before evidence can suppress readiness work |
| `review_status` | Must be `approved` before evidence can suppress readiness work |
| `verification.issuer_verified` | Confirms the named issuer was checked locally or by a reviewer |
| `verification.accreditation_verified` | Required for ISO certificate coverage |
| `verification.auditor_eligibility_verified` | Required for SOC 2 Type II report coverage |
| `fields.valid_until` | Required for ISO 27001 certificate freshness |
| `fields.period_end` | Required for SOC 2 Type II recency |

Automatic extraction always starts as `needs-review`. A document can suppress duplicate SOC 2 or ISO readiness work only when reviewed metadata explicitly sets `review_status: approved`, `scope_covers_target: true`, names the covered target, and records verified issuing-authority details. ISO evidence must be unexpired and have verified accreditation. SOC 2 Type II evidence must have a period end within the configured 455-day recency window and verified auditor eligibility. Deterministic technical monitoring continues even when formal evidence covers the target.

When evidence covers a suite, `plan` marks applicable non-automated checks as
`covered-by-existing-evidence`. A `run` records those checks as
`skipped-covered` with the evidence id and document name. Automated checks remain
available for ongoing technical monitoring.

When `MONGODB_URI` is configured, imports are upserted into
`evidence_documents`; completed runs populate `targets`, `assessment_runs`, and
normalized `test_results`.
Without it, the same workflow operates from local JSON files.

For local development, set:

```bash
MONGODB_URI=mongodb://localhost:27017
MONGODB_DATABASE=compliance_agent
```

The example source documents and metadata files are safe fixtures. The
`examples/evidence-library/` directory is generated by `evidence import`, and
`examples/results/` is generated by `localproof run`; both should be treated as
local output unless a specific fixture is intentionally force-added.

The Compose `agent-runtime` profile places the CLI and MongoDB on the same internal-only Docker network:

```bash
docker compose -f compliance-console/docker-compose.yml --profile agent-tools run --rm agent-runtime node bin/evidence.mjs evaluate --target /workspace/examples/localproof-container-target.yaml --library /workspace/examples/evidence-library
```
