# Local Software Compliance Readiness Agent

## Objective

Build an always-on, local agent that evaluates a software product against requirements drawn from official specifications and uploaded qualification documents.

The first supported assessment areas are:

- SOC 2 Type II readiness
- ISO/IEC 27001 readiness
- Application penetration testing
- WCAG accessibility conformance

All inference runs locally on the Dell Pro Max with GB10. OpenClaw orchestrates the workflow, OpenShell restricts the agent's access, NemoClaw manages the OpenClaw and OpenShell environment, and MongoDB stores targets, evidence, findings, and workflow state.

## Product boundary

This system provides readiness assessments, technical test results, evidence collection, gap analysis, and draft auditor-style responses.

It does not issue:

- A SOC 2 report, which requires an independent CPA examination
- An ISO/IEC 27001 certificate, which requires an accredited certification body
- A formal third-party penetration-test attestation
- A guarantee of WCAG conformance based only on automated testing

Reports must label simulated or agent-generated conclusions as **readiness findings** or **emulated assessment results**.

## Authoritative sources

Every assessment rule must identify its source, version, control identifier, and retrieval date. Initial sources:

- [AICPA SOC resources](https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2)
- [ISO/IEC 27001](https://www.iso.org/standard/27001)
- [OWASP Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/)
- [OWASP Web Security Testing Guide](https://owasp.org/www-project-web-security-testing-guide/stable/)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

Downloaded specifications and control catalogs are stored locally before assessment. Production runs make no external API or inference calls.

## End-to-end workflow

1. Register the software and its authorized assessment scope.
2. Discover how the software is built, started, accessed, and authenticated.
3. Generate and validate `compliance-target.yaml`.
4. Import qualification requirements from official specifications and customer documents.
5. Search the local evidence library for existing certifications and assessment reports.
6. Verify each artifact's scope, issuer, period, expiration, and applicability.
7. Skip covered assessment work when valid evidence already exists, while reporting the artifact details.
8. Run readiness checks for missing, expired, out-of-scope, or incomplete qualifications.
9. Use specialized subagents to perform authorized software tests.
10. Validate and deduplicate findings.
11. Produce results, evidence, concerns, limitations, and recommended next actions.
12. Save the assessment and continue monitoring for software, evidence, or specification changes.

## Certification and evidence decision

Existing evidence is not accepted solely because a certificate file exists. The agent checks:

- Correct organization and product
- Systems and locations included in scope
- Issuer or auditor identity
- Audit or certification period
- Expiration or renewal date
- Included criteria or controls
- Exceptions, exclusions, and qualifications
- Whether the current software version is materially different

Possible decisions are:

- `covered`: valid evidence covers the requirement; skip duplicate testing
- `partially-covered`: evidence exists but scope or criteria are incomplete
- `expired`: evidence is no longer current
- `unverified`: authenticity or applicability cannot be established locally
- `not-covered`: no relevant evidence exists

Technical tests may still run when they provide ongoing assurance, but the report must distinguish them from formal certification.

## Specialized assessment agents

- **Requirements agent:** extracts and normalizes controls from specifications and uploaded documents.
- **Evidence agent:** locates existing reports and determines whether they cover the target.
- **SOC 2 readiness agent:** evaluates control descriptions and operating evidence.
- **ISO 27001 readiness agent:** evaluates the ISMS, risk process, policies, and control evidence.
- **Attack-surface agent:** maps authorized web, API, source, container, and network interfaces.
- **Authentication agent:** tests authentication and session controls.
- **Authorization agent:** tests role and object-level access controls.
- **Input-validation agent:** checks common injection and unsafe-input weaknesses.
- **Configuration agent:** checks dependencies, secrets, headers, containers, and deployment settings.
- **WCAG agent:** combines automated accessibility checks with a queue for required manual checks.
- **Validation agent:** reproduces important findings, removes duplicates, and checks evidence quality.
- **Reporting agent:** maps findings to requirements and generates the final readiness report.

Subagents use deterministic tools for observations and the local model for planning, interpretation, and explanation. Active tests run only against explicitly authorized targets and within declared limits.

## Required outputs

For each framework or qualification, return:

- Existing certification or report details
- Applicable requirements and controls
- Tests performed, skipped, unsupported, or requiring manual review
- Result and supporting evidence for each test
- Potential problems and notable concerns
- Severity, confidence, and affected component
- False-positive or uncertainty notes
- Recommended remediation
- Formal steps still requiring an auditor, certification body, specialist, or human reviewer
- Assessment scope, limitations, tool versions, model version, and timestamps

---

# Phase 1: Discover the Software and Generate YAML

## Goal

The discovery agent investigates the supplied software and creates a machine-readable `compliance-target.yaml` describing how approved tools can build, start, access, authenticate to, and test it.

The YAML is configuration consumed by coded tools. It is not a substitute for those tools and must not contain guessed credentials or unverified commands.

## Minimum input

The operator supplies:

- A local source repository, packaged application, or running local target
- Written authorization and boundaries for testing
- A staging environment or permission to create one
- Test accounts when authenticated behavior must be assessed
- Available architecture, API, deployment, and compliance documents

## Discovery workflow

### 1. Create an isolated inspection workspace

Copy or mount the target read-only where possible. Record a content hash or source revision so the generated YAML can be tied to the inspected software version.

### 2. Inventory known project artifacts

Inspect standard files before using model inference, including:

- `README` and developer documentation
- `Dockerfile` and Compose files
- Package and dependency manifests
- Build and task configuration
- Environment-variable examples
- OpenAPI or GraphQL schemas
- Application routes and entry points
- Infrastructure configuration
- Test configuration
- Existing security and accessibility reports

### 3. Identify the target types

Classify each component as one or more of:

- Web application
- REST or GraphQL API
- Source repository
- Container image
- Command-line application
- Desktop or mobile application
- Infrastructure configuration
- Database or message-driven service
- Compliance-document collection

Unsupported component types remain explicitly marked as unsupported.

### 4. Determine startup and health checks

Derive candidate build, start, stop, reset, and health-check operations from repository evidence. Prefer declared scripts and Compose services over agent-generated shell commands.

Commands are initially marked `proposed`. A validator executes them in an isolated environment and marks them `verified` only after successful startup and shutdown.

### 5. Discover interfaces

Identify local URLs, ports, API schemas, browser entry points, user roles, expected protocols, and dependencies. Verify each interface against the running staging target when available.

### 6. Determine authentication requirements

Identify required test roles without storing secrets in YAML. Reference environment-variable names or a local credential identifier:

```yaml
authentication:
  accounts:
    - role: administrator
      username_env: TEST_ADMIN_USERNAME
      password_env: TEST_ADMIN_PASSWORD
```

### 7. Establish assessment boundaries

Generate a deny-by-default scope containing:

- Allowed hosts, ports, paths, and repositories
- Excluded endpoints and destructive operations
- Request-rate and concurrency limits
- Permitted test accounts
- Data-reset procedure
- Whether active testing is allowed
- Filesystem read and write boundaries
- Network destinations

The agent cannot expand this scope on its own.

### 8. Generate the YAML

Every inferred field includes provenance, confidence, and validation status. Unknown information remains `null` or appears in `unresolved`; it is never invented.

The tool writes this draft as `compliance-target.generated.yaml`. It becomes the approved `compliance-target.yaml` only after the operator review in step 10.

### 9. Validate the YAML

Validation has three layers:

1. Schema validation checks types, required fields, and allowed values.
2. Safety validation rejects unrestricted hosts, embedded secrets, destructive commands, and missing limits.
3. Runtime validation confirms approved startup commands, health checks, interfaces, and test accounts.

### 10. Present for operator review

The operator reviews the generated scope and unresolved questions before active penetration testing begins. Read-only source, document, and configuration analysis may run before that approval when already authorized.

## Proposed YAML format

```yaml
schema_version: "1.0"

target:
  name: "Acme Platform"
  version: "git:abc123"
  environment: "isolated-staging"
  source_path: "/workspace/targets/acme"

components:
  - id: "web"
    type: "web-application"
    framework: "react"
    confidence: 0.96
    provenance: "package.json"

deployment:
  method: "docker-compose"
  compose_file: "docker-compose.yml"
  commands:
    start:
      value: "docker compose up -d"
      status: "proposed"
    stop:
      value: "docker compose down"
      status: "proposed"
  healthcheck:
    url: "http://acme-app:3000/health"
    status: "unverified"

interfaces:
  web:
    base_url: "http://acme-app:3000"
  api:
    base_url: "http://acme-api:8080"
    specification: "docs/openapi.yaml"

authentication:
  accounts:
    - role: "standard-user"
      username_env: "TEST_USER_USERNAME"
      password_env: "TEST_USER_PASSWORD"
    - role: "administrator"
      username_env: "TEST_ADMIN_USERNAME"
      password_env: "TEST_ADMIN_PASSWORD"

artifacts:
  source: true
  containers: true
  api_specification: true
  compliance_documents: "evidence/"

assessments:
  soc2_readiness: true
  iso27001_readiness: true
  penetration_test: true
  wcag: true

scope:
  active_testing: true
  allowed_hosts:
    - "acme-app"
    - "acme-api"
  allowed_ports:
    - 3000
    - 8080
  excluded_paths:
    - "/admin/destructive-reset"
  maximum_requests_per_second: 5
  maximum_concurrent_requests: 2

data_handling:
  external_network: "deny"
  use_synthetic_test_data: true
  retain_raw_responses: false
  secrets_in_manifest: "forbidden"

discovery:
  generated_at: "YYYY-MM-DDTHH:MM:SSZ"
  generated_by: "target-discovery-agent"
  source_revision: "abc123"
  unresolved:
    - "Confirm whether administrator tests may modify user roles"
```

## Discovery implementation components

- A filesystem and repository inspector
- Parsers for package manifests, Dockerfiles, Compose, OpenAPI, GraphQL, and environment examples
- A framework and component detector
- A local port and health-check verifier
- A secrets detector that prevents secret values from entering YAML
- A YAML generator
- A JSON Schema validator for the YAML contract
- An OpenShell policy generator derived from the approved scope
- A provenance recorder stored in MongoDB

## Phase 1 completion criteria

Phase 1 is complete when:

- The target software version is identified.
- Supported components and interfaces are listed.
- Startup and health-check methods are verified or clearly unresolved.
- Authentication roles are defined through secret references.
- Active-test boundaries are explicit and deny by default.
- Every inferred value has provenance and confidence.
- The YAML passes schema and safety validation.
- Unsupported and unresolved areas are visible to the operator.

## Current implementation status

The target discovery skill, YAML generator, catalog schema, and headless suite runner (the LocalProof CLI) are now scaffolded. OpenClaw can inspect a repository, propose `compliance-target.yaml`, validate the offline execution policy, plan applicable checks, and run the implemented deterministic adapters.

The next implementation work is to add adapters for Playwright/axe-core, OWASP ZAP, Semgrep, Gitleaks, Syft, and an offline vulnerability scanner, then persist normalized evidence and review decisions in local MongoDB.

---

## Optional Next.js console scaffold

The operator console is implemented in `compliance-console/` as a local Next.js application. It is optional: the primary OpenClaw interface is the headless runtime in `agent-runtime/` and the skills in `skills/`.

Its responsibilities are:

- Select an authorized software target.
- Invoke the read-only discovery tool through a restricted local route.
- Display the proposed `compliance-target.yaml` and unresolved items.
- Present framework readiness, evidence coverage, findings, and agent activity.
- Connect to local MongoDB for persistent assessment state.
- Provide a future review and approval surface for active tests.

The application includes:

- `app/page.js`: compliance dashboard and discovery interface
- `app/api/discovery/route.js`: constrained adapter to the discovery CLI
- `app/api/status/route.js`: local service health reporting
- `lib/mongodb.js`: local MongoDB connection helper
- `Dockerfile`: production Next.js image
- `docker-compose.yml`: console and MongoDB on an internal network

The required-stack deployment model is:

```text
Dell Pro Max with GB10
├── Next.js compliance console
├── Local MongoDB
├── Locally hosted assessment target
├── Local inference service
└── NemoClaw-managed OpenShell sandbox
    └── OpenClaw
        └── discover-software and assess-software skills, plus the LocalProof CLI
```

NemoClaw and OpenShell do not run inside the Next.js application. NemoClaw provisions the agent sandbox separately. The console, target software, MongoDB, and local inference services are exposed to that sandbox only through explicitly permitted local routes.

The discovery API accepts only child directories of `TARGETS_ROOT`, mounts example targets read-only in Docker, does not execute target code, and writes generated YAML to a separate output volume.

## OpenClaw-first assessment runtime

OpenClaw uses the `assess-software` skill, driving that headless runtime, to:

1. Load an approved `compliance-target.yaml`.
2. Ask the CLI to plan one framework suite or all suites.
3. Separate local automated checks, assisted evidence checks, manual review, blocked active tests, and unavailable implementations.
4. Run only tests allowed by the target scope.
5. Read compact JSON evidence and explain important results.
6. Persist results to MongoDB when the persistence adapter is connected.

Framework catalogs live in:

- `compliance-suites/soc2/`
- `compliance-suites/iso27001/`
- `compliance-suites/security/`
- `compliance-suites/wcag/`

The catalogs contain 128 readiness checks in total. They are grouped by compliance area and record official source identifiers, applicability, expected evidence, local tool requirements, and limitations.

The CLI never downloads a missing tool. It returns `not-run` or `not-implemented`, allowing OpenClaw to explain the missing capability without silently weakening the assessment.
