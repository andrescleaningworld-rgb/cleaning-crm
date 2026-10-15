// Staff only (proxy.ts default gate). Crew Link supply orders, read only:
//
//   GET view=orders      the list on the Supply Orders page (and its print page)
//   GET view=print&id=   one order for app/crew-link/print/order/[id]
//
// Changing an order is the Supply Orders inbox (✓ Approve: lib/pg/shelves.ts).
// See lib/pg/crew-supplies.ts. The products and each account's picks are the one
// supply list now (app/api/admin/supply-list, migration 038); the separate
// catalog is gone. Until migration 033 is in this database every GET answers
// { ready: false } and the screens hide the feature.

import { NextRequest, NextResponse } from "next/server";
import { crewSuppliesReady, editMarksFor, listCrewLinkOrders } from "@/lib/pg/crew-supplies";
import { getSupplyOrderById } from "@/lib/teamHubDb";
import { lookupAccountSummary } from "@/lib/teamHubAccountLookup";

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

    // The printable order (app/crew-link/print/order/[id]): one order and the
    // account NAME only; nothing else about the account is sent.
    if (view === "print") {
      const id = Number(params.get("id"));
      const order = Number.isInteger(id) ? await getSupplyOrderById(id) : null;
      if (!order) return refuse("Order not found.", 404);
      const accountId = order.crewLinkAccountId ?? "";
      const account = accountId ? await lookupAccountSummary(accountId) : null;
      // The lines are already the edited ones; this says who edited it. Never stops the printout.
      const edited = (await editMarksFor([order.id]).catch(() => ({}) as Awaited<ReturnType<typeof editMarksFor>>))[order.id] ?? null;
      return NextResponse.json(
        {
          success: true,
          ready: true,
          edited,
          accountName: account?.accountName || accountId,
          order: {
            id: order.id,
            status: order.status,
            note: order.note,
            noteEnglish: order.noteEnglish,
            otherItems: order.otherItems,
            orderedBy: order.workerFirstName,
            createdAt: order.createdAt,
            lines: order.lines.map((line) => ({ itemName: line.itemName, unit: line.unit, qty: line.qty })),
          },
        },
        noStore
      );
    }

    return refuse("Unknown view.");
  } catch (error) {
    console.error("[crew-supplies GET]", error instanceof Error ? error.message : error);
    return refuse("That did not load.", 500);
  }
}
