"use client";

import { useEffect, useMemo, useState } from "react";

const proofBidUrl = "http://127.0.0.1:8765";

const defaultRfpProfile = {
  buyer: "Northeast Health Exchange",
  project: "Security and compliance RFP",
  supplier: "ProofBid Demo Supplier",
  owner: "Supplier Assurance",
  dueDate: "2026-09-18",
  classification: "Buyer-shareable",
  responseStyle: "Concise technical",
};

const sourceMix = [
  { label: "Policies", value: 34, tone: "green" },
  { label: "Controls", value: 26, tone: "blue" },
  { label: "Tests", value: 22, tone: "violet" },
  { label: "Attestations", value: 18, tone: "amber" },
];

const fallbackSoftwareOptions = [
  {
    id: "nextjs-storefront",
    name: "Example Next.js Storefront",
    folder: "nextjs-storefront",
    framework: "Next.js",
    signals: ["package.json", "Dockerfile", "openapi.yaml"],
  },
];

const rfpDocumentCategories = [
  {
    id: "company",
    label: "Company and product overview",
    examples: "supplier profile, platform overview, architecture brief",
    keywords: ["company", "supplier", "product", "overview", "platform", "architecture", "data-flow", "data flow"],
  },
  {
    id: "security",
    label: "Security overview",
    examples: "security whitepaper, secure SDLC, shared responsibility",
    keywords: ["security", "whitepaper", "sdlc", "secure-development", "secure development", "shared-responsibility"],
  },
  {
    id: "soc2",
    label: "SOC 2 report",
    examples: "SOC 2 Type II report, bridge letter",
    keywords: ["soc2", "soc-2", "soc 2", "type ii", "type-ii", "bridge-letter"],
  },
  {
    id: "iso27001",
    label: "ISO 27001 certificate",
    examples: "ISO 27001 certificate, statement of applicability",
    keywords: ["iso27001", "iso-27001", "iso 27001", "soa", "statement-of-applicability"],
  },
  {
    id: "pentest",
    label: "Penetration test summary",
    examples: "pentest attestation, remediation letter",
    keywords: ["pentest", "pen-test", "penetration", "remediation-letter", "attestation"],
  },
  {
    id: "vulnerability",
    label: "Vulnerability management",
    examples: "scanner summary, SBOM, remediation SLA",
    keywords: ["vulnerability", "cve", "scanner", "scan", "sbom", "grype", "trivy", "remediation", "patch"],
  },
  {
    id: "privacy",
    label: "Privacy and data handling",
    examples: "DPA, subprocessor list, data retention policy",
    keywords: ["privacy", "dpa", "gdpr", "subprocessor", "retention", "data-processing"],
  },
  {
    id: "access",
    label: "Access control",
    examples: "SSO, MFA, RBAC, admin access policy",
    keywords: ["sso", "mfa", "rbac", "iam", "access", "admin", "oidc", "least-privilege"],
  },
  {
    id: "resilience",
    label: "Resilience and incident response",
    examples: "BCP, DR plan, incident response, RTO/RPO",
    keywords: ["incident", "bcp", "business-continuity", "disaster", "recovery", "dr", "rto", "rpo"],
  },
  {
    id: "insurance",
    label: "Insurance",
    examples: "cyber liability, E&O, certificate of insurance",
    keywords: ["insurance", "liability", "e&o", "errors", "omissions", "coi"],
  },
  {
    id: "accessibility",
    label: "Accessibility",
    examples: "VPAT, WCAG report, accessibility statement",
    keywords: ["vpat", "wcag", "accessibility", "a11y"],
  },
];

const requirementRows = [
  {
    id: "SEC-04",
    domain: "Identity",
    requirement: "Federated SSO, MFA, and least privilege administration",
    answer: "Supported",
    answerText: "We support federated SSO through OIDC, require MFA for administrative access, and maintain least-privilege admin role assignments.",
    evidence: "OIDC policy, admin role matrix",
    document: "OIDC access policy",
    documentHref: `${proofBidUrl}/documents/oidc-access-policy`,
    notes: "Ready for buyer packet.",
    decision: "pending",
    confidence: 92,
    tone: "green",
  },
  {
    id: "SEC-11",
    domain: "Vuln mgmt",
    requirement: "CVE triage, patch SLA, and remediation evidence",
    answer: "Partial",
    answerText: "We run recurring vulnerability scans and track remediation through an internal queue. Critical and high remediation SLA evidence should be attached before final submission.",
    evidence: "Scanner summary, remediation queue",
    document: "Vulnerability scanner summary",
    documentHref: `${proofBidUrl}/documents/vulnerability-scanner-summary`,
    notes: "Add high-severity SLA attachment.",
    decision: "pending",
    confidence: 68,
    tone: "amber",
  },
  {
    id: "DAT-02",
    domain: "Data",
    requirement: "Encryption in transit, at rest, and key ownership",
    answer: "Supported",
    answerText: "Data is encrypted in transit with TLS and encrypted at rest using managed keys documented in the platform KMS architecture.",
    evidence: "TLS config, KMS architecture",
    document: "KMS architecture brief",
    documentHref: `${proofBidUrl}/documents/kms-architecture-brief`,
    notes: "Use buyer-safe encryption summary.",
    decision: "pending",
    confidence: 86,
    tone: "blue",
  },
  {
    id: "OPS-07",
    domain: "Resilience",
    requirement: "RTO, RPO, incident escalation, and exercise cadence",
    answer: "Needs owner",
    answerText: "Disaster recovery procedures are drafted, but RTO/RPO commitments and incident escalation cadence require operations owner approval.",
    evidence: "DR runbook pending approval",
    document: "DR runbook draft",
    documentHref: `${proofBidUrl}/documents/dr-runbook-draft`,
    notes: "Needs ops owner signoff.",
    decision: "pending",
    confidence: 51,
    tone: "red",
  },
];

const answerTones = {
  Supported: "green",
  Partial: "amber",
  "Needs owner": "red",
  "Not applicable": "blue",
  Drafting: "amber",
};

const seedMessages = [
  {
    role: "buyer",
    label: "Buyer clause SEC-11",
    text: "Describe vulnerability management, including remediation windows for critical and high findings.",
  },
  {
    role: "proofbid",
    label: "ProofBid",
    text: "Draft cites the remediation queue and local scanner summary. High SLA evidence is incomplete.",
  },
  {
    role: "reviewer",
    label: "Reviewer",
    text: "Keep the answer affirmative but flag the SLA attachment for legal review before export.",
  },
];

function Icon({ name }) {
  const paths = {
    command: "M4 5h16M4 12h16M4 19h10",
    export: "M12 3v12M7 8l5-5 5 5M5 21h14v-6",
    matrix: "M4 5h16M4 12h16M4 19h16M8 5v14M16 5v14",
    chat: "M5 5h14v10H8l-3 3V5z",
    evidence: "M4 19V5M4 19h17M8 16v-5M13 16V7M18 16v-3",
    findings: "M12 3 2.8 19h18.4L12 3zM12 9v5M12 17.5v.1",
    settings: "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM19 12l2-1-2-3-2 .4-1-2.4h-4L10 6 8 8l.4 2L6 11v2l2 1 .4 2L8 18l2 2 2.4-1h4L18 18l-1-2 2-.4 2-3-2-1z",
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

function serviceClass(status) {
  if (status === "available" || status === "configured-by-nemoclaw") return "online";
  if (status === "unavailable") return "offline";
  return "waiting";
}

function formatDate(value) {
  if (!value) return "No run yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function readableKey(key) {
  return String(key || "unknown").replaceAll("-", " ");
}

function countEntries(counts) {
  return Object.entries(counts || {}).sort((left, right) => right[1] - left[1]);
}

function readinessTone(label) {
  const text = String(label || "").toLowerCase();
  if (text.includes("ready")) return "green";
  if (text.includes("review")) return "amber";
  return "red";
}

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(100, Math.max(0, number));
}

function normalizedName(value) {
  return String(value || "").toLowerCase().replace(/[_\s]+/g, "-");
}

function formatFileSize(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return "0 KB";
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function createEmptyInventory() {
  return {
    categories: rfpDocumentCategories.map((category) => ({ ...category, files: [] })),
    extraFiles: [],
    duplicateNames: [],
    fileCount: 0,
    totalSize: 0,
  };
}

function categorizeDocumentFiles(files) {
  const inventory = createEmptyInventory();
  const nameCounts = new Map();
  const categoryMap = new Map(inventory.categories.map((category) => [category.id, category]));
  const matchOrder = [
    "soc2",
    "iso27001",
    "pentest",
    "vulnerability",
    "privacy",
    "accessibility",
    "insurance",
    "resilience",
    "access",
    "security",
    "company",
  ].map((id) => rfpDocumentCategories.find((category) => category.id === id)).filter(Boolean);

  files.forEach((file) => {
    const record = {
      name: file.name,
      path: file.webkitRelativePath || file.name,
      size: file.size || 0,
      type: file.type || "document",
    };
    const haystack = normalizedName(`${record.path} ${record.name}`);
    const key = normalizedName(record.name);
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1);

    const category = matchOrder.find((candidate) => (
      candidate.keywords.some((keyword) => haystack.includes(normalizedName(keyword)))
    ));

    if (category) {
      categoryMap.get(category.id)?.files.push(record);
    } else {
      inventory.extraFiles.push(record);
    }

    inventory.fileCount += 1;
    inventory.totalSize += record.size;
  });

  inventory.duplicateNames = [...nameCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([name, count]) => ({ name, count }));

  return inventory;
}

function summarizeDocumentInventory(inventory) {
  const categories = inventory?.categories || [];
  const missing = categories.filter((category) => category.files.length === 0).length;
  const duplicated = categories.filter((category) => category.files.length > 1).length;
  const ready = categories.length - missing;
  return {
    ready,
    missing,
    duplicated,
    extra: inventory?.extraFiles?.length || 0,
    total: categories.length,
    files: inventory?.fileCount || 0,
    size: inventory?.totalSize || 0,
  };
}

function categoryStatus(category) {
  if (!category.files.length) return { label: "Missing", tone: "red" };
  if (category.files.length > 1) return { label: "Duplicate", tone: "amber" };
  return { label: "Ready", tone: "green" };
}

function requirementTone(row) {
  const confidence = clampPercent(row.confidence);
  const hasEvidence = Boolean(String(row.evidence || "").trim());
  if (row.decision === "accepted") return "green";
  if (row.decision === "rejected") return "red";
  if (row.decision === "changes") return "amber";
  if (!row.decision || row.decision === "pending") return "amber";
  if (row.answer === "Not applicable") return "blue";
  if (row.answer === "Needs owner" || !hasEvidence || confidence < 55) return "red";
  if (row.answer === "Partial" || row.answer === "Drafting" || confidence < 75) return "amber";
  return "green";
}

function heatmapStatus(tone) {
  if (tone === "green") return "Ready";
  if (tone === "amber") return "Review";
  if (tone === "red") return "Gap";
  return "N/A";
}

function decisionLabel(decision) {
  if (decision === "accepted") return "Accepted";
  if (decision === "rejected") return "Denied";
  if (decision === "changes") return "Proposed changes";
  return "Pending review";
}

function shortDate(value) {
  if (!value) return "Unscheduled";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function safeFileName(value) {
  return String(value || "rfp-export")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "rfp-export";
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function escapeMarkdownCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function downloadFile(filename, type, content) {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function Dashboard() {
  const [target, setTarget] = useState("nextjs-storefront");
  const [softwareOptions, setSoftwareOptions] = useState(fallbackSoftwareOptions);
  const [softwareError, setSoftwareError] = useState("");
  const [documentInventory, setDocumentInventory] = useState(createEmptyInventory);
  const [documentFolderName, setDocumentFolderName] = useState("");
  const [rfpRequest, setRfpRequest] = useState("");
  const [analysisStarted, setAnalysisStarted] = useState(false);
  const [rfpProfile, setRfpProfile] = useState(defaultRfpProfile);
  const [responseRows, setResponseRows] = useState(requirementRows);
  const [assessment, setAssessment] = useState(null);
  const [assessmentError, setAssessmentError] = useState("");
  const [discovery, setDiscovery] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [thread, setThread] = useState(seedMessages);
  const [draftMessage, setDraftMessage] = useState("");
  const [lastExport, setLastExport] = useState("");

  useEffect(() => {
    let active = true;

    fetch("/api/assessment", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        setAssessment(data);
        setAssessmentError("");
      })
      .catch(() => {
        if (!active) return;
        setAssessmentError("Assessment state is unavailable.");
        setAssessment((current) => current ?? { services: { app: "unavailable", mongodb: "unavailable", inference: "unavailable" } });
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    fetch("/api/software", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        if (!Array.isArray(data.software) || data.software.length === 0) {
          setSoftwareOptions(fallbackSoftwareOptions);
          setSoftwareError(data.error || "");
          return;
        }
        setSoftwareOptions(data.software);
        setSoftwareError("");
        if (!data.software.some((software) => software.id === target)) {
          setTarget(data.software[0].id);
        }
      })
      .catch(() => {
        if (!active) return;
        setSoftwareOptions(fallbackSoftwareOptions);
        setSoftwareError("Software inventory is unavailable, so the demo target is selected.");
      });

    return () => {
      active = false;
    };
  }, [target]);

  function handleDocumentFolder(event) {
    const files = Array.from(event.target.files || []);
    setDocumentInventory(categorizeDocumentFiles(files));
    setDocumentFolderName(files[0]?.webkitRelativePath?.split(/[\\/]/)[0] || "");
  }

  async function runDiscovery(event) {
    event.preventDefault();
    setRunning(true);
    setError("");
    setDiscovery(null);

    try {
      const response = await fetch("/api/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Discovery failed");
      setDiscovery(data);

      const assessmentResponse = await fetch("/api/assessment", { cache: "no-store" });
      if (assessmentResponse.ok) {
        setAssessment(await assessmentResponse.json());
        setAssessmentError("");
      }

      setAnalysisStarted(true);
      window.setTimeout(() => {
        document.getElementById("dashboard")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setRunning(false);
    }
  }

  function addReviewerNote(event) {
    event.preventDefault();
    const text = draftMessage.trim();
    if (!text) return;
    setThread((current) => [
      ...current,
      { role: "reviewer", label: "Reviewer", text },
    ]);
    setDraftMessage("");
  }

  function updateProfile(field, value) {
    setRfpProfile((current) => ({ ...current, [field]: value }));
  }

  function updateResponseRow(id, field, value) {
    setResponseRows((current) => current.map((row) => {
      if (row.id !== id) return row;
      if (field === "answer") return { ...row, answer: value, tone: answerTones[value] || row.tone };
      if (field === "confidence") return { ...row, confidence: clampPercent(value) };
      return { ...row, [field]: value };
    }));
  }

  function setReviewDecision(id, decision) {
    setResponseRows((current) => current.map((row) => {
      if (row.id !== id) return row;
      if (decision === "accepted") return { ...row, decision, answer: "Supported", confidence: Math.max(row.confidence, 80) };
      if (decision === "rejected") return { ...row, decision, answer: "Needs owner", confidence: Math.min(row.confidence, 45) };
      return { ...row, decision, answer: row.answer === "Supported" ? "Drafting" : row.answer };
    }));
  }

  function applyProposedChanges(id) {
    setResponseRows((current) => current.map((row) => {
      if (row.id !== id) return row;
      return {
        ...row,
        answer: "Supported",
        confidence: Math.max(row.confidence, 80),
        decision: "accepted",
        notes: row.notes?.trim() ? row.notes : "Accepted after manual answer update.",
      };
    }));
  }

  const services = assessment?.services || { app: "checking", mongodb: "checking", inference: "checking" };
  const latestTarget = assessment?.latest_target;
  const forecast = assessment?.forecast || { score: 0, label: "Loading", summary: "Loading latest local readiness state." };
  const frameworkCards = assessment?.suites || [];
  const findings = assessment?.concerns || [];
  const resultCounts = countEntries(assessment?.counts?.by_result);
  const dispositionCounts = countEntries(assessment?.counts?.by_disposition);
  const selectedSoftware = softwareOptions.find((software) => software.id === target) || softwareOptions[0] || fallbackSoftwareOptions[0];
  const documentSummary = summarizeDocumentInventory(documentInventory);
  const coveredFrameworks = useMemo(
    () => frameworkCards.filter((card) => card.evidence?.covered).length,
    [frameworkCards],
  );
  const frameworkCoverage = frameworkCards.length ? Math.round((coveredFrameworks / frameworkCards.length) * 100) : 0;
  const forecastScore = clampPercent(forecast.score);
  const rfpReadiness = Math.round((forecastScore * 0.62) + (frameworkCoverage * 0.38));
  const suitePreview = frameworkCards.slice(0, 4);
  const averageConfidence = responseRows.length
    ? Math.round(responseRows.reduce((sum, row) => sum + clampPercent(row.confidence), 0) / responseRows.length)
    : 0;
  const evidenceMatch = Math.round((averageConfidence * 0.7) + (frameworkCoverage * 0.3));
  const openRows = responseRows.filter((row) => row.decision !== "accepted" && row.answer !== "Not applicable").length;
  const rfpSignals = [
    { label: "RFP rows", value: responseRows.length, detail: `${openRows} need review` },
    { label: "Evidence match", value: `${evidenceMatch}%`, detail: `${documentSummary.ready}/${documentSummary.total} doc groups` },
    { label: "Draft confidence", value: `${averageConfidence}%`, detail: rfpProfile.responseStyle },
    { label: "Buyer due", value: shortDate(rfpProfile.dueDate), detail: rfpProfile.classification },
  ];
  const intakeSignals = [
    { label: "Software", value: selectedSoftware?.name || "No target", detail: selectedSoftware?.framework || "Unknown" },
    { label: "Documents", value: `${documentSummary.ready}/${documentSummary.total}`, detail: `${documentSummary.missing} missing` },
    { label: "Duplicates", value: documentSummary.duplicated, detail: `${documentSummary.extra} extra files` },
    { label: "RFP request", value: rfpRequest.trim() ? "Loaded" : "Optional", detail: rfpRequest.trim() ? "buyer request attached" : "can run without it" },
  ];
  const complianceChecklist = [
    {
      label: "Target software selected",
      detail: selectedSoftware ? `${selectedSoftware.folder} | ${selectedSoftware.framework}` : "No software selected",
      tone: selectedSoftware ? "green" : "red",
      status: selectedSoftware ? "Ready" : "Missing",
    },
    {
      label: "RFP evidence folder categorized",
      detail: `${documentSummary.ready} ready, ${documentSummary.missing} missing, ${documentSummary.duplicated} duplicate groups`,
      tone: documentSummary.missing ? "amber" : "green",
      status: documentSummary.missing ? "Partial" : "Ready",
    },
    {
      label: "Buyer request loaded",
      detail: rfpRequest.trim() ? `${rfpRequest.trim().length} characters available for response drafting` : "Proceeding without buyer-supplied request text",
      tone: rfpRequest.trim() ? "green" : "blue",
      status: rfpRequest.trim() ? "Ready" : "Optional",
    },
    {
      label: "LocalProof discovery",
      detail: discovery ? discovery.file : "Discovery has not produced a target proposal yet",
      tone: discovery ? "green" : "amber",
      status: discovery ? "Ready" : "Pending",
    },
    {
      label: "Compliance readiness snapshot",
      detail: `${assessment?.counts?.total ?? 0} checks in the current dashboard snapshot`,
      tone: readinessTone(forecast.label),
      status: forecast.label || "Loading",
    },
    {
      label: "RFP answer review",
      detail: `${openRows} rows still need review before final buyer export`,
      tone: openRows ? "amber" : "green",
      status: openRows ? "Review" : "Ready",
    },
  ];
  const heatmapCells = useMemo(() => responseRows.map((row) => {
    const tone = requirementTone(row);
    const status = heatmapStatus(tone);
    const confidence = clampPercent(row.confidence);
    const evidence = row.evidence?.trim() || "No evidence linked";
    const notes = row.notes?.trim() || "No reviewer notes";
    return {
      id: row.id,
      domain: row.domain,
      requirement: row.requirement,
      answer: row.answer,
      answerText: row.answerText,
      evidence,
      notes,
      confidence,
      tone,
      status,
      tooltip: `${row.id} (${row.domain}) - ${status}. ${decisionLabel(row.decision)}, ${confidence}% confidence. Evidence: ${evidence}. Notes: ${notes}`,
    };
  }), [responseRows]);

  function exportMarkdown() {
    const rows = responseRows.map((row) => (
      `| ${escapeMarkdownCell(row.id)} | ${escapeMarkdownCell(row.domain)} | ${escapeMarkdownCell(heatmapStatus(requirementTone(row)))} | ${escapeMarkdownCell(decisionLabel(row.decision))} | ${escapeMarkdownCell(row.requirement)} | ${escapeMarkdownCell(row.answerText)} | [${escapeMarkdownCell(row.document)}](${row.documentHref}) | ${clampPercent(row.confidence)}% | ${escapeMarkdownCell(row.notes)} |`
    ));
    const lines = [
      `# ${rfpProfile.buyer} - ${rfpProfile.project}`,
      "",
      `Supplier: ${rfpProfile.supplier}`,
      `Owner: ${rfpProfile.owner}`,
      `Due date: ${rfpProfile.dueDate || "Unscheduled"}`,
      `Classification: ${rfpProfile.classification}`,
      `Response style: ${rfpProfile.responseStyle}`,
      `RFP readiness: ${rfpReadiness}/100`,
      `LocalProof forecast: ${forecast.label}`,
      "",
      "## Executive Summary",
      forecast.summary,
      "",
      "## Local Evidence Snapshot",
      `Target: ${latestTarget?.name || "No target loaded"}`,
      `Source revision: ${latestTarget?.version || "unknown"}`,
      `Generated: ${formatDate(assessment?.generated_at)}`,
      `Checks observed: ${assessment?.counts?.total ?? 0}`,
      `Document groups ready: ${documentSummary.ready}/${documentSummary.total}`,
      `Document gaps: ${documentSummary.missing} missing, ${documentSummary.duplicated} duplicate groups, ${documentSummary.extra} extra files`,
      "",
      "## Requirement Matrix",
      "| ID | Domain | Status | Decision | Request | Answer | Source Document | Confidence | Notes |",
      "| --- | --- | --- | --- | --- | --- | --- | ---: | --- |",
      ...rows,
      "",
      "## Buyer-Visible Gaps",
      ...(findings.length > 0
        ? findings.map((finding) => `- ${finding.severity}: ${finding.title} (${finding.framework})`)
        : ["- No buyer-visible gaps in the latest readiness snapshot."]),
      "",
      "Readiness forecast only; not certification, attestation, or legal advice.",
    ];
    downloadFile(`${safeFileName(rfpProfile.buyer)}-${safeFileName(rfpProfile.project)}.md`, "text/markdown;charset=utf-8", lines.join("\n"));
    setLastExport(`Markdown package exported at ${new Date().toLocaleTimeString()}`);
  }

  function exportCsv() {
    const header = ["buyer", "project", "id", "domain", "status", "decision", "request", "answer", "source_document", "source_url", "confidence", "notes"];
    const lines = [
      header.join(","),
      ...responseRows.map((row) => [
        rfpProfile.buyer,
        rfpProfile.project,
        row.id,
        row.domain,
        heatmapStatus(requirementTone(row)),
        decisionLabel(row.decision),
        row.requirement,
        row.answerText,
        row.document,
        row.documentHref,
        `${clampPercent(row.confidence)}%`,
        row.notes,
      ].map(escapeCsv).join(",")),
    ];
    downloadFile(`${safeFileName(rfpProfile.project)}-matrix.csv`, "text/csv;charset=utf-8", lines.join("\n"));
    setLastExport(`CSV matrix exported at ${new Date().toLocaleTimeString()}`);
  }

  function exportJson() {
    const payload = {
      profile: rfpProfile,
      metrics: {
        rfpReadiness,
        evidenceMatch,
        averageConfidence,
        openRows,
        forecastLabel: forecast.label,
        documentGroupsReady: documentSummary.ready,
        missingDocumentGroups: documentSummary.missing,
        duplicateDocumentGroups: documentSummary.duplicated,
        extraDocumentFiles: documentSummary.extra,
      },
      localProof: {
        target: latestTarget?.name || null,
        sourceRevision: latestTarget?.version || null,
        generatedAt: assessment?.generated_at || null,
        runId: assessment?.run_id || null,
        counts: assessment?.counts || null,
      },
      intake: {
        software: selectedSoftware,
        documentFolder: documentFolderName || null,
        documents: documentInventory.categories.map((category) => ({
          id: category.id,
          label: category.label,
          status: categoryStatus(category).label,
          files: category.files.map((file) => ({
            name: file.name,
            path: file.path,
            size: file.size,
          })),
        })),
        extraFiles: documentInventory.extraFiles.map((file) => ({
          name: file.name,
          path: file.path,
          size: file.size,
        })),
        rfpRequest: rfpRequest.trim() || null,
      },
      rows: responseRows.map((row) => ({
        id: row.id,
        domain: row.domain,
        status: heatmapStatus(requirementTone(row)),
        tone: requirementTone(row),
        decision: decisionLabel(row.decision),
        requirement: row.requirement,
        answer: row.answer,
        answerText: row.answerText,
        evidence: row.evidence,
        sourceDocument: row.document,
        sourceUrl: row.documentHref,
        confidence: clampPercent(row.confidence),
        notes: row.notes,
      })),
      reviewThread: thread,
      buyerVisibleGaps: findings.map((finding) => ({
        severity: finding.severity,
        title: finding.title,
        framework: finding.framework,
      })),
    };
    downloadFile(`${safeFileName(rfpProfile.project)}-package.json`, "application/json;charset=utf-8", JSON.stringify(payload, null, 2));
    setLastExport(`JSON package exported at ${new Date().toLocaleTimeString()}`);
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">PB</div>
          <div>
            <strong>ProofBid</strong>
            <span>Assurance Console</span>
          </div>
        </div>

        <nav aria-label="Primary navigation">
          <a className="navItem active" href="#intake"><Icon name="settings" />Intake</a>
          <a className="navItem" href="#dashboard"><Icon name="command" />Dashboard</a>
          <a className="navItem" href="#checklist"><Icon name="evidence" />Checklist</a>
          <a className="navItem" href="#export"><Icon name="export" />Export</a>
          <a className="navItem" href="#matrix"><Icon name="matrix" />Matrix</a>
          <a className="navItem" href="#chat"><Icon name="chat" />Chat</a>
          <a className="navItem" href="#evidence"><Icon name="evidence" />Evidence</a>
          <a className="navItem" href="#findings"><Icon name="findings" />Findings</a>
        </nav>

        <div className="sidebarFooter">
          <a className="navItem" href="#settings"><Icon name="settings" />Settings</a>
          <div className="localBadge">
            <span className="statusDot" />
            <div><strong>GB10 local stack</strong><span>RFP + readiness</span></div>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">SUPPLIER ASSURANCE</span>
            <h1>Unified RFP dashboard</h1>
          </div>
          <div className="runtimePills" aria-label="Service status">
            <span><i className="online" />ProofBid</span>
            <span><i className={serviceClass(services.mongodb)} />MongoDB</span>
            <span><i className={serviceClass(services.inference)} />GB10 inference</span>
          </div>
        </header>

        <div className="content">
          <section className="intakePanel" id="intake">
            <div className="intakeHeader">
              <div>
                <span className="sectionLabel">LOCAL INTAKE</span>
                <h2>Scope the RFP response</h2>
                <p>{selectedSoftware?.name || "Select a software target"} with {documentSummary.ready} evidence groups ready for review.</p>
              </div>
              <div className="intakeStatus">
                <strong>{analysisStarted ? "Analysis loaded" : "Ready to run"}</strong>
                <span>{documentSummary.missing ? `${documentSummary.missing} evidence groups missing` : "Evidence checklist complete"}</span>
              </div>
            </div>

            <form className="intakeGrid" onSubmit={runDiscovery}>
              <section className="slotPanel softwareSlot">
                <div className="slotHeading">
                  <span className="sectionLabel">TARGET SOFTWARE</span>
                  <strong>{selectedSoftware?.framework || "Unknown"}</strong>
                </div>
                <label htmlFor="softwareTarget">Recognized software</label>
                <select
                  id="softwareTarget"
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                >
                  {softwareOptions.map((software) => (
                    <option key={software.id} value={software.id}>
                      {software.name}
                    </option>
                  ))}
                </select>
                <div className="softwareMeta">
                  <span>Folder: {selectedSoftware?.folder || target}</span>
                  <span>Signals: {(selectedSoftware?.signals || []).join(", ") || "none"}</span>
                </div>
                {softwareError && <div className="message error" role="alert">{softwareError}</div>}
              </section>

              <section className="slotPanel documentSlot">
                <div className="slotHeading">
                  <span className="sectionLabel">TARGET DOCUMENTS</span>
                  <strong>{documentSummary.files} files</strong>
                </div>
                <label className="folderDrop">
                  <input
                    type="file"
                    multiple
                    directory=""
                    webkitdirectory=""
                    onChange={handleDocumentFolder}
                  />
                  <span>Target folder with relevant documents</span>
                  <strong>{documentFolderName || "Choose folder"}</strong>
                  <small>{documentSummary.files ? `${formatFileSize(documentSummary.size)} indexed locally` : "Folder names and file names are used for categorization."}</small>
                </label>
              </section>

              <section className="slotPanel rfpSlot">
                <div className="slotHeading">
                  <span className="sectionLabel">OPTIONAL RFP</span>
                  <strong>{rfpRequest.trim() ? "Loaded" : "Open"}</strong>
                </div>
                <label htmlFor="rfpRequest">Buyer request</label>
                <textarea
                  id="rfpRequest"
                  value={rfpRequest}
                  onChange={(event) => setRfpRequest(event.target.value)}
                  placeholder="Paste the buyer's RFP request, questionnaire text, or due-diligence prompt."
                />
              </section>

              <section className="slotPanel runSlot">
                <div className="intakeMetrics" aria-label="Intake metrics">
                  {intakeSignals.map((signal) => (
                    <div className="metricItem compact" key={signal.label}>
                      <span>{signal.label}</span>
                      <strong>{signal.value}</strong>
                      <small>{signal.detail}</small>
                    </div>
                  ))}
                </div>
                <button className="primaryRun" type="submit" disabled={running || !target.trim()}>
                  {running ? "Running analysis..." : "Run analysis"}
                </button>
                {error && <div className="message error" role="alert">{error}</div>}
              </section>
            </form>

            <section className="documentReview" aria-label="RFP document checklist">
              <div className="panelHeading">
                <div>
                  <span className="sectionLabel">DOCUMENT CHECKLIST</span>
                  <h2>RFP evidence folder</h2>
                </div>
                <span className={`readOnly ${documentSummary.missing ? "amber" : "green"}`}>
                  {documentSummary.missing ? "Partial" : "Ready"}
                </span>
              </div>
              <div className="documentGrid">
                {documentInventory.categories.map((category) => {
                  const status = categoryStatus(category);
                  return (
                    <article className={`docCategory ${status.tone}`} key={category.id}>
                      <div>
                        <strong>{category.label}</strong>
                        <span>{category.examples}</span>
                      </div>
                      <b>{status.label}</b>
                      {category.files.length > 0 && (
                        <ul>
                          {category.files.slice(0, 3).map((file) => (
                            <li key={file.path}>{file.name}</li>
                          ))}
                          {category.files.length > 3 && <li>{category.files.length - 3} more</li>}
                        </ul>
                      )}
                    </article>
                  );
                })}
              </div>
              {(documentInventory.extraFiles.length > 0 || documentInventory.duplicateNames.length > 0) && (
                <div className="documentExceptions">
                  {documentInventory.extraFiles.length > 0 && (
                    <div>
                      <strong>Extra files</strong>
                      <span>{documentInventory.extraFiles.slice(0, 4).map((file) => file.name).join(", ")}</span>
                    </div>
                  )}
                  {documentInventory.duplicateNames.length > 0 && (
                    <div>
                      <strong>Duplicate names</strong>
                      <span>{documentInventory.duplicateNames.slice(0, 4).map((file) => `${file.name} x${file.count}`).join(", ")}</span>
                    </div>
                  )}
                </div>
              )}
            </section>
          </section>

          <div className={`postAnalysis ${analysisStarted ? "visible" : ""}`} id="dashboard">
          <section className="dashboardHero">
            <div className="heroCopy">
              <span className="sectionLabel">ACTIVE RESPONSE</span>
              <h2>{rfpProfile.buyer} {rfpProfile.project}</h2>
              <p>{forecast.summary}</p>
              {assessment?.note && <p className="fallbackNotice">{assessment.note}</p>}
              {assessmentError && <p className="fallbackNotice error">{assessmentError}</p>}
            </div>

            <div className="heroMetrics" aria-label="RFP summary">
              {rfpSignals.map((signal) => (
                <div className="metricItem" key={signal.label}>
                  <span>{signal.label}</span>
                  <strong>{signal.value}</strong>
                  <small>{signal.detail}</small>
                </div>
              ))}
            </div>

            <div className="readinessGauge" style={{ "--score": `${rfpReadiness * 3.6}deg` }}>
              <div className={`gaugeDial ${readinessTone(forecast.label)}`}>
                <strong>{rfpReadiness}</strong>
                <span>/100</span>
              </div>
              <small>RFP readiness</small>
              <a className="primaryButton" href={proofBidUrl} target="_blank" rel="noreferrer">Open ProofBid</a>
            </div>
          </section>

          <section className="panel checklistPanel" id="checklist">
            <div className="panelHeading">
              <div>
                <span className="sectionLabel">COMPLIANCE CHECKLIST</span>
                <h2>Response readiness</h2>
              </div>
              <span className="readOnly">{complianceChecklist.filter((item) => item.tone === "green").length}/{complianceChecklist.length} ready</span>
            </div>
            <div className="checklistGrid">
              {complianceChecklist.map((item) => (
                <article className={`checkItem ${item.tone}`} key={item.label}>
                  <b>{item.status}</b>
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.detail}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="panel packagePanel" id="export">
            <div className="panelHeading">
              <div>
                <span className="sectionLabel">RFP PACKAGE</span>
                <h2>Customize and export</h2>
              </div>
              <span className="readOnly">Buyer-safe</span>
            </div>

            <div className="packageGrid">
              <label>
                <span>Buyer</span>
                <input value={rfpProfile.buyer} onChange={(event) => updateProfile("buyer", event.target.value)} />
              </label>
              <label>
                <span>RFP title</span>
                <input value={rfpProfile.project} onChange={(event) => updateProfile("project", event.target.value)} />
              </label>
              <label>
                <span>Supplier</span>
                <input value={rfpProfile.supplier} onChange={(event) => updateProfile("supplier", event.target.value)} />
              </label>
              <label>
                <span>Owner</span>
                <input value={rfpProfile.owner} onChange={(event) => updateProfile("owner", event.target.value)} />
              </label>
              <label>
                <span>Due date</span>
                <input type="date" value={rfpProfile.dueDate} onChange={(event) => updateProfile("dueDate", event.target.value)} />
              </label>
              <label>
                <span>Classification</span>
                <select value={rfpProfile.classification} onChange={(event) => updateProfile("classification", event.target.value)}>
                  <option>Buyer-shareable</option>
                  <option>Internal review</option>
                  <option>NDA required</option>
                </select>
              </label>
              <label>
                <span>Response style</span>
                <select value={rfpProfile.responseStyle} onChange={(event) => updateProfile("responseStyle", event.target.value)}>
                  <option>Concise technical</option>
                  <option>Executive summary</option>
                  <option>Detailed control mapping</option>
                </select>
              </label>
            </div>

            <div className="exportStrip">
              <div>
                <strong>{responseRows.length} rows ready for package generation</strong>
                <span>Exports include the answer matrix, evidence labels, readiness score, and review notes without raw scanner output.</span>
              </div>
              <div className="exportActions">
                <button type="button" onClick={exportMarkdown}>Markdown</button>
                <button type="button" onClick={exportCsv}>CSV</button>
                <button type="button" onClick={exportJson}>JSON</button>
              </div>
            </div>
            {lastExport && <div className="exportStatus" role="status">{lastExport}</div>}
          </section>

          <section className="visualGrid" aria-label="RFP dashboard visuals">
            <article className="panel compactPanel">
              <div className="panelHeading tight">
                <div><span className="sectionLabel">COVERAGE</span><h2>Clause posture</h2></div>
                <span className="readOnly">{coveredFrameworks}/{frameworkCards.length || 4} suites</span>
              </div>
              <div className="suiteBars">
                {(suitePreview.length ? suitePreview : [
                  { code: "SOC2", name: "SOC 2", progress: 72, tone: "green" },
                  { code: "ISO", name: "ISO 27001", progress: 64, tone: "blue" },
                  { code: "NIST", name: "NIST CSF", progress: 58, tone: "violet" },
                  { code: "VPAT", name: "Accessibility", progress: 43, tone: "amber" },
                ]).map((card) => (
                  <div className="suiteBar" key={card.code || card.name}>
                    <div>
                      <strong>{card.code || card.name}</strong>
                      <span>{card.name}</span>
                    </div>
                    <div className="barTrack"><span className={card.tone} style={{ width: `${clampPercent(card.progress)}%` }} /></div>
                    <b>{clampPercent(card.progress)}%</b>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel compactPanel">
              <div className="panelHeading tight">
                <div><span className="sectionLabel">HEATMAP</span><h2>Requirement density</h2></div>
                <span className="readOnly">{heatmapCells.length} rows</span>
              </div>
              <div
                aria-label={`Requirement heatmap with ${heatmapCells.length} rows`}
                className="heatmap"
                style={{ "--heat-columns": Math.min(8, Math.max(4, heatmapCells.length)) }}
              >
                {heatmapCells.map((cell) => (
                  <button
                    aria-label={cell.tooltip}
                    className={`heatCell ${cell.tone}`}
                    key={cell.id}
                    title={cell.tooltip}
                    type="button"
                  >
                    <span className="heatTooltip" role="tooltip">
                      <strong>{cell.id} | {cell.status}</strong>
                      <small>{cell.domain}</small>
                      <small>{cell.answer} | {cell.confidence}% confidence</small>
                      <em>{cell.evidence}</em>
                    </span>
                  </button>
                ))}
              </div>
              <div className="legend">
                <span><i className="green" />Ready</span>
                <span><i className="amber" />Review</span>
                <span><i className="red" />Gap</span>
                <span><i className="blue" />N/A</span>
              </div>
            </article>

            <article className="panel compactPanel sourcePanel">
              <div className="panelHeading tight">
                <div><span className="sectionLabel">SOURCES</span><h2>Evidence mix</h2></div>
                <span className="liveTag"><i />{assessment?.fallback ? "Fallback" : "MongoDB"}</span>
              </div>
              <div className="sourceBars">
                {sourceMix.map((source) => (
                  <div className="sourceRow" key={source.label}>
                    <span>{source.label}</span>
                    <div className="barTrack"><span className={source.tone} style={{ width: `${source.value}%` }} /></div>
                    <strong>{source.value}%</strong>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel compactPanel chatPanel" id="chat">
              <div className="panelHeading tight">
                <div><span className="sectionLabel">CHAT</span><h2>Review thread</h2></div>
                <span className="readOnly">Local</span>
              </div>
              <div className="messageStack">
                {thread.map((message, index) => (
                  <div className={`chatBubble ${message.role}`} key={`${message.role}-${index}`}>
                    <strong>{message.label}</strong>
                    <p>{message.text}</p>
                  </div>
                ))}
              </div>
              <form className="chatComposer" onSubmit={addReviewerNote}>
                <input
                  aria-label="Reviewer note"
                  value={draftMessage}
                  onChange={(event) => setDraftMessage(event.target.value)}
                  placeholder="Add review note"
                />
                <button type="submit">Send</button>
              </form>
            </article>
          </section>

          <section className="panel matrixPanel" id="matrix">
            <div className="panelHeading">
              <div><span className="sectionLabel">ANSWER MATRIX</span><h2>RFP rows with evidence and risk</h2></div>
              <a className="secondaryButton" href={proofBidUrl} target="_blank" rel="noreferrer">Open workspace</a>
            </div>
            <div className="requirementTable">
              {responseRows.map((row) => (
                <article className={`reviewRow ${row.decision}`} key={row.id}>
                  <div className="requestCell">
                    <div className="reqId"><strong>{row.id}</strong><span>{row.domain}</span></div>
                    <label className="requestEditor">
                      <span>Request</span>
                      <textarea
                        value={row.requirement}
                        onChange={(event) => updateResponseRow(row.id, "requirement", event.target.value)}
                      />
                    </label>
                  </div>

                  <div className="answerCell">
                    <div className="answerHeader">
                      <span aria-live="polite" className={`decisionBadge ${requirementTone(row)}`}>{decisionLabel(row.decision)}</span>
                      <div className="confidenceCell compactConfidence">
                        <div className="miniTrack"><span className={requirementTone(row)} style={{ width: `${row.confidence}%` }} /></div>
                        <span>{row.confidence}%</span>
                      </div>
                    </div>
                    <p className="answerText">{row.answerText}</p>
                    <a className="sourceLink" href={row.documentHref} target="_blank" rel="noreferrer">
                      Source: {row.document}
                    </a>
                    <small>{row.evidence}</small>
                  </div>

                  <div className="decisionButtons" aria-label={`Review controls for ${row.id}`}>
                    <button
                      aria-pressed={row.decision === "rejected"}
                      className={`decisionButton reject ${row.decision === "rejected" ? "selected" : ""}`}
                      onClick={() => setReviewDecision(row.id, "rejected")}
                      type="button"
                    >
                      Reject
                    </button>
                    <button
                      aria-pressed={row.decision === "changes"}
                      className={`decisionButton changes ${row.decision === "changes" ? "selected" : ""}`}
                      onClick={() => setReviewDecision(row.id, "changes")}
                      type="button"
                    >
                      Make changes
                    </button>
                    <button
                      aria-pressed={row.decision === "accepted"}
                      className={`decisionButton accept ${row.decision === "accepted" ? "selected" : ""}`}
                      onClick={() => setReviewDecision(row.id, "accepted")}
                      type="button"
                    >
                      Accept
                    </button>
                  </div>

                  {row.decision === "changes" && (
                    <div className="manualEdit">
                      <label>
                        <span>Proposed answer</span>
                        <textarea
                          value={row.answerText}
                          onChange={(event) => updateResponseRow(row.id, "answerText", event.target.value)}
                        />
                      </label>
                      <div className="manualEditActions">
                        <span>Applying changes updates the answer above and marks this row accepted.</span>
                        <button type="button" onClick={() => applyProposedChanges(row.id)}>Apply changes</button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className="operationsGrid">
            <section className="panel discoveryPanel" id="settings">
              <div className="panelHeading">
                <div>
                  <span className="sectionLabel">LOCAL TARGET</span>
                  <h2>Authorize assessment</h2>
                </div>
                <span className="readOnly">Scoped</span>
              </div>
              <form onSubmit={runDiscovery}>
                <label htmlFor="target">Target folder</label>
                <div className="inputRow">
                  <input
                    id="target"
                    value={target}
                    onChange={(event) => setTarget(event.target.value)}
                    placeholder="nextjs-storefront"
                    autoComplete="off"
                  />
                  <button type="submit" disabled={running || !target.trim()}>
                    {running ? "Inspecting..." : "Run"}
                  </button>
                </div>
              </form>
              {error && <div className="message error" role="alert">{error}</div>}
              {discovery && (
                <div className="discoveryResult" aria-live="polite">
                  <div className="resultHeader">
                    <div><span className="statusDot" /><strong>Proposal generated</strong></div>
                    <span>{discovery.file}</span>
                  </div>
                  <pre>{discovery.yaml}</pre>
                </div>
              )}
            </section>

            <section className={`panel targetPanel ${assessment?.fallback ? "fallback" : ""}`} id="evidence">
              <div className="panelHeading">
                <div>
                  <span className="sectionLabel">LOCALPROOF</span>
                  <h2>Evidence posture</h2>
                </div>
                <span className={`readOnly ${readinessTone(forecast.label)}`}>{forecast.label}</span>
              </div>
              <div className="runMeta">
                <div><span>Target</span><strong>{latestTarget?.name || "Loading"}</strong></div>
                <div><span>Run</span><strong>{assessment?.run_id || "pending"}</strong></div>
                <div><span>Checks</span><strong>{assessment?.counts?.total ?? 0}</strong></div>
              </div>
              <p>
                Source revision <code>{latestTarget?.version || "unknown"}</code>
                {" | "}
                generated {formatDate(assessment?.generated_at)}
              </p>
              <div className="countColumns">
                <div>
                  <h3>Results</h3>
                  {resultCounts.length > 0 ? resultCounts.map(([key, value]) => (
                    <div className="countRow" key={key}><span>{readableKey(key)}</span><strong>{value}</strong></div>
                  )) : <div className="emptyMini">Waiting for a run</div>}
                </div>
                <div>
                  <h3>Disposition</h3>
                  {dispositionCounts.length > 0 ? dispositionCounts.map(([key, value]) => (
                    <div className="countRow" key={key}><span>{readableKey(key)}</span><strong>{value}</strong></div>
                  )) : <div className="emptyMini">Waiting for a run</div>}
                </div>
              </div>
            </section>
          </section>

          <section className="panel findingsPanel" id="findings">
            <div className="panelHeading">
              <div><span className="sectionLabel">REVIEW QUEUE</span><h2>Buyer-visible gaps</h2></div>
              <div className="stackRoute"><span>ProofBid</span><b>-&gt;</b><span>LocalProof</span><b>-&gt;</b><span>RFP-safe export</span></div>
            </div>
            <div className="findingList">
              {findings.length > 0 ? findings.map((finding) => (
                <article className="finding" key={`${finding.framework}-${finding.title}`}>
                  <span className={`severity ${finding.severity.toLowerCase()}`}>{finding.severity}</span>
                  <div><h3>{finding.title}</h3><p>{finding.framework} | {finding.source}</p></div>
                  <button aria-label={`Open ${finding.title}`} type="button">&gt;</button>
                </article>
              )) : (
                <div className="emptyState">
                  No top concerns are present in the latest readiness snapshot.
                </div>
              )}
            </div>
          </section>

          <footer>
            <span>All response work stays on the local GB10 stack.</span>
            <span>Readiness forecast only; not certification, attestation, or legal advice.</span>
          </footer>
          </div>
        </div>
      </section>
    </main>
  );
}
