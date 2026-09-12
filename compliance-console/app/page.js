"use client";

import { useEffect, useState } from "react";

const frameworkCards = [
  {
    code: "SOC",
    name: "SOC 2 Type II",
    description: "Security controls and operating evidence",
    status: "Evidence review",
    tone: "violet",
    progress: 64,
  },
  {
    code: "ISO",
    name: "ISO/IEC 27001",
    description: "ISMS controls, policies, and risk process",
    status: "12 gaps",
    tone: "amber",
    progress: 48,
  },
  {
    code: "SEC",
    name: "Application Security",
    description: "OWASP ASVS and authorized local tests",
    status: "Ready to test",
    tone: "blue",
    progress: 22,
  },
  {
    code: "A11Y",
    name: "WCAG 2.2",
    description: "Automated checks and manual review queue",
    status: "3 concerns",
    tone: "green",
    progress: 76,
  },
];

const findings = [
  {
    severity: "High",
    title: "Administrator session lacks idle timeout evidence",
    framework: "SOC 2 · CC6.1",
    source: "Authentication configuration",
  },
  {
    severity: "Medium",
    title: "Keyboard focus is obscured by the sticky header",
    framework: "WCAG 2.2 · 2.4.11",
    source: "Local browser test",
  },
  {
    severity: "Review",
    title: "Annual risk assessment document is eleven months old",
    framework: "ISO 27001 · 6.1.2",
    source: "Evidence library",
  },
];

const activity = [
  ["09:42", "Evidence agent", "Indexed security policies and audit artifacts"],
  ["09:38", "Discovery agent", "Identified Next.js application on port 3000"],
  ["09:37", "OpenShell", "Applied deny-by-default network policy"],
];

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

export default function Dashboard() {
  const [target, setTarget] = useState("nextjs-storefront");
  const [discovery, setDiscovery] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [services, setServices] = useState({ app: "checking", mongodb: "checking" });

  useEffect(() => {
    fetch("/api/status")
      .then((response) => response.json())
      .then((data) => setServices(data.services))
      .catch(() => setServices({ app: "available", mongodb: "unavailable" }));
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
            <span><i className={services.mongodb === "available" ? "online" : "waiting"} />MongoDB</span>
            <span><i className="online" />GB10 local inference</span>
          </div>
        </header>

        <div className="content" id="overview">
          <section className="heroPanel">
            <div>
              <span className="sectionLabel">CURRENT TARGET</span>
              <h2>Example Next.js Storefront</h2>
              <p>Local readiness assessment · source revision <code>demo-abc123</code></p>
            </div>
            <div className="scoreRing" aria-label="Readiness score 58 percent">
              <strong>58</strong><span>/100</span>
            </div>
          </section>

          <section className="frameworkGrid" aria-label="Assessment frameworks">
            {frameworkCards.map((card) => (
              <article className="frameworkCard" key={card.code}>
                <div className={`frameworkIcon ${card.tone}`}>{card.code}</div>
                <div className="frameworkHeading">
                  <h3>{card.name}</h3>
                  <span className={`tag ${card.tone}`}>{card.status}</span>
                </div>
                <p>{card.description}</p>
                <div className="progress"><span style={{ width: `${card.progress}%` }} /></div>
                <small>{card.progress}% evidence coverage</small>
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
                <div><span className="sectionLabel">AGENT ACTIVITY</span><h2>Local workflow</h2></div>
                <span className="liveTag"><i />Live</span>
              </div>
              <div className="timeline">
                {activity.map(([time, agent, message]) => (
                  <div className="timelineItem" key={time + agent}>
                    <time>{time}</time>
                    <span className="timelineDot" />
                    <div><strong>{agent}</strong><p>{message}</p></div>
                  </div>
                ))}
              </div>
              <div className="stackRoute">
                <span>OpenClaw</span><b>→</b><span>OpenShell</span><b>→</b><span>GB10</span>
              </div>
            </section>
          </div>

          <section className="panel findingsPanel" id="findings">
            <div className="panelHeading">
              <div><span className="sectionLabel">PRIORITY QUEUE</span><h2>Recent findings</h2></div>
              <button className="secondaryButton" type="button">View all findings</button>
            </div>
            <div className="findingList">
              {findings.map((finding) => (
                <article className="finding" key={finding.title}>
                  <span className={`severity ${finding.severity.toLowerCase()}`}>{finding.severity}</span>
                  <div><h3>{finding.title}</h3><p>{finding.framework} · {finding.source}</p></div>
                  <button aria-label={`Open ${finding.title}`} type="button">›</button>
                </article>
              ))}
            </div>
          </section>

          <footer>
            <span>All assessment data remains on this device.</span>
            <span>NemoClaw managed · OpenShell policy enforced</span>
          </footer>
        </div>
      </section>
    </main>
  );
}
