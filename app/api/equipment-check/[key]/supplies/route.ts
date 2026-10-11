// Supply Check on the shop tablet. Public route under /api/equipment-check
// (proxy.ts), like the rest of the tablet app: it checks the tablet's secret
// link and the signed-in staff member (name + PIN) itself.
//
// GET  = the picture grid (active items with a photo, unit and shelf count),
//        the sites it can go to, and this week's count when it is still due.
// POST = { action: "take" | "return", accountId, accountName, lines } or
//        { action: "count", counts }.
//
// Costs are never sent to the tablet. Behind FEATURE_SUPPLY_CONTROL.

import { NextRequest, NextResponse } from "next/server";
import { fetchAllMainAccounts } from "@/lib/data/accounts";
import { requireEquipmentCheckSession, startEquipmentCheckSession } from "@/lib/equipmentCheckSession";
import { OFFICE_USE, listShelf, moveFromShelf, saveWeeklyCount, supplyControlReady, weeklyCount } from "@/lib/pg/supply-control";

const clean = (value: unknown) => String(value ?? "").trim();
const noStore = { headers: { "Cache-Control": "no-store" } };

function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = clean(row[key]);
    if (value) return value;
  }
  return "";
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    if (!(await supplyControlReady())) return NextResponse.json({ success: true, ready: false }, noStore);
    const ctx = await requireEquipmentCheckSession(request, key);
    if (!ctx) return NextResponse.json({ success: false, error: "Not signed in." }, { status: 401, ...noStore });

    const [shelf, accounts, count] = await Promise.all([listShelf(), fetchAllMainAccounts(), weeklyCount()]);
    const sites = (accounts as unknown as Record<string, unknown>[])
      .filter((account) => /^active$/i.test(pick(account, ["status", "Status"])))
      .map((account) => ({ id: pick(account, ["accountId", "id", "Account ID"]), name: pick(account, ["accountName", "Account Name", "name"]) }))
      .filter((site) => site.name)
      .sort((a, b) => a.name.localeCompare(b.name));

    const response = NextResponse.json(
      {
        success: true,
        ready: true,
        name: ctx.staff.name,
        officeUse: OFFICE_USE,
        items: shelf.map((item) => ({ id: item.id, name: item.name, unit: item.unit, photoUrl: item.photoUrl, shelfCount: item.shelfCount, shelfLocation: item.shelfLocation })),
        sites,
        // The weekly count is asked for until it is done, starting Monday.
        count: count.done ? null : { week: count.week, asks: count.asks.filter((ask) => ask.counted === null) },
      },
      noStore
    );
    await startEquipmentCheckSession(request, response, ctx.staff.id, ctx.keyVersion);
    return response;
  } catch (error) {
    console.error("[supply-check GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500, ...noStore });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    if (!(await supplyControlReady())) return NextResponse.json({ success: false, error: "Not turned on here yet." }, { status: 409, ...noStore });
    const ctx = await requireEquipmentCheckSession(request, key);
    if (!ctx) return NextResponse.json({ success: false, error: "Not signed in." }, { status: 401, ...noStore });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = clean(body.action);

    let payload: Record<string, unknown>;
    if (action === "take" || action === "return") {
      const lines = (Array.isArray(body.lines) ? body.lines : []).map((line) => ({ supplyId: Number((line as Record<string, unknown>)?.supplyId), qty: Number((line as Record<string, unknown>)?.qty) }));
      const moved = await moveFromShelf({ kind: action, lines, accountId: clean(body.accountId), accountName: clean(body.accountName) || OFFICE_USE, staffId: ctx.staff.id, staffName: ctx.staff.name, note: "Supply Check tablet" });
      // How many, never how much: the tablet does not show money.
      payload = { success: true, items: moved.items };
    } else if (action === "count") {
      const counts = (Array.isArray(body.counts) ? body.counts : []).map((entry) => ({ supplyId: Number((entry as Record<string, unknown>)?.supplyId), counted: Number((entry as Record<string, unknown>)?.counted) }));
      await saveWeeklyCount(counts, ctx.staff.name);
      payload = { success: true };
    } else {
      return NextResponse.json({ success: false, error: "Unknown action." }, { status: 400, ...noStore });
    }

    const response = NextResponse.json(payload, noStore);
    await startEquipmentCheckSession(request, response, ctx.staff.id, ctx.keyVersion);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("[supply-check POST]", message);
    return NextResponse.json({ success: false, error: message && message.length < 120 && !/sql|syntax|relation|column/i.test(message) ? message : "That did not save. Try again." }, { status: 400, ...noStore });
  }
}
