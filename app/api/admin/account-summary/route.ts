// Staff only (proxy.ts default gate). The numbers on the account page's
// "Everything for this account" tiles. Read only. See lib/pg/account-summary.ts.

import { NextRequest, NextResponse } from "next/server";
import { getAccountSummary } from "@/lib/pg/account-summary";

const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET(request: NextRequest) {
  try {
    const accountId = (request.nextUrl.searchParams.get("accountId") ?? "").trim();
    if (!accountId) return NextResponse.json({ success: false, error: "accountId is required." }, { status: 400 });
    const summary = await getAccountSummary(accountId);
    // An account this database does not know: the tiles still open the lists, without numbers.
    return NextResponse.json({ success: true, summary }, noStore);
  } catch (error) {
    console.error("[account-summary GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "The numbers did not load." }, { status: 500 });
  }
}
