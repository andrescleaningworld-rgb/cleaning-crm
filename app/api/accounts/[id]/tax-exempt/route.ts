// "Tax exempt" on the account page (lib/pg/tax-exempt.ts, migration 065).
// Staff only: /api/accounts is behind the staff login (proxy.ts), and it is
// checked here. Display only: the customer's price shows without "+ sales tax".
//
//   GET             { exempt }
//   POST { on }     saves it (a line in the account's History)

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { logActivity } from "@/lib/activityLog";
import { isTaxExempt, setTaxExempt } from "@/lib/pg/tax-exempt";

type RouteContext = { params: Promise<{ id: string }> };
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

export async function GET(request: NextRequest, { params }: RouteContext) {
  if (!(await getAdminIdentity(request))) return refuse("Log in first.", 401);
  const accountId = decodeURIComponent((await params).id).trim();
  return NextResponse.json({ success: true, exempt: await isTaxExempt(accountId) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const staff = await getAdminIdentity(request);
    if (!staff) return refuse("Log in first.", 401);
    const accountId = decodeURIComponent((await params).id).trim();
    const body = (await request.json().catch(() => ({}))) as { on?: unknown };
    const on = body.on === true;
    await setTaxExempt(accountId, on);
    await logActivity({
      actorAccountId: staff.accountId ?? null,
      actorRole: staff.role ?? "manager",
      actorName: staff.name || "Someone",
      action: "update",
      entityType: "account",
      entityId: accountId,
      detail: on ? "Tax exempt: ON (the customer's price shows without sales tax)" : "Tax exempt: OFF (the customer's price shows + sales tax)",
    }).catch(() => undefined);
    return NextResponse.json({ success: true, exempt: on });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return refuse(message && message.length < 160 ? message : "That did not save. Try again.", 500);
  }
}
