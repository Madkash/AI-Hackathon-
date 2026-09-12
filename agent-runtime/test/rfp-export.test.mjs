import assert from "node:assert/strict";
import test from "node:test";
import { buildRfpSecuritySummary, classifyRfpResult, findRfpSafetyIssues } from "../lib/rfp-export.mjs";

function assessment(overrides = {}) {
  return {
    run_id: "run-rfp-1",
    status: "completed",
    classification: "readiness-assessment",
    target: { name: "localproof-console", version: "0.1.0" },
    generated_at: "2026-09-12T16:00:00.000Z",
    evidence_coverage: {
      soc2: {
        covered: true,
        evidence_id: "sha256-should-not-export",
        document: "full-soc2-report.pdf",
        issuer: "Example CPA Firm",
        scope: "Development and operation of the LocalProof software service",
        period_end: "2026-08-31",
      },
      iso27001: {
        covered: false,
        reason: "No approved, scope-matched evidence with verified issuing authority",
      },
    },
    results: [
      {
        suite: "security",
        id: "SEC-CONF-002",
        title: "Detect secrets in source and build artifacts",
        handler: "gitleaks",
        disposition: "ready",
        result: "not-observed",
        evidence: [{
          type: "cli-security-tool",
          tool: "gitleaks",
          sample: [{ file: "src/app.js", start_line: 12, secret: "AKIA-SHOULD-NOT-EXPORT" }],
          stdout_sample: "api_key=super-secret-value",
        }],
      },
      {
        suite: "security",
        id: "SEC-SESS-001",
        title: "Inspect session cookie attributes",
        handler: "local-http",
        disposition: "ready",
        result: "not-observed",
        evidence: [{
          type: "local-http",
          url: "http://localhost:3000/",
          headers: { "set-cookie": "session=secret" },
          observations: { cookie_flags: [{ name: "session", secure: false }] },
          violations: ["cookie-flags"],
        }],
      },
      {
        suite: "security",
        id: "SEC-AS-002",
        title: "Enumerate local services and administrative interfaces",
        handler: "local-tcp-probe",
        disposition: "ready",
        result: "observed",
        evidence: [{ type: "local-tcp-probe", host: "admin.internal", port: 8080, state: "open" }],
      },
      {
        suite: "wcag",
        id: "1.1.1",
        title: "Non-text Content",
        handler: "axe-cli",
        disposition: "ready",
        result: "observed",
        evidence: [{
          type: "cli-security-tool",
          counts: { violations: 0, passes: 3 },
        }],
      },
    ],
    ...overrides,
  };
}

test("buildRfpSecuritySummary creates a buyer-safe summary without raw assessment details", () => {
  const summary = buildRfpSecuritySummary(assessment(), {
    approval_status: "approved-for-rfp",
    approved_by: "security-owner",
    approved_at: "2026-09-12T17:00:00.000Z",
  });

  assert.equal(summary.classification, "rfp-security-summary");
  assert.equal(summary.audience_tier, "public-rfp");
  assert.equal(summary.formal_evidence[0].kind, "soc2-type2-report");
  assert.equal(summary.formal_evidence[0].artifact_tier, "nda-rfp");
  assert.equal(summary.formal_evidence[0].evidence_id, undefined);
  assert.equal(summary.formal_evidence[0].document, undefined);
  assert.equal(summary.approval.status, "approved-for-rfp");

  const secretSummary = summary.technical_testing.find((item) => item.category === "secret-scanning");
  assert.equal(secretSummary.remediation_status.open, 1);
  assert.equal(secretSummary.audience_tier, "internal-only");

  const serialized = JSON.stringify(summary);
  assert.doesNotMatch(serialized, /src\/app\.js/);
  assert.doesNotMatch(serialized, /AKIA-SHOULD-NOT-EXPORT/);
  assert.doesNotMatch(serialized, /super-secret-value/);
  assert.doesNotMatch(serialized, /localhost:3000/);
  assert.doesNotMatch(serialized, /admin\.internal/);
  assert.doesNotMatch(serialized, /stdout_sample/);
  assert.doesNotMatch(serialized, /set-cookie/i);
  assert.deepEqual(findRfpSafetyIssues(summary), []);
});

test("classifyRfpResult defaults unknown and sensitive result types away from public sharing", () => {
  assert.deepEqual(
    classifyRfpResult({ suite: "custom", id: "CUSTOM-001", title: "New raw tool", result: "observed" }),
    { tier: "internal-only", category: "custom-readiness" },
  );
  assert.equal(
    classifyRfpResult({ suite: "security", handler: "semgrep", title: "SAST finding" }).tier,
    "internal-only",
  );
  assert.equal(
    classifyRfpResult({ suite: "security", handler: "grype", title: "Dependency vulnerability scan" }).tier,
    "nda-rfp",
  );
  assert.equal(
    classifyRfpResult({ suite: "soc2", disposition: "covered-by-existing-evidence" }).tier,
    "public-rfp",
  );
});

test("findRfpSafetyIssues flags accidental raw-detail leaks", () => {
  const issues = findRfpSafetyIssues({
    classification: "rfp-security-summary",
    safe: "summary only",
    nested: {
      stdout_sample: "api_key=super-secret-value",
      host: "admin.internal",
      location: "http://localhost:3000/admin",
    },
  });

  assert.ok(issues.some((issue) => issue.includes("stdout_sample")));
  assert.ok(issues.some((issue) => issue.includes("secret")));
  assert.ok(issues.some((issue) => issue.includes("host")));
});
