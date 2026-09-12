#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".nuxt",
  ".venv",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "vendor",
]);

const MAX_DEPTH = 5;
const MAX_FILES = 5000;
const MAX_TEXT_BYTES = 1024 * 1024;

function fail(message) {
  console.error(`discover-software: ${message}`);
  process.exit(1);
}

function parseArguments(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes("--help")) {
    console.log(
      "Usage: node discover-software.mjs <target-directory> [--output <yaml-file>]",
    );
    process.exit(args.includes("--help") ? 0 : 1);
  }

  const target = args[0];
  let output = path.join(target, "compliance-target.generated.yaml");
  const outputIndex = args.indexOf("--output");
  if (outputIndex !== -1) {
    if (!args[outputIndex + 1]) fail("--output requires a file path");
    output = args[outputIndex + 1];
  }

  return {
    target: path.resolve(target),
    output: path.resolve(output),
  };
}

function listFiles(root) {
  const results = [];

  function walk(current, depth) {
    if (depth > MAX_DEPTH || results.length >= MAX_FILES) return;

    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= MAX_FILES) return;
      if (entry.isSymbolicLink()) continue;

      const absolute = path.join(current, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");

      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) walk(absolute, depth + 1);
      } else if (entry.isFile()) {
        results.push({ absolute, relative, basename: entry.name });
      }
    }
  }

  walk(root, 0);
  return results;
}

function readText(file) {
  try {
    const stat = fs.statSync(file.absolute);
    if (stat.size > MAX_TEXT_BYTES) return null;
    return fs.readFileSync(file.absolute, "utf8");
  } catch {
    return null;
  }
}

function findFirst(files, names) {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  return files.find((file) => wanted.has(file.basename.toLowerCase()));
}

function filesMatching(files, predicate) {
  return files.filter(predicate).map((file) => file.relative);
}

function parsePackageJson(file) {
  if (!file) return null;
  try {
    return JSON.parse(fs.readFileSync(file.absolute, "utf8"));
  } catch {
    return null;
  }
}

function packageManager(files) {
  if (findFirst(files, ["pnpm-lock.yaml"])) return "pnpm";
  if (findFirst(files, ["yarn.lock"])) return "yarn";
  if (findFirst(files, ["bun.lock", "bun.lockb"])) return "bun";
  return "npm";
}

function scriptCommand(manager, script) {
  if (manager === "npm") return script === "start" ? "npm start" : `npm run ${script}`;
  return `${manager} ${script}`;
}

function detectFramework(packageJson) {
  const dependencies = {
    ...(packageJson?.dependencies ?? {}),
    ...(packageJson?.devDependencies ?? {}),
  };

  const candidates = [
    ["next", "nextjs"],
    ["@angular/core", "angular"],
    ["nuxt", "nuxt"],
    ["vue", "vue"],
    ["react", "react"],
    ["express", "express"],
    ["fastify", "fastify"],
    ["@nestjs/core", "nestjs"],
  ];

  for (const [dependency, framework] of candidates) {
    if (dependencies[dependency]) return { framework, evidence: "package.json" };
  }
  return null;
}

function detectPortFromScript(script) {
  if (typeof script !== "string") return null;
  const match = script.match(/(?:--port|-p)\s*[= ]\s*(\d{2,5})/);
  return match ? Number(match[1]) : null;
}

function detectComposePort(composeFile) {
  if (!composeFile) return null;
  const text = readText(composeFile);
  if (!text) return null;

  const quoted = text.match(/["'](\d{2,5}):(\d{2,5})["']/);
  const plain = text.match(/^\s*-\s*(\d{2,5}):(\d{2,5})\s*$/m);
  const match = quoted ?? plain;
  return match ? Number(match[1]) : null;
}

function detectDockerfilePort(dockerfile) {
  if (!dockerfile) return null;
  const text = readText(dockerfile);
  const match = text?.match(/^\s*EXPOSE\s+(\d{2,5})/im);
  return match ? Number(match[1]) : null;
}

function parseEnvironmentKeys(file) {
  if (!file) return [];
  const text = readText(file);
  if (!text) return [];

  return text
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1])
    .filter(Boolean)
    .sort();
}

function yamlScalar(value) {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return JSON.stringify(String(value));
}

function toYaml(value, indent = 0) {
  const pad = " ".repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]`;
    return value
      .map((item) => {
        if (item !== null && typeof item === "object") {
          return `${pad}-\n${toYaml(item, indent + 2)}`;
        }
        return `${pad}- ${yamlScalar(item)}`;
      })
      .join("\n");
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return `${pad}{}`;
    return entries
      .map(([key, item]) => {
        if (item !== null && typeof item === "object") {
          return `${pad}${key}:\n${toYaml(item, indent + 2)}`;
        }
        return `${pad}${key}: ${yamlScalar(item)}`;
      })
      .join("\n");
  }

  return `${pad}${yamlScalar(value)}`;
}

function buildDiscovery(root, files) {
  const packageFile = findFirst(files, ["package.json"]);
  const packageJson = parsePackageJson(packageFile);
  const manager = packageManager(files);
  const framework = detectFramework(packageJson);
  const composeFile = findFirst(files, [
    "compose.yaml",
    "compose.yml",
    "docker-compose.yaml",
    "docker-compose.yml",
  ]);
  const dockerfile = findFirst(files, ["Dockerfile"]);
  const envExample = findFirst(files, [".env.example", ".env.sample", "example.env"]);
  const apiSpecs = filesMatching(files, (file) =>
    /(^|\/)(openapi|swagger)\.(ya?ml|json)$/i.test(file.relative),
  );

  const scripts = packageJson?.scripts ?? {};
  const preferredScript = scripts.dev ? "dev" : scripts.start ? "start" : null;
  const composePort = detectComposePort(composeFile);
  const scriptPort = detectPortFromScript(preferredScript ? scripts[preferredScript] : null);
  const dockerfilePort = detectDockerfilePort(dockerfile);
  const port = composePort ?? scriptPort ?? dockerfilePort ?? (framework?.framework === "nextjs" ? 3000 : null);

  const components = [];
  if (packageFile) {
    components.push({
      id: "application",
      type: framework ? "web-application" : "source-repository",
      framework: framework?.framework ?? null,
      confidence: framework ? 0.96 : 0.65,
      provenance: packageFile.relative,
    });
  }
  if (dockerfile) {
    components.push({
      id: "container",
      type: "container-image",
      confidence: 0.98,
      provenance: dockerfile.relative,
    });
  }
  if (apiSpecs.length > 0) {
    components.push({
      id: "api",
      type: "rest-api",
      confidence: 0.98,
      provenance: apiSpecs[0],
    });
  }

  let deployment;
  if (composeFile) {
    deployment = {
      method: "docker-compose",
      compose_file: composeFile.relative,
      commands: {
        start: {
          value: `docker compose -f ${composeFile.relative} up -d`,
          status: "proposed",
          provenance: composeFile.relative,
        },
        stop: {
          value: `docker compose -f ${composeFile.relative} down`,
          status: "proposed",
          provenance: composeFile.relative,
        },
      },
    };
  } else if (preferredScript) {
    deployment = {
      method: "package-script",
      package_manager: manager,
      commands: {
        start: {
          value: scriptCommand(manager, preferredScript),
          status: "proposed",
          provenance: `${packageFile.relative}#scripts.${preferredScript}`,
        },
        stop: {
          value: null,
          status: "unresolved",
          provenance: null,
        },
      },
    };
  } else {
    deployment = {
      method: "unknown",
      commands: {
        start: { value: null, status: "unresolved", provenance: null },
        stop: { value: null, status: "unresolved", provenance: null },
      },
    };
  }

  const unresolved = [];
  if (components.length === 0) unresolved.push("No supported application manifest was detected");
  if (!deployment.commands.start.value) unresolved.push("Startup command could not be determined");
  if (!port) unresolved.push("Application port and local URL could not be determined");
  unresolved.push("Confirm authorized hosts, paths, request limits, and test accounts");
  unresolved.push("Verify proposed startup and shutdown commands in an isolated environment");

  return {
    schema_version: "0.1-draft",
    target: {
      name: packageJson?.name ?? path.basename(root),
      version: packageJson?.version ?? null,
      environment: "isolated-staging",
      source_path: root.split(path.sep).join("/"),
    },
    components,
    deployment,
    interfaces: {
      web: {
        base_url: port ? `http://localhost:${port}` : null,
        status: "unverified",
        provenance: composePort
          ? composeFile.relative
          : scriptPort
            ? `${packageFile.relative}#scripts.${preferredScript}`
            : dockerfilePort
              ? dockerfile.relative
              : framework?.framework === "nextjs"
                ? "Next.js conventional default"
                : null,
      },
      api: {
        specification: apiSpecs[0] ?? null,
        status: apiSpecs.length > 0 ? "discovered" : "not-discovered",
      },
    },
    environment_variable_names: parseEnvironmentKeys(envExample),
    assessments: {
      soc2_readiness: true,
      iso27001_readiness: true,
      penetration_test: true,
      wcag: true,
    },
    scope: {
      active_testing: false,
      allowed_hosts: ["localhost"],
      allowed_ports: port ? [port] : [],
      excluded_paths: [],
      maximum_requests_per_second: 2,
      maximum_concurrent_requests: 1,
    },
    data_handling: {
      external_network: "deny",
      use_synthetic_test_data: true,
      secrets_in_manifest: "forbidden",
    },
    discovery: {
      generated_at: new Date().toISOString(),
      generated_by: "discover-software.mjs",
      inspected_file_count: files.length,
      execution_performed: false,
      unresolved,
    },
  };
}

const { target, output } = parseArguments(process.argv);
if (!fs.existsSync(target)) fail(`target does not exist: ${target}`);
if (!fs.statSync(target).isDirectory()) fail(`target is not a directory: ${target}`);

const files = listFiles(target);
const discovery = buildDiscovery(target, files);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${toYaml(discovery)}\n`, "utf8");

console.log(`Inspected ${files.length} files without executing target code.`);
console.log(`Wrote proposed configuration to ${output}`);
