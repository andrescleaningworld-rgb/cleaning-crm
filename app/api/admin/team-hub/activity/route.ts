// Admin-only (proxy.ts default admin gate). Phase 6: per-account "what
// happened" activity feed — see the getTeamHubActivityFeedForSite comment
// in lib/teamHubDb.ts for why this is intentionally NOT lib/activityLog.ts.
// No Sheets reads in this file.
//
// Query: siteId (required), and optional filters kind (comma list of
// checklist_submitted/round_check/issue_reported/supply_order), crewId,
// status (open|closed), from/to (YYYY-MM-DD, America/New_York days).
import { NextRequest, NextResponse } from "next/server";
import { getTeamHubActivityFeedForSite, TEAM_HUB_ACTIVITY_KINDS, type TeamHubActivityKind } from "@/lib/teamHubDb";

export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const siteId = Number(params.get("siteId"));
    if (!Number.isInteger(siteId)) {
      return NextResponse.json({ success: false, error: "A valid siteId is required." }, { status: 400 });
    }

    const kinds = (params.get("kind") ?? "")
      .split(",")
      .map((k) => k.trim())
      .filter((k): k is TeamHubActivityKind => TEAM_HUB_ACTIVITY_KINDS.includes(k as TeamHubActivityKind));
    const crewIdParam = params.get("crewId");
    const crewId = crewIdParam && Number.isInteger(Number(crewIdParam)) ? Number(crewIdParam) : null;
    const statusParam = params.get("status");
    const status = statusParam === "open" || statusParam === "closed" ? statusParam : null;

    const events = await getTeamHubActivityFeedForSite(siteId, {
      kinds,
      crewId,
      status,
      fromDate: params.get("from"),
      toDate: params.get("to"),
    });
    return NextResponse.json({ success: true, events });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load activity." },
      { status: 500 }
    );
  }
}
