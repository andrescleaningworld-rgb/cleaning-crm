// Admin-only (proxy.ts default admin gate). Phase 6 Sub Center read-only
// list: every Team Hub site each sub's crews work, grouped by sub, with
// real account names and open problem/order counts. Sub and account names
// are resolved through lib/teamHubAccountLookup.ts — the only Sheets reads
// in this file.
import { NextResponse } from "next/server";
import { listTeamHubSubCrewSites } from "@/lib/teamHubDb";
import { lookupAccountSummaries, lookupSubcontractorNames } from "@/lib/teamHubAccountLookup";

export async function GET() {
  try {
    const sites = await listTeamHubSubCrewSites();
    const subIds = Array.from(new Set(sites.map((s) => s.subId)));
    const accountIds = Array.from(new Set(sites.map((s) => s.accountId)));
    const [subNames, accounts] = await Promise.all([lookupSubcontractorNames(subIds), lookupAccountSummaries(accountIds)]);

    const subs = subIds
      .map((subId) => ({
        subId,
        name: subNames.get(subId) ?? subId,
        sites: sites
          .filter((s) => s.subId === subId)
          .map((s) => ({ ...s, accountName: accounts.get(s.accountId)?.accountName ?? s.accountId })),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ success: true, subs });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load Team Hub sites by sub." },
      { status: 500 }
    );
  }
}
