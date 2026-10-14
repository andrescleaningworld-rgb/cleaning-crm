// Staff only (proxy.ts default gate). The two shelves (lib/pg/shelves.ts):
//
//   GET                         the office shelf, every site shelf, what is on
//                               its way to sites, and what arrived short
//   POST received { supplyId, qty }                      📥 Received from vendor
//   POST send { key }                                    🚚 Sent to site: an order
//   POST send { accountId, accountName, lines }          🚚 Sent to site: no order
//
// Until migration 038 is in this database GET answers { ready: false }.

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { officeShelf, receivedFromVendor, sendToSite, shortDeliveries, siteShelves, waiting } from "@/lib/pg/shelves";
import { oneListReady } from "@/lib/pg/supply-list";

const clean = (value: unknown) => String(value ?? "").trim();
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

export async function GET() {
  try {
    if (!(await oneListReady())) return NextResponse.json({ success: true, ready: false });
    const [office, sites, onTheWay, short] = await Promise.all([officeShelf(), siteShelves(), waiting(), shortDeliveries()]);
    return NextResponse.json({ success: true, ready: true, office, sites, waiting: onTheWay, short }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[shelves GET]", error instanceof Error ? error.message : error);
    return refuse("That did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await oneListReady())) return refuse("This is not turned on here yet.", 409);
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
    } catch (error) {
      return refuse(error instanceof Error ? error.message : "That did not save.");
    }
    return refuse("Unknown action.");
  } catch (error) {
    console.error("[shelves POST]", error instanceof Error ? error.message : error);
    return refuse("That did not save. Try again.", 500);
  }
}
