# SOC 2 Type II readiness suite

This directory defines a hackathon-scale SOC 2 readiness suite. It inventories evidence and scaffolds local technical checks against stable AICPA criteria identifiers. It does **not** perform or emulate a SOC 2 examination and cannot issue a report, opinion, attestation, or certification.

The AICPA describes SOC as a suite of services that CPAs may provide, and its SOC 2 guide addresses assertion-based examinations of a service organization's system description and controls. A real SOC 2 Type II examination therefore remains the work of an appropriately licensed, independent CPA firm. This suite prepares evidence and identifies gaps for management and an eventual service auditor.

## Authoritative basis

The catalog uses these official AICPA sources:

- [2017 Trust Services Criteria, revised points of focus 2022](https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022)
- [2018 SOC 2 Description Criteria, revised implementation guidance 2022](https://www.aicpa-cima.com/category/resources/technology?type=framework)
- [AICPA System and Organization Controls suite](https://www.aicpa-cima.com/resources/landing/system-and-organization-controls-soc-suite-of-services)
- [AICPA authoritative SOC 2 reporting guide](https://www.aicpa-cima.com/cpe-learning/publication/soc-2-reporting-on-an-examination-of-controls-at-a-service-organization-relevant-to-security-availability-processing-integrity-confidentiality-or-privacy)

The AICPA criteria text is not copied into this repository. `catalog.json` retains stable identifiers such as `CC6.1`, paraphrases readiness objectives, and links back to the official source. Before production use, a qualified compliance lead and the engaged service auditor should confirm the selected criteria, current source version, system boundaries, and examination scope.

## Scope model

Every SOC 2 engagement includes the Security category, represented by the Common Criteria:

- `CC1`: control environment
- `CC2`: information and communication
- `CC3`: risk assessment
- `CC4`: monitoring
- `CC5`: control activities
- `CC6`: logical and physical access
- `CC7`: system operations
- `CC8`: change management
- `CC9`: risk mitigation

Management may select additional categories when relevant to service commitments and system requirements:

- `A1`: availability
- `PI1`: processing integrity
- `C1`: confidentiality
- `P1`–`P8`: privacy

The system-description readiness check also references `DC1`–`DC9` from the separate AICPA Description Criteria. These are clearly labeled in the catalog so they are not confused with Trust Services Criteria.

## What can be automated

The suite deliberately distinguishes three test types:

- `automated_technical`: a deterministic local tool can inspect a repository, configuration, local test application, exported record set, or disposable restore target.
- `hybrid`: automation can collect and reconcile evidence, but a person must interpret organizational context and sufficiency.
- `manual_evidence`: the tool inventories, hashes, dates, and highlights gaps in evidence that requires interviews, observation, sampling, or professional judgment.

Examples of useful local automation include source authorization checks, account-population reconciliation, committed-secret detection, logging coverage analysis, Git change traceability, backup restoration, and input/output reconciliation.

Automation cannot determine whether management's description is fairly presented, whether controls were suitably designed, or whether they operated effectively throughout a Type II period. Those conclusions depend on the service auditor's risk assessment, population validation, sampling, procedures, exception evaluation, and professional judgment.

## Catalog structure

[`catalog.json`](./catalog.json) contains:

- Official source records with stable local IDs and URLs
- Required and optional category applicability rules
- Practical groups covering the Common Criteria and additional categories
- Scaffold tests with IDs, inputs, local tools, evidence, and limitations
- Allowed readiness result states
- Provenance and local-runtime requirements

Each test scaffold includes:

```json
{
  "id": "SOC2-CHANGE-001",
  "title": "Source change authorization and test traceability",
  "type": "automated_technical",
  "applicability": "Git repositories with local workflow exports",
  "inputs": ["Git history", "local approval and CI exports"],
  "local_only_tool": "git-change-control-analyzer",
  "expected_evidence": ["reviewer", "linked ticket", "test result"],
  "limitations": "Git alone cannot prove approval or production deployment."
}
```

The named tools are interfaces to implement under the test runner. They are not claims that a complete auditor-grade test exists today.

## Local-only execution

At runtime, the suite must use only:

- Files copied to the GB10
- Local MongoDB records
- Local source repositories and Git history
- Local containers and authorized test endpoints
- Local deterministic scanners
- Models served through the GB10 local inference route

Outbound network access and remote inference are denied. Official materials should be downloaded and versioned before the assessment runtime. Each evidence artifact should retain its source path, SHA-256 hash, collection time, tool version, and test parameters.

Active checks should run only against an authorized, disposable local target. The default mode is read-only. OpenClaw can select and sequence tools, while OpenShell constrains files, processes, and network destinations. NemoClaw manages the OpenClaw-in-OpenShell environment and its local inference route.

## MVP behavior

For the hackathon, the runner should:

1. Read the target manifest and intended Trust Services Categories.
2. Validate that all required input locations and permissions are local.
3. Run the Common Criteria readiness scaffolds.
4. Run `A1`, `PI1`, `C1`, or `P1`–`P8` scaffolds only when selected.
5. Store evidence and provenance locally.
6. Return one of the catalog's readiness states for every test.
7. Produce findings, missing evidence, manual-review tasks, and limitations.

Reports must say “readiness check passed” rather than “SOC 2 compliant.” They must prominently state that a CPA firm's examination is required for a SOC 2 Type II report.
