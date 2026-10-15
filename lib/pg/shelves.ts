// The supplies system (migrations 038, 039, 040): one order inbox, two kinds
// of stock, and every change written down.
//
//   warehouse   sub_supplies.shelf_count: Cleaning World's own stock at the
//               Hackensack warehouse. site_shelf.warehouse_qty: stock bought
//               for one customer, kept at the warehouse for them.
//   site        site_shelf.qty: what is at each customer, per product.
//
// An order (Crew Link: supply_orders; sub portal or a manager: sub_supply_orders)
// goes:
//
//   1. New        the office taps ✓ Approve (quantities can be changed first,
//                 a typed-in line matched to a product) or ✗ Decline.
//   2. Approved   "How do we fill it?" makes the order's delivery
//                 (supply_deliveries.fill):
//                   vendor    the vendor ships to the site
//                   pickup    the sub picks it up at the warehouse: the office
//                             taps Picked up -> warehouse down, site up
//                   deliver   we take it on the tablet (warehouse down) and
//                             drive it
//   3. On its way vendor and deliver: the crew confirms on Supplies arrived,
//                 per item. Only what came goes on the site; less came: the
//                 rest is a back order (migration 039); more came: the extra
//                 goes on the site too. Any difference is flagged to the
//                 office (Supply Orders, an email, and a paper in the Pin
//                 Board's Supply orders square; nobody is texted).
//   4. Delivered
//
// Also: "+ Stock came in" (warehouse), "Case empty" (crew, one case off the
// site), "+ Add delivery" and a corrected count on an account's Site stock.
// Every change is a supply_moves row: who, what, when, how many, and where it
// was made (source: office, tablet, crew-link, sub-portal). A back order is
// its own delivery row (back_of = the delivery it is the rest of; source_ref
// = the order's ref + "#back<that id>").

import { getSql } from "@/lib/db";
import { sendInternalNotification } from "@/lib/email";
import { boardReady, pinPaper } from "@/lib/pg/board";
import { editCrewOrder, getCrewOrderDetail } from "@/lib/pg/crew-supplies";
import { createSupplyOrder } from "@/lib/pg/supplies";
import { ensureCrewItem, listProducts, oneListReady, type Product } from "@/lib/pg/supply-list";
import { notDeleted, orderDeleteReady } from "@/lib/pg/supply-deleted";
import { lookupAccountSummaries } from "@/lib/teamHubAccountLookup";

const clean = (value: unknown) => String(value ?? "").trim();
const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : value ? String(value) : "");
const qtyOf = (raw: string) => Number(String(raw).replace(/[^0-9]/g, "")) || 0;
const count = (value: unknown, max = 999): number | null => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
};

/** Where a change was made, for the history. */
export type MoveSource = "office" | "tablet" | "crew-link" | "sub-portal";

/* ---------- turned on ---------- */

let ready = false;

/**
 * True once this database has the shelves (038), back orders (039) and the
 * one system (040). Until then the supplies screens stay hidden, so they
 * never run half of the rules.
 */
export async function shelvesReady(): Promise<boolean> {
  if (ready) return true;
  if (!(await oneListReady())) return false;
  try {
    const rows = (await getSql()`
      SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'supply_deliveries' AND column_name = 'fill')
         AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'supply_deliveries' AND column_name = 'back_of') AS ok
    `) as { ok: boolean }[];
    ready = rows[0]?.ok === true;
  } catch {
    ready = false;
  }
  return ready;
}

/** A back order's source_ref: the order's ref, then "#back<id>". This gives the order's own ref. */
const BACK = "#back";
const orderRef = (sourceRef: string) => clean(sourceRef).split(BACK)[0];

/* ---------- colors ---------- */

export type Level = "green" | "yellow" | "red" | "none";

/** Site stock: red 0, yellow 1, green 2 or more. */
export const siteLevel = (qty: number): Level => (qty <= 0 ? "red" : qty === 1 ? "yellow" : "green");

/** Warehouse: red at or below its minimum, yellow up to twice that, green above. No minimum: the site rule. Never counted: none. */
export function officeLevel(qty: number | null, min: number | null): Level {
  if (qty === null) return "none";
  if (min !== null && min > 0) return qty <= min ? "red" : qty <= min * 2 ? "yellow" : "green";
  return siteLevel(qty);
}

/* ---------- the stock ---------- */

export type ShelfTile = { supplyId: number; name: string; code: string; unit: string; photoUrl: string; qty: number | null; level: Level };

const tile = (product: Product, qty: number | null, level: Level): ShelfTile => ({
  supplyId: product.id,
  name: product.crewName,
  code: product.code,
  unit: product.unit,
  photoUrl: product.photoUrl,
  qty,
  level,
});

/** Cleaning World's own warehouse stock: every product in use, with its count and color. */
export async function officeShelf(): Promise<ShelfTile[]> {
  const products = await listProducts(false);
  return products.map((product) => tile(product, product.shelfCount, officeLevel(product.shelfCount, product.minLevel)));
}

/** One account's stock: at the site (`tiles`), and bought for them and kept at the warehouse (`held`). */
export type SiteShelf = { accountId: string; accountName: string; tiles: ShelfTile[]; held: ShelfTile[] };

type SiteRow = { account_id: string; account_name: string; supply_id: string | number; qty: number; warehouse_qty: number };

async function siteRows(accountId?: string): Promise<SiteRow[]> {
  const sql = getSql();
  return (accountId
    ? await sql`SELECT account_id, account_name, supply_id, qty, warehouse_qty FROM site_shelf WHERE account_id = ${accountId}`
    : await sql`SELECT account_id, account_name, supply_id, qty, warehouse_qty FROM site_shelf`) as SiteRow[];
}

/** Each account's stock (only accounts that have some), or just one account's. */
export async function siteShelves(accountId?: string): Promise<SiteShelf[]> {
  const [rows, products] = await Promise.all([siteRows(accountId), listProducts(true)]);
  const byId = new Map(products.map((product) => [product.id, product]));
  const shelves = new Map<string, SiteShelf>();
  for (const row of rows) {
    const product = byId.get(Number(row.supply_id));
    if (!product) continue;
    const shelf = shelves.get(row.account_id) ?? { accountId: row.account_id, accountName: clean(row.account_name) || row.account_id, tiles: [], held: [] };
    // A row that only holds warehouse stock for them is not a site product (yet).
    if (row.qty > 0 || row.warehouse_qty === 0) shelf.tiles.push(tile(product, row.qty, siteLevel(row.qty)));
    if (row.warehouse_qty > 0) shelf.held.push(tile(product, row.warehouse_qty, "none"));
    shelves.set(row.account_id, shelf);
  }
  for (const shelf of shelves.values()) {
    shelf.tiles.sort((a, b) => a.name.localeCompare(b.name));
    shelf.held.sort((a, b) => a.name.localeCompare(b.name));
  }
  return [...shelves.values()].sort((a, b) => a.accountName.localeCompare(b.accountName));
}

/* ---------- + Stock came in (warehouse) ---------- */

/**
 * Items came in from a vendor. Cleaning World's own (no owner): the warehouse
 * count goes up. Bought for a customer: it is kept at the warehouse for that
 * customer (site_shelf.warehouse_qty) until it goes to their site.
 */
export async function stockCameIn(input: { lines: { supplyId: number; qty: number }[]; vendor: string; ownerAccountId?: string; ownerAccountName?: string; by: string }): Promise<{ items: number }> {
  const lines = input.lines.map((line) => ({ supplyId: Number(line.supplyId), qty: count(line.qty, 9999) ?? 0 })).filter((line) => Number.isInteger(line.supplyId) && line.qty > 0);
  if (lines.length === 0) throw new Error("Pick what came in, and how many.");
  const sql = getSql();
  const rows = (await sql`SELECT id, supply_item, unit_cost::text FROM sub_supplies WHERE id = ANY(${lines.map((line) => line.supplyId)}::bigint[])`) as { id: string | number; supply_item: string; unit_cost: string | null }[];
  const byId = new Map(rows.map((row) => [Number(row.id), row]));
  if (lines.some((line) => !byId.has(line.supplyId))) throw new Error("One of those is not on the Supplies list.");
  const owner = clean(input.ownerAccountId);
  const ownerName = clean(input.ownerAccountName);
  if (owner && !ownerName) throw new Error("Pick the customer it belongs to.");
  const vendor = clean(input.vendor).slice(0, 120);
  const note = `Stock came in${vendor ? ` from ${vendor}` : ""}${owner ? `, for ${ownerName}` : ""}`;
  const statements = lines.flatMap((line) => {
    const row = byId.get(line.supplyId)!;
    return [
      owner
        ? sql`
            INSERT INTO site_shelf (account_id, supply_id, account_name, qty, warehouse_qty, updated_by) VALUES (${owner}, ${line.supplyId}, ${ownerName}, 0, ${line.qty}, ${input.by})
            ON CONFLICT (account_id, supply_id) DO UPDATE SET warehouse_qty = site_shelf.warehouse_qty + EXCLUDED.warehouse_qty, account_name = EXCLUDED.account_name, updated_by = EXCLUDED.updated_by, updated_at = now()
          `
        : sql`UPDATE sub_supplies SET shelf_count = COALESCE(shelf_count, 0) + ${line.qty}, updated_by = ${input.by}, updated_at = now() WHERE id = ${line.supplyId}`,
      sql`
        INSERT INTO supply_moves (supply_id, item_name, qty, kind, account_id, account_name, unit_cost, staff_name, note, source)
        VALUES (${line.supplyId}, ${clean(row.supply_item)}, ${line.qty}, 'receive', ${owner}, ${owner ? ownerName : ""}, ${row.unit_cost}, ${input.by}, ${note}, 'office')
      `,
    ];
  });
  await sql.transaction(statements);
  return { items: lines.reduce((sum, line) => sum + line.qty, 0) };
}

/* ---------- what is on its way to a site ---------- */

export type Fill = "vendor" | "pickup" | "deliver";
export const FILLS: Fill[] = ["vendor", "pickup", "deliver"];

export type WaitLine = { supplyId: number | null; name: string; unit: string; qty: number };
export type Waiting = {
  /** "d:<delivery>", "crew:<order>" or "sub:<group>" (the last two: orders from before migration 040). */
  key: string;
  source: "crew-order" | "sub-order" | "office";
  /** The order's ref (a back order's too). */
  ref: string;
  /** The rest of a delivery that came short. */
  backOrder: boolean;
  /** How it is filled; "" = a delivery from before migration 040, or sent by the office with no order. */
  fill: Fill | "";
  accountId: string;
  accountName: string;
  /** When it was ordered, or sent. */
  at: string;
  /** "" = not taken from the warehouse (yet). */
  sentAt: string;
  lines: WaitLine[];
};

type DeliveryRow = { id: string | number; account_id: string; account_name: string; source: Waiting["source"]; source_ref: string; back_of: string | number | null; fill: Fill | ""; lines: WaitLine[]; sent_at: string | Date | null; created_at: string | Date };

const OPEN_SUB_STATUS = `lower(btrim(status)) NOT IN ('completed', 'delivered', 'cancelled', 'canceled', 'denied')`;
/** Sub-portal lines already on their way before migration 040 (no delivery row). */
const LEGACY_SUB_ON_WAY = `lower(btrim(status)) IN ('pending / in progress', 'pending', 'in progress', 'picked', 'bought', 'sent')`;
const SUB_GROUP = `COALESCE(NULLIF(btrim(order_group_id), ''), btrim(order_id))`;

/**
 * Everything on its way to sites, or to one site: every delivery not
 * confirmed or cancelled yet (approved orders, back orders, sends with no
 * order), and orders that were already on their way before migration 040
 * (Crew Link "Ordered", sub-portal "Pending / In Progress") with no delivery.
 * New orders are not on their way: the office approves them first.
 */
export async function waiting(accountId?: string): Promise<Waiting[]> {
  const sql = getSql();
  const one = clean(accountId);
  // A deleted order (migration 041) is never on its way.
  const [crewKept, subKept] = await Promise.all([notDeleted("o"), notDeleted("o")]);
  const [deliveries, crewOrders, subLines, products] = await Promise.all([
    sql`SELECT id, account_id, account_name, source, source_ref, back_of, fill, lines, sent_at, created_at FROM supply_deliveries
        WHERE arrived_at IS NULL AND cancelled_at IS NULL AND (${one} = '' OR account_id = ${one}) ORDER BY created_at` as unknown as Promise<DeliveryRow[]>,
    sql.query(
      `SELECT o.id, o.crew_link_account_id, o.created_at FROM supply_orders o
       WHERE o.crew_link_account_id IS NOT NULL AND o.status = 'ordered' AND ($1::text = '' OR o.crew_link_account_id = $1::text) AND ${crewKept}
         AND NOT EXISTS (SELECT 1 FROM supply_deliveries d WHERE d.source = 'crew-order' AND d.source_ref = o.id::text)
       ORDER BY o.created_at`,
      [one]
    ) as unknown as Promise<{ id: number; crew_link_account_id: string; created_at: string | Date }[]>,
    sql.query(
      `SELECT ${SUB_GROUP} AS grp, COALESCE(account_ref, btrim(account_id_raw)) AS account_id, btrim(account_name) AS account_name,
              supply_id, btrim(supply_item) AS supply_item, btrim(unit) AS unit, quantity_raw, created_at
       FROM sub_supply_orders o
       WHERE ${LEGACY_SUB_ON_WAY} AND ${subKept} AND COALESCE(account_ref, btrim(account_id_raw)) <> '' AND btrim(account_name) <> 'Shelf restock'
         AND ($1::text = '' OR COALESCE(account_ref, btrim(account_id_raw)) = $1::text)
         AND NOT EXISTS (SELECT 1 FROM supply_deliveries d WHERE d.source = 'sub-order' AND d.source_ref = ${SUB_GROUP})
       ORDER BY created_at, sheet_row`,
      [one]
    ) as unknown as Promise<{ grp: string; account_id: string; account_name: string; supply_id: string | number | null; supply_item: string; unit: string; quantity_raw: string; created_at: string | Date }[]>,
    listProducts(true),
  ]);
  const nameOf = new Map(products.map((product) => [product.id, product]));
  const named = (supplyId: number | null, fallback: string) => (supplyId !== null ? nameOf.get(supplyId)?.crewName || fallback : fallback);

  const list: Waiting[] = deliveries.map((row) => ({
    key: `d:${row.id}`,
    source: row.source,
    ref: orderRef(row.source_ref),
    backOrder: row.back_of !== null,
    fill: row.fill ?? "",
    accountId: row.account_id,
    accountName: clean(row.account_name),
    at: iso(row.sent_at ?? row.created_at),
    sentAt: iso(row.sent_at),
    lines: (Array.isArray(row.lines) ? row.lines : []).map((line) => ({ ...line, name: named(line.supplyId, line.name) })),
  }));

  if (crewOrders.length > 0) {
    const ids = crewOrders.map((order) => order.id);
    const [lines, names] = await Promise.all([
      sql`SELECT l.order_id, i.sub_supply_id, i.name, i.unit, l.qty FROM supply_order_lines l JOIN supply_items i ON i.id = l.item_id
          WHERE l.order_id = ANY(${ids}::int[]) ORDER BY lower(i.name)` as unknown as Promise<{ order_id: number; sub_supply_id: string | number | null; name: string; unit: string; qty: number }[]>,
      lookupAccountSummaries([...new Set(crewOrders.map((order) => order.crew_link_account_id))]),
    ]);
    for (const order of crewOrders) {
      list.push({
        key: `crew:${order.id}`,
        source: "crew-order",
        ref: String(order.id),
        backOrder: false,
        fill: "",
        accountId: order.crew_link_account_id,
        accountName: names.get(order.crew_link_account_id)?.accountName || order.crew_link_account_id,
        at: iso(order.created_at),
        sentAt: "",
        lines: lines
          .filter((line) => line.order_id === order.id)
          .map((line) => {
            const supplyId = line.sub_supply_id === null ? null : Number(line.sub_supply_id);
            return { supplyId, name: named(supplyId, clean(line.name)), unit: clean(line.unit), qty: line.qty };
          }),
      });
    }
  }

  const groups = new Map<string, Waiting>();
  for (const row of subLines) {
    const key = `sub:${row.grp}`;
    const entry = groups.get(key) ?? { key, source: "sub-order" as const, ref: row.grp, backOrder: false, fill: "" as const, accountId: row.account_id, accountName: row.account_name, at: iso(row.created_at), sentAt: "", lines: [] };
    const supplyId = row.supply_id === null ? null : Number(row.supply_id);
    entry.lines.push({ supplyId, name: named(supplyId, row.supply_item), unit: row.unit, qty: qtyOf(row.quantity_raw) || 1 });
    groups.set(key, entry);
  }
  list.push(...groups.values());
  return list.filter((entry) => entry.lines.length > 0).sort((a, b) => a.at.localeCompare(b.at));
}

/** What a crew can confirm on Supplies arrived: not a pick-up (the office confirms that), not a "we deliver" still at the warehouse. */
export const crewCanConfirm = (entry: Waiting) => entry.fill !== "pickup" && !(entry.fill === "deliver" && !entry.sentAt);

/* ---------- taken from the warehouse for a site ---------- */

/**
 * Takes the items out of the warehouse for a site: first what is kept there
 * for that customer, then Cleaning World's own. `key` sends a waiting
 * delivery or order (all its lines: "We deliver", "Picked up"); otherwise
 * `lines` go to the account with no order (the tablet, "For an account") and
 * wait for the crew to confirm.
 */
export async function sendToSite(input: { key?: string; accountId?: string; accountName?: string; lines?: { supplyId: number; qty: number }[]; by: string; source?: MoveSource }): Promise<{ deliveryId: number }> {
  const sql = getSql();
  const source: MoveSource = input.source ?? "office";
  let entry: Waiting;
  if (input.key) {
    const found = (await waiting()).find((item) => item.key === input.key);
    if (!found) throw new Error("That order is not waiting any more. Refresh the page.");
    if (found.sentAt) throw new Error("That was already sent.");
    entry = found;
  } else {
    const accountId = clean(input.accountId);
    if (!accountId) throw new Error("Pick the site.");
    const products = new Map((await listProducts(false)).map((product) => [product.id, product]));
    const lines: WaitLine[] = [];
    for (const line of input.lines ?? []) {
      const product = products.get(Number(line.supplyId));
      const qty = count(line.qty);
      if (product && qty) lines.push({ supplyId: product.id, name: product.crewName, unit: product.unit, qty });
    }
    if (lines.length === 0) throw new Error("Pick what you are sending.");
    entry = { key: "", source: "office", ref: "", backOrder: false, fill: "deliver", accountId, accountName: clean(input.accountName), at: "", sentAt: "", lines };
  }

  const shelfLines = entry.lines.filter((line): line is WaitLine & { supplyId: number } => line.supplyId !== null && line.qty > 0);
  const ids = shelfLines.map((line) => line.supplyId);
  const [costs, held] = ids.length
    ? await Promise.all([
        sql`SELECT id, supply_item, unit_cost::text FROM sub_supplies WHERE id = ANY(${ids}::bigint[])` as unknown as Promise<{ id: string | number; supply_item: string; unit_cost: string | null }[]>,
        sql`SELECT supply_id, warehouse_qty FROM site_shelf WHERE account_id = ${entry.accountId} AND supply_id = ANY(${ids}::bigint[]) AND warehouse_qty > 0` as unknown as Promise<{ supply_id: string | number; warehouse_qty: number }[]>,
      ])
    : [[], []];
  const costOf = new Map(costs.map((row) => [Number(row.id), row]));
  const heldOf = new Map(held.map((row) => [Number(row.supply_id), row.warehouse_qty]));
  const ref = entry.key.startsWith("d:") ? "" : entry.ref;

  const statements = [];
  if (entry.key.startsWith("d:")) {
    statements.push(sql`UPDATE supply_deliveries SET sent_by = ${input.by}, sent_at = now() WHERE id = ${Number(entry.key.slice(2))} AND sent_at IS NULL`);
  } else if (entry.source === "office") {
    statements.push(sql`
      INSERT INTO supply_deliveries (account_id, account_name, source, source_ref, lines, sent_by, sent_at, fill)
      VALUES (${entry.accountId}, ${entry.accountName}, 'office', '', ${JSON.stringify(entry.lines)}::jsonb, ${input.by}, now(), 'deliver')
    `);
  } else {
    statements.push(sql`
      INSERT INTO supply_deliveries (account_id, account_name, source, source_ref, lines, sent_by, sent_at, fill)
      VALUES (${entry.accountId}, ${entry.accountName}, ${entry.source}, ${ref}, ${JSON.stringify(entry.lines)}::jsonb, ${input.by}, now(), 'deliver')
      ON CONFLICT (source, source_ref) WHERE source <> 'office' DO UPDATE SET sent_by = EXCLUDED.sent_by, sent_at = EXCLUDED.sent_at, lines = EXCLUDED.lines
    `);
  }
  for (const line of shelfLines) {
    const row = costOf.get(line.supplyId);
    const theirs = Math.min(heldOf.get(line.supplyId) ?? 0, line.qty);
    const ours = line.qty - theirs;
    const name = clean(row?.supply_item) || line.name;
    if (theirs > 0) {
      statements.push(
        sql`UPDATE site_shelf SET warehouse_qty = GREATEST(warehouse_qty - ${theirs}, 0), updated_by = ${input.by}, updated_at = now() WHERE account_id = ${entry.accountId} AND supply_id = ${line.supplyId}`,
        sql`
          INSERT INTO supply_moves (supply_id, item_name, qty, kind, account_id, account_name, unit_cost, staff_name, order_id, note, source)
          VALUES (${line.supplyId}, ${name}, ${-theirs}, 'send', ${entry.accountId}, ${entry.accountName}, ${row?.unit_cost ?? null}, ${input.by}, ${ref}, 'Sent to site from their own stock at the warehouse', ${source})
        `
      );
    }
    if (ours > 0) {
      statements.push(
        // The warehouse never shows less than 0: a count that was off is fixed by the next count.
        sql`UPDATE sub_supplies SET shelf_count = GREATEST(COALESCE(shelf_count, 0) - ${ours}, 0), updated_at = now() WHERE id = ${line.supplyId}`,
        sql`
          INSERT INTO supply_moves (supply_id, item_name, qty, kind, account_id, account_name, unit_cost, staff_name, order_id, note, source)
          VALUES (${line.supplyId}, ${name}, ${-ours}, 'send', ${entry.accountId}, ${entry.accountName}, ${row?.unit_cost ?? null}, ${input.by}, ${ref}, 'Sent to site', ${source})
        `
      );
    }
  }
  // The order shows it is on its way.
  if (entry.source === "crew-order") statements.push(sql`UPDATE supply_orders SET status = 'ordered', updated_at = now() WHERE id = ${Number(ref)} AND status = 'new'`);
  if (entry.source === "sub-order") {
    statements.push(
      sql.query(`UPDATE sub_supply_orders SET status = 'Pending / In Progress', updated_at = now() WHERE ${SUB_GROUP} = $1::text AND lower(btrim(status)) IN ('new', 'approved', 'needs review')`, [ref])
    );
  }
  await sql.transaction(statements);
  const made = (await sql`SELECT id FROM supply_deliveries WHERE account_id = ${entry.accountId} AND sent_at IS NOT NULL ORDER BY sent_at DESC, id DESC LIMIT 1`) as { id: string | number }[];
  return { deliveryId: Number(made[0]?.id ?? 0) };
}

/* ---------- the inbox: Approve, How do we fill it?, Decline, Picked up ---------- */

/** An order on the Supply Orders page: a Crew Link order (its id), or a sub-portal order (its group refs). */
export type OrderPick = { source: "crew-order" | "sub-order"; refs: string[] };

/** One line on the Approve sheet. `lineId`: "sub:<row>" or "crew:<item>". `supplyId` null = typed in, no product yet. */
export type ApproveLine = { lineId: string; label: string; qty: number; unit: string; supplyId: number | null };

const cleanPick = (order: OrderPick): OrderPick => {
  const refs = [...new Set((Array.isArray(order?.refs) ? order.refs : []).map(clean).filter(Boolean))].slice(0, 50);
  if (order?.source !== "crew-order" && order?.source !== "sub-order") throw new Error("That order was not found.");
  if (refs.length === 0 || (order.source === "crew-order" && refs.some((ref) => !/^\d+$/.test(ref)))) throw new Error("That order was not found.");
  return { source: order.source, refs };
};

type SubLineRow = { sheet_row: number; grp: string; account_id: string; account_name: string; supply_item: string; quantity_raw: string; unit: string; supply_id: string | number | null; status: string; subcontractor: string; subcontractor_email: string; delivery_mode: string; notes: string };

async function subLinesOf(refs: string[]): Promise<SubLineRow[]> {
  return (await getSql().query(
    `SELECT sheet_row, ${SUB_GROUP} AS grp, COALESCE(account_ref, btrim(account_id_raw)) AS account_id, btrim(account_name) AS account_name, btrim(supply_item) AS supply_item,
            quantity_raw, btrim(unit) AS unit, supply_id, btrim(status) AS status, btrim(subcontractor) AS subcontractor, btrim(subcontractor_email) AS subcontractor_email,
            btrim(delivery_mode) AS delivery_mode, btrim(notes) AS notes
     FROM sub_supply_orders WHERE ${SUB_GROUP} = ANY($1::text[]) AND ${OPEN_SUB_STATUS} ORDER BY sheet_row`,
    [refs]
  )) as SubLineRow[];
}

/** "Other / Not Listed - paper towels" -> "paper towels". */
const writeInLabel = (item: string) => clean(item.replace(/^other\s*\/\s*not listed\s*[-–:]\s*/i, ""));

/** The Approve sheet: the order's lines (typed-in ones too) and, for a Crew Link order, what the crew typed under "Other". */
export async function approveSheet(pick: OrderPick): Promise<{ lines: ApproveLine[]; otherItems: string }> {
  const order = cleanPick(pick);
  if (order.source === "sub-order") {
    const rows = await subLinesOf(order.refs);
    return {
      lines: rows.map((row) => ({ lineId: `sub:${row.sheet_row}`, label: writeInLabel(row.supply_item) || row.supply_item, qty: qtyOf(row.quantity_raw) || 1, unit: row.unit, supplyId: row.supply_id === null ? null : Number(row.supply_id) })),
      otherItems: "",
    };
  }
  const detail = await getCrewOrderDetail(Number(order.refs[0]));
  if (!detail) throw new Error("That order was not found.");
  const items = (await getSql()`SELECT id, sub_supply_id FROM supply_items WHERE id = ANY(${detail.lines.map((line) => line.itemId)}::int[])`) as { id: number; sub_supply_id: string | number | null }[];
  const productOf = new Map(items.map((item) => [Number(item.id), item.sub_supply_id === null ? null : Number(item.sub_supply_id)]));
  return {
    lines: detail.lines.map((line) => ({ lineId: `crew:${line.itemId}`, label: line.itemName, qty: line.qty, unit: line.unit, supplyId: productOf.get(line.itemId) ?? null })),
    otherItems: detail.otherItems,
  };
}

/** A sub-portal line's quantity, keeping its words ("10 boxes" -> "8 boxes"). */
const newQuantity = (raw: string, qty: number) => (/\d+/.test(raw) ? raw.trim().replace(/\d+/, String(qty)) : String(qty));

/**
 * ✓ Approve: saves the quantities (0 takes a line off), the products picked
 * for typed-in lines, and the products added; then, with `fill`, makes the
 * order's delivery. A Crew Link order is approved and filled in one go (its
 * own status has no "Approved"); a sub-portal order can stay Approved and be
 * filled later. Gives back what it changed, in words, for the activity log.
 */
export async function approveOrder(input: { order: OrderPick; lines: { lineId: string; qty: number; supplyId: number | null }[]; add: { supplyId: number; qty: number }[]; fill: Fill | ""; by: string }): Promise<{ changes: string[] }> {
  const order = cleanPick(input.order);
  const sql = getSql();
  const products = new Map((await listProducts(false)).map((product) => [product.id, product]));
  const productId = (value: unknown) => {
    const id = value === null || value === undefined || value === "" ? null : Number(value);
    if (id !== null && !products.has(id)) throw new Error("One of those products is not on the Supplies list.");
    return id;
  };
  const wanted = new Map((Array.isArray(input.lines) ? input.lines : []).map((line) => [clean(line.lineId), { qty: count(line.qty) ?? -1, supplyId: productId(line.supplyId) }]));
  if ([...wanted.values()].some((line) => line.qty < 0)) throw new Error("Use a number from 0 to 999.");
  const added = (Array.isArray(input.add) ? input.add : []).map((line) => ({ supplyId: productId(line.supplyId), qty: count(line.qty) ?? 0 })).filter((line): line is { supplyId: number; qty: number } => line.supplyId !== null && line.qty > 0);

  if (order.source === "crew-order") {
    if (!input.fill) throw new Error("Pick how we fill it.");
    const id = Number(order.refs[0]);
    const detail = await getCrewOrderDetail(id);
    if (!detail || detail.status !== "new") throw new Error("That order was already approved or closed. Refresh the page.");
    const lines = new Map<number, number>();
    for (const line of detail.lines) lines.set(line.itemId, wanted.get(`crew:${line.itemId}`)?.qty ?? line.qty);
    for (const line of added) {
      const itemId = await ensureCrewItem(line.supplyId, input.by);
      lines.set(itemId, (lines.get(itemId) ?? 0) + line.qty);
    }
    const next = [...lines].filter(([, qty]) => qty > 0).map(([itemId, qty]) => ({ itemId, qty }));
    const changed = next.length !== detail.lines.length || detail.lines.some((line) => lines.get(line.itemId) !== line.qty);
    if (next.length === 0 && !detail.otherItems) throw new Error("Nothing is left on this order. Use ✗ Decline instead.");
    const changes = changed ? await editCrewOrder(id, { lines: next, otherItems: detail.otherItems }, input.by) : [];
    await chooseFill({ order, fill: input.fill, by: input.by });
    return { changes };
  }

  const rows = await subLinesOf(order.refs);
  if (rows.length === 0) throw new Error("That order was already closed. Refresh the page.");
  if (rows.some((row) => !["new", "needs review", "approved", ""].includes(row.status.toLowerCase()))) throw new Error("That order was already approved. Refresh the page.");
  const statements = [];
  const changes: string[] = [];
  for (const row of rows) {
    const line = wanted.get(`sub:${row.sheet_row}`);
    const was = qtyOf(row.quantity_raw) || 1;
    const qty = line ? line.qty : was;
    const supplyId = line ? line.supplyId : row.supply_id === null ? null : Number(row.supply_id);
    const label = writeInLabel(row.supply_item) || row.supply_item;
    if (qty === 0) {
      changes.push(`Removed: ${label}`);
      statements.push(sql`UPDATE sub_supply_orders SET status = 'Cancelled', updated_at = now() WHERE sheet_row = ${row.sheet_row}`);
      continue;
    }
    if (qty !== was) changes.push(`${label}: ${was} -> ${qty}`);
    if (supplyId !== null && supplyId !== (row.supply_id === null ? null : Number(row.supply_id))) changes.push(`${label}: product ${products.get(supplyId)?.crewName ?? supplyId}`);
    const quantity = qty === was ? row.quantity_raw : newQuantity(row.quantity_raw, qty);
    statements.push(sql`UPDATE sub_supply_orders SET status = 'Approved', quantity_raw = ${quantity}, supply_id = ${supplyId}, step_by = ${input.by}, step_at = now(), updated_at = now() WHERE sheet_row = ${row.sheet_row}`);
  }
  if (rows.every((row) => (wanted.get(`sub:${row.sheet_row}`)?.qty ?? 1) === 0) && added.length === 0) throw new Error("Nothing is left on this order. Use ✗ Decline instead.");
  await sql.transaction(statements);
  // Products added on the Approve sheet join the same order (its group).
  const first = rows[0];
  for (const line of added) {
    const product = products.get(line.supplyId)!;
    changes.push(`Added: ${line.qty} × ${product.crewName}`);
    const made = await createSupplyOrder({
      supplyItem: product.code || product.crewName,
      category: product.category,
      quantity: String(line.qty),
      unit: product.unit,
      accountName: first.account_name,
      accountId: first.account_id,
      subcontractor: first.subcontractor,
      subcontractorEmail: first.subcontractor_email,
      orderGroupId: first.grp,
      deliveryMode: first.delivery_mode,
      notes: `Added by ${input.by} when approving`,
      status: "Approved",
    });
    await sql`UPDATE sub_supply_orders SET supply_id = ${line.supplyId} WHERE sheet_row = ${made.rowNumber}`;
  }
  if (input.fill) await chooseFill({ order, fill: input.fill, by: input.by });
  return { changes };
}

/** The account an order is for, by name (the activity log). "" when it cannot be found. */
export async function orderAccountName(pick: OrderPick): Promise<string> {
  try {
    const order = cleanPick(pick);
    if (order.source === "sub-order") {
      const rows = (await getSql().query(`SELECT btrim(account_name) AS name FROM sub_supply_orders WHERE ${SUB_GROUP} = ANY($1::text[]) LIMIT 1`, [order.refs])) as { name: string }[];
      return rows[0]?.name ?? "";
    }
    const rows = (await getSql()`SELECT crew_link_account_id FROM supply_orders WHERE id = ${Number(order.refs[0])}`) as { crew_link_account_id: string | null }[];
    const accountId = rows[0]?.crew_link_account_id ?? "";
    return accountId ? (await lookupAccountSummaries([accountId])).get(accountId)?.accountName || accountId : "";
  } catch {
    return "";
  }
}

/**
 * "How do we fill it?": the order's delivery is made with how it is filled,
 * and the order is on its way (Crew Link "Ordered", sub portal "Pending / In
 * Progress"). Vendor ships: the crew sees it on Supplies arrived at once. We
 * deliver: it waits for the tablet. Sub picks up: it waits for Picked up.
 */
export async function chooseFill(input: { order: OrderPick; fill: Fill; by: string }): Promise<void> {
  const order = cleanPick(input.order);
  if (!FILLS.includes(input.fill)) throw new Error("Pick: vendor ships, sub picks up, or we deliver.");
  const sql = getSql();
  const products = new Map((await listProducts(true)).map((product) => [product.id, product]));
  const named = (supplyId: number | null, fallback: string) => (supplyId !== null ? products.get(supplyId)?.crewName || fallback : fallback);
  const deliveries: { accountId: string; accountName: string; ref: string; lines: WaitLine[] }[] = [];

  if (order.source === "crew-order") {
    const id = Number(order.refs[0]);
    const rows = (await sql`SELECT crew_link_account_id, status FROM supply_orders WHERE id = ${id}`) as { crew_link_account_id: string | null; status: string }[];
    if (!rows[0]?.crew_link_account_id || !["new", "ordered"].includes(rows[0].status)) throw new Error("That order was already closed. Refresh the page.");
    const accountId = rows[0].crew_link_account_id;
    const [lines, names] = await Promise.all([
      sql`SELECT i.sub_supply_id, i.name, i.unit, l.qty FROM supply_order_lines l JOIN supply_items i ON i.id = l.item_id WHERE l.order_id = ${id} ORDER BY lower(i.name)` as unknown as Promise<{ sub_supply_id: string | number | null; name: string; unit: string; qty: number }[]>,
      lookupAccountSummaries([accountId]),
    ]);
    deliveries.push({
      accountId,
      accountName: names.get(accountId)?.accountName || accountId,
      ref: String(id),
      lines: lines.map((line) => {
        const supplyId = line.sub_supply_id === null ? null : Number(line.sub_supply_id);
        return { supplyId, name: named(supplyId, clean(line.name)), unit: clean(line.unit), qty: line.qty };
      }),
    });
  } else {
    const rows = (await subLinesOf(order.refs)).filter((row) => row.status.toLowerCase() !== "cancelled");
    if (rows.length === 0) throw new Error("That order was already closed. Refresh the page.");
    for (const ref of order.refs) {
      const mine = rows.filter((row) => row.grp === ref);
      if (mine.length === 0) continue;
      deliveries.push({
        accountId: mine[0].account_id,
        accountName: mine[0].account_name,
        ref,
        lines: mine.map((row) => {
          const supplyId = row.supply_id === null ? null : Number(row.supply_id);
          return { supplyId, name: named(supplyId, writeInLabel(row.supply_item) || row.supply_item), unit: row.unit, qty: qtyOf(row.quantity_raw) || 1 };
        }),
      });
    }
  }
  if (deliveries.some((delivery) => !delivery.accountId)) throw new Error("This order has no account. Fix the account first.");

  const statements = deliveries.map(
    (delivery) => sql`
      INSERT INTO supply_deliveries (account_id, account_name, source, source_ref, lines, fill)
      VALUES (${delivery.accountId}, ${delivery.accountName}, ${order.source}, ${delivery.ref}, ${JSON.stringify(delivery.lines)}::jsonb, ${input.fill})
      ON CONFLICT (source, source_ref) WHERE source <> 'office' DO UPDATE SET fill = EXCLUDED.fill, lines = EXCLUDED.lines
      WHERE supply_deliveries.sent_at IS NULL AND supply_deliveries.arrived_at IS NULL
    `
  );
  if (order.source === "crew-order") statements.push(sql`UPDATE supply_orders SET status = 'ordered', updated_at = now() WHERE id = ${Number(order.refs[0])} AND status = 'new'`);
  else
    statements.push(
      sql.query(
        `UPDATE sub_supply_orders SET status = 'Pending / In Progress', step_by = $2::text, step_at = now(), updated_at = now()
         WHERE ${SUB_GROUP} = ANY($1::text[]) AND lower(btrim(status)) IN ('new', 'approved', 'needs review', '')`,
        [order.refs, input.by]
      )
    );
  await sql.transaction(statements);
}

/** ✗ Decline: a new or approved order is closed (Crew Link "Cancelled", sub portal "Denied"); a delivery still at the warehouse goes too. */
export async function declineOrder(input: { order: OrderPick; by: string }): Promise<void> {
  const order = cleanPick(input.order);
  const sql = getSql();
  const started = (await sql`
    SELECT 1 FROM supply_deliveries WHERE source = ${order.source} AND split_part(source_ref, ${BACK}, 1) = ANY(${order.refs}::text[]) AND (sent_at IS NOT NULL OR arrived_at IS NOT NULL) LIMIT 1
  `) as unknown[];
  if (started.length > 0) throw new Error("Part of this order is already on its way. Cancel what is left on its back order instead.");
  const statements = [
    sql`UPDATE supply_deliveries SET cancelled_at = now() WHERE source = ${order.source} AND source_ref = ANY(${order.refs}::text[]) AND arrived_at IS NULL AND cancelled_at IS NULL`,
  ];
  if (order.source === "crew-order") statements.push(sql`UPDATE supply_orders SET status = 'cancelled', updated_at = now() WHERE id = ${Number(order.refs[0])} AND status IN ('new', 'ordered')`);
  else
    statements.push(
      sql.query(`UPDATE sub_supply_orders SET status = 'Denied', step_by = $2::text, step_at = now(), updated_at = now() WHERE ${SUB_GROUP} = ANY($1::text[]) AND ${OPEN_SUB_STATUS}`, [order.refs, input.by])
    );
  await sql.transaction(statements);
}

/* ---------- 🗑 Delete order (migration 041) ---------- */

export const DELETE_REASONS = ["Duplicate", "Test", "Old, already handled", "Entered by mistake", "Other"] as const;
export type DeleteReason = (typeof DELETE_REASONS)[number];

/**
 * 🗑 Delete order: a soft delete. Its rows stay, marked deleted with who and
 * why; Supply Orders and the Pin Board leave it out from then on, and a
 * delivery still waiting for it goes too. Not when any of it already moved
 * stock (taken from the warehouse, picked up, or confirmed arrived): then the
 * rest is cancelled instead. Gives back the reason as written, for the
 * activity log.
 */
export async function deleteOrder(input: { order: OrderPick; reason: string; note: string; by: string }): Promise<{ reason: string }> {
  const order = cleanPick(input.order);
  if (!(await orderDeleteReady())) throw new Error("Deleting orders is not turned on here yet.");
  const reason = DELETE_REASONS.find((entry) => entry === clean(input.reason));
  if (!reason) throw new Error("Pick why it is deleted.");
  const note = clean(input.note).slice(0, 200);
  if (reason === "Other" && note.length < 3) throw new Error("Write a short note: why is it deleted?");
  const written = note ? `${reason}: ${note}` : reason;
  const sql = getSql();

  // The order's own line ids too: older moves name a line, not the group.
  const lineIds =
    order.source === "sub-order"
      ? ((await sql.query(`SELECT btrim(order_id) AS id FROM sub_supply_orders WHERE ${SUB_GROUP} = ANY($1::text[])`, [order.refs])) as { id: string }[]).map((row) => row.id).filter(Boolean)
      : [];
  const refs = [...order.refs, ...lineIds];
  const moved = (await sql`
    SELECT 1 FROM supply_deliveries
    WHERE source = ${order.source} AND split_part(source_ref, ${BACK}, 1) = ANY(${order.refs}::text[]) AND (sent_at IS NOT NULL OR arrived_at IS NOT NULL)
    UNION ALL
    SELECT 1 FROM supply_moves WHERE order_id = ANY(${refs}::text[]) AND kind IN ('pick', 'send', 'arrive')
    LIMIT 1
  `) as unknown[];
  if (moved.length > 0) throw new Error("Part of this order already moved stock (taken, picked up or arrived), so it cannot be deleted. Cancel what is left instead.");

  const statements = [
    sql`UPDATE supply_deliveries SET cancelled_at = now() WHERE source = ${order.source} AND split_part(source_ref, ${BACK}, 1) = ANY(${order.refs}::text[]) AND arrived_at IS NULL AND cancelled_at IS NULL`,
  ];
  if (order.source === "crew-order") {
    statements.push(sql`UPDATE supply_orders SET deleted_at = now(), deleted_by = ${input.by}, deleted_reason = ${written}, updated_at = now() WHERE id = ${Number(order.refs[0])} AND deleted_at IS NULL`);
  } else {
    statements.push(
      sql.query(`UPDATE sub_supply_orders SET deleted_at = now(), deleted_by = $2::text, deleted_reason = $3::text, updated_at = now() WHERE ${SUB_GROUP} = ANY($1::text[]) AND deleted_at IS NULL`, [order.refs, input.by, written])
    );
  }
  await sql.transaction(statements);
  return { reason: written };
}

/** ✓ Picked up: the sub took it from the warehouse. Warehouse down, site up, the order Delivered. */
export async function pickedUp(input: { key: string; by: string }): Promise<void> {
  const entry = (await waiting()).find((item) => item.key === input.key);
  if (!entry || entry.fill !== "pickup") throw new Error("That pick-up is not waiting any more. Refresh the page.");
  if (!entry.sentAt) await sendToSite({ key: entry.key, by: input.by, source: "office" });
  await confirmArrival({ accountId: entry.accountId, key: entry.key, got: entry.lines.map((line) => line.qty), by: input.by, source: "office" });
}

/* ---------- a manager orders for a sub (a call or a text) ---------- */

/**
 * The order lands in the inbox already Approved, as the sub's own order would
 * (so the sub portal and the Pin Board see it too); the office then picks how
 * to fill it.
 */
export async function orderForSub(input: { accountId: string; accountName: string; sub: string; lines: { supplyId: number; qty: number }[]; note: string; by: string }): Promise<{ groupId: string; lines: number }> {
  const accountName = clean(input.accountName);
  if (!accountName) throw new Error("Pick the site it is for.");
  const sub = clean(input.sub).slice(0, 120);
  if (!sub) throw new Error("Who is it for? Pick the sub.");
  const products = new Map((await listProducts(false)).map((product) => [product.id, product]));
  const lines = (Array.isArray(input.lines) ? input.lines : []).map((line) => ({ supplyId: Number(line.supplyId), qty: count(line.qty) ?? 0 })).filter((line) => products.has(line.supplyId) && line.qty > 0);
  if (lines.length === 0) throw new Error("Pick at least one item.");
  const groupId = `SUPORD-GROUP-${Date.now()}`;
  const sql = getSql();
  for (const line of lines) {
    const product = products.get(line.supplyId)!;
    const made = await createSupplyOrder({
      supplyItem: product.code || product.crewName,
      category: product.category,
      quantity: String(line.qty),
      unit: product.unit,
      accountName,
      accountId: clean(input.accountId),
      subcontractor: sub,
      orderGroupId: groupId,
      deliveryMode: "",
      notes: [`Entered by ${input.by} (call or text)`, clean(input.note)].filter(Boolean).join(". ").slice(0, 500),
      status: "Approved",
    });
    await sql`UPDATE sub_supply_orders SET supply_id = ${line.supplyId}, step_by = ${input.by}, step_at = now() WHERE sheet_row = ${made.rowNumber}`;
  }
  return { groupId, lines: lines.length };
}

/* ---------- an account's Site stock (the office) ---------- */

/** "+ Add delivery": supplies that reached the site with no order (dropped off, shipped direct). Site up. */
export async function addSiteDelivery(input: { accountId: string; accountName: string; lines: { supplyId: number; qty: number }[]; note: string; by: string }): Promise<{ items: number }> {
  const accountId = clean(input.accountId);
  if (!accountId) throw new Error("This account has no id.");
  const products = new Map((await listProducts(false)).map((product) => [product.id, product]));
  const lines = (Array.isArray(input.lines) ? input.lines : []).map((line) => ({ supplyId: Number(line.supplyId), qty: count(line.qty) ?? 0 })).filter((line) => products.has(line.supplyId) && line.qty > 0);
  if (lines.length === 0) throw new Error("Pick what came, and how many.");
  const sql = getSql();
  const note = clean(input.note).slice(0, 200) || "Added by the office";
  await sql.transaction(
    lines.flatMap((line) => [
      sql`
        INSERT INTO site_shelf (account_id, supply_id, account_name, qty, updated_by) VALUES (${accountId}, ${line.supplyId}, ${clean(input.accountName)}, ${line.qty}, ${input.by})
        ON CONFLICT (account_id, supply_id) DO UPDATE SET qty = site_shelf.qty + EXCLUDED.qty, account_name = EXCLUDED.account_name, updated_by = EXCLUDED.updated_by, updated_at = now()
      `,
      sql`
        INSERT INTO supply_moves (supply_id, item_name, qty, kind, account_id, account_name, staff_name, note, source)
        VALUES (${line.supplyId}, ${products.get(line.supplyId)!.code || products.get(line.supplyId)!.crewName}, ${line.qty}, 'site-add', ${accountId}, ${clean(input.accountName)}, ${input.by}, ${note}, 'office')
      `,
    ])
  );
  return { items: lines.reduce((sum, line) => sum + line.qty, 0) };
}

/** A site count corrected by the office. The reason is required and kept in the history. */
export async function setSiteCount(input: { accountId: string; accountName: string; supplyId: number; qty: number; reason: string; by: string }): Promise<{ qty: number }> {
  const accountId = clean(input.accountId);
  const reason = clean(input.reason).slice(0, 200);
  const qty = count(input.qty, 9999);
  if (!accountId) throw new Error("This account has no id.");
  if (qty === null) throw new Error("Use a whole number, 0 or more.");
  if (reason.length < 3) throw new Error("Write a short reason.");
  const sql = getSql();
  const product = (await sql`SELECT supply_item FROM sub_supplies WHERE id = ${input.supplyId}`) as { supply_item: string }[];
  if (product.length === 0) throw new Error("That product is not on the Supplies list.");
  const before = (await sql`SELECT qty FROM site_shelf WHERE account_id = ${accountId} AND supply_id = ${input.supplyId}`) as { qty: number }[];
  const was = before[0]?.qty ?? 0;
  if (was === qty) return { qty };
  await sql.transaction([
    sql`
      INSERT INTO site_shelf (account_id, supply_id, account_name, qty, updated_by) VALUES (${accountId}, ${input.supplyId}, ${clean(input.accountName)}, ${qty}, ${input.by})
      ON CONFLICT (account_id, supply_id) DO UPDATE SET qty = EXCLUDED.qty, account_name = EXCLUDED.account_name, updated_by = EXCLUDED.updated_by, updated_at = now()
    `,
    sql`
      INSERT INTO supply_moves (supply_id, item_name, qty, kind, account_id, account_name, staff_name, note, source)
      VALUES (${input.supplyId}, ${clean(product[0].supply_item)}, ${qty - was}, 'site-set', ${accountId}, ${clean(input.accountName)}, ${input.by}, ${`Count ${was} -> ${qty}: ${reason}`}, 'office')
    `,
  ]);
  return { qty };
}

/* ---------- 3. Supplies arrived ---------- */

export type ArrivedLine = WaitLine & { got: number };

/** The order is open again (back order) or done; the same words as sendToSite and the sub portal use. */
function orderStatus(sql: ReturnType<typeof getSql>, source: Waiting["source"], ref: string, outcome: "back-order" | "delivered" | "cancelled", by: string) {
  if (source === "crew-order") {
    const status = outcome === "back-order" ? "ordered" : outcome;
    return [sql`UPDATE supply_orders SET status = ${status}, updated_at = now() WHERE id = ${Number(ref)} AND status IN ('new', 'ordered')`];
  }
  if (source === "sub-order") {
    if (outcome === "back-order") {
      return [sql.query(`UPDATE sub_supply_orders SET status = 'Pending / In Progress', updated_at = now() WHERE ${SUB_GROUP} = $1::text AND lower(btrim(status)) IN ('new', 'approved', 'needs review')`, [ref])];
    }
    return [
      sql.query(
        `UPDATE sub_supply_orders SET status = $3::text, step = CASE WHEN line_source <> '' AND $3::text = 'Completed' THEN 'delivered' ELSE step END, step_by = $2::text, step_at = now(), updated_at = now()
         WHERE ${SUB_GROUP} = $1::text AND ${OPEN_SUB_STATUS}`,
        [ref, by, outcome === "delivered" ? "Completed" : "Cancelled"]
      ),
    ];
  }
  return [];
}

/**
 * The crew confirms what came. `got` is per line, in the same order as the
 * waiting entry's lines. What came goes on the site shelf, extra too. Less
 * came: the rest is a new back order waiting for the crew, and the order
 * stays open (Back order); otherwise the order is Delivered. Any difference
 * is flagged to the office.
 */
export async function confirmArrival(input: { accountId: string; key: string; got: number[]; by: string; source?: MoveSource }): Promise<{ short: ArrivedLine[]; extra: ArrivedLine[] }> {
  const entry = (await waiting(input.accountId)).find((item) => item.key === input.key);
  if (!entry) throw new Error("That delivery is not waiting any more.");
  const source: MoveSource = input.source ?? "crew-link";
  const arrived: ArrivedLine[] = entry.lines.map((line, index) => ({ ...line, got: count(input.got[index]) ?? line.qty }));
  const short = arrived.filter((line) => line.got < line.qty);
  const extra = arrived.filter((line) => line.got > line.qty);
  const sql = getSql();
  const by = clean(input.by).slice(0, 80) || "Crew";

  const statements = [];
  if (entry.key.startsWith("d:")) {
    statements.push(sql`
      UPDATE supply_deliveries SET arrived = ${JSON.stringify(arrived)}::jsonb, arrived_by = ${by}, arrived_at = now(), short = ${short.length > 0}, extra = ${extra.length > 0}
      WHERE id = ${Number(entry.key.slice(2))} AND arrived_at IS NULL
    `);
  } else {
    statements.push(sql`
      INSERT INTO supply_deliveries (account_id, account_name, source, source_ref, lines, arrived, arrived_by, arrived_at, short, extra)
      VALUES (${entry.accountId}, ${entry.accountName}, ${entry.source}, ${entry.ref}, ${JSON.stringify(entry.lines)}::jsonb, ${JSON.stringify(arrived)}::jsonb, ${by}, now(), ${short.length > 0}, ${extra.length > 0})
      ON CONFLICT (source, source_ref) WHERE source <> 'office' DO UPDATE SET arrived = EXCLUDED.arrived, arrived_by = EXCLUDED.arrived_by, arrived_at = EXCLUDED.arrived_at, short = EXCLUDED.short, extra = EXCLUDED.extra
    `);
  }
  if (short.length > 0) {
    // The rest stays on its way: a back order of what did not come, sent (or not) like the delivery it is the rest of.
    const rest: WaitLine[] = short.map((line) => ({ supplyId: line.supplyId, name: line.name, unit: line.unit, qty: line.qty - line.got }));
    const lines = JSON.stringify(rest);
    // Once per delivery: a second tap never makes a second back order.
    statements.push(
      entry.key.startsWith("d:")
        ? sql`
            INSERT INTO supply_deliveries (account_id, account_name, source, source_ref, lines, sent_by, sent_at, back_of, fill)
            SELECT account_id, account_name, source, ${entry.ref} || ${BACK} || id::text, ${lines}::jsonb, sent_by, sent_at, id, fill FROM supply_deliveries p
            WHERE id = ${Number(entry.key.slice(2))} AND NOT EXISTS (SELECT 1 FROM supply_deliveries b WHERE b.back_of = p.id)
          `
        : sql`
            INSERT INTO supply_deliveries (account_id, account_name, source, source_ref, lines, sent_by, sent_at, back_of, fill)
            SELECT account_id, account_name, source, ${entry.ref} || ${BACK} || id::text, ${lines}::jsonb, sent_by, sent_at, id, fill FROM supply_deliveries p
            WHERE source = ${entry.source} AND source_ref = ${entry.ref} AND back_of IS NULL AND NOT EXISTS (SELECT 1 FROM supply_deliveries b WHERE b.back_of = p.id)
          `
    );
  }
  for (const line of arrived) {
    if (line.supplyId === null || line.got <= 0) continue;
    statements.push(
      sql`
        INSERT INTO site_shelf (account_id, supply_id, account_name, qty, updated_by) VALUES (${entry.accountId}, ${line.supplyId}, ${entry.accountName}, ${line.got}, ${by})
        ON CONFLICT (account_id, supply_id) DO UPDATE SET qty = site_shelf.qty + EXCLUDED.qty, account_name = EXCLUDED.account_name, updated_by = EXCLUDED.updated_by, updated_at = now()
      `,
      sql`
        INSERT INTO supply_moves (supply_id, item_name, qty, kind, account_id, account_name, staff_name, order_id, note, source)
        VALUES (${line.supplyId}, ${line.name}, ${line.got}, 'arrive', ${entry.accountId}, ${entry.accountName}, ${by}, ${entry.ref}, ${line.got === line.qty ? "Arrived" : `Arrived ${line.got} of ${line.qty}`}, ${source})
      `
    );
  }
  statements.push(...orderStatus(sql, entry.source, entry.ref, short.length > 0 ? "back-order" : "delivered", by));
  await sql.transaction(statements);
  if (short.length > 0 || extra.length > 0) await flagDifferent(entry, [...short, ...extra], by);
  return { short, extra };
}

/** "Gloves: 3 of 5 box (2 on back order)" or "Gloves: 7 of 5 box (2 extra)". */
const differentText = (line: ArrivedLine) =>
  `${line.name}: ${line.got} of ${line.qty}${line.unit ? ` ${line.unit}` : ""} (${line.got < line.qty ? `${line.qty - line.got} on back order` : `${line.got - line.qty} extra`})`;

const differentTitle = (short: boolean, extra: boolean) => (short && extra ? "Arrived short and extra" : short ? "Arrived short" : "Arrived extra");

/** The office hears about it: an email, and a paper in the Pin Board's Supply orders square. Never throws. */
async function flagDifferent(entry: Waiting, lines: ArrivedLine[], by: string): Promise<void> {
  const title = `${differentTitle(lines.some((line) => line.got < line.qty), lines.some((line) => line.got > line.qty))}: ${entry.accountName}`;
  const texts = lines.map(differentText);
  try {
    await sendInternalNotification(title, [
      `${by} confirmed a delivery at ${entry.accountName}. What came was different from the order:`,
      "",
      ...texts.map((line) => `- ${line}`),
      "",
      "Anything short stays on its way as a back order. See it on the Supply Orders page.",
    ]);
  } catch (error) {
    console.error("[shelves] different email:", error instanceof Error ? error.message : error);
  }
  try {
    if (await boardReady()) {
      // The Supply orders square is not a person's square: no text goes out.
      await pinPaper({ text: title, accountId: entry.accountId, accountName: entry.accountName, square: "", by, notes: texts.join("; ").slice(0, 900), box: "supply" });
    }
  } catch (error) {
    console.error("[shelves] different paper:", error instanceof Error ? error.message : error);
  }
}

/* ---------- the office: cancel a back-ordered item ---------- */

export type CancelChoice = "shelf" | "lost";

/**
 * What the site's spend already counts for one of this back-ordered item, or
 * null when it counts nothing (lib/pg/supply-control.ts monthSpend): sent from
 * our shelf is a 'send' at the product's cost; a sub-portal line bought for it
 * counts once it is bought or delivered, at that line's cost. A Crew Link
 * order bought direct and never sent from our shelf is in no spend.
 */
async function siteCharge(
  row: { source: Waiting["source"]; sent_at: string | Date | null },
  ref: string,
  supplyId: number,
  productCost: string | null,
  outcome: "delivered" | "cancelled" | ""
): Promise<string | null> {
  if (row.sent_at) return productCost ?? "0";
  if (row.source !== "sub-order" || !ref) return null;
  const lines = (await getSql().query(
    `SELECT unit_cost::text AS unit_cost, step FROM sub_supply_orders
     WHERE ${SUB_GROUP} = $1::text AND supply_id = $2 AND line_source = 'buy' ORDER BY sheet_row LIMIT 1`,
    [ref, supplyId]
  )) as { unit_cost: string | null; step: string }[];
  const line = lines[0];
  // Closing the order as Delivered marks its lines delivered (orderStatus), so it counts from then.
  if (!line || !(line.step === "bought" || line.step === "delivered" || outcome === "delivered")) return null;
  return line.unit_cost ?? "0";
}

/**
 * Takes one item off a back order. "shelf": it never left us, so it goes back
 * on the office shelf (the send undone: a 'send' move with a plus quantity,
 * which also takes it off the site's spend). "lost": nothing comes back. It is
 * a Cleaning World loss, never the customer's: a 'lost' move (with its cost)
 * shows it in the history and is not in any site's spend, and when the site
 * was already charged for it (sent from our shelf, or a sub-portal line
 * bought for it) a 'send' with a plus quantity takes that charge off again.
 * A back order with nothing left is closed, and so is its order: Delivered if
 * anything came, Cancelled if nothing did.
 */
export async function cancelBackOrder(input: { key: string; index: number; choice: CancelChoice; by: string }): Promise<{ closed: boolean }> {
  const sql = getSql();
  const id = input.key.startsWith("d:") ? Number(input.key.slice(2)) : NaN;
  if (!Number.isInteger(id)) throw new Error("That back order is not here any more. Refresh the page.");
  if (input.choice !== "shelf" && input.choice !== "lost") throw new Error("Pick: put back on our shelf, or lost.");
  const rows = (await sql`
    SELECT id, account_id, account_name, source, source_ref, lines, sent_at FROM supply_deliveries
    WHERE id = ${id} AND back_of IS NOT NULL AND arrived_at IS NULL AND cancelled_at IS NULL
  `) as { id: string | number; account_id: string; account_name: string; source: Waiting["source"]; source_ref: string; lines: WaitLine[]; sent_at: string | Date | null }[];
  const row = rows[0];
  const lines = Array.isArray(row?.lines) ? row.lines : [];
  const line = lines[input.index];
  if (!row || !line) throw new Error("That back order is not here any more. Refresh the page.");
  const rest = lines.filter((_, index) => index !== input.index);
  const closed = rest.length === 0;
  const ref = orderRef(row.source_ref);
  const by = clean(input.by).slice(0, 80) || "Office";
  const cancelled = { ...line, choice: input.choice, by, at: new Date().toISOString() };
  const product = line.supplyId === null ? [] : ((await sql`SELECT supply_item, unit_cost::text FROM sub_supplies WHERE id = ${line.supplyId}`) as { supply_item: string; unit_cost: string | null }[]);

  // Only if the back order is still the one the office saw: nobody confirmed or changed it meanwhile.
  const taken = (await sql`
    UPDATE supply_deliveries SET lines = ${JSON.stringify(rest)}::jsonb, cancelled = cancelled || ${JSON.stringify([cancelled])}::jsonb, cancelled_at = ${closed ? new Date().toISOString() : null}
    WHERE id = ${id} AND arrived_at IS NULL AND cancelled_at IS NULL AND lines = ${JSON.stringify(lines)}::jsonb
    RETURNING id
  `) as { id: string | number }[];
  if (taken.length === 0) throw new Error("That back order just changed. Refresh the page.");

  // The order is closed with the back order: Delivered if anything came, Cancelled if nothing did.
  let outcome: "delivered" | "cancelled" | "" = "";
  if (closed && ref) {
    const came = (await sql`
      SELECT EXISTS (
        SELECT 1 FROM supply_deliveries d, jsonb_array_elements(COALESCE(d.arrived, '[]'::jsonb)) a
        WHERE d.source = ${row.source} AND split_part(d.source_ref, ${BACK}, 1) = ${ref} AND (a->>'got')::int > 0
      ) AS came
    `) as { came: boolean }[];
    outcome = came[0]?.came ? "delivered" : "cancelled";
  }

  const statements = [];
  if (line.supplyId !== null && product.length > 0) {
    const name = clean(product[0].supply_item) || line.name;
    if (input.choice === "shelf") {
      statements.push(
        sql`UPDATE sub_supplies SET shelf_count = COALESCE(shelf_count, 0) + ${line.qty}, updated_by = ${by}, updated_at = now() WHERE id = ${line.supplyId}`,
        sql`
          INSERT INTO supply_moves (supply_id, item_name, qty, kind, account_id, account_name, unit_cost, staff_name, order_id, note, source)
          VALUES (${line.supplyId}, ${name}, ${line.qty}, 'send', ${row.account_id}, ${row.account_name}, ${product[0].unit_cost}, ${by}, ${ref}, 'Back order cancelled: put back on our shelf', 'office')
        `
      );
    } else {
      statements.push(sql`
        INSERT INTO supply_moves (supply_id, item_name, qty, kind, account_id, account_name, unit_cost, staff_name, order_id, note, source)
        VALUES (${line.supplyId}, ${name}, ${line.qty}, 'lost', ${row.account_id}, ${row.account_name}, ${product[0].unit_cost}, ${by}, ${ref}, 'Back order cancelled: lost / never coming. Cleaning World loss, not billed to the customer', 'office')
      `);
      const charged = await siteCharge(row, ref, line.supplyId, product[0].unit_cost, outcome);
      if (charged !== null) {
        statements.push(sql`
          INSERT INTO supply_moves (supply_id, item_name, qty, kind, account_id, account_name, unit_cost, staff_name, order_id, note, source)
          VALUES (${line.supplyId}, ${name}, ${line.qty}, 'send', ${row.account_id}, ${row.account_name}, ${charged}, ${by}, ${ref}, 'Lost back order taken off the customer''s supplies', 'office')
        `);
      }
    }
  }
  if (outcome) statements.push(...orderStatus(sql, row.source, ref, outcome, by));
  if (statements.length > 0) await sql.transaction(statements);
  return { closed };
}

/* ---------- 4. Case empty ---------- */

export async function caseEmpty(input: { accountId: string; supplyId: number; by: string; source?: MoveSource }): Promise<{ qty: number }> {
  const sql = getSql();
  const by = clean(input.by).slice(0, 80) || "Crew";
  const rows = (await sql`
    UPDATE site_shelf SET qty = qty - 1, updated_by = ${by}, updated_at = now()
    WHERE account_id = ${input.accountId} AND supply_id = ${input.supplyId} AND qty > 0
    RETURNING qty, account_name
  `) as { qty: number; account_name: string }[];
  if (rows.length === 0) throw new Error("There is none of that on the shelf.");
  const product = (await sql`SELECT supply_item FROM sub_supplies WHERE id = ${input.supplyId}`) as { supply_item: string }[];
  await sql`
    INSERT INTO supply_moves (supply_id, item_name, qty, kind, account_id, account_name, staff_name, note, source)
    VALUES (${input.supplyId}, ${clean(product[0]?.supply_item)}, -1, 'empty', ${input.accountId}, ${rows[0].account_name}, ${by}, 'Case empty', ${input.source ?? "crew-link"})
  `;
  return { qty: rows[0].qty };
}

/* ---------- the office: what arrived different ---------- */

export type DifferentDelivery = { id: number; accountId: string; accountName: string; source: string; ref: string; by: string; at: string; short: boolean; extra: boolean; title: string; lines: string[] };

/** The newest deliveries that came short or with extra, newest first. */
export async function differentDeliveries(limit = 20): Promise<DifferentDelivery[]> {
  const rows = (await getSql()`
    SELECT id, account_id, account_name, source, source_ref, arrived, arrived_by, arrived_at, short, extra FROM supply_deliveries
    WHERE short OR extra ORDER BY arrived_at DESC LIMIT ${Math.min(100, Math.max(1, limit))}
  `) as { id: string | number; account_id: string; account_name: string; source: string; source_ref: string; arrived: ArrivedLine[] | null; arrived_by: string; arrived_at: string | Date; short: boolean; extra: boolean }[];
  return rows.map((row) => ({
    id: Number(row.id),
    accountId: row.account_id,
    accountName: clean(row.account_name),
    source: row.source,
    ref: orderRef(row.source_ref),
    by: clean(row.arrived_by),
    at: iso(row.arrived_at),
    short: row.short,
    extra: row.extra,
    title: differentTitle(row.short, row.extra),
    lines: (row.arrived ?? []).filter((line) => line.got !== line.qty).map(differentText),
  }));
}

/* ---------- what a crew sees (Crew Link, sub portal) ---------- */

export type CrewShelfView = {
  shelf: { supplyId: number; name: string; unit: string; photoUrl: string; qty: number; level: Level }[];
  waiting: { key: string; at: string; sent: boolean; backOrder: boolean; lines: { name: string; unit: string; qty: number }[] }[];
};

/** One site's shelf and what is on its way there, with no product codes (staff only) and no costs. */
export async function crewShelfView(accountId: string): Promise<CrewShelfView> {
  const [shelves, onTheWay] = await Promise.all([siteShelves(accountId), waiting(accountId)]);
  return {
    shelf: (shelves[0]?.tiles ?? []).map((item) => ({ supplyId: item.supplyId, name: item.name, unit: item.unit, photoUrl: item.photoUrl, qty: item.qty ?? 0, level: item.level })),
    waiting: onTheWay.filter(crewCanConfirm).map((entry) => ({ key: entry.key, at: entry.at, sent: entry.sentAt !== "", backOrder: entry.backOrder, lines: entry.lines.map((line) => ({ name: line.name, unit: line.unit, qty: line.qty })) })),
  };
}
