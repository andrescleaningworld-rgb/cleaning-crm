// Admin-only (proxy.ts default admin gate). Simplicity-pass addition: the
// "one plain status line per crew" on the summary view
// (docs/team-hub-spec.md) — last submitted checklist run's done/total, or
// today's rounds checked/total, whichever the crew actually uses. No
// Sheets reads.
import { NextRequest, NextResponse } from "next/server";
import {
  getLastSubmittedTeamHubChecklistRunSummary,
  listEnabledTeamHubRoundItemsForCrew,
  getLatestTeamHubRoundChecksForCrew,
} from "@/lib/teamHubDb";

export async function GET(request: NextRequest) {
  try {
    const crewId = Number(new URL(request.url).searchParams.get("crewId"));
    if (!Number.isInteger(crewId)) {
      return NextResponse.json({ success: false, error: "A valid crewId is required." }, { status: 400 });
    }

    const [checklist, roundItems, latestChecks] = await Promise.all([
      getLastSubmittedTeamHubChecklistRunSummary(crewId),
      listEnabledTeamHubRoundItemsForCrew(crewId),
      getLatestTeamHubRoundChecksForCrew(crewId),
    ]);

    const rounds =
      roundItems.length > 0
        ? { checkedCount: roundItems.filter((item) => latestChecks.has(item.crewItemId)).length, totalCount: roundItems.length }
        : null;

    return NextResponse.json({ success: true, checklist, rounds });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load crew summary." },
      { status: 500 }
    );
  }
}
