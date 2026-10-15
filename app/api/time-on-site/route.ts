// Approx. time on site per account. Staff only (proxy.ts default gate, and
// the staff session is checked here). See lib/pg/time-on-site.ts.
//   GET  ?accountId=…   one account's time on site
//   GET  ?list=1        every active account, for the quick fill-in screen
//   POST { accountId, minutes }   the office sets it

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { getTimeOnSite, listTimeOnSite, setTimeOnSiteByOffice, timeOnSiteReady } from "@/lib/pg/time-on-site";

const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET(request: NextRequest) {
  try {
    if (!(await getAdminIdentity(request))) return refuse("Log in first.", 401);
    if (!(await timeOnSiteReady())) return NextResponse.json({ success: true, on: false }, noStore);
    const params = request.nextUrl.searchParams;
    if (params.get("list") === "1") return NextResponse.json({ success: true, on: true, accounts: await listTimeOnSite() }, noStore);
    const accountId = (params.get("accountId") ?? "").trim();
    if (!accountId) return refuse("Which account?");
    return NextResponse.json({ success: true, on: true, time: await getTimeOnSite(accountId) }, noStore);
  } catch (error) {
    console.error("[time-on-site GET]", error instanceof Error ? error.message : error);
    return refuse("Time on site did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Log in first.", 401);
    if (!(await timeOnSiteReady())) return refuse("This is not turned on here yet.", 409);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const accountId = String(body.accountId ?? "").trim();
    const minutes = Number(body.minutes);
    if (!accountId) return refuse("Which account?");
    if (!Number.isFinite(minutes)) return refuse("How long?");
    const time = await setTimeOnSiteByOffice(accountId, minutes, String(identity.name ?? "").trim() || "Staff");
    if (!time) return refuse("That account was not found.", 404);
    return NextResponse.json({ success: true, time });
  } catch (error) {
    console.error("[time-on-site POST]", error instanceof Error ? error.message : error);
    return refuse("Time on site was not saved.", 500);
  }
}
