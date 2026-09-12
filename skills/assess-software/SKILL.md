---
name: assess-software
description: Plan and run local compliance-readiness suites against an approved software target.
---

# Assess software

Use this skill after `discover-software` has produced an operator-reviewed `compliance-target.yaml`.

## Workflow

1. Confirm the target YAML exists and was approved for the requested assessment.
2. Generate a plan before running checks:

   ```bash
   node /workspace/agent-runtime/bin/localproof.mjs plan --target <target-yaml> --suite <suite>
   ```

3. Report tests that will run, require manual evidence, or are blocked.
4. Run one framework suite at a time:

   ```bash
   node /workspace/agent-runtime/bin/localproof.mjs run --target <target-yaml> --suite <suite> --output <results-directory>
   ```

5. Read the generated JSON result. Summarize failures, concerns, missing evidence, skipped checks, and limitations.
6. Preserve raw results as evidence and record the assessment in MongoDB when the persistence tool is available.

Supported suite names are `soc2`, `iso27001`, `security`, `wcag`, and `all`.

## Boundaries

- These are readiness checks and emulated assessment results, not formal certifications.
- Do not download tools, rules, specifications, or dependencies during an assessment.
- Do not call remote APIs or remote inference services.
- Do not execute a target repository's scripts during planning.
- Do not run active checks unless `scope.active_testing` is explicitly `true`.
- Never run tests classified as intrusive.
- Never expand allowed hosts, ports, paths, or credentials beyond the approved target YAML.
- Return `not-run` when a required local tool is unavailable.
