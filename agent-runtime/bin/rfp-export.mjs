#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { buildRfpSecuritySummary } from "../lib/rfp-export.mjs";

function fail(message) {
  console.error(JSON.stringify({ status: "error", error: message }, null, 2));
  process.exit(1);
}

const args = process.argv.slice(2);
const value = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};

const assessmentFile = value("--assessment");
const outputFile = value("--output");
const audienceTier = value("--audience-tier") ?? "public-rfp";

if (!assessmentFile) {
  fail("Usage: localproof-rfp-export --assessment <assessment.json> [--output <rfp-summary.json>] [--audience-tier public-rfp|nda-rfp|restricted-buyer-review|internal-only]");
}

try {
  const assessment = JSON.parse(await fs.readFile(path.resolve(assessmentFile), "utf8"));
  const summary = buildRfpSecuritySummary(assessment, { audienceTier });
  const serialized = `${JSON.stringify(summary, null, 2)}\n`;

  if (outputFile) {
    const resolved = path.resolve(outputFile);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, serialized);
    console.log(JSON.stringify({
      status: "exported",
      output: resolved,
      classification: summary.classification,
      audience_tier: summary.audience_tier,
    }, null, 2));
  } else {
    process.stdout.write(serialized);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : "RFP export failed");
}
