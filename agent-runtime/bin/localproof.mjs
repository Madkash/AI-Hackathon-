#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";
import YAML from "yaml";

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
    fail("Usage: localproof <plan|run> --target <yaml> --suite <suite|all> [--output <directory>]");
  }

  const value = (flag) => {
    const index = rest.indexOf(flag);
    return index >= 0 ? rest[index + 1] : null;
  };

  const target = value("--target");
  const suite = value("--suite") || "all";
  const output = value("--output");
  if (!target) fail("--target is required");
  if (suite !== "all" && !supportedSuites.includes(suite)) fail(`Unsupported suite: ${suite}`);
  if (command === "run" && !output) fail("--output is required when running tests");

  return {
    command,
    target: path.resolve(target),
    suites: suite === "all" ? supportedSuites : [suite],
    output: output ? path.resolve(output) : null,
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

function normalizeTest(suite, test, target) {
  const executor = test.executor ?? { handler: test.automation === "manual" ? "manual" : "unimplemented" };
  const active = executor.handler === "local-http" || executor.handler === "local-command";
  const intrusive = test.safety === "intrusive";
  let disposition = "ready";
  let reason = null;

  if (intrusive) {
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
  if (documentChecks.length > 0) {
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > 2_000_000) throw new Error("Response is too large for the local document checker");
    const body = await response.text();
    if (documentChecks.includes("title")) {
      const title = body.match(/<title(?:\s[^>]*)?>([^<]*)<\/title>/i)?.[1]?.trim() ?? null;
      observations.title = { present: Boolean(title), length: title?.length ?? 0 };
    }
    if (documentChecks.includes("html-lang")) {
      const language = body.match(/<html(?:\s[^>]*)?\slang=["']([^"']+)["']/i)?.[1] ?? null;
      observations.html_lang = { present: Boolean(language), value: language };
    }
  }
  return {
    result: "observed",
    evidence: [{ type: "local-http", url: url.toString(), status: response.status, headers: selectedHeaders, observations }],
    limitations: ["A single response does not establish control effectiveness across the application"],
  };
}

async function execute(test, target) {
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
const plan = catalogs.flatMap((catalog) =>
  catalog.tests.map((test) => normalizeTest(catalog.suite, test, target)),
);

if (options.command === "plan") {
  console.log(JSON.stringify({
    status: "planned",
    target: target.target,
    external_network: "deny",
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
await fs.writeFile(resultFile, JSON.stringify({
  status: "completed",
  classification: "readiness-assessment",
  target: target.target,
  external_network: "deny",
  generated_at: new Date().toISOString(),
  results,
}, null, 2));

console.log(JSON.stringify({ status: "completed", result_file: resultFile, result_count: results.length }, null, 2));
