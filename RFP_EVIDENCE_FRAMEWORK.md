# RFP Evidence Sharing Framework

## Purpose

This framework defines how LocalProof should package software security and compliance results for an RFP response.

The supplier goal is to prove that the software is responsibly built, tested, monitored, and governed without exposing raw findings, exploit paths, secrets, infrastructure details, or internal operational playbooks. The buyer goal is to receive enough evidence to assess risk, request follow-up artifacts, and decide whether the supplier is acceptable for the proposed scope.

LocalProof should therefore produce different evidence packages for different audiences instead of treating every assessment result as buyer-shareable.

## Core Principle

Do not return raw assessment output directly in an RFP.

Return a controlled assurance summary that states:

- what was assessed
- when it was assessed
- which methods and tools were used
- what scope was covered
- what level of assurance the result supports
- what issues remain open at a summary level
- what formal third-party evidence exists
- what limitations and required human reviews remain

The report must not disclose sensitive technical details that would materially help an attacker or reveal confidential operating information.

## Audience Tiers

Every result, evidence item, and attachment should be classified into one of these tiers.

| Tier | Audience | Use | Examples |
| --- | --- | --- | --- |
| `public-rfp` | Included in normal RFP response | High-level assurance and control posture | Security program overview, control summary, severity counts, remediation SLA, certification metadata |
| `nda-rfp` | Shared only under NDA or controlled portal | Stronger buyer diligence without raw exploitability | SOC 2 Type II report, ISO certificate, executive pentest summary, sanitized vulnerability summary, SBOM summary |
| `restricted-buyer-review` | Shared only after security/legal approval | Detailed diligence for high-risk buyers | Full pentest report, detailed architecture/data-flow diagrams, threat model summary |
| `internal-only` | Not shared with buyers | Remediation and operational security | Raw scanner output, request/response captures, source locations, exploit steps, open critical findings, secrets, internal runbooks |

Default classification should be conservative. New result types should default to `internal-only` until explicitly mapped.

## Evidence Package Types

### RFP Summary Package

Default buyer response package.

Includes:

- product and version assessed
- assessment date and assessment window
- assessment scope
- excluded systems and limitations
- framework mappings at summary level
- security testing methods used
- tool names and versions where safe
- severity counts by category
- remediation status by severity
- current certification/report coverage
- future review or retest dates
- named limitations and human review requirements

Excludes:

- raw findings
- source file paths and line numbers
- exact exploit payloads
- request/response samples
- logs, stack traces, or screenshots containing sensitive data
- unredacted dependency inventory
- exact internal hostnames, ports, and admin interfaces
- unresolved vulnerability details beyond severity/category/status

### NDA Diligence Package

Used when the buyer has a legitimate need and an NDA is in place.

May include:

- SOC 2 Type II report
- ISO 27001 certificate and scope statement
- bridge letter
- executive penetration-test summary
- sanitized SAST/DAST/SCA summaries
- SBOM summary
- architecture and data-flow overview
- control evidence index
- vulnerability management SLA performance

Should still exclude:

- secrets
- raw exploit details
- exact attacker playbooks
- unremediated critical or high details unless approved
- customer-specific incidents unless legally reviewed

### Internal Remediation Package

Used by engineering, security, and compliance teams.

Includes:

- raw tool evidence
- source locations
- full samples
- reproduction notes
- internal owner, ticket, and SLA details
- scanner logs and local command output
- exact component and package findings

This package is not suitable for RFP return.

## Result Classification Rules

| Result Type | Default Tier | RFP Handling |
| --- | --- | --- |
| SOC 2 Type II coverage decision | `public-rfp` summary, `nda-rfp` artifact | Show issuer, period end, scope summary, and exceptions status. Attach full report only under NDA. |
| ISO 27001 certificate coverage | `public-rfp` summary | Show certification body, validity dates, and scope summary. Full certificate can usually be shared. |
| Evidence freshness and scope checks | `public-rfp` summary | Report covered, expired, out-of-scope, or needs-review without internal notes. |
| Readiness score and forecast | `public-rfp` | Must be labeled as readiness only, not certification or attestation. |
| Manual review requirements | `public-rfp` | Summarize required reviewer/auditor/certification body action. |
| Secret scan results | `internal-only` raw, `public-rfp` aggregate | Report whether scanning is performed, last run date, severity counts, and remediation status only. |
| SAST or Semgrep findings | `internal-only` raw, `nda-rfp` summary | Do not expose source paths, line numbers, payloads, or raw messages in normal RFP. |
| DAST or ZAP findings | `internal-only` raw, `nda-rfp` summary | Do not expose request/response samples, endpoint details, or exploit hints. |
| SBOM inventory | `nda-rfp` or `restricted-buyer-review` | Provide summary or approved SBOM format under controlled sharing. Do not include unpublished internal components by default. |
| SCA vulnerability findings | `internal-only` raw, `nda-rfp` summary | Share severity counts, remediation status, and exceptions. Avoid exact vulnerable package list unless approved. |
| Open ports and service exposure | `internal-only` raw | Share only high-level network segmentation and exposure governance. |
| Authentication abuse or lockout tests | `internal-only` | Share only that controls are tested and whether gaps are remediated. |
| Authorization and IDOR checks | `internal-only` raw, `nda-rfp` summary | Share coverage, methodology, and status. Avoid route/object details. |
| Session management checks | `internal-only` raw, `public-rfp` aggregate | Share high-level cookie/session control posture, not token behavior details. |
| WCAG automated results | `public-rfp` summary | Label as automated readiness, not conformance. Include manual review requirements. |
| Raw command stdout/stderr | `internal-only` | Never include in RFP export. |

## Report Language Rules

RFP-facing reports must use cautious assurance language.

Allowed terms:

- readiness observation
- evidence reviewed
- control appears implemented
- no material gap observed in tested scope
- requires manual review
- covered by existing evidence
- not observed in local assessment
- assessment limitation

Forbidden unless backed by the correct formal artifact:

- certified
- SOC 2 compliant
- ISO compliant
- audit passed
- penetration test passed
- secure
- no vulnerabilities
- WCAG conformant
- guaranteed

## Required Metadata

Every RFP-safe result should include:

- `target_name`
- `target_version`
- `assessment_id`
- `generated_at`
- `assessment_window`
- `scope_summary`
- `excluded_scope`
- `frameworks`
- `tools_used`
- `tool_versions`
- `evidence_sources`
- `review_status`
- `result_summary`
- `severity_counts`
- `remediation_status`
- `limitations`
- `next_review_date`
- `classification`

Every exported artifact should include:

- owner approval status
- audience tier
- export timestamp
- source assessment identifier
- redaction policy version
- hash of exported file

## Redaction Rules

RFP export must remove or generalize:

- secrets, tokens, credentials, private keys, cookies, session identifiers
- authorization headers
- raw request and response bodies
- source file paths and line numbers
- stack traces
- local filesystem paths
- internal hostnames and ports
- usernames, emails, and customer identifiers unless already approved
- exact exploit payloads
- package lists tied to unremediated vulnerabilities unless approved
- tool stdout and stderr samples

RFP export may retain:

- test category
- severity level
- count
- status
- remediation SLA bucket
- date first observed
- date remediated
- retest status
- mapped control or framework family

## Workflow

1. Run internal LocalProof assessment against approved scope.
2. Store raw assessment results as internal evidence.
3. Classify each result and artifact by audience tier.
4. Apply RFP export policy.
5. Generate the RFP summary package.
6. Generate optional NDA diligence package when authorized.
7. Run export safety tests.
8. Require owner approval before external sharing.
9. Preserve an audit record of exactly what was exported.

## Test Requirements To Add

### RFP Export Tests

Add tests that prove RFP output:

- includes required metadata
- includes readiness limitations
- includes severity counts and remediation status
- excludes raw evidence samples
- excludes stdout and stderr samples
- excludes request and response data
- excludes source paths and line numbers
- excludes secrets and secret-like strings
- excludes exact internal hosts and ports
- excludes forbidden assurance claims

### Classification Tests

Add tests that prove:

- new result types default to `internal-only`
- secret, SAST, DAST, SCA, network, auth abuse, and source-pattern evidence cannot be `public-rfp` by default
- SOC 2 and ISO formal evidence can produce public metadata but not unrestricted raw artifacts
- NDA packages include only approved fields

### Catalog Policy Tests

Add tests that prove:

- no `intrusive` check is default-enabled
- no `safe-active` check is default-enabled without explicit scope
- all catalogs carry a readiness or non-certification disclaimer
- all automated tests include limitations
- every executor maps to a known safety policy

### Redaction Tests

Extend tests to cover:

- `source-pattern`
- `file-presence`
- `local-http`
- `local-tcp-probe`
- `local-command`
- generated assessment reports
- generated RFP exports

The existing adapter tests already cover much of this for Semgrep, Gitleaks, Syft, Grype, Trivy, ZAP, and axe.

## Suggested Export Schema

```json
{
  "schema_version": "1.0",
  "classification": "rfp-security-summary",
  "audience_tier": "public-rfp",
  "target": {
    "name": "Product Name",
    "version": "git-or-release-id"
  },
  "assessment": {
    "id": "assessment-id",
    "generated_at": "YYYY-MM-DDTHH:MM:SSZ",
    "assessment_window": {
      "started_at": "YYYY-MM-DD",
      "ended_at": "YYYY-MM-DD"
    },
    "scope_summary": "Approved local staging assessment of web application, API, source repository, and supplied evidence.",
    "excluded_scope": ["production infrastructure", "unprovided third-party systems"]
  },
  "formal_evidence": [
    {
      "kind": "soc2-type2-report",
      "issuer": "Independent CPA Firm",
      "period_end": "YYYY-MM-DD",
      "scope_summary": "System and controls relevant to Security",
      "status": "covered",
      "artifact_tier": "nda-rfp"
    }
  ],
  "technical_testing": [
    {
      "category": "static-application-security-testing",
      "status": "performed",
      "last_run": "YYYY-MM-DD",
      "severity_counts": {
        "critical": 0,
        "high": 0,
        "medium": 2,
        "low": 5
      },
      "remediation_status": {
        "open": 1,
        "in_progress": 1,
        "remediated": 5,
        "accepted_risk": 0
      }
    }
  ],
  "limitations": [
    "Readiness forecast only. This is not a certification, attestation, audit opinion, assurance report, penetration-test attestation, or legal conclusion."
  ],
  "approval": {
    "status": "approved-for-rfp",
    "approved_by": "security-owner",
    "approved_at": "YYYY-MM-DDTHH:MM:SSZ"
  }
}
```

## Implementation Direction

The LocalProof runtime should keep producing detailed internal assessment results. A separate export module should transform those results into RFP-safe packages.

Recommended module shape:

- `lib/rfp-export.mjs`: classification, redaction, and package generation
- `test/rfp-export.test.mjs`: RFP package safety tests
- `test/catalog-policy.test.mjs`: catalog safety invariants
- optional `bin/rfp-export.mjs`: CLI for producing approved export artifacts

The export layer should be deny-by-default: if a result has no explicit policy, it is omitted from buyer-facing output and listed internally as requiring classification.
