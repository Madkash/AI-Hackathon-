#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const tools = [
  { name: "Node.js", commands: [["node", "--version"]], tier: "required", purpose: "OpenClaw skills and LocalProof runner" },
  { name: "npm", commands: [["npm", "--version"]], tier: "required", purpose: "Preinstall pinned local runtime dependencies" },
  { name: "Docker", commands: [["docker", "--version"]], tier: "required", purpose: "OpenShell and isolated target services" },
  { name: "Docker Compose", commands: [["docker", "compose", "version"]], tier: "required", purpose: "Local console, MongoDB, and target orchestration" },
  { name: "NemoClaw", commands: [["nemoclaw", "--version"]], tier: "required-on-gb10", purpose: "Managed OpenClaw and OpenShell environment" },
  { name: "OpenShell", commands: [["openshell", "--version"]], tier: "required-on-gb10", purpose: "Sandbox and deny-by-default network policy" },
  { name: "Git", commands: [["git", "--version"]], tier: "recommended", purpose: "Source revision and change-control evidence" },
  { name: "ripgrep", commands: [["rg", "--version"]], tier: "recommended", purpose: "Fast local source discovery" },
  { name: "Playwright", commands: [["playwright", "--version"], ["npx", "--no-install", "playwright", "--version"]], tier: "assessment", purpose: "Local browser automation against approved targets" },
  { name: "axe", commands: [["axe", "--version"], ["npx", "--no-install", "axe", "--version"]], tier: "assessment", purpose: "Local automated accessibility checks" },
  { name: "OWASP ZAP", commands: [["zap.sh", "-version"], ["zap.bat", "-version"]], tier: "assessment", purpose: "Local passive and authorized web testing" },
  { name: "Semgrep", commands: [["semgrep", "--version"]], tier: "assessment", purpose: "Static analysis with locally pinned rules" },
  { name: "Gitleaks", commands: [["gitleaks", "version"]], tier: "assessment", purpose: "Offline secret detection with redacted output" },
  { name: "Syft", commands: [["syft", "version"]], tier: "assessment", purpose: "Local SBOM generation" },
  { name: "Grype", commands: [["grype", "version"]], tier: "assessment-choice", purpose: "Offline vulnerability matching" },
  { name: "Trivy", commands: [["trivy", "--version"]], tier: "assessment-choice", purpose: "Alternative offline vulnerability and configuration scanning" },
  { name: "Nmap", commands: [["nmap", "--version"]], tier: "assessment", purpose: "Bounded inspection of approved local services" },
];

const CMD_UNSAFE_CHARACTERS = /[&|<>^%!()"]/;

function quoteForCmd(value) {
  const text = String(value);
  if (CMD_UNSAFE_CHARACTERS.test(text)) {
    throw new Error(`Argument contains characters that cannot be safely passed to a Windows .cmd/.bat wrapper: ${text}`);
  }
  return /\s/.test(text) ? `"${text}"` : text;
}

function runWithWindowsShell(command, args) {
  const commandLine = [command, ...args].map(quoteForCmd).join(" ");
  return spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", commandLine], {
    encoding: "utf8",
    timeout: 5000,
    windowsHide: true,
  });
}

function spawnCandidate(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 5000, windowsHide: true });
  if (process.platform !== "win32" || !["ENOENT", "EPERM", "EINVAL"].includes(result.error?.code) || /[\\/]/.test(command)) {
    return { result, command };
  }

  const wrappers = /\.[a-z0-9]+$/i.test(command) ? [command] : [command, `${command}.cmd`, `${command}.bat`];
  for (const wrapper of wrappers) {
    const retry = runWithWindowsShell(wrapper, args);
    if (!retry.error) return { result: retry, command: wrapper };
    if (!["ENOENT", "EINVAL"].includes(retry.error.code)) return { result: retry, command: wrapper };
  }

  return { result, command };
}

function inspect(candidate) {
  const [command, ...args] = candidate;
  const { result, command: executedCommand } = spawnCandidate(command, args);
  if (result.error) {
    const code = result.error.code || "spawn-error";
    if (code === "EPERM" || code === "EACCES") return { blocked: true };
    return null;
  }
  if (result.status !== 0) return null;
  const text = `${result.stdout || ""}\n${result.stderr || ""}`.trim().split(/\r?\n/)[0];
  return { command: [executedCommand, ...args].join(" "), version: text || "available" };
}

const results = tools.map((tool) => {
  let detection = tool.name === "Node.js"
    ? { command: process.execPath, version: process.version }
    : tool.name === "npm" && process.env.npm_config_user_agent
      ? { command: "npm", version: process.env.npm_config_user_agent.split(" ")[0] }
      : null;
  let blockedReason = null;
  if (!detection) {
    for (const candidate of tool.commands) {
      const attempt = inspect(candidate);
      if (attempt?.blocked) {
        blockedReason = "subprocess checks blocked by current sandbox";
        break;
      }
      if (attempt) {
        detection = attempt;
        break;
      }
    }
  }
  return {
    ...tool,
    available: detection ? true : blockedReason ? null : false,
    detection,
    note: blockedReason,
  };
});

console.log(JSON.stringify({
  checked_at: new Date().toISOString(),
  network_used: false,
  results,
}, null, 2));
