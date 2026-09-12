import { buildAssessmentReport } from "./reporting.mjs";

export const RFP_READINESS_LIMITATION =
  "Readiness forecast only. This report is not a certification, attestation, audit opinion, assurance report, penetration-test attestation, or legal conclusion.";

const VALID_TIERS = new Set(["public-rfp", "nda-rfp", "restricted-buyer-review", "internal-only"]);
const POSITIVE_RESULTS = new Set(["observed", "skipped-covered", "pass", "passed", "covered"]);
const REVIEW_RESULTS = new Set(["manual-review", "not-run", "blocked"]);
const GAP_RESULTS = new Set(["not-observed", "not-implemented", "error"]);
const VALID_SEVERITIES = new Set(["critical", "high", "medium", "low", "info"]);
const RAW_FIELD_NAMES = new Set([
  "args",
  "command",
  "evidence",
  "headers",
  "host",
  "line",
  "observations",
  "path",
  "port",
  "request",
  "response",
  "sample",
  "source_path",
  "stderr_sample",
  "stdout_sample",
  "url",
  "violations",
]);

const SECRET_VALUE_PATTERNS = [
  /(?:api[_-]?key|access[_-]?token|authorization|bearer|client[_-]?secret|credential|password|private[_-]?key|secret|session[_-]?token|token)\s*[:=]\s*["']?[^"',;\s]{8,}/i,
  /authorization\s*:\s*bearer\s+[a-z0-9._~+/=-]+/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\bAKIA[0-9A-Z]{12,}\b/,
];

const LOCATION_PATTERNS = [
  /\bhttps?:\/\/[^\s"']+/i,
  /\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0|[a-z0-9.-]+\.internal|[a-z0-9.-]+\.local):\d{2,5}\b/i,
  /\b[A-Za-z]:\\[^"'\s]+/,
  /(?:^|[\s"'])\.\.?\/[^"'\s]+/,
  /\b(?:src|app|lib|test|tests|routes|pages|server|client)\/[A-Za-z0-9._/-]+:\d+\b/,
];

const FORBIDDEN_CLAIM_PATTERNS = [
  /\bSOC\s*2\s+compliant\b/i,
  /\bISO(?:\/IEC)?\s*27001\s+compliant\b/i,
  /\baudit\s+passed\b/i,
  /\bpenetration\s+test\s+passed\b/i,
  /\bWCAG\s+conformant\b/i,
  /\bno\s+vulnerabilities\b/i,
  /\bguaranteed\b/i,
];

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

function increment(counts, key, amount = 1) {
  counts[key] = (counts[key] ?? 0) + amount;
}

function emptySeverityCounts() {
  return { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
}

function emptyRemediationStatus() {
  return {
    open: 0,
    in_progress: 0,
    remediated: 0,
    accepted_risk: 0,
    requires_review: 0,
  };
}

function suiteDisplayName(suite) {
  if (suite === "soc2") return "SOC 2";
  if (suite === "iso27001") return "ISO/IEC 27001";
  if (suite === "wcag") return "WCAG";
  if (suite === "security") return "Application security";
  return suite;
}

function categoryForResult(result = {}) {
  const suite = normalized(result.suite);
  const handler = normalized(result.handler);
  const id = normalized(result.id);
  const title = normalized(result.title);
  const text = `${suite} ${handler} ${id} ${title}`;

  if (suite === "wcag" || handler === "axe-cli") return "accessibility-readiness";
  if (suite === "soc2") return "soc2-readiness";
  if (suite === "iso27001") return "iso27001-readiness";
  if (handler === "gitleaks" || text.includes("secret")) return "secret-scanning";
  if (handler === "semgrep" || handler === "source-pattern") return "static-application-security-testing";
  if (handler === "zap-baseline" || handler === "local-http") return "dynamic-application-security-testing";
  if (handler === "syft") return "software-bill-of-materials";
  if (handler === "grype" || handler === "trivy" || text.includes("vulnerab")) return "software-composition-analysis";
  if (handler === "local-tcp-probe" || text.includes("network") || text.includes("service exposure")) return "network-exposure-review";
  if (text.includes("auth") || text.includes("session")) return "identity-and-session-review";
  return `${suite}-readiness`;
}

function resultAudienceTier(result = {}) {
  const suite = normalized(result.suite);
  const handler = normalized(result.handler);
  const id = normalized(result.id);
  const title = normalized(result.title);
  const text = `${suite} ${handler} ${id} ${title}`;

  if (normalized(result.disposition) === "covered-by-existing-evidence") return "public-rfp";
  if (suite === "soc2" || suite === "iso27001" || suite === "wcag") return "public-rfp";
  if (
    handler === "gitleaks" ||
    handler === "semgrep" ||
    handler === "source-pattern" ||
    handler === "zap-baseline" ||
    handler === "local-http" ||
    handler === "local-tcp-probe" ||
    handler === "local-command" ||
    text.includes("authn-004") ||
    text.includes("account enumeration") ||
    text.includes("authorization") ||
    text.includes("session")
  ) {
    return "internal-only";
  }
  if (handler === "syft" || handler === "grype" || handler === "trivy") return "nda-rfp";
  return "internal-only";
}

function severityForResult(result = {}) {
  const supplied = normalized(result.severity);
  if (VALID_SEVERITIES.has(supplied)) return supplied;

  const status = normalized(result.result);
  if (status === "error") return "high";
  if (status === "not-observed" || status === "not-implemented") return "medium";
  if (status === "blocked" || status === "manual-review" || normalized(result.disposition) === "manual-review") return "medium";
  return null;
}

function collectEvidenceSeverities(result = {}) {
  const counts = emptySeverityCounts();
  let found = false;
  for (const evidence of Array.isArray(result.evidence) ? result.evidence : []) {
    const severities = evidence?.counts?.severities ?? evidence?.counts?.impacts ?? evidence?.counts?.risks ?? {};
    for (const [severity, count] of Object.entries(severities)) {
      const key = normalized(severity);
      if (VALID_SEVERITIES.has(key)) {
        increment(counts, key, Number(count) || 0);
        found = true;
      }
    }
  }
  return found ? counts : null;
}

function remediationBucket(result = {}) {
  const status = normalized(result.result);
  const disposition = normalized(result.disposition);

  if (POSITIVE_RESULTS.has(status)) return "remediated";
  if (GAP_RESULTS.has(status)) return "open";
  if (REVIEW_RESULTS.has(status) || disposition === "manual-review" || disposition === "blocked") return "requires_review";
  return "requires_review";
}

function emptyTechnicalSummary(category) {
  return {
    category,
    status: "performed",
    last_run: null,
    audience_tier: "public-rfp",
    result_counts: {},
    severity_counts: emptySeverityCounts(),
    remediation_status: emptyRemediationStatus(),
    omitted_raw_result_count: 0,
  };
}

function combineTier(current, next) {
  const rank = {
    "public-rfp": 1,
    "nda-rfp": 2,
    "restricted-buyer-review": 3,
    "internal-only": 4,
  };
  return rank[next] > rank[current] ? next : current;
}

function addTechnicalResult(summary, result, generatedAt) {
  increment(summary.result_counts, normalized(result.result));
  summary.last_run = summary.last_run ?? (String(generatedAt ?? "").slice(0, 10) || null);
  summary.omitted_raw_result_count += 1;
  summary.audience_tier = combineTier(summary.audience_tier, resultAudienceTier(result));

  const evidenceSeverities = collectEvidenceSeverities(result);
  if (evidenceSeverities) {
    for (const [severity, count] of Object.entries(evidenceSeverities)) increment(summary.severity_counts, severity, count);
  } else {
    const severity = severityForResult(result);
    if (severity) increment(summary.severity_counts, severity);
  }

  increment(summary.remediation_status, remediationBucket(result));
}

function formalEvidenceKind(suite) {
  if (suite === "soc2") return "soc2-type2-report";
  if (suite === "iso27001") return "iso27001-certificate";
  return `${suite}-assurance-evidence`;
}

function formalEvidenceTier(suite) {
  if (suite === "soc2") return "nda-rfp";
  if (suite === "iso27001") return "public-rfp";
  return "nda-rfp";
}

function buildFormalEvidence(evidenceCoverage = {}) {
  return Object.entries(evidenceCoverage)
    .filter(([suite]) => ["soc2", "iso27001"].includes(suite))
    .map(([suite, coverage]) => ({
      kind: formalEvidenceKind(suite),
      framework: suiteDisplayName(suite),
      issuer: compactText(coverage?.issuer),
      period_end: coverage?.period_end ?? null,
      valid_until: coverage?.valid_until ?? null,
      scope_summary: compactText(coverage?.scope),
      status: coverage?.covered ? "covered" : "not-covered",
      reason: coverage?.covered ? null : compactText(coverage?.reason),
      artifact_tier: formalEvidenceTier(suite),
    }));
}

function buildFrameworkSummaries(report = {}) {
  return Object.entries(report.framework_summaries ?? {}).map(([suite, summary]) => ({
    framework: suiteDisplayName(suite),
    suite,
    forecast_label: summary.forecast_label ?? "insufficient-data",
    readiness_score: summary.readiness_score ?? 0,
    total_tests: summary.total_tests ?? 0,
    concern_count: Array.isArray(summary.points_of_concern) ? summary.points_of_concern.length : 0,
    covered_by_existing_evidence: Boolean(summary.covered_evidence?.covered),
  }));
}

function buildTechnicalTesting(assessment = {}) {
  const summaries = new Map();
  for (const result of Array.isArray(assessment.results) ? assessment.results : []) {
    const category = categoryForResult(result);
    if (!summaries.has(category)) summaries.set(category, emptyTechnicalSummary(category));
    addTechnicalResult(summaries.get(category), result, assessment.generated_at);
  }
  return [...summaries.values()].sort((left, right) => left.category.localeCompare(right.category));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function classifyRfpResult(result = {}) {
  return {
    tier: resultAudienceTier(result),
    category: categoryForResult(result),
  };
}

export function buildRfpSecuritySummary(assessment = {}, options = {}) {
  const report = assessment.report ?? buildAssessmentReport(assessment);
  const audienceTier = options.audienceTier ?? options.audience_tier ?? "public-rfp";
  if (!VALID_TIERS.has(audienceTier)) throw new Error(`Unsupported RFP audience tier: ${audienceTier}`);

  const packageDocument = {
    schema_version: "1.0",
    classification: "rfp-security-summary",
    audience_tier: audienceTier,
    target: {
      name: assessment.target?.name ?? null,
      version: assessment.target?.version ?? null,
    },
    assessment: {
      id: assessment.run_id ?? null,
      source_classification: assessment.classification ?? null,
      generated_at: assessment.generated_at ?? null,
      assessment_window: {
        started_at: options.started_at ?? (String(assessment.generated_at ?? "").slice(0, 10) || null),
        ended_at: options.ended_at ?? (String(assessment.generated_at ?? "").slice(0, 10) || null),
      },
      scope_summary: compactText(options.scope_summary) ?? "Approved local readiness assessment of supplied software, configuration, and evidence.",
      excluded_scope: list(options.excluded_scope),
    },
    formal_evidence: buildFormalEvidence(assessment.evidence_coverage),
    framework_summaries: buildFrameworkSummaries(report),
    technical_testing: buildTechnicalTesting(assessment),
    limitations: unique([
      RFP_READINESS_LIMITATION,
      ...(Array.isArray(report.limitations) ? report.limitations.map(compactText) : []),
    ]),
    approval: {
      status: options.approval_status ?? "draft-not-approved-for-external-sharing",
      approved_by: options.approved_by ?? null,
      approved_at: options.approved_at ?? null,
    },
    omitted_internal_detail: {
      raw_results_retained_internally: Array.isArray(assessment.results) ? assessment.results.length : 0,
      policy: "Raw evidence, request/response data, source locations, command output, secrets, internal hosts, ports, and exploit details are excluded from this RFP package.",
    },
  };

  const issues = findRfpSafetyIssues(packageDocument);
  if (issues.length > 0) {
    throw new Error(`RFP export failed safety validation: ${issues.join("; ")}`);
  }

  return packageDocument;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function findRfpSafetyIssues(value, path = "$") {
  const issues = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => issues.push(...findRfpSafetyIssues(item, `${path}[${index}]`)));
    return issues;
  }

  if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      const normalizedKey = normalized(key);
      if (RAW_FIELD_NAMES.has(normalizedKey)) {
        issues.push(`${path}.${key} exposes raw assessment detail`);
      }
      issues.push(...findRfpSafetyIssues(item, `${path}.${key}`));
    }
    return issues;
  }

  if (typeof value !== "string") return issues;
  const text = value.trim();
  if (!text) return issues;

  for (const pattern of SECRET_VALUE_PATTERNS) {
    if (pattern.test(text)) issues.push(`${path} appears to contain a secret or credential`);
  }
  for (const pattern of LOCATION_PATTERNS) {
    if (pattern.test(text)) issues.push(`${path} appears to contain a raw path, URL, host, or port`);
  }
  for (const pattern of FORBIDDEN_CLAIM_PATTERNS) {
    if (pattern.test(text)) issues.push(`${path} contains a forbidden assurance claim`);
  }

  return issues;
}

export default buildRfpSecuritySummary;
