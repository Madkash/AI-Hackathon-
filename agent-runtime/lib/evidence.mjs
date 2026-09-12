import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { execFileAsync } from "./exec.mjs";

function compact(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value ?? null;
}

function labelled(text, labels) {
  for (const label of labels) {
    const match = text.match(new RegExp(`(?:^|\\n)\\s*(?:${label})\\s*[:\\-]\\s*([^\\n]{2,240})`, "i"));
    if (match) return compact(match[1]);
  }
  return null;
}

function normalizedName(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseDate(value) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : null;
}

async function readText(file) {
  const extension = path.extname(file).toLowerCase();
  if ([".txt", ".md", ".json", ".yaml", ".yml"].includes(extension)) {
    return { text: await fs.readFile(file, "utf8"), method: "local-text" };
  }
  if (extension === ".pdf") {
    try {
      const { stdout } = await execFileAsync("pdftotext", ["-layout", file, "-"], {
        windowsHide: true,
        maxBuffer: 20 * 1024 * 1024,
      });
      if (!stdout.trim()) throw new Error("PDF contains no extractable text");
      return { text: stdout, method: "local-pdftotext" };
    } catch (error) {
      throw new Error(`PDF extraction requires local Poppler pdftotext, or an OCR-produced text file: ${error.message}`);
    }
  }
  throw new Error(`Unsupported evidence format: ${extension || "no extension"}`);
}

function heuristicFields(text) {
  const soc2 = /\bSOC\s*2\b[\s\S]{0,100}\bType\s*(?:II|2)\b/i.test(text);
  const iso = /\bISO(?:\/IEC)?\s*27001\b/i.test(text);
  const kind = soc2 ? "soc2-type2-report" : iso ? "iso27001-certificate" : "unknown";
  return {
    kind,
    subject: labelled(text, ["certificate holder", "service organization", "organization", "subject"]),
    covered_product: labelled(text, ["covered product", "product", "service"]),
    scope: labelled(text, ["certification scope", "system scope", "scope"]),
    issuer: labelled(text, ["certification body", "independent service auditor", "auditor", "cpa firm", "issuer"]),
    accreditation_body: labelled(text, ["accreditation body", "accredited by"]),
    standard: soc2 ? "AICPA SOC 2 Type II" : iso ? "ISO/IEC 27001" : null,
    issue_date: parseDate(labelled(text, ["issue date", "issued", "report date"])),
    period_start: parseDate(labelled(text, ["period start", "review period from", "audit period from"])),
    period_end: parseDate(labelled(text, ["period end", "review period to", "audit period to"])),
    valid_from: parseDate(labelled(text, ["valid from", "effective from"])),
    valid_until: parseDate(labelled(text, ["valid until", "valid through", "expiration date", "expiry date", "expires"])),
    certificate_number: labelled(text, ["certificate number", "certificate no\\.?", "registration number"]),
  };
}

export async function importEvidence({ target, document, metadata = {}, library }) {
  const bytes = await fs.readFile(document);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const extracted = await readText(document);
  const heuristic = heuristicFields(extracted.text);
  const suppliedFields = metadata.fields ?? {};
  const fields = { ...heuristic, ...suppliedFields };
  fields.kind = suppliedFields.kind ?? heuristic.kind;

  const record = {
    schema_version: "1.0",
    evidence_id: sha256,
    target: { name: target.target.name, version: target.target.version ?? null },
    document: {
      filename: path.basename(document),
      source_path: path.resolve(document),
      sha256,
    },
    fields,
    target_match: {
      scope_covers_target: metadata.scope_covers_target === true,
      covered_target_names: metadata.covered_target_names ?? [],
    },
    verification: {
      issuer_verified: metadata.verification?.issuer_verified === true,
      accreditation_verified: metadata.verification?.accreditation_verified === true,
      auditor_eligibility_verified: metadata.verification?.auditor_eligibility_verified === true,
    },
    extraction: {
      method: metadata.fields ? `${extracted.method}+reviewed-metadata` : extracted.method,
      imported_at: new Date().toISOString(),
      review_status: metadata.review_status ?? "needs-review",
      notes: metadata.notes ?? [],
    },
  };

  await fs.mkdir(library, { recursive: true });
  const output = path.join(library, `${sha256}.evidence.json`);
  await fs.writeFile(output, JSON.stringify(record, null, 2));
  return { record, output };
}

export async function loadEvidenceLibrary(directory) {
  if (!directory) return [];
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  const records = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".evidence.json")) continue;
    const file = path.join(directory, entry.name);
    try {
      records.push(JSON.parse(await fs.readFile(file, "utf8")));
    } catch {
      records.push({ evidence_id: entry.name, invalid: true });
    }
  }
  return records;
}

export function evaluateCoverage(target, records, now = new Date()) {
  const targetNames = [target.target.name, ...(target.target.aliases ?? [])].map(normalizedName).filter(Boolean);
  const decisions = {};
  for (const suite of ["soc2", "iso27001"]) {
    const matchingKind = suite === "soc2" ? "soc2-type2-report" : "iso27001-certificate";
    const candidates = records.filter((record) => {
      if (record.invalid || record.fields?.kind !== matchingKind) return false;
      const declared = (record.target_match?.covered_target_names ?? []).map(normalizedName);
      const nameMatch = declared.some((name) => targetNames.includes(name));
      const authorityVerified = suite === "iso27001"
        ? record.verification?.issuer_verified === true && record.verification?.accreditation_verified === true
        : record.verification?.issuer_verified === true && record.verification?.auditor_eligibility_verified === true;
      return record.extraction?.review_status === "approved" &&
        record.target_match?.scope_covers_target === true && nameMatch && authorityVerified;
    });
    const valid = candidates.find((record) => {
      if (suite === "iso27001") {
        const expires = Date.parse(record.fields?.valid_until);
        return Number.isFinite(expires) && expires >= now.getTime();
      }
      const periodEnd = Date.parse(record.fields?.period_end);
      const ageDays = (now.getTime() - periodEnd) / 86_400_000;
      return Number.isFinite(periodEnd) && ageDays >= 0 && ageDays <= 455;
    });
    const staleReason = suite === "iso27001"
      ? "Approved evidence has expired (past its valid_until date)"
      : "Approved evidence is outside the accepted SOC 2 Type II recency window";
    decisions[suite] = valid ? {
      covered: true,
      evidence_id: valid.evidence_id,
      document: valid.document?.filename,
      issuer: valid.fields?.issuer ?? null,
      scope: valid.fields?.scope ?? null,
      valid_until: valid.fields?.valid_until ?? null,
      period_end: valid.fields?.period_end ?? null,
    } : {
      covered: false,
      reason: candidates.length ? staleReason : "No approved, scope-matched evidence with verified issuing authority",
    };
  }
  return decisions;
}

export async function readMetadata(file) {
  if (!file) return {};
  const text = await fs.readFile(file, "utf8");
  return path.extname(file).toLowerCase() === ".json" ? JSON.parse(text) : YAML.parse(text);
}
