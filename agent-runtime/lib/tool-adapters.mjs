import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execLocalToolAsync } from "./exec.mjs";

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_BUFFER_BYTES = 8 * 1024 * 1024;
const MAX_BUFFER_BYTES = 20 * 1024 * 1024;
const DEFAULT_SAMPLE_CHARS = 4000;

const SECRET_KEY_PATTERN = /(?:api[_-]?key|access[_-]?token|auth(?:orization)?|bearer|client[_-]?secret|credential|password|private[_-]?key|secret|session[_-]?token|token)/i;
const SECRET_TEXT_PATTERNS = [
  /((?:api[_-]?key|access[_-]?token|auth(?:orization)?|bearer|client[_-]?secret|credential|password|private[_-]?key|secret|session[_-]?token|token)\s*[:=]\s*)(["']?)[^\s"',;}]+/gi,
  /(authorization\s*:\s*bearer\s+)[a-z0-9._~+/=-]+/gi,
  /(-----BEGIN [A-Z ]*PRIVATE KEY-----)[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----)/g,
];

const TOOL_DEFINITIONS = {
  semgrep: {
    executable: "semgrep",
    buildArgs: buildSemgrepArgs,
    summarize: summarizeSemgrep,
    env: {
      SEMGREP_SEND_METRICS: "off",
    },
    limitations: [
      "Semgrep results depend on the supplied local rules/config path; missing rules, generated code, unsupported languages, and framework-specific behavior can create false negatives.",
      "Static analysis findings require human triage before they can support a formal security or compliance conclusion.",
    ],
  },
  gitleaks: {
    executable: "gitleaks",
    buildArgs: buildGitleaksArgs,
    summarize: summarizeGitleaks,
    limitations: [
      "Gitleaks redacts detected secrets where supported, but secret scanning can still produce false positives and false negatives.",
      "A clean local scan does not prove that secrets were never committed, published, or exposed outside the scanned source tree.",
    ],
  },
  syft: {
    executable: "syft",
    buildArgs: buildSyftArgs,
    summarize: summarizeSyft,
    env: {
      SYFT_CHECK_FOR_APP_UPDATE: "false",
    },
    limitations: [
      "Syft generates a local SBOM snapshot; package detection can miss dynamically downloaded, vendored, generated, or runtime-only components.",
      "An SBOM is inventory evidence, not a vulnerability or license-compliance conclusion by itself.",
    ],
  },
  grype: {
    executable: "grype",
    buildArgs: buildGrypeArgs,
    summarize: summarizeGrype,
    env: {
      GRYPE_DB_AUTO_UPDATE: "false",
      GRYPE_DB_VALIDATE_AGE: "false",
      GRYPE_CHECK_FOR_APP_UPDATE: "false",
    },
    limitations: [
      "Grype is run against the local vulnerability database without automatic updates; stale or missing databases can under-report vulnerabilities.",
      "Vulnerability matches require human triage for reachability, exploitability, fix availability, and environmental context.",
    ],
  },
  trivy: {
    executable: "trivy",
    buildArgs: buildTrivyArgs,
    summarize: summarizeTrivy,
    env: {
      TRIVY_DISABLE_VEX_NOTICE: "true",
      TRIVY_NO_PROGRESS: "true",
    },
    limitations: [
      "Trivy is invoked with offline/no-update flags where supported; results depend on the locally available vulnerability database.",
      "Filesystem scans can miss runtime-only packages, external services, unreachable code paths, and vulnerabilities requiring contextual exploitability review.",
    ],
  },
  "axe-cli": {
    executable: "axe",
    buildArgs: buildAxeArgs,
    summarize: summarizeAxe,
    limitations: [
      "axe CLI automation can identify many accessibility rule violations, but it cannot establish full WCAG conformance or judge all human-meaning, exception, and complete-process requirements.",
      "Browser, page state, authentication, route coverage, and accessibility-supported use constraints require qualified human review.",
    ],
  },
  "zap-baseline": {
    executable: "zap-baseline.py",
    buildArgs: buildZapBaselineArgs,
    summarize: summarizeZapBaseline,
    jsonReport: true,
    limitations: [
      "ZAP baseline is a passive, bounded scan. It does not perform a full penetration test and cannot establish exploitability or absence of vulnerabilities.",
      "Results depend on local target reachability, crawl coverage, authentication context, and locally installed ZAP rule versions.",
    ],
  },
};

function resultError(message, evidence = []) {
  return { result: "error", evidence, limitations: [message] };
}

function normalizedString(value) {
  return String(value ?? "").trim();
}

function boundedNumber(value, fallback, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(Math.floor(number), maximum);
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveSourceRoot(config) {
  const sourceRoot = normalizedString(config.sourceRoot ?? config.source_root ?? config.approvedSourceRoot);
  if (!sourceRoot) throw new Error("A sourceRoot must be provided for local tool adapters");
  return path.resolve(sourceRoot);
}

function resolveInside(root, requested, label) {
  const value = requested === undefined || requested === null || requested === "" ? "." : String(requested);
  const resolved = path.resolve(root, value);
  if (!isInside(root, resolved)) {
    throw new Error(`${label} must stay inside the approved source root`);
  }
  return resolved;
}

function resolveUnderAnyRoot(sourceRoot, requested, extraRoots, label) {
  const value = normalizedString(requested);
  if (!value) throw new Error(`${label} is required`);

  const roots = [
    sourceRoot,
    ...(extraRoots ?? []).map((root) => path.resolve(root)),
  ];
  const candidates = path.isAbsolute(value)
    ? [path.resolve(value)]
    : roots.map((root) => path.resolve(root, value));
  const allowedCandidates = candidates.filter((candidate) => roots.some((root) => isInside(root, candidate)));
  const resolved = allowedCandidates.find((candidate) => existsSync(candidate)) ?? allowedCandidates[0] ?? candidates[0];
  if (!roots.some((root) => isInside(root, resolved))) {
    throw new Error(`${label} must be a local path inside an approved root`);
  }
  return resolved;
}

function relativeToRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative ? relative.split(path.sep).join("/") : ".";
}

function arrayOfStrings(value, label) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be an array of strings`);
  }
  return value;
}

function redactText(value, limit = DEFAULT_SAMPLE_CHARS) {
  let text = String(value ?? "");
  for (const pattern of SECRET_TEXT_PATTERNS) {
    text = text.replace(pattern, (...parts) => {
      if (parts.length >= 4 && typeof parts[1] === "string") return `${parts[1]}${parts[2] ?? ""}[redacted]`;
      return "[redacted-private-key]";
    });
  }
  return text.slice(0, limit);
}

function redactData(value, depth = 0) {
  if (depth > 5) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 5).map((item) => redactData(item, depth + 1));
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? redactText(value, 1000) : value;
  }

  return Object.fromEntries(
    Object.entries(value).slice(0, 24).map(([key, item]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? "[redacted]" : redactData(item, depth + 1),
    ]),
  );
}

function commandFor(config, definition) {
  const command = normalizedString(config.command ?? config.executable ?? definition.executable);
  if (!command || command.includes("\0")) throw new Error("Tool command must be a non-empty executable name or path");
  return command;
}

function commandPrefixArgs(config) {
  return arrayOfStrings(config.commandArgsPrefix ?? config.command_args_prefix, "commandArgsPrefix");
}

function localToolEnvironment(extra = {}) {
  const allowed = ["PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR", "TEMP", "TMP", "HOME", "USERPROFILE"];
  const env = Object.fromEntries(allowed.filter((name) => process.env[name]).map((name) => [name, process.env[name]]));
  return { ...env, ...extra };
}

function parseJsonOutput(stdout, stderr) {
  const candidates = [stdout, stderr].map((value) => String(value ?? "").trim()).filter(Boolean);
  for (const candidate of candidates) {
    try {
      return { parsed: JSON.parse(candidate), source: candidate };
    } catch {
      const starts = [candidate.indexOf("{"), candidate.indexOf("[")].filter((index) => index >= 0);
      const first = starts.length ? Math.min(...starts) : -1;
      const lastBrace = candidate.lastIndexOf("}");
      const lastBracket = candidate.lastIndexOf("]");
      const last = Math.max(lastBrace, lastBracket);
      if (first >= 0 && last > first) {
        try {
          return { parsed: JSON.parse(candidate.slice(first, last + 1)), source: candidate.slice(first, last + 1) };
        } catch {
          // Keep trying the next candidate.
        }
      }
    }
  }
  return { parsed: null, source: null };
}

function evidenceBase({ tool, command, args, cwd, sourceRoot, sourcePath, exitCode, stdout, stderr, counts, sample }) {
  const sampleChars = DEFAULT_SAMPLE_CHARS;
  return {
    type: "cli-security-tool",
    tool,
    command: {
      executable: path.basename(command),
      args: args.map((arg) => redactText(arg, 600)),
      cwd: relativeToRoot(sourceRoot, cwd),
    },
    source_path: relativeToRoot(sourceRoot, sourcePath),
    exit_code: exitCode,
    counts,
    sample: redactData(sample ?? []),
    stdout_sample: redactText(stdout, sampleChars),
    stderr_sample: redactText(stderr, sampleChars),
  };
}

function tempReportPath(tool) {
  return fs.mkdtemp(path.join(os.tmpdir(), `localproof-${tool}-`))
    .then((directory) => ({ directory, reportFile: path.join(directory, "report.json") }));
}

function statusFromSummary(tool, summary, exitCode, parsed) {
  if (!parsed) return "error";
  if (exitCode !== 0 && !summary.hasConcerns) return "error";
  if (summary.hasConcerns) return "not-observed";
  if (tool === "syft") return summary.hasInventory ? "observed" : "not-observed";
  return "observed";
}

async function executeTool(tool, config = {}) {
  const definition = TOOL_DEFINITIONS[tool];
  if (!definition) throw new Error(`Unsupported local tool adapter: ${tool}`);

  try {
    const sourceRoot = resolveSourceRoot(config);
    const sourcePath = resolveInside(sourceRoot, config.sourcePath ?? config.source_path ?? ".", "sourcePath");
    const cwd = resolveInside(sourceRoot, config.cwd ?? ".", "cwd");
    const report = definition.jsonReport ? await tempReportPath(tool) : null;
    const context = { sourceRoot, sourcePath, cwd, config, reportFile: report?.reportFile ?? null };
    const toolArgs = definition.buildArgs(context);
    const prefixArgs = commandPrefixArgs(config);
    const args = [...prefixArgs, ...toolArgs];
    const command = commandFor(config, definition);
    const timeout = boundedNumber(config.timeoutMs ?? config.timeout_ms, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
    const maxBuffer = boundedNumber(config.maxBufferBytes ?? config.max_buffer_bytes, DEFAULT_MAX_BUFFER_BYTES, MAX_BUFFER_BYTES);

    let exitCode = 0;
    let stdout = "";
    let stderr = "";

    try {
      const result = await execLocalToolAsync(command, args, {
        cwd,
        env: localToolEnvironment(definition.env),
        timeout,
        maxBuffer,
        windowsHide: true,
      });
      stdout = result.stdout ?? "";
      stderr = result.stderr ?? "";
    } catch (error) {
      if (error?.code === "ENOENT") {
        return {
          result: "not-run",
          evidence: [{
            type: "cli-security-tool",
            tool,
            command: {
              executable: path.basename(command),
              args: args.map((arg) => redactText(arg, 600)),
              cwd: relativeToRoot(sourceRoot, cwd),
            },
            source_path: relativeToRoot(sourceRoot, sourcePath),
            missing_tool: true,
          }],
          limitations: [`Required local tool is not installed or not on PATH: ${definition.executable}`],
        };
      }

      exitCode = Number.isInteger(error?.code) ? error.code : 1;
      stdout = error?.stdout ?? "";
      stderr = error?.stderr ?? error?.message ?? "";

      if (error?.killed || error?.signal === "SIGTERM" || /timed out/i.test(String(error?.message ?? ""))) {
        return {
          result: "error",
          evidence: [evidenceBase({
            tool,
            command,
            args,
            cwd,
            sourceRoot,
            sourcePath,
            exitCode,
            stdout,
            stderr,
            counts: {},
            sample: [],
          })],
          limitations: [`${tool} timed out after ${timeout}ms`],
        };
      }
    }

    let reportText = "";
    if (report?.reportFile) {
      reportText = await fs.readFile(report.reportFile, "utf8").catch(() => "");
      await fs.rm(report.directory, { recursive: true, force: true }).catch(() => {});
    }
    const { parsed } = parseJsonOutput(reportText || stdout, stderr);
    const summary = parsed ? definition.summarize(parsed) : {
      counts: {},
      sample: [],
      hasConcerns: false,
      hasInventory: false,
    };
    const result = statusFromSummary(tool, summary, exitCode, parsed);
    const limitations = [
      ...definition.limitations,
      "Tool execution is local, shell-free, timeout-bounded, output-bounded, and based on the caller-approved source root.",
    ];
    if (!parsed) limitations.unshift(`${tool} did not produce parseable JSON output`);
    if (exitCode !== 0 && parsed && !summary.hasConcerns) {
      limitations.unshift(`${tool} exited with code ${exitCode} without parseable findings that explain the failure`);
    }

    return {
      result,
      evidence: [evidenceBase({
        tool,
        command,
        args,
        cwd,
        sourceRoot,
        sourcePath,
        exitCode,
        stdout,
        stderr,
        counts: summary.counts,
        sample: summary.sample,
      })],
      limitations,
    };
  } catch (error) {
    return resultError(error instanceof Error ? error.message : "Local tool adapter failed");
  }
}

function buildSemgrepArgs({ sourceRoot, sourcePath, config }) {
  const ruleConfig = resolveUnderAnyRoot(
    sourceRoot,
    config.rulesPath ?? config.rules_path ?? config.configPath ?? config.config_path,
    config.approvedConfigRoots ?? config.approved_config_roots,
    "semgrep rules/config path",
  );
  const args = ["--json", "--metrics=off", "--config", ruleConfig];
  for (const pattern of arrayOfStrings(config.include, "include")) args.push("--include", pattern);
  for (const pattern of arrayOfStrings(config.exclude, "exclude")) args.push("--exclude", pattern);
  args.push(sourcePath);
  return args;
}

function buildGitleaksArgs({ sourcePath }) {
  return ["detect", "--source", sourcePath, "--redact", "--report-format", "json", "--report-path", "-", "--no-banner"];
}

function buildSyftArgs({ sourcePath }) {
  return [`dir:${sourcePath}`, "-o", "json"];
}

function buildGrypeArgs({ sourcePath }) {
  return [`dir:${sourcePath}`, "-o", "json"];
}

function buildTrivyArgs({ sourcePath }) {
  return [
    "fs",
    "--format",
    "json",
    "--skip-db-update",
    "--skip-java-db-update",
    "--offline-scan",
    "--no-progress",
    sourcePath,
  ];
}

function buildAxeArgs({ config }) {
  const targetUrl = normalizedString(config.targetUrl ?? config.target_url);
  if (!targetUrl) throw new Error("axe-cli requires a targetUrl");
  const args = ["--stdout", targetUrl];
  const rules = arrayOfStrings(config.rules, "rules");
  const tags = arrayOfStrings(config.tags, "tags");
  if (rules.length) args.push("--rules", rules.join(","));
  if (tags.length) args.push("--tags", tags.join(","));
  return args;
}

function buildZapBaselineArgs({ config, reportFile }) {
  const targetUrl = normalizedString(config.targetUrl ?? config.target_url);
  if (!targetUrl) throw new Error("zap-baseline requires a targetUrl");
  const minutes = Math.min(Math.max(Number(config.minutes ?? config.spider_minutes ?? 1) || 1, 0), 10);
  const startupMinutes = Math.min(Math.max(Number(config.timeout_minutes ?? 2) || 2, 1), 10);
  const args = ["-t", targetUrl, "-J", reportFile, "-m", String(minutes), "-T", String(startupMinutes)];
  const zapOptions = arrayOfStrings(config.zapOptions ?? config.zap_options, "zapOptions");
  if (config.no_update_check !== false) {
    zapOptions.unshift("-config", "start.checkAddonUpdates=false");
    zapOptions.unshift("-config", "start.checkForUpdates=false");
  }
  if (zapOptions.length > 0) args.push("-z", zapOptions.join(" "));
  if (config.fail_on_warning !== true) args.push("-I");
  if (config.short_output !== false) args.push("-s");
  return args;
}

function sampleSemgrepFinding(finding) {
  return {
    check_id: finding.check_id ?? null,
    path: finding.path ?? null,
    start: finding.start?.line ? { line: finding.start.line } : null,
    severity: finding.extra?.severity ?? finding.extra?.metadata?.severity ?? null,
    message: finding.extra?.message ?? null,
  };
}

function summarizeSemgrep(parsed) {
  const results = Array.isArray(parsed.results) ? parsed.results : [];
  const errors = Array.isArray(parsed.errors) ? parsed.errors : [];
  return {
    counts: {
      findings: results.length,
      errors: errors.length,
    },
    sample: results.slice(0, 3).map(sampleSemgrepFinding),
    hasConcerns: results.length > 0 || errors.length > 0,
    hasInventory: false,
  };
}

function summarizeGitleaks(parsed) {
  const findings = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.findings)
      ? parsed.findings
      : Array.isArray(parsed.leaks)
        ? parsed.leaks
        : [];
  return {
    counts: {
      findings: findings.length,
    },
    sample: findings.slice(0, 3).map((finding) => ({
      rule_id: finding.RuleID ?? finding.ruleID ?? finding.rule_id ?? null,
      description: finding.Description ?? finding.description ?? null,
      file: finding.File ?? finding.file ?? null,
      start_line: finding.StartLine ?? finding.startLine ?? finding.start_line ?? null,
      secret: finding.Secret ?? finding.secret ?? null,
    })),
    hasConcerns: findings.length > 0,
    hasInventory: false,
  };
}

function summarizeSyft(parsed) {
  const artifacts = Array.isArray(parsed.artifacts) ? parsed.artifacts : [];
  const relationships = Array.isArray(parsed.artifactRelationships)
    ? parsed.artifactRelationships
    : Array.isArray(parsed.relationships)
      ? parsed.relationships
      : [];
  return {
    counts: {
      artifacts: artifacts.length,
      relationships: relationships.length,
    },
    sample: artifacts.slice(0, 5).map((artifact) => ({
      name: artifact.name ?? null,
      version: artifact.version ?? null,
      type: artifact.type ?? null,
      language: artifact.language ?? null,
      purl: artifact.purl ?? null,
    })),
    hasConcerns: false,
    hasInventory: artifacts.length > 0,
  };
}

function summarizeGrype(parsed) {
  const matches = Array.isArray(parsed.matches) ? parsed.matches : [];
  const vulnerabilityIds = new Set(matches.map((match) => match.vulnerability?.id).filter(Boolean));
  const severityCounts = {};
  for (const match of matches) {
    const severity = String(match.vulnerability?.severity ?? "unknown").toLowerCase();
    severityCounts[severity] = (severityCounts[severity] ?? 0) + 1;
  }
  return {
    counts: {
      matches: matches.length,
      vulnerabilities: vulnerabilityIds.size || matches.length,
      severities: severityCounts,
    },
    sample: matches.slice(0, 3).map((match) => ({
      vulnerability_id: match.vulnerability?.id ?? null,
      severity: match.vulnerability?.severity ?? null,
      package: match.artifact?.name ?? null,
      version: match.artifact?.version ?? null,
      type: match.artifact?.type ?? null,
    })),
    hasConcerns: matches.length > 0,
    hasInventory: false,
  };
}

function summarizeTrivy(parsed) {
  const results = Array.isArray(parsed.Results) ? parsed.Results : [];
  const vulnerabilities = results.flatMap((result) => Array.isArray(result.Vulnerabilities) ? result.Vulnerabilities : []);
  const secrets = results.flatMap((result) => Array.isArray(result.Secrets) ? result.Secrets : []);
  const misconfigurations = results.flatMap((result) => Array.isArray(result.Misconfigurations) ? result.Misconfigurations : []);
  const severityCounts = {};
  for (const vulnerability of vulnerabilities) {
    const severity = String(vulnerability.Severity ?? "unknown").toLowerCase();
    severityCounts[severity] = (severityCounts[severity] ?? 0) + 1;
  }
  return {
    counts: {
      vulnerabilities: vulnerabilities.length,
      secrets: secrets.length,
      misconfigurations: misconfigurations.length,
      severities: severityCounts,
    },
    sample: [
      ...vulnerabilities.slice(0, 2).map((vulnerability) => ({
        vulnerability_id: vulnerability.VulnerabilityID ?? null,
        package: vulnerability.PkgName ?? null,
        installed_version: vulnerability.InstalledVersion ?? null,
        severity: vulnerability.Severity ?? null,
      })),
      ...secrets.slice(0, 1).map((secret) => ({
        rule_id: secret.RuleID ?? null,
        category: secret.Category ?? null,
        severity: secret.Severity ?? null,
        target: secret.Target ?? null,
      })),
    ],
    hasConcerns: vulnerabilities.length > 0 || secrets.length > 0 || misconfigurations.length > 0,
    hasInventory: false,
  };
}

function summarizeAxe(parsed) {
  const pages = Array.isArray(parsed) ? parsed : [parsed];
  const violations = pages.flatMap((page) => Array.isArray(page?.violations) ? page.violations : []);
  const incomplete = pages.flatMap((page) => Array.isArray(page?.incomplete) ? page.incomplete : []);
  const passes = pages.flatMap((page) => Array.isArray(page?.passes) ? page.passes : []);
  const impactCounts = {};
  for (const violation of violations) {
    const impact = String(violation.impact ?? "unknown").toLowerCase();
    impactCounts[impact] = (impactCounts[impact] ?? 0) + 1;
  }
  return {
    counts: {
      pages: pages.length,
      violations: violations.length,
      incomplete: incomplete.length,
      passes: passes.length,
      impacts: impactCounts,
    },
    sample: violations.slice(0, 3).map((violation) => ({
      id: violation.id ?? null,
      impact: violation.impact ?? null,
      help: violation.help ?? null,
      nodes: Array.isArray(violation.nodes) ? violation.nodes.length : 0,
    })),
    hasConcerns: violations.length > 0 || incomplete.length > 0,
    hasInventory: passes.length > 0,
  };
}

function summarizeZapBaseline(parsed) {
  const sites = Array.isArray(parsed?.site) ? parsed.site : [];
  const alerts = sites.flatMap((site) => Array.isArray(site.alerts) ? site.alerts : []);
  const riskCounts = {};
  for (const alert of alerts) {
    const risk = String(alert.riskdesc ?? alert.risk ?? "unknown").split(" ")[0].toLowerCase();
    riskCounts[risk] = (riskCounts[risk] ?? 0) + 1;
  }
  return {
    counts: {
      sites: sites.length,
      alerts: alerts.length,
      risks: riskCounts,
    },
    sample: alerts.slice(0, 3).map((alert) => ({
      plugin_id: alert.pluginid ?? null,
      risk: alert.riskdesc ?? alert.risk ?? null,
      name: alert.alert ?? alert.name ?? null,
      confidence: alert.confidence ?? null,
      instances: Array.isArray(alert.instances) ? alert.instances.length : 0,
    })),
    hasConcerns: alerts.length > 0,
    hasInventory: sites.length > 0,
  };
}

export function redactToolOutput(value, limit) {
  return redactText(value, limit);
}

export async function runToolAdapter(tool, config = {}) {
  return executeTool(tool, config);
}

export async function runSemgrep(config = {}) {
  return executeTool("semgrep", config);
}

export async function runGitleaks(config = {}) {
  return executeTool("gitleaks", config);
}

export async function runSyft(config = {}) {
  return executeTool("syft", config);
}

export async function runGrype(config = {}) {
  return executeTool("grype", config);
}

export async function runTrivy(config = {}) {
  return executeTool("trivy", config);
}

export async function runAxeCli(config = {}) {
  return executeTool("axe-cli", config);
}

export async function runZapBaseline(config = {}) {
  return executeTool("zap-baseline", config);
}
