// "At risk" flags (lib/pg/account-risk.ts). Staff only: proxy.ts keeps every
// /api path behind the staff login unless it is listed as public, and this
// one is not. Never used by the sub portal or the customer portal.
//
// GET                 { flags: { <account id>: { level, reason } } } for every active account
// GET ?accountId=     one account, with the numbers behind its flag

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { accountRiskFlags } from "@/lib/pg/account-risk";

const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET(request: NextRequest) {
  try {
    if (!(await getAdminIdentity(request))) return NextResponse.json({ success: false, error: "Log in first." }, { status: 401, ...noStore });
    const flags = await accountRiskFlags();
    const one = request.nextUrl.searchParams.get("accountId")?.trim();
    if (one) return NextResponse.json({ success: true, flag: flags.get(one) ?? null }, noStore);
    const out: Record<string, { level: string; reason: string }> = {};
    for (const [id, flag] of flags) out[id] = { level: flag.level, reason: flag.reason };
    return NextResponse.json({ success: true, flags: out }, noStore);
  } catch (error) {
    console.error("[account-risk GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "At risk flags did not load." }, { status: 500, ...noStore });
  }
}
