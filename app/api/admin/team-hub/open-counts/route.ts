// Admin-only (proxy.ts default admin gate). Phase 6: lightweight open-issue
// counts per account, for the Accounts Center badge — deliberately its own
// tiny route rather than folded into /api/admin/team-hub/queue, since the
// accounts list can load this on every visit without pulling full issue/
// order payloads. No Sheets reads in this file.
import { NextResponse } from "next/server";
import { getOpenTeamHubIssueCountsByAccount } from "@/lib/teamHubDb";

export async function GET() {
  try {
    const counts = await getOpenTeamHubIssueCountsByAccount();
    return NextResponse.json({ success: true, countsByAccountId: Object.fromEntries(counts) });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load open Team Hub problem counts." },
      { status: 500 }
    );
  }
}
