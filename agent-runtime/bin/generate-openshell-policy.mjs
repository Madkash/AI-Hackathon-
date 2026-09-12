#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";

function fail(message) {
  console.error(JSON.stringify({ status: "error", error: message }, null, 2));
  process.exit(1);
}

function parseArguments(argv) {
  const args = argv.slice(2);
  const value = (flag) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : null;
  };

  const target = value("--target");
  const output = value("--output");
  if (!target) {
    fail("Usage: generate-openshell-policy --target <compliance-target.yaml> [--output <policy.json>]");
  }

  return {
    target: path.resolve(target),
    output: output ? path.resolve(output) : null,
  };
}

async function loadTarget(file) {
  const parsed = YAML.parse(await fs.readFile(file, "utf8"));
  if (!parsed?.target || !parsed?.scope || !parsed?.data_handling) {
    fail("Target YAML must contain target, scope, and data_handling sections");
  }
  return parsed;
}

function buildPolicy(targetFile, target) {
  const scope = target.scope ?? {};
  const dataHandling = target.data_handling ?? {};

  // Refuse to emit a policy that would not actually deny egress. The
  // generated file is meant to be OpenShell's enforcement input, so a
  // permissive policy here would defeat the deny-by-default guarantee.
  if (dataHandling.external_network !== "deny") {
    fail('Refusing to generate a policy: data_handling.external_network must be "deny"');
  }

  const allowedHosts = scope.allowed_hosts ?? [];
  if (allowedHosts.length === 0) {
    fail("Refusing to generate a policy: scope.allowed_hosts is empty");
  }

  const allowedPorts = scope.allowed_ports ?? [];

  return {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    generated_by: "generate-openshell-policy",
    generated_from: targetFile,
    target_name: target.target?.name ?? null,
    network: {
      default_egress: "deny",
      deny_external_network: true,
      allow_egress: allowedHosts.map((host) => ({ host, ports: allowedPorts })),
    },
    filesystem: {
      read_only: [target.target?.source_path].filter(Boolean),
      write_allowed: [],
    },
    active_testing: scope.active_testing === true,
    excluded_paths: scope.excluded_paths ?? [],
    rate_limits: {
      max_requests_per_second: scope.maximum_requests_per_second ?? null,
      max_concurrent_requests: scope.maximum_concurrent_requests ?? null,
    },
    permitted_test_accounts: (target.authentication?.accounts ?? []).map((account) => account.role),
  };
}

async function main() {
  const { target, output } = parseArguments(process.argv);

  let parsedTarget;
  try {
    parsedTarget = await loadTarget(target);
  } catch (error) {
    if (error?.code === "ENOENT") fail(`Target YAML not found: ${target}`);
    throw error;
  }

  const policy = buildPolicy(target, parsedTarget);
  const serialized = `${JSON.stringify(policy, null, 2)}\n`;

  if (output) {
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, serialized, "utf8");
    console.log(JSON.stringify({ status: "ok", output }, null, 2));
  } else {
    process.stdout.write(serialized);
  }
}

main();
