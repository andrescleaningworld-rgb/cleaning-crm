// Staff only (proxy.ts default gate). The supplies system (lib/pg/shelves.ts):
//
//   GET                          the warehouse, every site's stock, what is on
//                                its way (back orders too), and what arrived
//                                different (short or extra)
//   GET ?view=approve&source=&refs=   the Approve sheet for one order
//   GET ?accountId=              one account: its site stock, what is kept for
//                                it at the warehouse, what is on its way, history
//
//   POST approve { order, lines, add, fill }      ✓ Approve (fill "" = choose later)
//   POST fill { order, fill }                     How do we fill it?
//   POST decline { order }                        ✗ Decline
//   POST delete { order, reason, note }           🗑 Delete order (soft; not once stock moved)
//   POST pickedUp { key }                         ✓ Picked up (sub at the warehouse)
//   POST delivered { key, got }                   ✓ Delivered: the office confirms what arrived
//   POST cancelBack { key, index, choice }        a back-ordered item cancelled: "shelf" or "lost"
//   POST cameIn { lines, vendor, ownerAccountId, ownerAccountName }   + Stock came in
//   POST orderForSub { accountId, accountName, sub, lines, note }     a manager's order (call / text)
//   POST addDelivery { accountId, accountName, lines, note }          Site stock: + Add delivery
//   POST setCount { accountId, accountName, supplyId, qty, reason }   Site stock: a count corrected
//
//   `order` = { source: "crew-order" | "sub-order", refs: [...] }.
//
// Approve (with what it changed), Decline, Delete (with the reason) and the
// fill choice each write a line in the activity log (Settings -> Activity log), entity "supply-order".
//
// Until migrations 038 to 040 are in this database GET answers { ready: false }.

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { logActivity } from "@/lib/activityLog";
import {
  FILLS,
  addSiteDelivery,
  approveOrder,
  approveSheet,
  cancelBackOrder,
  chooseFill,
  declineOrder,
  deleteOrder,
  differentDeliveries,
  officeShelf,
  orderAccountName,
  orderForSub,
  officeDelivered,
  pickedUp,
  setSiteCount,
  shelvesReady,
  siteShelves,
  stockCameIn,
  waiting,
  type Fill,
  type OrderPick,
} from "@/lib/pg/shelves";
import { listMoves } from "@/lib/pg/supply-control";

const clean = (value: unknown) => String(value ?? "").trim();
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const noStore = { headers: { "Cache-Control": "no-store" } };

const linesOf = (value: unknown) =>
  (Array.isArray(value) ? value : []).map((line) => {
    const entry = (line ?? {}) as Record<string, unknown>;
    return { supplyId: Number(entry.supplyId), qty: Number(entry.qty) };
  });
const orderOf = (value: unknown): OrderPick => {
  const entry = (value ?? {}) as Record<string, unknown>;
  return { source: clean(entry.source) as OrderPick["source"], refs: (Array.isArray(entry.refs) ? entry.refs : []).map(clean) };
};
const FILL_WORDS: Record<Fill, string> = { vendor: "Vendor ships to site", pickup: "Sub picks up", deliver: "We deliver" };

type Identity = NonNullable<Awaited<ReturnType<typeof getAdminIdentity>>>;

/** One activity-log line for an order: "<account>: <what happened>". Never stops the save. */
async function logOrder(identity: Identity, order: OrderPick, detail: string, action: "update" | "delete" = "update") {
  if (!identity.accountId) return;
  const accountName = await orderAccountName(order);
  await logActivity({
    actorAccountId: identity.accountId,
    actorRole: identity.role ?? "manager",
    actorName: identity.name || "",
    action,
    entityType: "supply-order",
    entityId: (order.source === "crew-order" ? `crew-${order.refs[0]}` : order.refs.join(",")).slice(0, 200),
    detail: `${accountName ? `${accountName}: ` : ""}${detail}`.slice(0, 500),
  });
}

const fillOf = (value: unknown): Fill | "" => (FILLS.includes(clean(value) as Fill) ? (clean(value) as Fill) : "");

export async function GET(request: NextRequest) {
  try {
    if (!(await shelvesReady())) return NextResponse.json({ success: true, ready: false }, noStore);
    const params = request.nextUrl.searchParams;

    if (params.get("view") === "approve") {
      const sheet = await approveSheet({ source: clean(params.get("source")) as OrderPick["source"], refs: params.getAll("refs") });
      return NextResponse.json({ success: true, ready: true, ...sheet }, noStore);
    }

    const accountId = clean(params.get("accountId"));
    if (accountId) {
      const [sites, onTheWay, moves] = await Promise.all([siteShelves(accountId), waiting(accountId), listMoves(40, accountId)]);
      return NextResponse.json({ success: true, ready: true, site: sites[0] ?? null, waiting: onTheWay, moves }, noStore);
    }

    const [office, sites, onTheWay, different] = await Promise.all([officeShelf(), siteShelves(), waiting(), differentDeliveries()]);
    return NextResponse.json({ success: true, ready: true, office, sites, waiting: onTheWay, different }, noStore);
  } catch (error) {
    console.error("[shelves GET]", error instanceof Error ? error.message : error);
    return refuse(error instanceof Error && error.message.length < 120 && !/sql|syntax|relation|column/i.test(error.message) ? error.message : "That did not load.", 500);
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
      if (action === "approve") {
        const lines = (Array.isArray(body.lines) ? body.lines : []).map((line) => {
          const entry = (line ?? {}) as Record<string, unknown>;
          return { lineId: clean(entry.lineId), qty: Number(entry.qty), supplyId: entry.supplyId === null || entry.supplyId === undefined || entry.supplyId === "" ? null : Number(entry.supplyId) };
        });
        const order = orderOf(body.order);
        const fill = fillOf(body.fill);
        const { changes } = await approveOrder({ order, lines, add: linesOf(body.add), fill, by });
        await logOrder(identity, order, `Approved${fill ? `, fill: ${FILL_WORDS[fill]}` : " (fill later)"}${changes.length > 0 ? `. Changes: ${changes.join("; ")}` : ""}`);
        return NextResponse.json({ success: true });
      }
      if (action === "fill") {
        const fill = fillOf(body.fill);
        if (!fill) return refuse("Pick: vendor ships, sub picks up, or we deliver.");
        const order = orderOf(body.order);
        await chooseFill({ order, fill, by });
        await logOrder(identity, order, `Fill: ${FILL_WORDS[fill]}`);
        return NextResponse.json({ success: true });
      }
      if (action === "decline") {
        const order = orderOf(body.order);
        await declineOrder({ order, by });
        await logOrder(identity, order, "Declined");
        return NextResponse.json({ success: true });
      }
      if (action === "delete") {
        const order = orderOf(body.order);
        const result = await deleteOrder({ order, reason: clean(body.reason), note: clean(body.note), by });
        await logOrder(identity, order, `Deleted. Why: ${result.reason}`, "delete");
        return NextResponse.json({ success: true });
      }
      if (action === "delivered") {
        const result = await officeDelivered({ key: clean(body.key), got: (Array.isArray(body.got) ? body.got : []).map((n) => Number(n)), by });
        if (identity.accountId) {
          await logActivity({
            actorAccountId: identity.accountId,
            actorRole: identity.role ?? "manager",
            actorName: identity.name || "",
            action: "update",
            entityType: "supply-order",
            entityId: clean(body.key).slice(0, 200),
            detail: `${result.accountName}: ✓ Delivered${result.short ? ` (${result.short} short, back order)` : ""}${result.extra ? ` (${result.extra} extra)` : ""}`.slice(0, 500),
          });
        }
        return NextResponse.json({ success: true, short: result.short, extra: result.extra });
      }
      if (action === "pickedUp") {
        await pickedUp({ key: clean(body.key), by });
        return NextResponse.json({ success: true });
      }
      if (action === "cancelBack") {
        const choice = clean(body.choice) === "shelf" ? "shelf" : clean(body.choice) === "lost" ? "lost" : null;
        if (!choice) return refuse("Pick: put back on our shelf, or lost.");
        const result = await cancelBackOrder({ key: clean(body.key), index: Number(body.index), choice, by });
        return NextResponse.json({ success: true, ...result });
      }
      if (action === "cameIn") {
        const result = await stockCameIn({ lines: linesOf(body.lines), vendor: clean(body.vendor), ownerAccountId: clean(body.ownerAccountId), ownerAccountName: clean(body.ownerAccountName), by });
        return NextResponse.json({ success: true, ...result });
      }
      if (action === "orderForSub") {
        const made = await orderForSub({ accountId: clean(body.accountId), accountName: clean(body.accountName), sub: clean(body.sub), lines: linesOf(body.lines), note: clean(body.note), by });
        return NextResponse.json({ success: true, ...made });
      }
      if (action === "addDelivery") {
        const result = await addSiteDelivery({ accountId: clean(body.accountId), accountName: clean(body.accountName), lines: linesOf(body.lines), note: clean(body.note), by });
        return NextResponse.json({ success: true, ...result });
      }
      if (action === "setCount") {
        const result = await setSiteCount({ accountId: clean(body.accountId), accountName: clean(body.accountName), supplyId: Number(body.supplyId), qty: Number(body.qty), reason: clean(body.reason), by });
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
