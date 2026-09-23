// Admin-only (proxy.ts default admin gate). Phase 6: which subs currently
// have an open Team Hub issue or order, for the Sub Center tab's overview
// list. Sub names resolved through lib/teamHubAccountLookup.ts's
// lookupSubcontractorNames — the only Sheets read in this file.
import { NextResponse } from "next/server";
import { listTeamHubSubIdsWithOpenItems } from "@/lib/teamHubDb";
import { lookupSubcontractorNames } from "@/lib/teamHubAccountLookup";

export async function GET() {
  try {
    const subIds = await listTeamHubSubIdsWithOpenItems();
    const names = await lookupSubcontractorNames(subIds);
    const subs = subIds.map((subId) => ({ subId, name: names.get(subId) ?? subId }));
    return NextResponse.json({ success: true, subs });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load subs with open Team Hub items." },
      { status: 500 }
    );
  }
}
