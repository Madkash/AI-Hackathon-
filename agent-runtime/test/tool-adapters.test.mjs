import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import {
  runAxeCli,
  runGitleaks,
  runGrype,
  runSemgrep,
  runSyft,
  runToolAdapter,
  runTrivy,
  runZapBaseline,
} from "../lib/tool-adapters.mjs";

async function workspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-tools-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(path.join(root, "src", "app.js"), "console.log('hello');\n", "utf8");
  await fs.writeFile(path.join(root, "semgrep-rules.yml"), "rules: []\n", "utf8");

  const fakeTool = path.join(root, "fake-tool.mjs");
  await fs.writeFile(fakeTool, `
const mode = process.argv[2];
const args = process.argv.slice(3);

if (mode === "semgrep") {
  console.log(JSON.stringify({
    results: [{
      check_id: "javascript.express.security",
      path: "src/app.js",
      start: { line: 1 },
      extra: {
        severity: "ERROR",
        message: "hardcoded api_key=super-secret-value"
      }
    }]
  }));
  process.exit(1);
}

if (mode === "gitleaks") {
  console.log(JSON.stringify({ args, findings: [] }));
  process.exit(0);
}

if (mode === "syft") {
  console.log(JSON.stringify({
    artifacts: [
      { name: "express", version: "4.18.2", type: "npm", language: "javascript", purl: "pkg:npm/express@4.18.2" },
      { name: "yaml", version: "2.8.1", type: "npm", language: "javascript" }
    ],
    relationships: [{ parent: "a", child: "b" }]
  }));
  process.exit(0);
}

if (mode === "grype") {
  console.log(JSON.stringify({
    matches: [{
      vulnerability: { id: "CVE-2026-0001", severity: "High" },
      artifact: { name: "express", version: "4.18.2", type: "npm" }
    }]
  }));
  process.exit(0);
}

if (mode === "trivy") {
  console.log(JSON.stringify({
    Results: [{
      Target: "src",
      Vulnerabilities: [{
        VulnerabilityID: "CVE-2026-0002",
        PkgName: "openssl",
        InstalledVersion: "1.0.0",
        Severity: "CRITICAL"
      }],
      Secrets: [{
        RuleID: "aws-access-key",
        Category: "AWS",
        Severity: "HIGH",
        Secret: "AKIA-SHOULD-BE-REDACTED"
      }]
    }]
  }));
  process.exit(0);
}

if (mode === "axe") {
  console.log(JSON.stringify([{
    url: "http://localhost:3000/",
    violations: [{
      id: "image-alt",
      impact: "serious",
      help: "Images must have alternate text",
      nodes: [{ target: ["img"] }]
    }],
    incomplete: [],
    passes: [{ id: "document-title" }]
  }]));
  process.exit(1);
}

if (mode === "zap") {
  const reportIndex = args.indexOf("-J");
  const reportPath = reportIndex >= 0 ? args[reportIndex + 1] : null;
  if (reportPath) {
    await import("node:fs/promises").then((fs) => fs.writeFile(reportPath, JSON.stringify({
      site: [{
        "@name": "http://localhost:3000",
        alerts: [{
          pluginid: "10021",
          riskdesc: "Medium (High)",
          alert: "X-Content-Type-Options Header Missing",
          confidence: "High",
          instances: [{ uri: "http://localhost:3000/" }]
        }]
      }]
    })));
  }
  process.exit(1);
}

if (mode === "bad-json") {
  console.log("not json secret=should-not-leak");
  process.exit(0);
}

console.error("unknown fake mode " + mode);
process.exit(2);
`, "utf8");

  return { root, fakeTool };
}

function fakeConfig(root, fakeTool, mode, extra = {}) {
  return {
    sourceRoot: root,
    sourcePath: "src",
    command: process.execPath,
    commandArgsPrefix: [fakeTool, mode],
    timeoutMs: 10_000,
    maxBufferBytes: 1024 * 1024,
    ...extra,
  };
}

test("runSemgrep requires a local rules/config path", async (t) => {
  const { root, fakeTool } = await workspace(t);

  const result = await runSemgrep(fakeConfig(root, fakeTool, "semgrep"));

  assert.equal(result.result, "error");
  assert.match(result.limitations[0], /semgrep rules\/config path is required/);
});

test("runSemgrep summarizes JSON findings and redacts obvious secrets", async (t) => {
  const { root, fakeTool } = await workspace(t);

  const result = await runSemgrep(fakeConfig(root, fakeTool, "semgrep", {
    rulesPath: "semgrep-rules.yml",
  }));

  assert.equal(result.result, "not-observed");
  assert.equal(result.evidence[0].tool, "semgrep");
  assert.equal(result.evidence[0].exit_code, 1);
  assert.equal(result.evidence[0].counts.findings, 1);
  assert.equal(result.evidence[0].counts.errors, 0);
  assert.match(result.evidence[0].stdout_sample, /api_key=\[redacted\]/);
  assert.doesNotMatch(result.evidence[0].stdout_sample, /super-secret-value/);
  assert.equal(result.evidence[0].sample[0].check_id, "javascript.express.security");
  assert.match(result.evidence[0].sample[0].message, /api_key=\[redacted\]/);
  assert.ok(result.evidence[0].command.args.includes("--metrics=off"));
});

test("runSemgrep resolves relative rules from approved catalog roots", async (t) => {
  const { root, fakeTool } = await workspace(t);
  const catalogRoot = path.join(root, "..", "catalog-security");
  const rulesPath = path.join(catalogRoot, "semgrep-rules", "localproof-javascript.yml");
  await fs.mkdir(path.dirname(rulesPath), { recursive: true });
  await fs.writeFile(rulesPath, "rules: []\n", "utf8");

  const result = await runSemgrep(fakeConfig(root, fakeTool, "semgrep", {
    rulesPath: "semgrep-rules/localproof-javascript.yml",
    approvedConfigRoots: [catalogRoot],
  }));

  assert.equal(result.result, "not-observed");
  assert.ok(result.evidence[0].command.args.includes(path.resolve(rulesPath)));
});

test("runGitleaks uses redacted JSON detect output and reports clean scans as observed", async (t) => {
  const { root, fakeTool } = await workspace(t);

  const result = await runGitleaks(fakeConfig(root, fakeTool, "gitleaks"));

  assert.equal(result.result, "observed");
  assert.equal(result.evidence[0].counts.findings, 0);
  assert.deepEqual(result.evidence[0].sample, []);
  assert.ok(result.evidence[0].command.args.includes("--redact"));
  assert.ok(result.evidence[0].command.args.includes("--report-format"));
  assert.ok(result.evidence[0].command.args.includes("json"));
  assert.ok(result.evidence[0].command.args.includes("--source"));
});

test("runSyft treats artifact inventory as observed SBOM evidence", async (t) => {
  const { root, fakeTool } = await workspace(t);

  const result = await runSyft(fakeConfig(root, fakeTool, "syft"));

  assert.equal(result.result, "observed");
  assert.equal(result.evidence[0].counts.artifacts, 2);
  assert.equal(result.evidence[0].counts.relationships, 1);
  assert.equal(result.evidence[0].sample[0].name, "express");
  assert.ok(result.evidence[0].command.args.some((arg) => arg.startsWith("dir:")));
});

test("runGrype summarizes offline-ish vulnerability matches as not observed readiness", async (t) => {
  const { root, fakeTool } = await workspace(t);

  const result = await runGrype(fakeConfig(root, fakeTool, "grype"));

  assert.equal(result.result, "not-observed");
  assert.equal(result.evidence[0].counts.matches, 1);
  assert.equal(result.evidence[0].counts.vulnerabilities, 1);
  assert.equal(result.evidence[0].counts.severities.high, 1);
  assert.equal(result.evidence[0].sample[0].vulnerability_id, "CVE-2026-0001");
  assert.ok(result.evidence[0].command.args.some((arg) => arg.startsWith("dir:")));
});

test("runTrivy uses no-update/offline flags and summarizes vulnerabilities and secrets", async (t) => {
  const { root, fakeTool } = await workspace(t);

  const result = await runTrivy(fakeConfig(root, fakeTool, "trivy"));

  assert.equal(result.result, "not-observed");
  assert.equal(result.evidence[0].counts.vulnerabilities, 1);
  assert.equal(result.evidence[0].counts.secrets, 1);
  assert.equal(result.evidence[0].counts.severities.critical, 1);
  assert.ok(result.evidence[0].command.args.includes("--skip-db-update"));
  assert.ok(result.evidence[0].command.args.includes("--skip-java-db-update"));
  assert.ok(result.evidence[0].command.args.includes("--offline-scan"));
  assert.equal(result.evidence[0].sample[1].rule_id, "aws-access-key");
  assert.equal(result.evidence[0].sample[1].Secret, undefined);
});

test("runAxeCli summarizes stdout JSON accessibility violations", async (t) => {
  const { root, fakeTool } = await workspace(t);

  const result = await runAxeCli(fakeConfig(root, fakeTool, "axe", {
    targetUrl: "http://localhost:3000/",
    rules: ["image-alt"],
  }));

  assert.equal(result.result, "not-observed");
  assert.equal(result.evidence[0].counts.violations, 1);
  assert.equal(result.evidence[0].counts.passes, 1);
  assert.equal(result.evidence[0].counts.impacts.serious, 1);
  assert.ok(result.evidence[0].command.args.includes("--stdout"));
  assert.ok(result.evidence[0].command.args.includes("--rules"));
  assert.equal(result.evidence[0].sample[0].id, "image-alt");
});

test("runZapBaseline reads JSON report output and summarizes alerts", async (t) => {
  const { root, fakeTool } = await workspace(t);

  const result = await runZapBaseline(fakeConfig(root, fakeTool, "zap", {
    targetUrl: "http://localhost:3000/",
    minutes: 0,
  }));

  assert.equal(result.result, "not-observed");
  assert.equal(result.evidence[0].counts.sites, 1);
  assert.equal(result.evidence[0].counts.alerts, 1);
  assert.equal(result.evidence[0].counts.risks.medium, 1);
  assert.ok(result.evidence[0].command.args.includes("-J"));
  assert.ok(result.evidence[0].command.args.includes("-z"));
  assert.match(result.evidence[0].command.args.join(" "), /start\.checkForUpdates=false/);
  assert.equal(result.evidence[0].sample[0].plugin_id, "10021");
});

test("missing local tools return not-run with summary evidence", async (t) => {
  const { root } = await workspace(t);

  const result = await runGitleaks({
    sourceRoot: root,
    sourcePath: "src",
    command: "openclaw-definitely-missing-gitleaks",
  });

  assert.equal(result.result, "not-run");
  assert.equal(result.evidence[0].tool, "gitleaks");
  assert.equal(result.evidence[0].missing_tool, true);
  assert.match(result.limitations[0], /not installed or not on PATH: gitleaks/);
});

test("source path and cwd are constrained to the approved source root", async (t) => {
  const { root, fakeTool } = await workspace(t);

  const sourcePathResult = await runSyft(fakeConfig(root, fakeTool, "syft", {
    sourcePath: "..",
  }));
  const cwdResult = await runSyft(fakeConfig(root, fakeTool, "syft", {
    cwd: "..",
  }));

  assert.equal(sourcePathResult.result, "error");
  assert.match(sourcePathResult.limitations[0], /sourcePath must stay inside/);
  assert.equal(cwdResult.result, "error");
  assert.match(cwdResult.limitations[0], /cwd must stay inside/);
});

test("runToolAdapter dispatches by tool name and reports unparseable JSON as error", async (t) => {
  const { root, fakeTool } = await workspace(t);

  const result = await runToolAdapter("syft", fakeConfig(root, fakeTool, "bad-json"));

  assert.equal(result.result, "error");
  assert.match(result.limitations[0], /did not produce parseable JSON/);
  assert.match(result.evidence[0].stdout_sample, /secret=\[redacted\]/);
  assert.doesNotMatch(result.evidence[0].stdout_sample, /should-not-leak/);
});
