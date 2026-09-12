import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const runtimeRoot = path.resolve(testDirectory, "..");
const repositoryRoot = path.resolve(runtimeRoot, "..");
const catalogRoot = path.join(repositoryRoot, "compliance-suites");
const catalogNames = ["soc2", "iso27001", "security", "wcag"];
const knownHandlers = new Set([
  "axe-cli",
  "file-presence",
  "gitleaks",
  "grype",
  "local-command",
  "local-http",
  "local-tcp-probe",
  "semgrep",
  "source-pattern",
  "syft",
  "trivy",
  "zap-baseline",
]);

async function readCatalog(name) {
  return JSON.parse(await fs.readFile(path.join(catalogRoot, name, "catalog.json"), "utf8"));
}

function catalogDisclaimer(catalog) {
  return [
    catalog.disclaimer,
    catalog.suite?.disclaimer,
    catalog.suite?.certificationBoundary,
    catalog.suite?.purpose,
    catalog.runtimePolicy?.disclaimer,
  ].filter(Boolean).join(" ");
}

function collectTests(catalog) {
  if (Array.isArray(catalog.test_scaffolds)) return catalog.test_scaffolds;
  if (Array.isArray(catalog.tests)) return catalog.tests;
  return (catalog.suites ?? []).flatMap((suite) => suite.tests ?? []);
}

test("catalogs carry readiness or non-certification disclaimers", async () => {
  for (const name of catalogNames) {
    const catalog = await readCatalog(name);
    const disclaimer = catalogDisclaimer(catalog);
    assert.match(disclaimer, /readiness|not.*certif|cannot.*conformance|cannot.*determine/i, `${name} needs an RFP-safe disclaimer`);
  }
});

test("safe-active and intrusive security checks are not default-enabled", async () => {
  for (const name of catalogNames) {
    const catalog = await readCatalog(name);
    for (const check of collectTests(catalog)) {
      const safety = check.safety_level ?? check.safety ?? null;
      if (safety === "intrusive" || safety === "safe-active") {
        assert.notEqual(check.default_enabled, true, `${name}:${check.id} must not default-enable ${safety} checks`);
      }
      if (check.default_enabled === true) {
        assert.equal(safety, "passive", `${name}:${check.id} default-enabled checks must be passive`);
      }
    }
  }
});

test("executors use known handlers and include limitations", async () => {
  for (const name of catalogNames) {
    const catalog = await readCatalog(name);
    for (const check of collectTests(catalog)) {
      if (!check.executor) continue;
      assert.ok(knownHandlers.has(check.executor.handler), `${name}:${check.id} uses unknown handler ${check.executor.handler}`);
      assert.ok(String(check.limitations ?? "").trim(), `${name}:${check.id} executor checks must state limitations`);
    }
  }
});
