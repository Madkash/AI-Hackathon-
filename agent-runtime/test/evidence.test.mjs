import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { evaluateCoverage, importEvidence, loadEvidenceLibrary } from "../lib/evidence.mjs";

const now = new Date("2026-09-12T12:00:00.000Z");
const target = {
  target: {
    name: "localproof-compliance-console",
    version: "0.1.0",
    aliases: ["console"],
  },
};

function baseMetadata(kind, overrides = {}) {
  const { fields = {}, ...topLevelOverrides } = overrides;
  return {
    fields: {
      kind,
      subject: "Example Software Company",
      covered_product: "localproof-compliance-console",
      scope: "Development and operation of the LocalProof software service",
      issuer: kind === "soc2-type2-report" ? "Example CPA Firm" : "Example Accredited Certification Body",
      standard: kind === "soc2-type2-report" ? "AICPA SOC 2 Type II" : "ISO/IEC 27001:2022",
      ...fields,
    },
    covered_target_names: ["localproof-compliance-console"],
    scope_covers_target: true,
    review_status: "approved",
    verification: {
      issuer_verified: true,
      accreditation_verified: kind === "iso27001-certificate",
      auditor_eligibility_verified: kind === "soc2-type2-report",
    },
    notes: ["Test metadata"],
    ...topLevelOverrides,
  };
}

async function importRecord(t, metadata, documentText = "Example assurance evidence document") {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "localproof-evidence-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));

  const document = path.join(workspace, "evidence.txt");
  const library = path.join(workspace, "library");
  await fs.writeFile(document, documentText, "utf8");

  const imported = await importEvidence({ target, document, metadata, library });
  const records = await loadEvidenceLibrary(library);

  assert.equal(records.length, 1);
  assert.equal(records[0].evidence_id, imported.record.evidence_id);
  assert.equal(records[0].extraction.method, "local-text+reviewed-metadata");
  return { imported, records };
}

test("approved ISO 27001 evidence covers the ISO suite", async (t) => {
  const metadata = baseMetadata("iso27001-certificate", {
    fields: {
      issue_date: "2026-01-15",
      valid_from: "2026-01-15",
      valid_until: "2029-01-14",
      certificate_number: "ISO-APPROVED-001",
    },
  });
  const { imported, records } = await importRecord(t, metadata, "ISO/IEC 27001 certificate");

  const coverage = evaluateCoverage(target, records, now);

  assert.equal(imported.record.extraction.review_status, "approved");
  assert.equal(coverage.iso27001.covered, true);
  assert.equal(coverage.iso27001.evidence_id, imported.record.evidence_id);
  assert.equal(coverage.iso27001.valid_until, "2029-01-14");
  assert.equal(coverage.soc2.covered, false);
});

test("expired ISO 27001 evidence is not accepted as coverage", async (t) => {
  const metadata = baseMetadata("iso27001-certificate", {
    fields: {
      issue_date: "2023-01-15",
      valid_from: "2023-01-15",
      valid_until: "2026-01-14",
      certificate_number: "ISO-EXPIRED-001",
    },
  });
  const { records } = await importRecord(t, metadata, "Expired ISO/IEC 27001 certificate");

  const coverage = evaluateCoverage(target, records, now);

  assert.equal(coverage.iso27001.covered, false);
  assert.equal(
    coverage.iso27001.reason,
    "Approved evidence is expired or outside the accepted SOC 2 recency window",
  );
});

test("approved SOC 2 Type II evidence inside the 455-day window covers the SOC 2 suite", async (t) => {
  const metadata = baseMetadata("soc2-type2-report", {
    fields: {
      period_start: "2024-09-16",
      period_end: "2025-09-15",
    },
  });
  const { imported, records } = await importRecord(t, metadata, "SOC 2 Type II report");

  const coverage = evaluateCoverage(target, records, now);

  assert.equal(coverage.soc2.covered, true);
  assert.equal(coverage.soc2.evidence_id, imported.record.evidence_id);
  assert.equal(coverage.soc2.period_end, "2025-09-15");
  assert.equal(coverage.iso27001.covered, false);
});

test("SOC 2 Type II evidence outside the 455-day window is not accepted as coverage", async (t) => {
  const metadata = baseMetadata("soc2-type2-report", {
    fields: {
      period_start: "2024-06-02",
      period_end: "2025-06-01",
    },
  });
  const { records } = await importRecord(t, metadata, "Stale SOC 2 Type II report");

  const coverage = evaluateCoverage(target, records, now);

  assert.equal(coverage.soc2.covered, false);
  assert.equal(
    coverage.soc2.reason,
    "Approved evidence is expired or outside the accepted SOC 2 recency window",
  );
});

test("approved evidence with a scope mismatch is not accepted as coverage", async (t) => {
  const metadata = baseMetadata("iso27001-certificate", {
    covered_target_names: ["other-product"],
    scope_covers_target: false,
    fields: {
      valid_until: "2029-01-14",
    },
  });
  const { records } = await importRecord(t, metadata, "Current ISO/IEC 27001 certificate for another scope");

  const coverage = evaluateCoverage(target, records, now);

  assert.equal(coverage.iso27001.covered, false);
  assert.equal(coverage.iso27001.reason, "No approved, scope-matched evidence with verified issuing authority");
});

test("needs-review evidence is imported but not accepted as coverage", async (t) => {
  const metadata = baseMetadata("iso27001-certificate", {
    review_status: undefined,
    fields: {
      valid_until: "2029-01-14",
    },
  });
  const { imported, records } = await importRecord(t, metadata, "Unreviewed ISO/IEC 27001 certificate");

  const coverage = evaluateCoverage(target, records, now);

  assert.equal(imported.record.extraction.review_status, "needs-review");
  assert.equal(coverage.iso27001.covered, false);
  assert.equal(coverage.iso27001.reason, "No approved, scope-matched evidence with verified issuing authority");
});

test("an unverified issuing authority cannot suppress readiness work", async (t) => {
  const metadata = baseMetadata("iso27001-certificate", {
    fields: { valid_until: "2029-01-14" },
    verification: {
      issuer_verified: false,
      accreditation_verified: false,
      auditor_eligibility_verified: false,
    },
  });
  const { records } = await importRecord(t, metadata, "ISO/IEC 27001 certificate with unverified issuer");
  const coverage = evaluateCoverage(target, records, now);
  assert.equal(coverage.iso27001.covered, false);
});
