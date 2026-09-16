// Owner-only Activity Log listing (gated by proxy.ts's OWNER_ONLY_PATHS).
// Not to be confused with app/api/activity-log/route.ts, an unrelated
// subcontractor-facing Sheets-backed feed used by app/sub-center.
import { NextRequest, NextResponse } from "next/server";
import { listActivityLog } from "@/lib/activityLog";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const actorAccountId = url.searchParams.get("managerAccountId")?.trim() || undefined;
    const start = url.searchParams.get("start")?.trim() || undefined;
    const end = url.searchParams.get("end")?.trim() || undefined;

    const entries = await listActivityLog({ actorAccountId, start, end });
    return NextResponse.json({ success: true, entries });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load activity log." },
      { status: 500 }
    );
  }
}
