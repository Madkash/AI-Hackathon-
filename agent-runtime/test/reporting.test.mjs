import assert from "node:assert/strict";
import test from "node:test";
import { buildAssessmentReport } from "../lib/reporting.mjs";

function assessment(overrides = {}) {
  return {
    run_id: "run-1",
    status: "completed",
    classification: "readiness-assessment",
    target: { name: "localproof-console", version: "0.1.0" },
    generated_at: "2026-09-12T16:00:00.000Z",
    evidence_coverage: {},
    results: [],
    ...overrides,
  };
}

test("buildAssessmentReport treats observed checks and skipped approved evidence as likely covered", () => {
  const report = buildAssessmentReport(assessment({
    evidence_coverage: {
      soc2: {
        covered: true,
        evidence_id: "evidence-1",
        document: "soc2-report.txt",
        issuer: "Example CPA Firm",
        period_end: "2026-08-31",
      },
    },
    results: [
      {
        suite: "soc2",
        id: "soc2-cc-1",
        title: "Access control review",
        disposition: "ready",
        result: "observed",
        evidence: [{ type: "file", path: "policy.md" }],
      },
      {
        suite: "soc2",
        id: "soc2-cc-2",
        title: "Change management review",
        disposition: "covered-by-existing-evidence",
        result: "skipped-covered",
        limitations: ["Existing evidence does not prove current runtime configuration"],
      },
    ],
  }));

  assert.equal(report.classification, "readiness-forecast");
  assert.match(report.readiness_language, /Readiness forecast only/);
  assert.match(report.readiness_language, /not a certification/);
  assert.equal(report.framework_summaries.soc2.readiness_score, 93);
  assert.equal(report.framework_summaries.soc2.forecast_label, "likely-covered");
  assert.equal(report.framework_summaries.soc2.covered_evidence.covered, true);
  assert.equal(report.framework_summaries.soc2.covered_evidence.covered_result_count, 1);
  assert.deepEqual(report.points_of_concern, []);
  assert.equal(report.overall.forecast_label, "likely-covered");
});

test("buildAssessmentReport reports hard gaps as points of concern", () => {
  const report = buildAssessmentReport(assessment({
    results: [
      {
        suite: "security",
        id: "sec-headers",
        title: "Security headers",
        disposition: "ready",
        result: "observed",
      },
      {
        suite: "security",
        id: "sec-secrets",
        title: "Secret scanning",
        disposition: "ready",
        result: "not-observed",
        limitations: ["The source-pattern check did not find a configured secret scanner"],
      },
      {
        suite: "security",
        id: "sec-sca",
        title: "Dependency vulnerability scanning",
        disposition: "ready",
        result: "not-implemented",
      },
      {
        suite: "security",
        id: "sec-runtime",
        title: "Runtime probe",
        disposition: "ready",
        result: "error",
        limitations: ["Connection refused"],
      },
    ],
  }));

  const summary = report.framework_summaries.security;
  assert.equal(summary.readiness_score, 25);
  assert.equal(summary.forecast_label, "likely-gaps");
  assert.equal(summary.counts.result.observed, 1);
  assert.equal(summary.counts.result["not-observed"], 1);
  assert.equal(summary.counts.result["not-implemented"], 1);
  assert.equal(summary.counts.result.error, 1);
  assert.equal(report.points_of_concern.length, 3);
  assert.deepEqual(
    report.points_of_concern.map((concern) => concern.id),
    ["sec-secrets", "sec-sca", "sec-runtime"],
  );
  assert.equal(report.points_of_concern.find((concern) => concern.id === "sec-runtime").severity, "high");
  assert.match(
    report.points_of_concern.find((concern) => concern.id === "sec-sca").recommended_action,
    /Implement a deterministic local executor/,
  );
  assert.equal(report.overall.forecast_label, "likely-gaps");
});

test("manual review gates a suite even when other checks are observed", () => {
  const report = buildAssessmentReport(assessment({
    results: [
      {
        suite: "iso27001",
        id: "iso-a5",
        title: "Policy evidence",
        disposition: "ready",
        result: "observed",
      },
      {
        suite: "iso27001",
        id: "iso-a6",
        title: "Management review",
        disposition: "manual-review",
        reason: "This requirement cannot be established by an automated software check",
        result: "not-run",
      },
    ],
  }));

  const summary = report.framework_summaries.iso27001;
  assert.equal(summary.readiness_score, 63);
  assert.equal(summary.forecast_label, "needs-human-review");
  assert.equal(summary.points_of_concern.length, 1);
  assert.equal(summary.points_of_concern[0].confidence, "high");
  assert.match(summary.points_of_concern[0].recommended_action, /Collect and review control evidence/);
  assert.equal(report.overall.forecast_label, "needs-human-review");
});

test("overall forecast is conservative across suites", () => {
  const report = buildAssessmentReport(assessment({
    results: [
      {
        suite: "soc2",
        id: "soc2-1",
        title: "SOC 2 covered evidence",
        disposition: "covered-by-existing-evidence",
        result: "skipped-covered",
      },
      {
        suite: "wcag",
        id: "wcag-1",
        title: "Image alternatives",
        disposition: "ready",
        result: "not-observed",
      },
    ],
  }));

  assert.equal(report.framework_summaries.soc2.forecast_label, "likely-covered");
  assert.equal(report.framework_summaries.wcag.forecast_label, "likely-gaps");
  assert.equal(report.overall.readiness_score, 43);
  assert.equal(report.overall.forecast_label, "likely-gaps");
});

test("empty assessment output remains insufficient data", () => {
  const report = buildAssessmentReport(assessment());

  assert.equal(report.overall.readiness_score, 0);
  assert.equal(report.overall.forecast_label, "insufficient-data");
  assert.equal(report.overall.result_count, 0);
  assert.deepEqual(report.framework_summaries, {});
  assert.equal(report.points_of_concern.length, 0);
});

test("suite-specific reports do not score unrelated evidence-only suites", () => {
  const report = buildAssessmentReport(assessment({
    evidence_coverage: {
      soc2: { covered: false, reason: "No approved, scope-matched evidence" },
      iso27001: { covered: true, evidence_id: "iso-cert", document: "iso.txt" },
    },
    results: [
      {
        suite: "soc2",
        id: "soc2-1",
        title: "SOC 2 source check",
        disposition: "ready",
        result: "observed",
      },
    ],
  }));

  assert.deepEqual(Object.keys(report.framework_summaries), ["soc2"]);
  assert.equal(report.overall.suite_count, 1);
  assert.equal(report.overall.readiness_score, 100);
});
