# Compliance suite catalog

The four catalogs contain 128 readiness checks that OpenClaw can plan and dispatch through the local LocalProof runner.

| Suite | Checks | Purpose |
| --- | ---: | --- |
| SOC 2 | 19 | Evidence and technical readiness mapped to AICPA Trust Services Criteria |
| ISO/IEC 27001 | 29 | ISMS and control readiness using original, non-normative check descriptions |
| Application security | 25 | OWASP ASVS 5.0.0 and WSTG 4.2 security testing contracts |
| WCAG 2.2 A/AA | 55 | Automated readiness observations and required manual accessibility review |

The catalogs are test contracts. `agent-runtime/bin/localproof.mjs` normalizes their source formats, validates them against `catalog.schema.json`, enforces the target allowlist, and invokes implemented deterministic adapters. Unimplemented or unavailable tools return explicit states instead of downloading software during an assessment.

Initial adapters cover file presence, source-pattern inspection, and bounded local HTTP observations. They provide 11 executable checks across the four suites. The rest remain visible as implementation or human-review work, so OpenClaw can produce a complete plan without overstating coverage.

```bash
cd agent-runtime
node bin/localproof.mjs plan --target ../examples/localproof-console-target.yaml --suite all
node bin/localproof.mjs run --target ../examples/localproof-console-target.yaml --suite all --output ../examples/results
```

Outputs are readiness evidence. A licensed CPA firm must conduct a SOC 2 Type II examination, an appropriate certification body must issue ISO/IEC 27001 certification, qualified testers must interpret penetration-test results, and automated tools alone cannot establish WCAG conformance.
