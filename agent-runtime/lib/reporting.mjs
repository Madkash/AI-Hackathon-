const READINESS_LANGUAGE =
  "Readiness forecast only. This report is not a certification, attestation, audit opinion, assurance report, or legal conclusion.";

const GENERAL_LIMITATIONS = [
  READINESS_LANGUAGE,
  "Official SOC 2, ISO 27001, WCAG, and security conclusions depend on qualified human review and the complete operating context.",
  "Automated checks and imported evidence can miss control design, operating effectiveness, production configuration, and scope issues.",
  "Existing evidence is counted only for its reviewed scope, validity window, and declared target match.",
];

const POSITIVE_RESULTS = new Set(["observed", "skipped-covered", "pass", "passed", "covered"]);
const CONCERN_RESULTS = new Set(["error", "not-observed", "not-implemented", "blocked", "not-run", "manual-review"]);
const CONCERN_DISPOSITIONS = new Set(["blocked", "manual-review", "not-implemented"]);

function normalized(value) {
  const text = String(value ?? "").trim().toLowerCase();
  return text || "unknown";
}

function compactText(value) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text || null;
}

function list(value) {
  if (Array.isArray(value)) return value.map(compactText).filter(Boolean);
  const text = compactText(value);
  return text ? [text] : [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function increment(counts, key) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function resultWeight(result) {
  const resultStatus = normalized(result.result);
  const disposition = normalized(result.disposition);

  if (["observed", "pass", "passed", "covered"].includes(resultStatus)) return 1;
  if (resultStatus === "skipped-covered" || disposition === "covered-by-existing-evidence") return 0.85;
  if (resultStatus === "manual-review" || disposition === "manual-review") return 0.25;
  return 0;
}

function concernStatus(result) {
  const resultStatus = normalized(result.result);
  const disposition = normalized(result.disposition);
  if (resultStatus === "not-run" && CONCERN_DISPOSITIONS.has(disposition)) return disposition;
  if (CONCERN_RESULTS.has(resultStatus)) return resultStatus;
  if (CONCERN_DISPOSITIONS.has(disposition)) return disposition;
  return null;
}

function isConcern(result) {
  if (POSITIVE_RESULTS.has(normalized(result.result))) return false;
  if (normalized(result.disposition) === "covered-by-existing-evidence") return false;
  return concernStatus(result) !== null;
}

function severityFor(status, result) {
  const supplied = normalized(result.severity);
  if (["critical", "high", "medium", "low", "info"].includes(supplied)) return supplied;
  if (status === "error") return "high";
  if (status === "not-observed") return "medium";
  if (status === "blocked") return "medium";
  if (status === "not-implemented") return "medium";
  if (status === "manual-review") return "medium";
  return "medium";
}

function confidenceFor(status, result) {
  const supplied = normalized(result.confidence);
  if (["high", "medium", "low"].includes(supplied)) return supplied;
  if (["blocked", "not-implemented", "manual-review"].includes(status)) return "high";
  return "medium";
}

function defaultReason(status) {
  if (status === "error") return "The local test errored before producing usable readiness evidence.";
  if (status === "not-observed") return "Expected readiness evidence was not observed by the local check.";
  if (status === "not-implemented") return "No deterministic local executor is implemented for this check.";
  if (status === "blocked") return "The check was blocked by assessment policy, scope, or target configuration.";
  if (status === "manual-review") return "This item requires qualified human review before readiness can be forecast confidently.";
  if (status === "not-run") return "The check did not run.";
  return "The result requires investigation before it can support readiness.";
}

function recommendedAction(status) {
  if (status === "error") {
    return "Fix the local test setup or target availability, then rerun this check before relying on the forecast.";
  }
  if (status === "not-observed") {
    return "Validate the control manually; if the gap is real, remediate it and rerun the assessment.";
  }
  if (status === "not-implemented") {
    return "Implement a deterministic local executor or attach approved manual evidence for this control.";
  }
  if (status === "blocked") {
    return "Confirm the target YAML authorizes this test, or record the blocked scope as an assessment limitation.";
  }
  if (status === "manual-review") {
    return "Collect and review control evidence, then record an approved human review decision.";
  }
  return "Review the target configuration and rerun the check once prerequisites are in place.";
}

function pointOfConcern(result) {
  const status = concernStatus(result) ?? "unknown";
  const limitations = list(result.limitations);
  return {
    suite: result.suite ?? "unknown",
    id: result.id ?? null,
    title: result.title ?? result.id ?? "Untitled check",
    control: result.control ?? null,
    result: result.result ?? null,
    disposition: result.disposition ?? null,
    severity: severityFor(status, result),
    confidence: confidenceFor(status, result),
    reason: compactText(result.reason) ?? limitations[0] ?? defaultReason(status),
    limitations,
    recommended_action: recommendedAction(status),
  };
}

function suiteForecast({ totalTests, score, concernCounts, positiveCount }) {
  if (totalTests === 0) return "insufficient-data";
  if (concernCounts.gaps > 0) return "likely-gaps";
  if (concernCounts.manualReview > 0) return "needs-human-review";
  if (score >= 80 && positiveCount > 0) return "likely-covered";
  if (positiveCount === 0) return "insufficient-data";
  return "likely-gaps";
}

function overallForecast(summaries) {
  if (summaries.length === 0) return "insufficient-data";
  const labels = new Set(summaries.map((summary) => summary.forecast_label));
  if (labels.has("likely-gaps")) return "likely-gaps";
  if (labels.has("needs-human-review")) return "needs-human-review";
  if (labels.has("insufficient-data")) return "insufficient-data";
  return "likely-covered";
}

function coverageSummary(suite, evidenceCoverage, resultCounts) {
  const decision = evidenceCoverage?.[suite] ?? null;
  const coveredResultCount = resultCounts["skipped-covered"] ?? 0;
  return {
    covered: Boolean(decision?.covered) || coveredResultCount > 0,
    covered_result_count: coveredResultCount,
    evidence_id: decision?.evidence_id ?? null,
    document: decision?.document ?? null,
    issuer: decision?.issuer ?? null,
    scope: decision?.scope ?? null,
    valid_until: decision?.valid_until ?? null,
    period_end: decision?.period_end ?? null,
    reason: decision?.covered ? null : decision?.reason ?? null,
  };
}

function suiteLimitations(results, concerns, coveredEvidence) {
  const resultLimitations = results.flatMap((result) => list(result.limitations));
  const concernLimitations = concerns.flatMap((concern) => concern.limitations);
  const generated = [];
  if (coveredEvidence.covered) {
    generated.push("Existing evidence reduces duplicate readiness work only for its reviewed scope and date window; it does not establish ongoing technical monitoring.");
  }
  if (concerns.some((concern) => concern.result === "not-run" || concern.disposition === "manual-review")) {
    generated.push("Manual-review or not-run items require qualified evaluation before a readiness conclusion can be relied on.");
  }
  if (results.length === 0) {
    generated.push("No assessment results were provided for this suite.");
  }
  return unique([...resultLimitations, ...concernLimitations, ...generated]);
}

function summarizeSuite(suite, results, evidenceCoverage) {
  const resultCounts = {};
  const dispositionCounts = {};
  for (const result of results) {
    increment(resultCounts, normalized(result.result));
    increment(dispositionCounts, normalized(result.disposition));
  }

  const totalTests = results.length;
  const score = totalTests === 0
    ? 0
    : Math.round((results.reduce((sum, result) => sum + resultWeight(result), 0) / totalTests) * 100);
  const concerns = results.filter(isConcern).map(pointOfConcern);
  const coveredEvidence = coverageSummary(suite, evidenceCoverage, resultCounts);
  const concernCounts = concerns.reduce(
    (counts, concern) => {
      if (concern.result === "manual-review" || concern.disposition === "manual-review") counts.manualReview += 1;
      else counts.gaps += 1;
      return counts;
    },
    { gaps: 0, manualReview: 0 },
  );
  const positiveCount = results.filter((result) => resultWeight(result) > 0.8).length;

  return {
    suite,
    total_tests: totalTests,
    counts: {
      result: resultCounts,
      disposition: dispositionCounts,
    },
    covered_evidence: coveredEvidence,
    readiness_score: score,
    forecast_label: suiteForecast({ totalTests, score, concernCounts, positiveCount }),
    points_of_concern: concerns,
    limitations: suiteLimitations(results, concerns, coveredEvidence),
  };
}

function aggregateCounts(summaries, key) {
  return summaries.reduce((aggregate, summary) => {
    for (const [status, count] of Object.entries(summary.counts[key])) {
      aggregate[status] = (aggregate[status] ?? 0) + count;
    }
    return aggregate;
  }, {});
}

export function buildAssessmentReport(assessment = {}) {
  const results = Array.isArray(assessment.results) ? assessment.results : [];
  const evidenceCoverage = assessment.evidence_coverage ?? {};
  const resultSuiteNames = unique(results.map((result) => result.suite ?? "unknown")).sort();
  const suiteNames = resultSuiteNames.length > 0
    ? resultSuiteNames
    : Object.keys(evidenceCoverage).filter((suite) => evidenceCoverage[suite]?.covered).sort();

  const frameworkSummaries = {};
  for (const suite of suiteNames) {
    frameworkSummaries[suite] = summarizeSuite(
      suite,
      results.filter((result) => (result.suite ?? "unknown") === suite),
      evidenceCoverage,
    );
  }

  const summaries = Object.values(frameworkSummaries);
  const pointsOfConcern = summaries.flatMap((summary) => summary.points_of_concern);
  const overallScore = summaries.length === 0
    ? 0
    : Math.round(summaries.reduce((sum, summary) => sum + summary.readiness_score, 0) / summaries.length);

  return {
    schema_version: "1.0",
    classification: "readiness-forecast",
    readiness_language: READINESS_LANGUAGE,
    target: assessment.target ?? null,
    generated_at: assessment.generated_at ?? null,
    source_assessment: {
      run_id: assessment.run_id ?? null,
      status: assessment.status ?? null,
      classification: assessment.classification ?? null,
    },
    overall: {
      readiness_score: overallScore,
      forecast_label: overallForecast(summaries),
      suite_count: summaries.length,
      result_count: results.length,
      concern_count: pointsOfConcern.length,
      counts: {
        result: aggregateCounts(summaries, "result"),
        disposition: aggregateCounts(summaries, "disposition"),
      },
    },
    framework_summaries: frameworkSummaries,
    points_of_concern: pointsOfConcern,
    limitations: unique([
      ...GENERAL_LIMITATIONS,
      ...summaries.flatMap((summary) => summary.limitations),
    ]),
  };
}

export default buildAssessmentReport;
