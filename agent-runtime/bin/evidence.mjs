#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";
import { evaluateCoverage, importEvidence, loadEvidenceLibrary, readMetadata } from "../lib/evidence.mjs";
import { closeDatabase, persistEvidence } from "../lib/mongodb.mjs";

function fail(message) {
  console.error(JSON.stringify({ status: "error", error: message }, null, 2));
  process.exit(1);
}

const [command, ...args] = process.argv.slice(2);
const value = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
if (!command || !["import", "evaluate"].includes(command)) {
  fail("Usage: evidence <import|evaluate> --target <yaml> --library <directory> [--document <file>] [--metadata <yaml|json>]");
}

const targetFile = value("--target");
const library = value("--library");
if (!targetFile || !library) fail("--target and --library are required");
const target = YAML.parse(await fs.readFile(path.resolve(targetFile), "utf8"));
if (target?.data_handling?.external_network !== "deny") fail("Target must deny external network access");

if (command === "import") {
  const document = value("--document");
  if (!document) fail("--document is required for import");
  try {
    const metadata = await readMetadata(value("--metadata"));
    const imported = await importEvidence({
      target,
      document: path.resolve(document),
      metadata,
      library: path.resolve(library),
    });
    const mongo_persisted = await persistEvidence(imported.record);
    await closeDatabase();
    console.log(JSON.stringify({
      status: "imported",
      evidence_file: imported.output,
      evidence_id: imported.record.evidence_id,
      extracted: imported.record.fields,
      review_status: imported.record.extraction.review_status,
      mongo_persisted,
    }, null, 2));
  } catch (error) {
    await closeDatabase();
    fail(error.message);
  }
} else {
  const records = await loadEvidenceLibrary(path.resolve(library));
  console.log(JSON.stringify({
    status: "evaluated",
    evidence_count: records.length,
    coverage: evaluateCoverage(target, records),
  }, null, 2));
}
