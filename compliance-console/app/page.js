"use client";

import { useEffect, useState } from "react";

function Icon({ name }) {
  const paths = {
    overview: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
    targets: "M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 11a1 1 0 1 0 1 1",
    evidence: "M6 3h9l3 3v15H6zM15 3v4h4M9 12h6M9 16h6",
    findings: "M12 3 2.8 19h18.4L12 3zM12 9v5M12 17.5v.1",
    reports: "M4 19V5M4 19h17M8 16v-5M13 16V7M18 16v-3",
    settings: "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM19 12l2-1-2-3-2 .4-1-2.4h-4L10 6 8 8l.4 2L6 11v2l2 1 .4 2L8 18l2 2 2.4-1h4L18 18l-1-2 2-.4 2-3-2-1z",
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

function serviceClass(status) {
  if (status === "available") return "online";
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

export default function Dashboard() {
  const [target, setTarget] = useState("nextjs-storefront");
  const [assessment, setAssessment] = useState(null);
  const [assessmentError, setAssessmentError] = useState("");
  const [discovery, setDiscovery] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

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

  const services = assessment?.services || { app: "checking", mongodb: "checking", inference: "checking" };
  const latestTarget = assessment?.latest_target;
  const forecast = assessment?.forecast || { score: 0, label: "Loading", summary: "Loading latest local readiness state." };
  const frameworkCards = assessment?.suites || [];
  const findings = assessment?.concerns || [];
  const resultCounts = countEntries(assessment?.counts?.by_result);
  const dispositionCounts = countEntries(assessment?.counts?.by_disposition);

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">LP</div>
          <div>
            <strong>LocalProof</strong>
            <span>Compliance Console</span>
          </div>
        </div>

        <nav aria-label="Primary navigation">
          <a className="navItem active" href="#overview"><Icon name="overview" />Overview</a>
          <a className="navItem" href="#discovery"><Icon name="targets" />Targets</a>
          <a className="navItem" href="#evidence"><Icon name="evidence" />Evidence</a>
          <a className="navItem" href="#findings"><Icon name="findings" />Findings</a>
          <a className="navItem" href="#reports"><Icon name="reports" />Reports</a>
        </nav>

        <div className="sidebarFooter">
          <a className="navItem" href="#settings"><Icon name="settings" />Settings</a>
          <div className="localBadge">
            <span className="statusDot" />
            <div><strong>Local runtime</strong><span>External egress denied</span></div>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">ASSESSMENT WORKSPACE</span>
            <h1>Compliance overview</h1>
          </div>
          <div className="runtimePills" aria-label="Service status">
            <span><i className={serviceClass(services.mongodb)} />MongoDB</span>
            <span><i className={serviceClass(services.inference === "configured-by-nemoclaw" ? "available" : services.inference)} />GB10 local inference</span>
          </div>
        </header>

        <div className="content" id="overview">
          <section className={`heroPanel ${assessment?.fallback ? "fallback" : ""}`}>
            <div>
              <span className="sectionLabel">CURRENT TARGET</span>
              <h2>{latestTarget?.name || "Loading latest assessment"}</h2>
              <p>
                Readiness forecast
                {" · "}
                source revision <code>{latestTarget?.version || "unknown"}</code>
                {" · "}
                generated {formatDate(assessment?.generated_at)}
              </p>
              {assessment?.note && <p className="fallbackNotice">{assessment.note}</p>}
              {assessmentError && <p className="fallbackNotice error">{assessmentError}</p>}
            </div>
            <div className="scoreWrap">
              <div className="scoreRing" aria-label={`Readiness forecast score ${forecast.score} percent`}>
                <strong>{forecast.score}</strong><span>/100</span>
              </div>
              <span>{forecast.label}</span>
            </div>
          </section>

          <section className="frameworkGrid" aria-label="Assessment frameworks">
            {frameworkCards.map((card) => (
              <article className="frameworkCard" key={card.suite}>
                <div className={`frameworkIcon ${card.tone}`}>{card.code}</div>
                <div className="frameworkHeading">
                  <h3>{card.name}</h3>
                  <span className={`tag ${card.tone}`}>{card.status}</span>
                </div>
                <p>{card.description}</p>
                <div className="progress"><span style={{ width: `${card.progress}%` }} /></div>
                <small>{card.coveredChecks}/{card.totalChecks} checks observed or covered</small>
                {card.evidence?.covered && (
                  <small>Evidence: {card.evidence.document || card.evidence.evidence_id}</small>
                )}
              </article>
            ))}
          </section>

          <div className="twoColumn">
            <section className="panel discoveryPanel" id="discovery">
              <div className="panelHeading">
                <div>
                  <span className="sectionLabel">PHASE 1</span>
                  <h2>Discover software</h2>
                </div>
                <span className="readOnly">Read only</span>
              </div>
              <p>Inspect an authorized local project and propose how the assessment stack should open it.</p>

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
                    {running ? "Inspecting…" : "Run discovery"}
                  </button>
                </div>
                <small>Resolved only inside the configured local targets directory.</small>
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

            <section className="panel" id="evidence">
              <div className="panelHeading">
                <div><span className="sectionLabel">LATEST RUN</span><h2>Assessment state</h2></div>
                <span className="liveTag"><i />{assessment?.fallback ? "Fallback" : "MongoDB"}</span>
              </div>
              <p>{forecast.summary}</p>

              <div className="runMeta">
                <div><span>Run</span><strong>{assessment?.run_id || "pending"}</strong></div>
                <div><span>Total checks</span><strong>{assessment?.counts?.total ?? 0}</strong></div>
                <div><span>Generated</span><strong>{formatDate(assessment?.generated_at)}</strong></div>
              </div>

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

              <div className="stackRoute">
                <span>OpenClaw</span><b>→</b><span>OpenShell</span><b>→</b><span>GB10</span>
              </div>
            </section>
          </div>

          <section className="panel findingsPanel" id="findings">
            <div className="panelHeading">
              <div><span className="sectionLabel">PRIORITY QUEUE</span><h2>Top points of concern</h2></div>
              <button className="secondaryButton" type="button">Readiness forecast</button>
            </div>
            <div className="findingList">
              {findings.length > 0 ? findings.map((finding) => (
                <article className="finding" key={`${finding.framework}-${finding.title}`}>
                  <span className={`severity ${finding.severity.toLowerCase()}`}>{finding.severity}</span>
                  <div><h3>{finding.title}</h3><p>{finding.framework} · {finding.source}</p></div>
                  <button aria-label={`Open ${finding.title}`} type="button">›</button>
                </article>
              )) : (
                <div className="emptyState">
                  No top concerns are present in the latest readiness snapshot.
                </div>
              )}
            </div>
          </section>

          <footer>
            <span>All assessment data remains on this device.</span>
            <span>Readiness forecast only; not a certification or attestation.</span>
          </footer>
        </div>
      </section>
    </main>
  );
}
