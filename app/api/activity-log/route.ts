import { NextResponse } from "next/server";
import { getOrFetch } from "@/lib/serverCache";
import { getSubcontractorActivityLog } from "@/lib/googleSheets";

export const maxDuration = 45;

export async function GET() {
  try {
    const logs = await getOrFetch(
      "activity-log:getSubcontractorActivityLog",
      getSubcontractorActivityLog
    );

    return NextResponse.json(
      { success: true, logs },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=120" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error loading activity log.",
      },
      { status: 500 }
    );
  }
}
