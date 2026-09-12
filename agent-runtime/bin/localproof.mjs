#!/usr/bin/env node

import fs from "node:fs/promises";
import crypto from "node:crypto";
import net from "node:net";
import { execFile } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";
import YAML from "yaml";
import { evaluateCoverage, loadEvidenceLibrary } from "../lib/evidence.mjs";
import { closeDatabase, persistAssessment } from "../lib/mongodb.mjs";
import { buildAssessmentReport } from "../lib/reporting.mjs";

const execFileAsync = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..", "..");
const catalogRoot = path.join(repositoryRoot, "compliance-suites");
const supportedSuites = ["soc2", "iso27001", "security", "wcag"];

function fail(message) {
  console.error(JSON.stringify({ status: "error", error: message }, null, 2));
  process.exit(1);
}

function parseArguments(argv) {
  const [command, ...rest] = argv.slice(2);
  if (!command || !["plan", "run"].includes(command)) {
    fail("Usage: localproof <plan|run> --target <yaml> --suite <suite|all> [--evidence-library <directory>] [--output <directory>]");
  }

  const value = (flag) => {
    const index = rest.indexOf(flag);
    return index >= 0 ? rest[index + 1] : null;
  };

  const target = value("--target");
  const suite = value("--suite") || "all";
  const output = value("--output");
  const evidenceLibrary = value("--evidence-library");
  if (!target) fail("--target is required");
  if (suite !== "all" && !supportedSuites.includes(suite)) fail(`Unsupported suite: ${suite}`);
  if (command === "run" && !output) fail("--output is required when running tests");

  return {
    command,
    target: path.resolve(target),
    suites: suite === "all" ? supportedSuites : [suite],
    output: output ? path.resolve(output) : null,
    evidenceLibrary: evidenceLibrary ? path.resolve(evidenceLibrary) : null,
  };
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function loadTarget(file) {
  const parsed = YAML.parse(await fs.readFile(file, "utf8"));
  if (!parsed?.target || !parsed?.scope || !parsed?.data_handling) {
    fail("Target YAML must contain target, scope, and data_handling sections");
  }
  if (parsed.data_handling.external_network !== "deny") {
    fail("Target must deny external network access");
  }
  return parsed;
}

async function loadCatalogs(names) {
  const schema = await readJson(path.join(catalogRoot, "catalog.schema.json"));
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const catalogs = [];

  for (const name of names) {
    const file = path.join(catalogRoot, name, "catalog.json");
    let sourceCatalog;
    try {
      sourceCatalog = await readJson(file);
    } catch {
      fail(`Suite catalog is missing or invalid: ${file}`);
    }
    const nestedTests = (sourceCatalog.suites ?? []).flatMap((group) =>
      (group.tests ?? []).map((test) => ({ ...test, group: test.group ?? group.id })),
    );
    const sourceTests = sourceCatalog.tests ?? sourceCatalog.test_scaffolds ?? nestedTests;
    const sourceSources = sourceCatalog.sources ?? (sourceCatalog.standard ? [
      {
        name: sourceCatalog.standard.name,
        version: sourceCatalog.standard.targetConformance ?? null,
        url: sourceCatalog.standard.normativeSpecification,
      },
    ] : []);
    const catalog = {
      suite: name,
      version:
        sourceCatalog.version ??
        sourceCatalog.catalogVersion ??
        sourceCatalog.catalog_version ??
        sourceCatalog.schema_version ??
        sourceCatalog.schemaVersion ??
        "draft",
      title: sourceCatalog.title ?? sourceCatalog.suite?.title ?? `${name} readiness`,
      disclaimer: sourceCatalog.disclaimer ?? sourceCatalog.suite?.disclaimer ?? sourceCatalog.suite?.certificationBoundary ?? "Readiness assessment only",
      sources: sourceSources.map((source) => ({
        ...source,
        name: source.name ?? source.title ?? source.reference ?? source.id,
        version: source.version ?? null,
        retrieved: source.retrieved ?? null,
      })),
      tests: sourceTests.map((test) => {
        const rawType = String(test.type ?? "").toLowerCase().replaceAll("_", "-");
        const automation = test.automation ?? (
          rawType.includes("automated") ? "automated" :
            rawType.includes("manual") ? "manual" :
              ["hybrid", "mixed", "assisted"].some((value) => rawType.includes(value)) ? "assisted" : null
        );
        return {
          ...test,
          control:
            test.control ??
            test.criteria?.join(", ") ??
            test.successCriteria?.join(", ") ??
            test.references?.map((reference) => reference.id).filter(Boolean).join(", ") ??
            (name === "wcag" ? `WCAG ${test.id}` : null) ??
            test.theme ??
            null,
          category: test.category ?? test.theme ?? test.group ?? null,
          automation,
          safety: test.safety ?? test.safety_level ?? test.safetyLevel ?? (automation === "manual" ? "passive" : null),
          local_tool: test.local_tool ?? test.localOnlyTool ?? test.local_only_tool ?? test.suggested_local_tool ?? test.suggestedLocalTool ?? null,
          expected_evidence: test.expected_evidence ?? test.expectedEvidence ?? test.evidence ?? null,
          limitations: test.limitations ?? null,
          executor: test.executor ?? null,
        };
      }),
    };
    if (!validate(catalog)) {
      fail(`Suite catalog failed schema validation: ${name}: ${ajv.errorsText(validate.errors)}`);
    }
    catalogs.push(catalog);
  }

  return catalogs;
}

function normalizeTest(suite, test, target, coverage) {
  const executor = test.executor ?? { handler: test.automation === "manual" ? "manual" : "unimplemented" };
  const active = executor.handler === "local-http" || executor.handler === "local-command" || executor.handler === "local-tcp-probe";
  const intrusive = test.safety === "intrusive";
  let disposition = "ready";
  let reason = null;

  const coveredEvidence = coverage?.[suite]?.covered ? coverage[suite] : null;
  if (coveredEvidence && test.automation !== "automated") {
    disposition = "covered-by-existing-evidence";
    reason = `Approved evidence ${coveredEvidence.evidence_id} covers this target and readiness suite`;
  } else if (intrusive) {
    disposition = "blocked";
    reason = "Intrusive tests are disabled by policy";
  } else if (active && target.scope.active_testing !== true) {
    disposition = "blocked";
    reason = "Active testing is not enabled in the approved target YAML";
  } else if (executor.handler === "manual" || test.automation === "manual") {
    disposition = "manual-review";
    reason = "This requirement cannot be established by an automated software check";
  }

  return {
    suite,
    id: test.id,
    title: test.title,
    control: test.control ?? null,
    handler: executor.handler,
    disposition,
    reason,
    covered_evidence: coveredEvidence,
  };
}

function targetSourceRoot(target) {
  return path.resolve(target.target.source_path);
}

function assertLocalUrl(rawUrl, target) {
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP(S) test URLs are supported");

  const allowedHosts = new Set(target.scope.allowed_hosts ?? []);
  const allowedPorts = new Set((target.scope.allowed_ports ?? []).map(Number));
  const effectivePort = Number(url.port || (url.protocol === "https:" ? 443 : 80));
  if (!allowedHosts.has(url.hostname)) throw new Error(`Host is outside approved scope: ${url.hostname}`);
  if (!allowedPorts.has(effectivePort)) throw new Error(`Port is outside approved scope: ${effectivePort}`);
  return url;
}

async function walkFiles(root, maximum = 5000) {
  const ignored = new Set([".git", ".next", "node_modules", "dist", "build", "coverage", "vendor"]);
  const found = [];

  async function walk(directory) {
    if (found.length >= maximum) return;
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (found.length >= maximum || entry.isSymbolicLink()) break;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory() && !ignored.has(entry.name)) await walk(absolute);
      if (entry.isFile()) found.push({ absolute, relative: path.relative(root, absolute).split(path.sep).join("/") });
    }
  }

  await walk(root);
  return found;
}

function wildcardMatches(file, pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("**", "::DOUBLE::").replaceAll("*", "[^/]*").replaceAll("::DOUBLE::", ".*");
  return new RegExp(`^${escaped}$`, "i").test(file);
}

async function runFilePresence(config, target) {
  const files = await walkFiles(targetSourceRoot(target));
  const patterns = config.patterns ?? [];
  const matches = files.filter((file) => patterns.some((pattern) => wildcardMatches(file.relative, pattern)));
  return {
    result: matches.length > 0 ? "observed" : "not-observed",
    evidence: matches.slice(0, 25).map((file) => ({ type: "file", path: file.relative })),
    limitations: ["File presence does not prove that a control operates effectively"],
  };
}

async function runSourcePattern(config, target) {
  const files = await walkFiles(targetSourceRoot(target));
  const include = config.include ?? ["**/*.js", "**/*.jsx", "**/*.ts", "**/*.tsx", "**/*.json", "**/*.yaml", "**/*.yml"];
  const patterns = (config.patterns ?? []).map((pattern) => new RegExp(pattern, "i"));
  const matches = [];

  for (const file of files) {
    if (!include.some((pattern) => wildcardMatches(file.relative, pattern))) continue;
    const stat = await fs.stat(file.absolute).catch(() => null);
    if (!stat || stat.size > 512_000) continue;
    const text = await fs.readFile(file.absolute, "utf8").catch(() => "");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (patterns.some((pattern) => pattern.test(line))) {
        matches.push({ type: "source-location", path: file.relative, line: index + 1 });
      }
    });
    if (matches.length >= 100) break;
  }

  return {
    result: matches.length > 0 ? "observed" : "not-observed",
    evidence: matches.slice(0, 100),
    limitations: ["Source pattern matches require human validation and may include false positives"],
  };
}

function analyzeDocumentChecks(body, checks) {
  const observations = {};
  if (checks.includes("title")) {
    const title = body.match(/<title(?:\s[^>]*)?>([^<]*)<\/title>/i)?.[1]?.trim() ?? null;
    observations.title = { present: Boolean(title), length: title?.length ?? 0 };
  }
  if (checks.includes("html-lang")) {
    const language = body.match(/<html(?:\s[^>]*)?\slang=["']([^"']+)["']/i)?.[1] ?? null;
    observations.html_lang = { present: Boolean(language), value: language };
  }
  if (checks.includes("img-alt")) {
    const images = [...body.matchAll(/<img\b[^>]*>/gi)];
    const missingAlt = images.filter((match) => !/\salt\s*=/i.test(match[0]));
    observations.img_alt = { images_found: images.length, missing_alt: missingAlt.length };
  }
  if (checks.includes("video-captions")) {
    const videos = [...body.matchAll(/<video\b[^>]*>[\s\S]*?<\/video>/gi)];
    const withCaptions = videos.filter((match) => /<track\b[^>]*\bkind\s*=\s*["'](captions|subtitles)["']/i.test(match[0]));
    observations.video_captions = { videos_found: videos.length, with_caption_track: withCaptions.length };
  }
  if (checks.includes("video-audio-description")) {
    const videos = [...body.matchAll(/<video\b[^>]*>[\s\S]*?<\/video>/gi)];
    const withDescriptions = videos.filter((match) => /<track\b[^>]*\bkind\s*=\s*["']descriptions["']/i.test(match[0]));
    observations.video_audio_description = { videos_found: videos.length, with_description_track: withDescriptions.length };
  }
  if (checks.includes("autoplay-media")) {
    const autoplayTags = [...body.matchAll(/<(audio|video)\b[^>]*>/gi)].filter((match) => /\sautoplay(\s|=|>)/i.test(match[0]));
    const withoutMuteAndControls = autoplayTags.filter(
      (match) => !(/\smuted(\s|=|>)/i.test(match[0]) && /\scontrols(\s|=|>)/i.test(match[0])),
    );
    observations.autoplay_media = { autoplay_elements: autoplayTags.length, without_mute_and_controls: withoutMuteAndControls.length };
  }
  if (checks.includes("landmarks")) {
    observations.landmarks = {
      has_main_landmark: /<main\b/i.test(body) || /role\s*=\s*["']main["']/i.test(body),
      has_nav_landmark: /<nav\b/i.test(body) || /role\s*=\s*["']navigation["']/i.test(body),
      has_skip_link: /<a\b[^>]*href\s*=\s*["']#[^"']+["'][^>]*>[\s\S]{0,80}?(skip|jump)/i.test(body),
    };
  }
  if (checks.includes("link-text")) {
    const links = [...body.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)];
    const vague = /^(click here|here|read more|more|link|this link)$/i;
    const ambiguous = links.filter((match) => {
      if (/aria-label\s*=/i.test(match[0])) return false;
      const text = match[1].replace(/<[^>]+>/g, "").trim();
      return text.length === 0 || vague.test(text);
    });
    observations.link_text = { links_found: links.length, empty_or_ambiguous: ambiguous.length };
  }
  if (checks.includes("form-labels")) {
    const controls = [...body.matchAll(/<(input|select|textarea)\b[^>]*>/gi)].filter(
      (match) => !/type\s*=\s*["'](hidden|submit|button|reset)["']/i.test(match[0]),
    );
    const labeledIds = new Set([...body.matchAll(/<label\b[^>]*\sfor\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]));
    const unlabeled = controls.filter((match) => {
      if (/aria-label\s*=|aria-labelledby\s*=/i.test(match[0])) return false;
      const id = match[0].match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1];
      return !id || !labeledIds.has(id);
    });
    observations.form_labels = { controls_found: controls.length, unlabeled: unlabeled.length };
  }
  if (checks.includes("duplicate-ids")) {
    const ids = [...body.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
    const counts = ids.reduce((map, id) => map.set(id, (map.get(id) ?? 0) + 1), new Map());
    observations.duplicate_ids = {
      total_ids: ids.length,
      duplicate_ids: [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id),
    };
  }
  if (checks.includes("viewport-zoom")) {
    const viewportContent =
      body.match(/<meta\b[^>]*name\s*=\s*["']viewport["'][^>]*content\s*=\s*["']([^"']+)["']/i)?.[1] ??
      body.match(/<meta\b[^>]*content\s*=\s*["']([^"']+)["'][^>]*name\s*=\s*["']viewport["']/i)?.[1] ??
      null;
    observations.viewport_zoom = {
      viewport_present: Boolean(viewportContent),
      blocks_zoom: Boolean(
        viewportContent && (/user-scalable\s*=\s*no/i.test(viewportContent) || /maximum-scale\s*=\s*1(\.0)?\b/i.test(viewportContent)),
      ),
    };
  }
  return observations;
}

async function runLocalHttp(config, target) {
  const base = target.interfaces?.web?.base_url;
  if (!base) return { result: "not-run", evidence: [], limitations: ["No web base URL is configured"] };
  const url = assertLocalUrl(new URL(config.path ?? "/", base).toString(), target);
  const response = await fetch(url, {
    method: config.method ?? "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(config.timeout_ms ?? 5000),
  });
  const selectedHeaders = {};
  for (const name of config.capture_headers ?? []) selectedHeaders[name] = response.headers.get(name);
  const documentChecks = config.document_checks ?? [];
  const observations = {};
  if (documentChecks.includes("cookie-flags")) {
    const setCookieValues =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [response.headers.get("set-cookie")].filter(Boolean);
    observations.cookie_flags = setCookieValues.map((raw) => ({
      name: raw.split("=")[0],
      secure: /;\s*Secure/i.test(raw),
      http_only: /;\s*HttpOnly/i.test(raw),
      same_site: raw.match(/;\s*SameSite=([^;]+)/i)?.[1] ?? null,
    }));
  }
  const bodyChecks = documentChecks.filter((check) => check !== "cookie-flags");
  if (bodyChecks.length > 0) {
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > 2_000_000) throw new Error("Response is too large for the local document checker");
    const body = await response.text();
    Object.assign(observations, analyzeDocumentChecks(body, bodyChecks));
  }
  return {
    result: "observed",
    evidence: [{ type: "local-http", url: url.toString(), status: response.status, headers: selectedHeaders, observations }],
    limitations: ["A single response does not establish control effectiveness across the application"],
  };
}

async function runLocalTcpProbe(config, target) {
  const allowedHosts = new Set(target.scope.allowed_hosts ?? []);
  const allowedPorts = new Set((target.scope.allowed_ports ?? []).map(Number));
  const requested = config.targets ?? [...allowedHosts].flatMap((host) => [...allowedPorts].map((port) => ({ host, port })));
  if (requested.length === 0) {
    return { result: "not-run", evidence: [], limitations: ["No approved host/port combinations are configured in scope"] };
  }

  const bounded = requested.slice(0, config.max_targets ?? 25);
  const observations = [];
  for (const { host, port } of bounded) {
    if (!allowedHosts.has(host) || !allowedPorts.has(Number(port))) {
      throw new Error(`Probe target is outside approved scope: ${host}:${port}`);
    }
    const state = await new Promise((resolve) => {
      const socket = net.createConnection({ host, port, timeout: config.timeout_ms ?? 1000 });
      const finish = (result) => {
        socket.destroy();
        resolve(result);
      };
      socket.once("connect", () => finish("open"));
      socket.once("timeout", () => finish("no-response"));
      socket.once("error", () => finish("closed-or-unreachable"));
    });
    observations.push({ host, port: Number(port), state });
  }

  return {
    result: observations.some((observation) => observation.state === "open") ? "observed" : "not-observed",
    evidence: observations.map((observation) => ({ type: "local-tcp-probe", ...observation })),
    limitations: [
      "Only explicitly approved local hosts and ports were probed. A closed local port does not establish that an equivalent production port is closed, and an open port is not itself a finding.",
    ],
  };
}

function localCommandEnvironment() {
  const allowed = ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "HOME", "USERPROFILE"];
  return Object.fromEntries(allowed.filter((name) => process.env[name]).map((name) => [name, process.env[name]]));
}

function safeOutput(text, limit = 8000) {
  return String(text ?? "")
    .replace(/((?:api[_-]?key|access[_-]?token|secret|password|authorization)\s*[:=]\s*)(["']?)[^\s"',;}]+/gi, "$1$2[redacted]")
    .slice(0, Math.min(Number(limit) || 8000, 20_000));
}

function assertLocalCommandConfig(config) {
  const command = String(config.command ?? "").trim();
  if (!command) throw new Error("local-command executor requires a command");
  if (path.basename(command) !== command || /[\\/]/.test(command)) {
    throw new Error("local-command executor only accepts command names resolved from PATH");
  }

  const args = config.args ?? [];
  if (!Array.isArray(args) || args.length > 80 || args.some((arg) => typeof arg !== "string")) {
    throw new Error("local-command executor args must be an array of up to 80 strings");
  }

  const expectedExitCodes = config.expected_exit_codes ?? [0];
  if (!Array.isArray(expectedExitCodes) || expectedExitCodes.some((code) => !Number.isInteger(code))) {
    throw new Error("local-command expected_exit_codes must be an array of integers");
  }

  return { command, args, expectedExitCodes };
}

async function runLocalCommand(config, target) {
  const { command, args, expectedExitCodes } = assertLocalCommandConfig(config);
  const sourceRoot = targetSourceRoot(target);
  const relativeCwd = config.cwd ? String(config.cwd) : ".";
  const cwd = path.resolve(sourceRoot, relativeCwd);
  const relative = path.relative(sourceRoot, cwd);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("local-command cwd must stay inside the approved source path");
  }

  const timeout = Math.min(Number(config.timeout_ms) || 15_000, 120_000);
  const maxBuffer = Math.min(Number(config.max_buffer_bytes) || 2_000_000, 5_000_000);
  const startedAt = new Date().toISOString();
  let status = 0;
  let stdout = "";
  let stderr = "";

  try {
    const result = await execFileAsync(command, args, {
      cwd,
      env: localCommandEnvironment(),
      timeout,
      windowsHide: true,
      maxBuffer,
    });
    stdout = result.stdout ?? "";
    stderr = result.stderr ?? "";
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        result: "not-run",
        evidence: [],
        limitations: [`Required local tool is not installed or not on PATH: ${command}`],
      };
    }
    status = Number.isInteger(error.code) ? error.code : 1;
    stdout = error.stdout ?? "";
    stderr = error.stderr ?? error.message ?? "";
  }

  const expected = expectedExitCodes.includes(status);
  return {
    result: expected ? (config.result_on_expected_exit ?? "observed") : (config.result_on_unexpected_exit ?? "not-observed"),
    evidence: [{
      type: "local-command",
      command,
      args,
      cwd: path.relative(sourceRoot, cwd).split(path.sep).join("/") || ".",
      exit_code: status,
      started_at: startedAt,
      stdout_sample: safeOutput(stdout, config.capture_output_chars),
      stderr_sample: safeOutput(stderr, config.capture_output_chars),
    }],
    limitations: [
      "Local command execution uses an explicit catalog command, no shell, sanitized environment, bounded timeout, and bounded output. Tool findings still require human review before formal use.",
    ],
  };
}

async function execute(test, target) {
  if (test.disposition === "covered-by-existing-evidence") {
    return {
      ...test,
      result: "skipped-covered",
      evidence: [{
        type: "existing-assurance-evidence",
        evidence_id: test.covered_evidence.evidence_id,
        document: test.covered_evidence.document,
      }],
      limitations: ["Existing formal evidence does not replace ongoing technical monitoring or establish coverage outside its stated scope"],
    };
  }
  if (test.disposition !== "ready") {
    return { ...test, result: "not-run", evidence: [] };
  }

  const sourceCatalog = await readJson(path.join(catalogRoot, test.suite, "catalog.json"));
  const nestedDefinitions = (sourceCatalog.suites ?? []).flatMap((group) => group.tests ?? []);
  const definitions = sourceCatalog.tests ?? sourceCatalog.test_scaffolds ?? nestedDefinitions;
  const definition = definitions.find((candidate) => candidate.id === test.id);
  const executor = definition?.executor;

  try {
    let execution;
    if (executor?.handler === "file-presence") execution = await runFilePresence(executor.config ?? {}, target);
    else if (executor?.handler === "source-pattern") execution = await runSourcePattern(executor.config ?? {}, target);
    else if (executor?.handler === "local-http") execution = await runLocalHttp(executor.config ?? {}, target);
    else if (executor?.handler === "local-tcp-probe") execution = await runLocalTcpProbe(executor.config ?? {}, target);
    else if (executor?.handler === "local-command") execution = await runLocalCommand(executor.config ?? {}, target);
    else execution = {
      result: "not-implemented",
      evidence: [],
      limitations: ["No local executor is registered for this scaffolded test"],
    };
    return { ...test, ...execution };
  } catch (error) {
    return {
      ...test,
      result: "error",
      evidence: [],
      limitations: [error instanceof Error ? error.message : "Local test failed"],
    };
  }
}

const options = parseArguments(process.argv);
const target = await loadTarget(options.target);
const catalogs = await loadCatalogs(options.suites);
const evidenceRecords = await loadEvidenceLibrary(options.evidenceLibrary);
const coverage = evaluateCoverage(target, evidenceRecords);
const plan = catalogs.flatMap((catalog) =>
  catalog.tests.map((test) => normalizeTest(catalog.suite, test, target, coverage)),
);

if (options.command === "plan") {
  console.log(JSON.stringify({
    status: "planned",
    target: target.target,
    external_network: "deny",
    evidence_coverage: coverage,
    tests: plan,
    counts: plan.reduce((counts, test) => {
      counts[test.disposition] = (counts[test.disposition] || 0) + 1;
      return counts;
    }, {}),
  }, null, 2));
  process.exit(0);
}

const results = [];
for (const test of plan) results.push(await execute(test, target));
await fs.mkdir(options.output, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const resultFile = path.join(options.output, `assessment-${timestamp}.json`);
const assessment = {
  run_id: crypto.randomUUID(),
  status: "completed",
  classification: "readiness-assessment",
  target: target.target,
  external_network: "deny",
  generated_at: new Date().toISOString(),
  evidence_coverage: coverage,
  results,
};
assessment.report = buildAssessmentReport(assessment);
await fs.writeFile(resultFile, JSON.stringify(assessment, null, 2));
let mongoPersisted = false;
let mongoError = null;
try {
  mongoPersisted = await persistAssessment(assessment);
} catch (error) {
  mongoError = error;
}
await closeDatabase();
if (mongoError) fail(`Assessment file was written, but MongoDB persistence failed: ${mongoError.message}`);

console.log(JSON.stringify({
  status: "completed",
  result_file: resultFile,
  result_count: results.length,
  mongo_persisted: mongoPersisted,
  forecast: assessment.report.overall,
}, null, 2));
