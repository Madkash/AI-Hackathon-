import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let mongodb = "not-configured";

  try {
    const database = await getDatabase();
    if (database) {
      await database.command({ ping: 1 });
      mongodb = "available";
    }
  } catch {
    mongodb = "unavailable";
  }

  return NextResponse.json({
    services: {
      app: "available",
      mongodb,
      inference: "configured-by-nemoclaw",
    },
    externalNetworkRequired: false,
  });
}
