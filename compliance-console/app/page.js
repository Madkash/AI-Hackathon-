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

const heatmapCells = [
  "green", "green", "blue", "green", "amber", "green", "green", "blue",
  "green", "amber", "red", "green", "blue", "green", "amber", "green",
  "blue", "green", "green", "red", "amber", "green", "blue", "green",
];

const requirementRows = [
  {
    id: "SEC-04",
    domain: "Identity",
    requirement: "Federated SSO, MFA, and least privilege administration",
    answer: "Supported",
    evidence: "OIDC policy, admin role matrix",
    notes: "Ready for buyer packet.",
    confidence: 92,
    tone: "green",
  },
  {
    id: "SEC-11",
    domain: "Vuln mgmt",
    requirement: "CVE triage, patch SLA, and remediation evidence",
    answer: "Partial",
    evidence: "Scanner summary, remediation queue",
    notes: "Add high-severity SLA attachment.",
    confidence: 68,
    tone: "amber",
  },
  {
    id: "DAT-02",
    domain: "Data",
    requirement: "Encryption in transit, at rest, and key ownership",
    answer: "Supported",
    evidence: "TLS config, KMS architecture",
    notes: "Use buyer-safe encryption summary.",
    confidence: 86,
    tone: "blue",
  },
  {
    id: "OPS-07",
    domain: "Resilience",
    requirement: "RTO, RPO, incident escalation, and exercise cadence",
    answer: "Needs owner",
    evidence: "DR runbook pending approval",
    notes: "Needs ops owner signoff.",
    confidence: 51,
    tone: "red",
  },
];

const answerTones = {
  Supported: "green",
  Partial: "amber",
  "Needs owner": "red",
  "Not applicable": "blue",
  Drafting: "violet",
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

  const services = assessment?.services || { app: "checking", mongodb: "checking", inference: "checking" };
  const latestTarget = assessment?.latest_target;
  const forecast = assessment?.forecast || { score: 0, label: "Loading", summary: "Loading latest local readiness state." };
  const frameworkCards = assessment?.suites || [];
  const findings = assessment?.concerns || [];
  const resultCounts = countEntries(assessment?.counts?.by_result);
  const dispositionCounts = countEntries(assessment?.counts?.by_disposition);
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
  const openRows = responseRows.filter((row) => row.answer !== "Supported" && row.answer !== "Not applicable").length;
  const rfpSignals = [
    { label: "RFP rows", value: responseRows.length, detail: `${openRows} need review` },
    { label: "Evidence match", value: `${evidenceMatch}%`, detail: "local + supplier docs" },
    { label: "Draft confidence", value: `${averageConfidence}%`, detail: rfpProfile.responseStyle },
    { label: "Buyer due", value: shortDate(rfpProfile.dueDate), detail: rfpProfile.classification },
  ];

  function exportMarkdown() {
    const rows = responseRows.map((row) => (
      `| ${escapeMarkdownCell(row.id)} | ${escapeMarkdownCell(row.domain)} | ${escapeMarkdownCell(row.requirement)} | ${escapeMarkdownCell(row.answer)} | ${escapeMarkdownCell(row.evidence)} | ${clampPercent(row.confidence)}% | ${escapeMarkdownCell(row.notes)} |`
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
      "",
      "## Requirement Matrix",
      "| ID | Domain | Requirement | Answer | Evidence | Confidence | Notes |",
      "| --- | --- | --- | --- | --- | ---: | --- |",
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
    const header = ["buyer", "project", "id", "domain", "requirement", "answer", "evidence", "confidence", "notes"];
    const lines = [
      header.join(","),
      ...responseRows.map((row) => [
        rfpProfile.buyer,
        rfpProfile.project,
        row.id,
        row.domain,
        row.requirement,
        row.answer,
        row.evidence,
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
      },
      localProof: {
        target: latestTarget?.name || null,
        sourceRevision: latestTarget?.version || null,
        generatedAt: assessment?.generated_at || null,
        runId: assessment?.run_id || null,
        counts: assessment?.counts || null,
      },
      rows: responseRows.map((row) => ({
        id: row.id,
        domain: row.domain,
        requirement: row.requirement,
        answer: row.answer,
        evidence: row.evidence,
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
          <a className="navItem active" href="#dashboard"><Icon name="command" />Dashboard</a>
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

        <div className="content" id="dashboard">
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
                <span className="readOnly">24 cells</span>
              </div>
              <div className="heatmap" aria-label="Requirement heatmap">
                {heatmapCells.map((tone, index) => (
                  <span className={tone} key={`${tone}-${index}`} title={`Clause ${index + 1}`} />
                ))}
              </div>
              <div className="legend">
                <span><i className="green" />Ready</span>
                <span><i className="amber" />Review</span>
                <span><i className="red" />Gap</span>
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
                <article className="requirementRow editableRequirement" key={row.id}>
                  <div className="reqId"><strong>{row.id}</strong><span>{row.domain}</span></div>
                  <label className="matrixField wide">
                    <span>Requirement</span>
                    <input value={row.requirement} onChange={(event) => updateResponseRow(row.id, "requirement", event.target.value)} />
                  </label>
                  <label className="matrixField">
                    <span>Answer</span>
                    <select value={row.answer} onChange={(event) => updateResponseRow(row.id, "answer", event.target.value)}>
                      {Object.keys(answerTones).map((answer) => <option key={answer}>{answer}</option>)}
                    </select>
                  </label>
                  <label className="matrixField evidenceField">
                    <span>Evidence</span>
                    <input value={row.evidence} onChange={(event) => updateResponseRow(row.id, "evidence", event.target.value)} />
                  </label>
                  <label className="matrixField confidenceField">
                    <span>Confidence</span>
                    <input
                      min="0"
                      max="100"
                      type="number"
                      value={row.confidence}
                      onChange={(event) => updateResponseRow(row.id, "confidence", event.target.value)}
                    />
                  </label>
                  <label className="matrixField notesField">
                    <span>Notes</span>
                    <input value={row.notes} onChange={(event) => updateResponseRow(row.id, "notes", event.target.value)} />
                  </label>
                  <div className="confidenceCell compactConfidence">
                    <div className="miniTrack"><span className={row.tone} style={{ width: `${row.confidence}%` }} /></div>
                    <span>{row.confidence}%</span>
                  </div>
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
      </section>
    </main>
  );
}
