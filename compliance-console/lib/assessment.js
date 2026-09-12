const suiteDetails = {
  soc2: {
    code: "SOC",
    name: "SOC 2 Type II",
    tone: "violet",
    description: "Security controls and operating evidence",
  },
  iso27001: {
    code: "ISO",
    name: "ISO/IEC 27001",
    tone: "amber",
    description: "ISMS controls, policies, and risk process",
  },
  security: {
    code: "SEC",
    name: "Application Security",
    tone: "blue",
    description: "OWASP-aligned local software checks",
  },
  wcag: {
    code: "A11Y",
    name: "WCAG 2.2",
    tone: "green",
    description: "Automated checks and manual review queue",
  },
};

const suiteOrder = Object.keys(suiteDetails);
const severityRank = { High: 0, Medium: 1, Review: 2, Low: 3 };

function countBy(items, key) {
  return items.reduce((counts, item) => {
    const value = item?.[key] || "unknown";
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function toPercent(value, total) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

// Weights mirror agent-runtime/lib/reporting.mjs's resultWeight() so the console's
// displayed score always matches the score already computed into the persisted
// assessment's `report` field for the same run.
function scoreResult(result) {
  if (["observed", "pass", "passed", "covered"].includes(result.result)) return 1;
  if (result.result === "skipped-covered" || result.disposition === "covered-by-existing-evidence") return 0.85;
  if (result.result === "manual-review" || result.disposition === "manual-review") return 0.25;
  return 0;
}

function forecastFromScore(score, concernCount) {
  if (score >= 80 && concernCount === 0) {
    return {
      label: "Likely ready for review",
      summary: "Forecast only: current local evidence and checks suggest a strong readiness posture, pending formal review.",
    };
  }
  if (score >= 55) {
    return {
      label: "Review advised",
      summary: "Forecast only: several controls appear covered, but open findings or manual-review items remain.",
    };
  }
  return {
    label: "Not yet ready",
    summary: "Forecast only: current local evidence and checks indicate material readiness gaps before formal review.",
  };
}

function frameworkLabel(result) {
  const detail = suiteDetails[result.suite];
  const suiteName = detail?.name || String(result.suite || "Unknown suite").toUpperCase();
  return result.control ? `${suiteName} · ${result.control}` : suiteName;
}

function concernSeverity(result) {
  if (result.result === "error" || result.result === "not-observed") return "High";
  if (result.disposition === "blocked") return "High";
  if (result.result === "not-implemented") return "Medium";
  if (result.disposition === "manual-review" || result.result === "not-run") return "Review";
  return "Medium";
}

function concernSource(result) {
  if (Array.isArray(result.limitations) && result.limitations.length > 0) return result.limitations[0];
  if (result.reason) return result.reason;
  if (result.handler) return `${result.handler} readiness check`;
  return "Assessment result";
}

function isConcern(result) {
  if (!result) return false;
  if (result.result === "observed" || result.result === "skipped-covered") return false;
  if (result.disposition === "covered-by-existing-evidence") return false;
  return true;
}

function topConcerns(results) {
  return results
    .filter(isConcern)
    .map((result) => ({
      severity: concernSeverity(result),
      title: result.title || result.id || "Untitled readiness check",
      framework: frameworkLabel(result),
      source: concernSource(result),
      result: result.result || "unknown",
      disposition: result.disposition || "unknown",
    }))
    .sort((left, right) => {
      const bySeverity = severityRank[left.severity] - severityRank[right.severity];
      if (bySeverity !== 0) return bySeverity;
      return left.title.localeCompare(right.title);
    })
    .slice(0, 5);
}

function normalizeCoverage(rawCoverage = {}) {
  return suiteOrder.map((suite) => {
    const coverage = rawCoverage[suite] || {};
    return {
      suite,
      name: suiteDetails[suite].name,
      covered: coverage.covered === true,
      evidence_id: coverage.evidence_id || null,
      document: coverage.document || null,
      issuer: coverage.issuer || null,
      valid_until: coverage.valid_until || null,
      period_end: coverage.period_end || null,
      reason: coverage.reason || (coverage.covered ? null : "No approved evidence coverage recorded for this suite"),
    };
  });
}

function suiteCards(results, coverageBySuite) {
  return suiteOrder.map((suite) => {
    const detail = suiteDetails[suite];
    const suiteResults = results.filter((result) => result.suite === suite);
    const coveredChecks = suiteResults.filter((result) =>
      result.result === "observed" || result.result === "skipped-covered"
    ).length;
    const concernCount = suiteResults.filter(isConcern).length;
    const coverage = coverageBySuite.find((entry) => entry.suite === suite);
    const progress = coverage?.covered ? 100 : toPercent(coveredChecks, suiteResults.length);
    const status = coverage?.covered
      ? "Evidence covered"
      : concernCount > 0
        ? `${concernCount} review items`
        : suiteResults.length > 0
          ? "No open concerns"
          : "No run data";

    return {
      suite,
      ...detail,
      status,
      progress,
      totalChecks: suiteResults.length,
      coveredChecks,
      concernCount,
      evidence: coverage || null,
    };
  });
}

export function normalizeAssessmentRun(run, { fallback = false, services, note } = {}) {
  const results = Array.isArray(run?.results) ? run.results : [];
  const concerns = topConcerns(results);
  const score = results.length > 0
    ? Math.round((results.reduce((total, result) => total + scoreResult(result), 0) / results.length) * 100)
    : 0;
  const coverageBySuite = normalizeCoverage(run?.evidence_coverage);

  return {
    fallback,
    note: note || null,
    services: {
      app: "available",
      mongodb: fallback ? "unavailable" : "available",
      inference: "configured-by-nemoclaw",
      ...(services || {}),
    },
    latest_target: {
      name: run?.target?.name || "Unknown target",
      version: run?.target?.version || "unknown",
      source_path: run?.target?.source_path || null,
    },
    generated_at: run?.generated_at || null,
    run_id: run?.run_id || null,
    classification: run?.classification || "readiness-assessment",
    evidence_coverage: coverageBySuite,
    counts: {
      total: results.length,
      by_result: countBy(results, "result"),
      by_disposition: countBy(results, "disposition"),
    },
    suites: suiteCards(results, coverageBySuite),
    concerns,
    forecast: {
      score,
      ...forecastFromScore(score, concerns.length),
    },
  };
}

export function demoAssessmentSnapshot({ services, note } = {}) {
  return normalizeAssessmentRun({
    run_id: "demo-fallback",
    classification: "readiness-assessment",
    generated_at: new Date().toISOString(),
    target: {
      name: "Example Next.js Storefront",
      version: "demo-abc123",
      source_path: "../examples/nextjs-storefront",
    },
    evidence_coverage: {
      soc2: {
        covered: false,
        reason: "No persisted SOC 2 run is available in MongoDB",
      },
      iso27001: {
        covered: true,
        evidence_id: "demo-iso27001",
        document: "evidence-document.example.txt",
        issuer: "Demo Certification Body",
        valid_until: "2027-09-30",
      },
    },
    results: [
      {
        suite: "soc2",
        id: "soc2-cc6-session-timeout",
        title: "Administrator session idle timeout evidence",
        control: "CC6.1",
        disposition: "manual-review",
        result: "not-run",
        handler: "manual",
        reason: "Formal control operation evidence requires reviewer approval",
      },
      {
        suite: "iso27001",
        id: "iso27001-existing-certificate",
        title: "Approved ISO 27001 certificate covers the local target",
        control: "ISO 27001",
        disposition: "covered-by-existing-evidence",
        result: "skipped-covered",
      },
      {
        suite: "security",
        id: "security-local-http-health",
        title: "Local HTTP health endpoint responds successfully",
        control: "OWASP ASVS readiness",
        disposition: "ready",
        result: "observed",
        handler: "local-http",
      },
      {
        suite: "security",
        id: "security-secret-scan",
        title: "Secret scanning adapter",
        control: "Secure development",
        disposition: "ready",
        result: "not-implemented",
        handler: "unimplemented",
        limitations: ["Secret scanning adapter has not been wired into this console slice"],
      },
      {
        suite: "wcag",
        id: "wcag-focus-visible",
        title: "Keyboard focus indicator remains visible",
        control: "2.4.11",
        disposition: "ready",
        result: "not-observed",
        handler: "browser-check",
        limitations: ["Demo data shows a likely focus visibility issue for readiness forecasting"],
      },
      {
        suite: "wcag",
        id: "wcag-alt-text",
        title: "Images include accessible alternatives",
        control: "1.1.1",
        disposition: "ready",
        result: "observed",
        handler: "browser-check",
      },
    ],
  }, {
    fallback: true,
    services: {
      app: "available",
      mongodb: "fallback",
      inference: "configured-by-nemoclaw",
      ...(services || {}),
    },
    note: note || "Showing fallback readiness data because no persisted assessment run is available.",
  });
}
