---
name: assess-software
description: Plan and run local compliance-readiness suites against an approved software target.
---

# Assess software

Use this skill after `discover-software` has produced an operator-reviewed `compliance-target.yaml`.

## Workflow

1. Confirm the target YAML exists and was approved for the requested assessment.
2. Search the configured local evidence library for SOC 2 Type II reports and ISO/IEC 27001 certificates. Import new documents with the local evidence tool. Treat automatic extraction as `needs-review` until scope, target identity, issuer, and dates are approved.

   ```bash
   node /workspace/agent-runtime/bin/evidence.mjs import --target <target-yaml> --document <local-document> --metadata <reviewed-metadata> --library <evidence-library>
   ```

3. Generate a plan before running checks:

   ```bash
   node /workspace/agent-runtime/bin/localproof.mjs plan --target <target-yaml> --suite <suite> --evidence-library <evidence-library>
   ```

4. Report tests that will run, require manual evidence, are covered by approved evidence, or are blocked.
5. Run one framework suite at a time:

   ```bash
   node /workspace/agent-runtime/bin/localproof.mjs run --target <target-yaml> --suite <suite> --evidence-library <evidence-library> --output <results-directory>
   ```

6. Read the generated JSON result. Summarize failures, concerns, missing evidence, covered checks, skipped checks, and limitations.
7. Preserve raw results as evidence. When `MONGODB_URI` is configured, confirm the target, evidence, assessment, and individual test results were stored locally.

Supported suite names are `soc2`, `iso27001`, `security`, `wcag`, and `all`.

## Boundaries

- These are readiness checks and emulated assessment results, not formal certifications.
- Do not download tools, rules, specifications, or dependencies during an assessment.
- Do not call remote APIs or remote inference services.
- Do not execute a target repository's scripts during planning.
- Do not run active checks unless `scope.active_testing` is explicitly `true`.
- Never run tests classified as intrusive.
- Never expand allowed hosts, ports, paths, or credentials beyond the approved target YAML.
- Never approve evidence based only on model output; approval must be represented in reviewed metadata.
- Continue automated technical monitoring when formal evidence covers a readiness suite.
- Return `not-run` when a required local tool is unavailable.
