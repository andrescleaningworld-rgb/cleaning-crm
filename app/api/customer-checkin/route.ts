// The customer monthly check-in, staff side (lib/pg/customer-checkin.ts).
// Staff only (proxy.ts default gate, plus a logged-in check here).
//
// GET ?accountId=           the account's last check-ins and whether it opted out
// POST { action: "test" }   "Send me a test": the real email to crm@, links save nothing

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { CHECKIN_TEST_EMAIL } from "@/lib/customerCheckin";
import { accountCheckins, sendTestCheckin } from "@/lib/pg/customer-checkin";

const noStore = { headers: { "Cache-Control": "no-store" } };
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status, ...noStore });

export async function GET(request: NextRequest) {
  try {
    if (!(await getAdminIdentity(request))) return refuse("Log in first.", 401);
    const accountId = request.nextUrl.searchParams.get("accountId")?.trim() ?? "";
    if (!accountId) return refuse("accountId is required.");
    return NextResponse.json({ success: true, ...(await accountCheckins(accountId)) }, noStore);
  } catch (error) {
    console.error("[customer-checkin GET]", error instanceof Error ? error.message : error);
    return refuse("Check-ins did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Log in first.", 401);
    const body = (await request.json().catch(() => ({}))) as { action?: unknown };
    if (body.action !== "test") return refuse("Unknown action.");
    const sent = await sendTestCheckin(request.nextUrl.origin, identity.name || "Office");
    return sent ? NextResponse.json({ success: true, sentTo: CHECKIN_TEST_EMAIL }, noStore) : refuse("Email is not set up on this server, so nothing was sent.", 503);
  } catch (error) {
    console.error("[customer-checkin POST]", error instanceof Error ? error.message : error);
    return refuse(error instanceof Error ? error.message : "The test was not sent.", 500);
  }
}
