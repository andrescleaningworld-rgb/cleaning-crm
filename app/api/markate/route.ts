// Markate (lib/pg/markate.ts). Staff only: this path falls through to
// proxy.ts's default admin gate. The Settings -> Markate parts are owner only.
//
// GET  ?list=1          the waiting estimates ("From Markate" in Accounts Center -> New accounts)
// GET  ?count=1         how many are waiting (the New accounts tab badge)
// GET  ?estimate=<id>   what New Accepted Account is filled with
// GET  ?settings=1      owner: the connection and the recurring items list
// POST { action: "skip", id }                 off the list and the board
// POST { action: "started", id, accountId }   New Accepted Account was saved from this estimate
// POST { action: "addItem", name }            owner
// POST { action: "removeItem", id }           owner
// POST { action: "checkNow", lookupId? }      owner: the same check the cron runs (+ one estimate looked up)
// POST { action: "disconnect" }               owner

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { markateConfigured } from "@/lib/markate";
import {
  addRecurringItem,
  checkForEstimates,
  disconnect,
  estimatePrefill,
  listRecurringItems,
  listWaiting,
  markStarted,
  markateReady,
  markateStatus,
  removeRecurringItem,
  skipEstimate,
  waitingCount,
} from "@/lib/pg/markate";

// "Check now" can wait on Markate's call limit; the check stops itself after 4 minutes.
export const maxDuration = 300;

const clean = (value: unknown) => String(value ?? "").trim();
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    if (!(await markateReady())) return NextResponse.json({ success: true, ready: false, estimates: [], count: 0 }, noStore);
    if (params.get("count") === "1") return NextResponse.json({ success: true, ready: true, count: await waitingCount() }, noStore);
    if (params.get("list") === "1") return NextResponse.json({ success: true, ready: true, estimates: await listWaiting() }, noStore);
    const estimate = clean(params.get("estimate"));
    if (estimate) {
      const prefill = await estimatePrefill(estimate);
      if (!prefill) return refuse("That Markate estimate was not found.", 404);
      return NextResponse.json({ success: true, ready: true, prefill }, noStore);
    }
    if (params.get("settings") === "1") {
      const identity = await getAdminIdentity(request);
      if (identity?.role !== "owner") return refuse("Only the owner can see this.", 403);
      const [status, items] = await Promise.all([markateStatus(), listRecurringItems()]);
      return NextResponse.json({ success: true, ready: true, configured: markateConfigured(), status, items }, noStore);
    }
    return refuse("Nothing asked for.");
  } catch (error) {
    console.error("[markate GET]", error instanceof Error ? error.message : error);
    return refuse("Markate did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await markateReady())) return refuse("Markate is not turned on here yet.", 409);
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Log in first.", 401);
    const by = clean(identity.name) || "Staff";
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = clean(body.action);

    if (action === "skip") {
      if (!(await skipEstimate(clean(body.id), by))) return refuse("That estimate is not waiting any more.", 409);
      return NextResponse.json({ success: true });
    }

    if (action === "started") {
      const accountId = clean(body.accountId);
      if (!accountId) return refuse("accountId is required.");
      if (!(await markStarted(clean(body.id), accountId, by))) return refuse("That estimate is not waiting any more.", 409);
      return NextResponse.json({ success: true });
    }

    // Settings -> Markate: the owner only.
    if (identity.role !== "owner") return refuse("Only the owner can change this.", 403);

    if (action === "addItem") {
      const name = clean(body.name);
      if (!name) return refuse("Type the item name.");
      if (!(await addRecurringItem(name, by))) return refuse("That item is already on the list.", 409);
      return NextResponse.json({ success: true, items: await listRecurringItems() });
    }

    if (action === "removeItem") {
      await removeRecurringItem(clean(body.id));
      return NextResponse.json({ success: true, items: await listRecurringItems() });
    }

    if (action === "checkNow") {
      // lookupId (optional): one Markate estimate to look up and show, for troubleshooting.
      const result = await checkForEstimates({ lookupId: clean(body.lookupId).replace(/\D/g, "") });
      if (result.error) return refuse(result.error, 502);
      return NextResponse.json({ success: true, result });
    }

    if (action === "disconnect") {
      await disconnect();
      return NextResponse.json({ success: true });
    }

    return refuse("Unknown action.");
  } catch (error) {
    console.error("[markate POST]", error instanceof Error ? error.message : error);
    return refuse("That did not save. Try again.", 500);
  }
}
