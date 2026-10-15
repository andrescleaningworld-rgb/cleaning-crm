// The sub portal's "📦 Supplies arrived" and "🗑 Case empty" (lib/pg/shelves.ts).
// Under /api/subcontractor-portal, which proxy.ts lets through without the
// staff login, so this route checks the sub's own session itself, and only
// lets a sub touch the sites that are theirs. Sub portal login is not changed.
//
//   GET ?accountId=                                 that site's shelf and what is on its way
//   POST { action: "arrive", accountId, key, got }  confirm a delivery
//   POST { action: "empty", accountId, supplyId }   one case used up
import { NextRequest, NextResponse } from "next/server";
import { getSubPortalByEmail } from "@/lib/data/sub-portal";
import { readSubSession } from "@/lib/subDevice";
import { caseEmpty, confirmArrival, crewShelfView, shelvesReady } from "@/lib/pg/shelves";

const clean = (value: unknown, max = 200) => String(value ?? "").trim().slice(0, max);
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

/** The sub, and whether this account is one of theirs. Null = not logged in. */
async function subFor(request: NextRequest, accountId: string): Promise<{ name: string; mine: boolean } | null> {
  const session = await readSubSession(request, NextResponse.json({}));
  if (!session.subcontractorEmail) return null;
  const portal = await getSubPortalByEmail(session.subcontractorEmail);
  if (!portal) return null;
  const accounts = (portal.accounts ?? []) as { accountId?: unknown }[];
  return { name: clean(session.subcontractorName) || session.subcontractorEmail, mine: accounts.some((account) => clean(account.accountId) === accountId) };
}

export async function GET(request: NextRequest) {
  try {
    if (!(await shelvesReady())) return NextResponse.json({ success: true, on: false });
    const accountId = clean(request.nextUrl.searchParams.get("accountId"));
    const sub = await subFor(request, accountId);
    if (!sub) return refuse("Not logged in.", 401);
    // No site asked for: only whether the two buttons are here (the home screen asks this).
    if (!accountId) return NextResponse.json({ success: true, on: true });
    if (!sub.mine) return refuse("That site is not one of yours.", 403);
    return NextResponse.json({ success: true, on: true, ...(await crewShelfView(accountId)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[sub shelf GET]", error instanceof Error ? error.message : error);
    return refuse("That did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await shelvesReady())) return refuse("Not available here yet.", 409);
    const body = (await request.json().catch(() => ({}))) as { action?: string; accountId?: string; key?: string; got?: unknown[]; supplyId?: unknown };
    const accountId = clean(body.accountId);
    const sub = await subFor(request, accountId);
    if (!sub) return refuse("Not logged in.", 401);
    if (!accountId || !sub.mine) return refuse("That site is not one of yours.", 403);
    try {
      if (body.action === "arrive") {
        const result = await confirmArrival({ accountId, key: clean(body.key), got: (Array.isArray(body.got) ? body.got : []).map((n) => Number(n)), by: sub.name, source: "sub-portal" });
        return NextResponse.json({ success: true, short: result.short.length, extra: result.extra.length });
      }
      if (body.action === "empty") {
        const result = await caseEmpty({ accountId, supplyId: Number(body.supplyId), by: sub.name, source: "sub-portal" });
        return NextResponse.json({ success: true, qty: result.qty });
      }
    } catch (error) {
      return refuse(error instanceof Error ? error.message : "That did not save.");
    }
    return refuse("Unknown action.");
  } catch (error) {
    console.error("[sub shelf POST]", error instanceof Error ? error.message : error);
    return refuse("That did not save. Try again.", 500);
  }
}
