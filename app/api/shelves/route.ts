// Staff only (proxy.ts default gate). The two shelves (lib/pg/shelves.ts):
//
//   GET                         the office shelf, every site shelf, what is on
//                               its way to sites (back orders too), and what
//                               arrived different (short or extra)
//   POST received { supplyId, qty }                      📥 Received from vendor
//   POST send { key }                                    🚚 Sent to site: an order
//   POST send { accountId, accountName, lines }          🚚 Sent to site: no order
//   POST cancelBack { key, index, choice }               a back-ordered item cancelled:
//                                                        choice "shelf" or "lost"
//
// Until migrations 038 and 039 are in this database GET answers { ready: false }.

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { cancelBackOrder, differentDeliveries, officeShelf, receivedFromVendor, sendToSite, shelvesReady, siteShelves, waiting } from "@/lib/pg/shelves";

const clean = (value: unknown) => String(value ?? "").trim();
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

export async function GET() {
  try {
    if (!(await shelvesReady())) return NextResponse.json({ success: true, ready: false });
    const [office, sites, onTheWay, different] = await Promise.all([officeShelf(), siteShelves(), waiting(), differentDeliveries()]);
    return NextResponse.json({ success: true, ready: true, office, sites, waiting: onTheWay, different }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[shelves GET]", error instanceof Error ? error.message : error);
    return refuse("That did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await shelvesReady())) return refuse("This is not turned on here yet.", 409);
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Log in first.", 401);
    const by = clean(identity.name) || "Office";
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = clean(body.action);
    try {
      if (action === "received") {
        await receivedFromVendor(Number(body.supplyId), Number(body.qty), by);
        return NextResponse.json({ success: true });
      }
      if (action === "send") {
        const lines = (Array.isArray(body.lines) ? body.lines : []).map((line) => ({ supplyId: Number((line as { supplyId?: unknown }).supplyId), qty: Number((line as { qty?: unknown }).qty) }));
        const made = await sendToSite({ key: clean(body.key) || undefined, accountId: clean(body.accountId), accountName: clean(body.accountName), lines, by });
        return NextResponse.json({ success: true, ...made });
      }
      if (action === "cancelBack") {
        const choice = clean(body.choice) === "shelf" ? "shelf" : clean(body.choice) === "lost" ? "lost" : null;
        if (!choice) return refuse("Pick: put back on our shelf, or lost.");
        const result = await cancelBackOrder({ key: clean(body.key), index: Number(body.index), choice, by });
        return NextResponse.json({ success: true, ...result });
      }
    } catch (error) {
      return refuse(error instanceof Error ? error.message : "That did not save.");
    }
    return refuse("Unknown action.");
  } catch (error) {
    console.error("[shelves POST]", error instanceof Error ? error.message : error);
    return refuse("That did not save. Try again.", 500);
  }
}
