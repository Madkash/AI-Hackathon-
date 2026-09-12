import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const requestedTarget = String(body.target || "").trim();
    if (!requestedTarget) {
      return NextResponse.json({ error: "A target folder is required." }, { status: 400 });
    }

    const targetsRoot = path.resolve(/* turbopackIgnore: true */
      process.env.TARGETS_ROOT || path.join(process.cwd(), "..", "examples"),
    );
    const targetPath = path.resolve(targetsRoot, requestedTarget);
    if (!isInside(targetsRoot, targetPath)) {
      return NextResponse.json(
        { error: "The target must be a child of the configured targets directory." },
        { status: 403 },
      );
    }

    const targetStats = await fs.stat(/* turbopackIgnore: true */ targetPath).catch(() => null);
    if (!targetStats?.isDirectory()) {
      return NextResponse.json({ error: "The target folder does not exist." }, { status: 404 });
    }

    const toolPath = path.resolve(/* turbopackIgnore: true */
      process.env.DISCOVERY_TOOL_PATH ||
        path.join(process.cwd(), "..", "skills", "discover-software", "scripts", "discover-software.mjs"),
    );
    const outputRoot = path.resolve(/* turbopackIgnore: true */
      process.env.DISCOVERY_OUTPUT_DIR || path.join(process.cwd(), "data", "generated"),
    );
    await fs.mkdir(outputRoot, { recursive: true });

    const safeName = path.basename(targetPath).replace(/[^a-zA-Z0-9._-]/g, "-");
    const outputPath = path.join(outputRoot, `${safeName}.compliance-target.generated.yaml`);

    const { stdout } = await execFileAsync(process.execPath, [
      toolPath,
      targetPath,
      "--output",
      outputPath,
    ], {
      cwd: targetPath,
      timeout: 20_000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });

    const yaml = await fs.readFile(outputPath, "utf8");
    return NextResponse.json({
      status: "proposed",
      file: path.basename(outputPath),
      summary: stdout.trim(),
      yaml,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Discovery failed." },
      { status: 500 },
    );
  }
}
