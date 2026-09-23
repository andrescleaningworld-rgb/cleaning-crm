// Admin-only (proxy.ts default admin gate). Phase 6 staff queue: open
// problems + open supply orders across EVERY account's Team Hub (the Phase
// 4 admin UI in app/accounts/[id]/team-hub-tab.tsx is scoped to one
// account). With ?subId=, scopes to one sub's own accounts instead (backs
// the Sub Center read-only list). Account names are resolved through
// lib/teamHubAccountLookup.ts, the one sanctioned choke point — the only
// Sheets read in this file.
import { NextRequest, NextResponse } from "next/server";
import {
  listOpenTeamHubIssuesAcrossSites,
  listOpenTeamHubSupplyOrdersAcrossSites,
  listOpenTeamHubIssuesForSub,
  listOpenTeamHubSupplyOrdersForSub,
} from "@/lib/teamHubDb";
import { lookupAccountSummaries } from "@/lib/teamHubAccountLookup";

export async function GET(request: NextRequest) {
  try {
    const subId = new URL(request.url).searchParams.get("subId")?.trim() || null;

    const [issues, orders] = subId
      ? await Promise.all([listOpenTeamHubIssuesForSub(subId), listOpenTeamHubSupplyOrdersForSub(subId)])
      : await Promise.all([listOpenTeamHubIssuesAcrossSites(), listOpenTeamHubSupplyOrdersAcrossSites()]);

    const accountIds = Array.from(new Set([...issues.map((i) => i.accountId), ...orders.map((o) => o.accountId)]));
    const accounts = await lookupAccountSummaries(accountIds);

    const accountNamesById: Record<string, string> = {};
    for (const accountId of accountIds) {
      accountNamesById[accountId] = accounts.get(accountId)?.accountName ?? accountId;
    }

    return NextResponse.json({ success: true, issues, orders, accountNamesById });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load the Team Hub queue." },
      { status: 500 }
    );
  }
}
