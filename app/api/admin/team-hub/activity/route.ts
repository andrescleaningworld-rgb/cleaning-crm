// Admin-only (proxy.ts default admin gate). Phase 6: per-account "what
// happened" activity feed — see the getTeamHubActivityFeedForSite comment
// in lib/teamHubDb.ts for why this is intentionally NOT lib/activityLog.ts.
// No Sheets reads in this file.
import { NextRequest, NextResponse } from "next/server";
import { getTeamHubActivityFeedForSite } from "@/lib/teamHubDb";

export async function GET(request: NextRequest) {
  try {
    const siteId = Number(new URL(request.url).searchParams.get("siteId"));
    if (!Number.isInteger(siteId)) {
      return NextResponse.json({ success: false, error: "A valid siteId is required." }, { status: 400 });
    }
    const events = await getTeamHubActivityFeedForSite(siteId, 50);
    return NextResponse.json({ success: true, events });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load activity." },
      { status: 500 }
    );
  }
}
