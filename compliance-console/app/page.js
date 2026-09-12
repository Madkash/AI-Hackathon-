"use client";

import { useEffect, useMemo, useState } from "react";

const proofBidUrl = "http://127.0.0.1:8765";

function Icon({ name }) {
  const paths = {
    command: "M4 5h16M4 12h16M4 19h10",
    rfp: "M6 3h9l3 3v15H6zM15 3v4h4M9 12h6M9 16h4",
    readiness: "M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 11a1 1 0 1 0 1 1",
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
  const coveredFrameworks = useMemo(
    () => frameworkCards.filter((card) => card.evidence?.covered).length,
    [frameworkCards],
  );

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
          <a className="navItem active" href="#command"><Icon name="command" />Command</a>
          <a className="navItem" href="#rfp"><Icon name="rfp" />RFP Workspace</a>
          <a className="navItem" href="#readiness"><Icon name="readiness" />Readiness</a>
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
            <h1>Unified response console</h1>
          </div>
          <div className="runtimePills" aria-label="Service status">
            <span><i className="online" />ProofBid</span>
            <span><i className={serviceClass(services.mongodb)} />MongoDB</span>
            <span><i className={serviceClass(services.inference)} />GB10 inference</span>
          </div>
        </header>

        <div className="content" id="command">
          <section className="heroPanel">
            <div>
              <span className="sectionLabel">COMMAND CENTER</span>
              <h2>From buyer requirement to defensible response.</h2>
              <p>
                ProofBid builds the RFP answer matrix. LocalProof checks whether the software and evidence support the claims.
              </p>
              <div className="heroActions">
                <a className="primaryButton" href={proofBidUrl} target="_blank" rel="noreferrer">Open ProofBid</a>
                <a className="secondaryButton" href="#readiness">Review readiness</a>
              </div>
            </div>
            <div className="scoreWrap">
              <div className={`scoreRing ${readinessTone(forecast.label)}`} aria-label={`Readiness forecast score ${forecast.score} percent`}>
                <strong>{forecast.score}</strong><span>/100</span>
              </div>
              <span>{forecast.label}</span>
            </div>
          </section>

          <section className="systemGrid" aria-label="Unified system overview">
            <article>
              <span>01</span>
              <h3>RFP analysis</h3>
              <p>Upload buyer requirements, supplier documents, and product configuration in the ProofBid GB10 workspace.</p>
            </article>
            <article>
              <span>02</span>
              <h3>Local evidence</h3>
              <p>Run LocalProof discovery and readiness checks against authorized local targets and persisted evidence.</p>
            </article>
            <article>
              <span>03</span>
              <h3>RFP-safe export</h3>
              <p>Package readiness summaries for buyers without raw findings, secrets, source paths, or exploit detail.</p>
            </article>
          </section>

          <section className="unifiedGrid">
            <section className="panel rfpPanel" id="rfp">
              <div className="panelHeading">
                <div>
                  <span className="sectionLabel">PROOFBID</span>
                  <h2>RFP response workspace</h2>
                </div>
                <span className="liveTag"><i />Port 8765</span>
              </div>
              <p>ProofBid is the intake and review surface for buyer requirements, supplier documents, citations, review notes, CSV matrices, and draft responses.</p>

              <div className="workflowRail">
                <div><strong>Ingest</strong><span>RFP, supplier evidence, product JSON</span></div>
                <div><strong>Analyze</strong><span>Local GB10 model maps requirements to evidence</span></div>
                <div><strong>Review</strong><span>Operator marks rows reviewed and exports drafts</span></div>
              </div>

              <div className="actionStrip">
                <a className="primaryButton" href={proofBidUrl} target="_blank" rel="noreferrer">Launch ProofBid</a>
                <span>Authenticated FastAPI service, local loopback only.</span>
              </div>
            </section>

            <section className={`panel targetPanel ${assessment?.fallback ? "fallback" : ""}`} id="readiness">
              <div className="panelHeading">
                <div>
                  <span className="sectionLabel">LOCALPROOF</span>
                  <h2>Readiness forecast</h2>
                </div>
                <span className="readOnly">Read only</span>
              </div>
              <h3>{latestTarget?.name || "Loading latest assessment"}</h3>
              <p>
                Source revision <code>{latestTarget?.version || "unknown"}</code>
                {" · "}
                generated {formatDate(assessment?.generated_at)}
              </p>
              {assessment?.note && <p className="fallbackNotice">{assessment.note}</p>}
              {assessmentError && <p className="fallbackNotice error">{assessmentError}</p>}
              <div className="runMeta">
                <div><span>Run</span><strong>{assessment?.run_id || "pending"}</strong></div>
                <div><span>Checks</span><strong>{assessment?.counts?.total ?? 0}</strong></div>
                <div><span>Covered suites</span><strong>{coveredFrameworks}/{frameworkCards.length || 4}</strong></div>
              </div>
            </section>
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
            <section className="panel discoveryPanel">
              <div className="panelHeading">
                <div>
                  <span className="sectionLabel">DISCOVERY</span>
                  <h2>Authorize a target</h2>
                </div>
                <span className="readOnly">Local scope</span>
              </div>
              <p>Inspect an authorized local project and propose how the assessment stack should build, open, and test it.</p>

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
                    {running ? "Inspecting..." : "Run discovery"}
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
                <div><span className="sectionLabel">ASSESSMENT STATE</span><h2>Evidence posture</h2></div>
                <span className="liveTag"><i />{assessment?.fallback ? "Fallback" : "MongoDB"}</span>
              </div>
              <p>{forecast.summary}</p>

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
                <span>ProofBid</span><b>→</b><span>LocalProof</span><b>→</b><span>RFP-safe export</span>
              </div>
            </section>
          </div>

          <section className="panel findingsPanel" id="findings">
            <div className="panelHeading">
              <div><span className="sectionLabel">REVIEW QUEUE</span><h2>Top points of concern</h2></div>
              <a className="secondaryButton" href="#rfp">Back to RFP workspace</a>
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
            <span>ProofBid and LocalProof are presented as one local assurance workflow.</span>
            <span>Readiness forecast only; not certification, attestation, or legal advice.</span>
          </footer>
        </div>
      </section>
    </main>
  );
}
