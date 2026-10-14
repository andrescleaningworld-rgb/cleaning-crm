// Staff only (proxy.ts default gate). Crew Link supply orders: the list on
// the Supply Orders page, and editing an order a crew already sent. See
// lib/pg/crew-supplies.ts. The products and each account's picks are the one
// supply list now (app/api/admin/supply-list, migration 038); the separate
// catalog is gone. Until migration 033 is in this database every GET answers
// { ready: false } and the screens hide the feature.

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { logActivity } from "@/lib/activityLog";
import { crewSuppliesReady, editCrewOrder, editMarksFor, getCrewOrderDetail, listCrewLinkOrders } from "@/lib/pg/crew-supplies";

const clean = (value: unknown) => String(value ?? "").trim();
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET(request: NextRequest) {
  try {
    if (!(await crewSuppliesReady())) return NextResponse.json({ success: true, ready: false }, noStore);
    const params = request.nextUrl.searchParams;
    const view = params.get("view");

    // Supply Orders page -> "Crew Link orders".
    if (view === "orders") {
      return NextResponse.json({ success: true, ready: true, orders: await listCrewLinkOrders() }, noStore);
    }

    // "Edit order": one order, what the crew first sent, and what can be added.
    if (view === "order") {
      const id = Number(params.get("id"));
      const order = Number.isInteger(id) ? await getCrewOrderDetail(id) : null;
      if (!order) return refuse("That order was not found.", 404);
      return NextResponse.json({ success: true, ready: true, order }, noStore);
    }

    // "Edited by ..." under orders listed elsewhere (the Accounts Center queue, the account's own list).
    if (view === "marks") {
      const ids = clean(params.get("ids"))
        .split(",")
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id))
        .slice(0, 300);
      return NextResponse.json({ success: true, ready: true, marks: await editMarksFor(ids) }, noStore);
    }

    return refuse("Unknown view.");
  } catch (error) {
    console.error("[crew-supplies GET]", error instanceof Error ? error.message : error);
    return refuse("That did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await crewSuppliesReady())) return refuse("This is not turned on here yet.", 409);
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Log in first.", 401);
    const by = clean(identity.name) || "Staff";

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = clean(body.action);

    if (action === "editOrder") {
      const id = Number(body.id);
      if (!Number.isInteger(id)) return refuse("That order was not found.", 404);
      const lines = (Array.isArray(body.lines) ? body.lines : []).map((line) => ({ itemId: Number((line as { itemId?: unknown })?.itemId), qty: Number((line as { qty?: unknown })?.qty) }));
      let changes: string[];
      try {
        changes = await editCrewOrder(id, { lines, otherItems: clean(body.otherItems) }, by);
      } catch (error) {
        return refuse(error instanceof Error ? error.message : "The order was not changed.");
      }
      if (changes.length > 0 && identity.accountId) {
        await logActivity({
          actorAccountId: identity.accountId,
          actorRole: identity.role ?? "manager",
          actorName: identity.name || "",
          action: "update",
          entityType: "team-hub-supply-order",
          entityId: String(id),
          detail: `edited: ${changes.join("; ")}`.slice(0, 500),
        }).catch((error) => console.error("[crew-supplies] activity log:", error instanceof Error ? error.message : error));
      }
      return NextResponse.json({ success: true, changes });
    }

    return refuse("Unknown action.");
  } catch (error) {
    console.error("[crew-supplies POST]", error instanceof Error ? error.message : error);
    return refuse("That did not save. Try again.", 500);
  }
}
