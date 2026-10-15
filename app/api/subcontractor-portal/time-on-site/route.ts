// The sub portal's "How long each cleaning takes". Identity comes from the
// sub_session cookie, never a client-supplied id (same pattern as
// app/api/subcontractor-portal/equipment/route.ts), and a sub can only
// answer for their own active accounts.
//   GET                          the sub's accounts with their time on site
//   POST { accountId, minutes }  the sub's answer (lib/pg/time-on-site.ts setTimeOnSiteBySub)

import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { subSessionOptions, type SubSessionData } from "@/lib/subSession";
import { listTimeOnSiteForSub, setTimeOnSiteBySub, subHasAccount, timeOnSiteReady } from "@/lib/pg/time-on-site";

const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const noStore = { headers: { "Cache-Control": "no-store" } };

async function subFrom(request: NextRequest): Promise<{ email: string; name: string } | null> {
  const session = await getIronSession<SubSessionData>(request, NextResponse.json({}), subSessionOptions());
  const email = session.subcontractorEmail?.trim() ?? "";
  return email ? { email, name: session.subcontractorName?.trim() || email } : null;
}

export async function GET(request: NextRequest) {
  try {
    const sub = await subFrom(request);
    if (!sub) return refuse("Not logged in.", 401);
    if (!(await timeOnSiteReady())) return NextResponse.json({ success: true, on: false, accounts: [] }, noStore);
    return NextResponse.json({ success: true, on: true, accounts: await listTimeOnSiteForSub(sub.email) }, noStore);
  } catch (error) {
    console.error("[subcontractor-portal/time-on-site GET]", error instanceof Error ? error.message : error);
    return refuse("Your accounts did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const sub = await subFrom(request);
    if (!sub) return refuse("Not logged in.", 401);
    if (!(await timeOnSiteReady())) return refuse("This is not turned on yet.", 409);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const accountId = String(body.accountId ?? "").trim();
    const minutes = Number(body.minutes);
    if (!accountId) return refuse("Which account?");
    if (!Number.isFinite(minutes)) return refuse("How long?");
    if (!(await subHasAccount(sub.email, accountId))) return refuse("That is not one of your accounts.", 403);
    const { time, kept } = await setTimeOnSiteBySub(accountId, minutes, sub.name);
    if (!time) return refuse("That account was not found.", 404);
    return NextResponse.json({ success: true, minutes: kept ? time.subMinutes : time.minutes, waiting: kept });
  } catch (error) {
    console.error("[subcontractor-portal/time-on-site POST]", error instanceof Error ? error.message : error);
    return refuse("Not saved.", 500);
  }
}
