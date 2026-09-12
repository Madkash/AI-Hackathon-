# ISO/IEC 27001:2022 Readiness Suite

This directory contains an original, non-normative scaffold for collecting local evidence and running bounded technical checks that may support an ISO/IEC 27001 readiness review.

It does **not** contain the ISO/IEC 27001 standard, reproduce its protected requirements, determine conformity, report audit findings, or issue certification. ISO describes ISO/IEC 27001 as the requirements standard for an information security management system (ISMS). Certification is independent written assurance, while accreditation recognizes the competence of a certification body. A formal result therefore requires a competent independent certification body and the licensed standard.

## What the catalog covers

The checks in `catalog.json` are organized around two layers:

1. **Management-system readiness:** high-level themes corresponding to clauses 4–10—organizational context, leadership, planning, support, operation, performance evaluation, and improvement.
2. **Control readiness:** practical checks grouped under the four public ISO/IEC 27002:2022 themes—organizational, people, physical, and technological.

The catalog deliberately uses original titles and paraphrases. Its mappings are navigation aids, not authoritative interpretations or substitutes for licensed ISO material.

## Assessment boundary

Each check is one of:

- `manual-evidence`: the agent can locate, index, and cross-reference evidence, but a qualified person must assess design, suitability, implementation, and effectiveness.
- `automated-technical`: a deterministic local tool can observe a narrow technical condition and preserve evidence.
- `mixed`: technical observations can support the review, but organizational judgment and manual evidence remain necessary.

Automated checks return readiness states such as `potential-gap` or `insufficient-evidence`. They must never emit `certified`, `conformant`, or formal `nonconformity` conclusions.

## Local-only execution model

All assessment inputs must already exist on the GB10 or on an explicitly approved local network service. During runtime:

- OpenClaw selects and sequences checks from the catalog.
- Coded tools perform deterministic inspection and testing.
- OpenShell denies general outbound network access and restricts files, processes, hosts, and ports.
- NemoClaw manages the OpenClaw-in-OpenShell environment and local inference route.
- The local model interprets evidence and drafts explanations.
- MongoDB stores test state, evidence metadata, results, approvals, and audit history locally.

Remote model providers, hosted scanners, public vulnerability feeds, web search, telemetry, and remote APIs are prohibited in the assessment path. Vulnerability checks must use a preloaded, dated advisory snapshot; the report must display its age.

## Execution flow

1. Load a validated `compliance-target.yaml` and confirm its authorized scope.
2. Load `catalog.json` and select applicable checks.
3. Search the local evidence library for an existing ISO/IEC 27001 certificate and supporting audit material.
4. Record certificate subject, ISMS scope, sites, certification body, accreditation details, dates, version, exclusions, and local verification status.
5. If valid evidence covers the current scope, report that evidence and skip duplicate certification-readiness collection as configured. Do not skip ongoing technical monitoring merely because a certificate exists.
6. For uncovered areas, run local technical checks and assemble management-system evidence requests.
7. Preserve tool versions, input hashes, timestamps, scope, raw local evidence references, limitations, and reviewer decisions.
8. Produce a readiness report for human review and, when desired, later assessment by a certification body.

## Required test entry fields

Every test scaffold contains:

- `id`: stable suite identifier
- `title`: original, practical check name
- `type`: manual, automated, or mixed classification
- `applicability`: conditions under which the check is relevant
- `inputs`: locally available records or technical targets
- `localOnlyTool`: the bounded tool behavior, with no remote dependency
- `expectedEvidence`: artifacts the test should preserve or request
- `limitations`: what the result cannot establish

The catalog additionally records the high-level clause or Annex A theme, suite version, standard edition, amendment metadata, runtime policy, and official source URLs.

## Certification and copyright safeguards

- Use an organization-licensed copy of ISO/IEC 27001 for an authoritative assessment.
- Keep licensed ISO content outside prompts, generated catalogs, reports, databases, and model-training material unless the applicable license expressly permits that use.
- Do not ask a model to reproduce or transform protected standard text.
- Have a qualified human map these original readiness checks to the licensed requirements and approve any organization-specific interpretation.
- Describe output as readiness evidence or potential gaps, not certification or an ISO audit opinion.
- Verify certificate status and accreditation through approved evidence or a human-led process; this runtime performs no external lookup.

## Official sources and versions

- [ISO/IEC 27001:2022, Edition 3, published October 2022](https://www.iso.org/standard/27001)
- [ISO/IEC 27001:2022/Amd 1:2024, published February 2024](https://www.iso.org/standard/88435.html)
- [ISO/IEC 27002:2022, Edition 3, published February 2022](https://www.iso.org/standard/75652.html)
- [ISO/IEC 27006-1:2024, Edition 1, published March 2024](https://www.iso.org/standard/82908.html)
- [ISO guidance on certification and accreditation](https://www.iso.org/certification.html)
- [ISO copyright guidance](https://www.iso.org/copyright.html)

Source metadata was reviewed on 2026-09-12. The suite should require source/version review before each release and whenever ISO publishes a revision or amendment.

## Expected local dependencies

The catalog itself requires only a JSON parser. Individual checks may later wrap local software such as an SBOM generator, an offline vulnerability scanner with a preloaded database, a secret scanner, configuration-policy checks, and bounded local network inspection. Each executable and data snapshot must be pinned, inventoried, and usable with networking disabled. No third-party installation is required merely to load this scaffold.
