// Crew "Couldn't do" (lib/pg/crew-skips.ts) for Accounts Center -> Crew Link.
// Staff only: this path falls through to proxy.ts's admin gate, and the
// session is checked here too.
//
// GET                                  every "Couldn't do" paper still up
// POST { action: "handled", accountId }  the paper comes down (the next skip puts it back)

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { listOpenSkips, markSkipsHandled } from "@/lib/pg/crew-skips";

const noStore = { headers: { "Cache-Control": "no-store" } };
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status, ...noStore });

export async function GET(request: NextRequest) {
  try {
    if (!(await getAdminIdentity(request))) return refuse("Log in first.", 401);
    return NextResponse.json({ success: true, skips: await listOpenSkips() }, noStore);
  } catch (error) {
    console.error("[crew-skips GET]", error instanceof Error ? error.message : error);
    return refuse("The list did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Log in first.", 401);
    const body = (await request.json().catch(() => ({}))) as { action?: unknown; accountId?: unknown };
    const accountId = String(body.accountId ?? "").trim();
    if (body.action !== "handled" || !accountId) return refuse("Unknown action.");
    if (!(await markSkipsHandled(accountId, identity.name || "Staff"))) return refuse("That is already handled.", 409);
    return NextResponse.json({ success: true }, noStore);
  } catch (error) {
    console.error("[crew-skips POST]", error instanceof Error ? error.message : error);
    return refuse("That did not save. Try again.", 500);
  }
}
