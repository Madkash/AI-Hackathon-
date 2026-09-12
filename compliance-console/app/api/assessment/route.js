import { NextResponse } from "next/server";
import { demoAssessmentSnapshot, normalizeAssessmentRun } from "@/lib/assessment";
import { getDatabase, hasMongoConfiguration } from "@/lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasMongoConfiguration()) {
    return NextResponse.json(demoAssessmentSnapshot({
      services: { mongodb: "not-configured" },
      note: "MONGODB_URI is not configured, so the console is showing fallback readiness data.",
    }));
  }

  try {
    const database = await getDatabase();
    if (!database) {
      return NextResponse.json(demoAssessmentSnapshot({
        services: { mongodb: "not-configured" },
        note: "MongoDB is not configured, so the console is showing fallback readiness data.",
      }));
    }

    await database.command({ ping: 1 });
    const latestRun = await database.collection("assessment_runs").findOne({}, {
      sort: { generated_at: -1, _id: -1 },
    });

    if (!latestRun) {
      return NextResponse.json(demoAssessmentSnapshot({
        services: { mongodb: "available" },
        note: "MongoDB is available, but no assessment run has been persisted yet.",
      }));
    }

    return NextResponse.json(normalizeAssessmentRun(latestRun, {
      services: { mongodb: "available" },
    }));
  } catch {
    return NextResponse.json(demoAssessmentSnapshot({
      services: { mongodb: "unavailable" },
      note: "MongoDB is configured but unavailable, so the console is showing fallback readiness data.",
    }));
  }
}
