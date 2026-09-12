import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function titleFromFolder(folder) {
  return folder
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function fileExists(filePath) {
  const stats = await fs.stat(/* turbopackIgnore: true */ filePath).catch(() => null);
  return Boolean(stats?.isFile());
}

async function readPackage(targetPath) {
  try {
    const raw = await fs.readFile(/* turbopackIgnore: true */ path.join(targetPath, "package.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function detectFramework(packageJson) {
  const dependencies = {
    ...(packageJson?.dependencies || {}),
    ...(packageJson?.devDependencies || {}),
  };
  if (dependencies.next) return "Next.js";
  if (dependencies.react) return "React";
  if (dependencies.vue) return "Vue";
  if (dependencies.svelte) return "Svelte";
  return packageJson ? "Node.js" : "Unknown";
}

export async function GET() {
  const targetsRoot = path.resolve(/* turbopackIgnore: true */
    process.env.TARGETS_ROOT || path.join(process.cwd(), "..", "examples"),
  );

  try {
    const entries = await fs.readdir(/* turbopackIgnore: true */ targetsRoot, { withFileTypes: true });
    const software = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const targetPath = path.join(/* turbopackIgnore: true */ targetsRoot, entry.name);
      const packageJson = await readPackage(targetPath);
      const hasDockerfile = await fileExists(path.join(targetPath, "Dockerfile"));
      const hasCompose = await fileExists(path.join(targetPath, "docker-compose.yml"));
      const hasOpenApi = await fileExists(path.join(targetPath, "openapi.yaml"));
      const hasTargetManifest = await fileExists(path.join(targetPath, "compliance-target.generated.yaml"));

      if (!packageJson && !hasDockerfile && !hasCompose && !hasOpenApi && !hasTargetManifest) {
        continue;
      }

      const signals = [
        packageJson ? "package.json" : null,
        hasDockerfile ? "Dockerfile" : null,
        hasCompose ? "docker-compose.yml" : null,
        hasOpenApi ? "openapi.yaml" : null,
        hasTargetManifest ? "target manifest" : null,
      ].filter(Boolean);

      software.push({
        id: entry.name,
        name: packageJson?.name || titleFromFolder(entry.name),
        folder: entry.name,
        framework: detectFramework(packageJson),
        signals,
      });
    }

    return NextResponse.json({ root: targetsRoot, software });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Software discovery failed.", software: [] },
      { status: 500 },
    );
  }
}
