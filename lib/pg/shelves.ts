// Stock, made simple (migration 038): two shelves and four actions.
//
//   office shelf   sub_supplies.shelf_count: the Supplies count.
//   site shelf     site_shelf: what is at each customer, per product.
//
//   1. Received from vendor (office)   adds to the office shelf.
//   2. Sent to site (office)           takes from the office shelf; the
//                                      delivery waits for the crew.
//   3. Supplies arrived (crew)         the items pre-filled, -/+ for short or
//                                      missing, Confirm: adds what came to the
//                                      site shelf, marks the order Delivered,
//                                      and flags anything short to the office
//                                      (Supply Orders page, an email, and a
//                                      paper in the Pin Board's Supply orders
//                                      square; it is not a person's square, so
//                                      nobody is texted).
//   4. Case empty (crew)               one tap takes one case off the site shelf.
//
// Every change is a supply_moves row (who, when, how many). Crew Link orders
// (supply_orders) and sub-portal orders (sub_supply_orders) both arrive this
// way; a delivery (supply_deliveries) ties a send and an arrival together.

import { getSql } from "@/lib/db";
import { sendInternalNotification } from "@/lib/email";
import { boardReady, pinPaper } from "@/lib/pg/board";
import { listProducts, type Product } from "@/lib/pg/supply-list";
import { lookupAccountSummaries } from "@/lib/teamHubAccountLookup";

const clean = (value: unknown) => String(value ?? "").trim();
const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : value ? String(value) : "");
const qtyOf = (raw: string) => Number(String(raw).replace(/[^0-9]/g, "")) || 0;
const count = (value: unknown, max = 999): number | null => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
};

/* ---------- colors ---------- */

export type Level = "green" | "yellow" | "red" | "none";

/** Site shelf: red 0, yellow 1, green 2 or more. */
export const siteLevel = (qty: number): Level => (qty <= 0 ? "red" : qty === 1 ? "yellow" : "green");

/** Office shelf: red at or below its minimum, yellow up to twice that, green above. No minimum: the site rule. Never counted: none. */
export function officeLevel(qty: number | null, min: number | null): Level {
  if (qty === null) return "none";
  if (min !== null && min > 0) return qty <= min ? "red" : qty <= min * 2 ? "yellow" : "green";
  return siteLevel(qty);
}

/* ---------- the shelves ---------- */

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

/** The office shelf: every product in use, with its count and color. */
export async function officeShelf(): Promise<ShelfTile[]> {
  const products = await listProducts(false);
  return products.map((product) => tile(product, product.shelfCount, officeLevel(product.shelfCount, product.minLevel)));
}

export type SiteShelf = { accountId: string; accountName: string; tiles: ShelfTile[] };

type SiteRow = { account_id: string; account_name: string; supply_id: string | number; qty: number };

async function siteRows(accountId?: string): Promise<SiteRow[]> {
  const sql = getSql();
  return (accountId
    ? await sql`SELECT account_id, account_name, supply_id, qty FROM site_shelf WHERE account_id = ${accountId}`
    : await sql`SELECT account_id, account_name, supply_id, qty FROM site_shelf`) as SiteRow[];
}

/** Each account's site shelf (only accounts that have one), or just one account's. */
export async function siteShelves(accountId?: string): Promise<SiteShelf[]> {
  const [rows, products] = await Promise.all([siteRows(accountId), listProducts(true)]);
  const byId = new Map(products.map((product) => [product.id, product]));
  const shelves = new Map<string, SiteShelf>();
  for (const row of rows) {
    const product = byId.get(Number(row.supply_id));
    if (!product) continue;
    const shelf = shelves.get(row.account_id) ?? { accountId: row.account_id, accountName: clean(row.account_name) || row.account_id, tiles: [] };
    shelf.tiles.push(tile(product, row.qty, siteLevel(row.qty)));
    shelves.set(row.account_id, shelf);
  }
  for (const shelf of shelves.values()) shelf.tiles.sort((a, b) => a.name.localeCompare(b.name));
  return [...shelves.values()].sort((a, b) => a.accountName.localeCompare(b.accountName));
}

/* ---------- 1. Received from vendor ---------- */

export async function receivedFromVendor(supplyId: number, qty: number, by: string): Promise<void> {
  const n = count(qty, 9999);
  if (!n) throw new Error("How many came in? Use a number from 1 up.");
  const sql = getSql();
  const rows = (await sql`SELECT supply_item, unit_cost::text FROM sub_supplies WHERE id = ${supplyId}`) as { supply_item: string; unit_cost: string | null }[];
  if (rows.length === 0) throw new Error("That product is not on the Supplies list.");
  await sql.transaction([
    sql`UPDATE sub_supplies SET shelf_count = COALESCE(shelf_count, 0) + ${n}, updated_by = ${by}, updated_at = now() WHERE id = ${supplyId}`,
    sql`
      INSERT INTO supply_moves (supply_id, item_name, qty, kind, account_name, unit_cost, staff_name, note)
      VALUES (${supplyId}, ${clean(rows[0].supply_item)}, ${n}, 'receive', '', ${rows[0].unit_cost}, ${by}, 'Received from vendor')
    `,
  ]);
}

/* ---------- what is on its way to a site ---------- */

export type WaitLine = { supplyId: number | null; name: string; unit: string; qty: number };
export type Waiting = {
  /** "d:<delivery>", "crew:<order>" or "sub:<group>". */
  key: string;
  source: "crew-order" | "sub-order" | "office";
  ref: string;
  accountId: string;
  accountName: string;
  /** When it was ordered, or sent (office). */
  at: string;
  /** "" = not sent from the office shelf (ordered, or bought and shipped direct). */
  sentAt: string;
  lines: WaitLine[];
};

type DeliveryRow = { id: string | number; account_id: string; account_name: string; source: Waiting["source"]; source_ref: string; lines: WaitLine[]; sent_at: string | Date | null; created_at: string | Date };

const OPEN_SUB_STATUS = `lower(btrim(status)) NOT IN ('completed', 'delivered', 'cancelled', 'canceled', 'denied')`;
const SUB_GROUP = `COALESCE(NULLIF(btrim(order_group_id), ''), btrim(order_id))`;

/**
 * Everything on its way to sites, or to one site: deliveries the office sent
 * that are not confirmed yet, and open orders (Crew Link and sub portal) that
 * were not sent from the office shelf (ordered or shipped direct).
 */
export async function waiting(accountId?: string): Promise<Waiting[]> {
  const sql = getSql();
  const one = clean(accountId);
  const [deliveries, crewOrders, subLines, products] = await Promise.all([
    sql`SELECT id, account_id, account_name, source, source_ref, lines, sent_at, created_at FROM supply_deliveries
        WHERE arrived_at IS NULL AND (${one} = '' OR account_id = ${one}) ORDER BY created_at` as unknown as Promise<DeliveryRow[]>,
    sql`SELECT o.id, o.crew_link_account_id, o.created_at FROM supply_orders o
        WHERE o.crew_link_account_id IS NOT NULL AND o.status IN ('new', 'ordered') AND (${one} = '' OR o.crew_link_account_id = ${one})
          AND NOT EXISTS (SELECT 1 FROM supply_deliveries d WHERE d.source = 'crew-order' AND d.source_ref = o.id::text)
        ORDER BY o.created_at` as unknown as Promise<{ id: number; crew_link_account_id: string; created_at: string | Date }[]>,
    sql.query(
      `SELECT ${SUB_GROUP} AS grp, COALESCE(account_ref, btrim(account_id_raw)) AS account_id, btrim(account_name) AS account_name,
              supply_id, btrim(supply_item) AS supply_item, btrim(unit) AS unit, quantity_raw, created_at
       FROM sub_supply_orders o
       WHERE ${OPEN_SUB_STATUS} AND COALESCE(account_ref, btrim(account_id_raw)) <> '' AND btrim(account_name) <> 'Shelf restock'
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
    ref: row.source_ref,
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
    const entry = groups.get(key) ?? { key, source: "sub-order" as const, ref: row.grp, accountId: row.account_id, accountName: row.account_name, at: iso(row.created_at), sentAt: "", lines: [] };
    const supplyId = row.supply_id === null ? null : Number(row.supply_id);
    entry.lines.push({ supplyId, name: named(supplyId, row.supply_item), unit: row.unit, qty: qtyOf(row.quantity_raw) || 1 });
    groups.set(key, entry);
  }
  list.push(...groups.values());
  return list.filter((entry) => entry.lines.length > 0).sort((a, b) => a.at.localeCompare(b.at));
}

/* ---------- 2. Sent to site ---------- */

/**
 * Takes the items off the office shelf and starts a delivery that waits for
 * the crew. `key` sends an order (all its lines); otherwise `lines` are sent
 * to the account with no order.
 */
export async function sendToSite(input: { key?: string; accountId?: string; accountName?: string; lines?: { supplyId: number; qty: number }[]; by: string }): Promise<{ deliveryId: number }> {
  const sql = getSql();
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
    entry = { key: "", source: "office", ref: "", accountId, accountName: clean(input.accountName), at: "", sentAt: "", lines };
  }

  const shelfLines = entry.lines.filter((line): line is WaitLine & { supplyId: number } => line.supplyId !== null && line.qty > 0);
  const costs = shelfLines.length
    ? ((await sql`SELECT id, supply_item, unit_cost::text FROM sub_supplies WHERE id = ANY(${shelfLines.map((line) => line.supplyId)}::bigint[])`) as { id: string | number; supply_item: string; unit_cost: string | null }[])
    : [];
  const costOf = new Map(costs.map((row) => [Number(row.id), row]));
  const ref = entry.key.startsWith("d:") ? "" : entry.ref;

  const statements = [];
  if (entry.key.startsWith("d:")) {
    statements.push(sql`UPDATE supply_deliveries SET sent_by = ${input.by}, sent_at = now() WHERE id = ${Number(entry.key.slice(2))} AND sent_at IS NULL`);
  } else if (entry.source === "office") {
    statements.push(sql`
      INSERT INTO supply_deliveries (account_id, account_name, source, source_ref, lines, sent_by, sent_at)
      VALUES (${entry.accountId}, ${entry.accountName}, 'office', '', ${JSON.stringify(entry.lines)}::jsonb, ${input.by}, now())
    `);
  } else {
    statements.push(sql`
      INSERT INTO supply_deliveries (account_id, account_name, source, source_ref, lines, sent_by, sent_at)
      VALUES (${entry.accountId}, ${entry.accountName}, ${entry.source}, ${ref}, ${JSON.stringify(entry.lines)}::jsonb, ${input.by}, now())
      ON CONFLICT (source, source_ref) WHERE source <> 'office' DO UPDATE SET sent_by = EXCLUDED.sent_by, sent_at = EXCLUDED.sent_at, lines = EXCLUDED.lines
    `);
  }
  for (const line of shelfLines) {
    const row = costOf.get(line.supplyId);
    statements.push(
      // The office shelf never shows less than 0: a count that was off is fixed by the next count.
      sql`UPDATE sub_supplies SET shelf_count = GREATEST(COALESCE(shelf_count, 0) - ${line.qty}, 0), updated_at = now() WHERE id = ${line.supplyId}`,
      sql`
        INSERT INTO supply_moves (supply_id, item_name, qty, kind, account_id, account_name, unit_cost, staff_name, order_id, note)
        VALUES (${line.supplyId}, ${clean(row?.supply_item) || line.name}, ${-line.qty}, 'send', ${entry.accountId}, ${entry.accountName}, ${row?.unit_cost ?? null}, ${input.by}, ${ref}, 'Sent to site')
      `
    );
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

/* ---------- 3. Supplies arrived ---------- */

export type ArrivedLine = WaitLine & { got: number };

/**
 * The crew confirms what came. `got` is per line, in the same order as the
 * waiting entry's lines. What came goes on the site shelf; the order is
 * Delivered; anything short is flagged to the office.
 */
export async function confirmArrival(input: { accountId: string; key: string; got: number[]; by: string }): Promise<{ short: ArrivedLine[] }> {
  const entry = (await waiting(input.accountId)).find((item) => item.key === input.key);
  if (!entry) throw new Error("That delivery is not waiting any more.");
  const arrived: ArrivedLine[] = entry.lines.map((line, index) => ({ ...line, got: Math.min(count(input.got[index]) ?? line.qty, 999) }));
  const short = arrived.filter((line) => line.got < line.qty);
  const sql = getSql();
  const by = clean(input.by).slice(0, 80) || "Crew";

  const statements = [];
  if (entry.key.startsWith("d:")) {
    statements.push(sql`
      UPDATE supply_deliveries SET arrived = ${JSON.stringify(arrived)}::jsonb, arrived_by = ${by}, arrived_at = now(), short = ${short.length > 0}
      WHERE id = ${Number(entry.key.slice(2))} AND arrived_at IS NULL
    `);
  } else {
    statements.push(sql`
      INSERT INTO supply_deliveries (account_id, account_name, source, source_ref, lines, arrived, arrived_by, arrived_at, short)
      VALUES (${entry.accountId}, ${entry.accountName}, ${entry.source}, ${entry.ref}, ${JSON.stringify(entry.lines)}::jsonb, ${JSON.stringify(arrived)}::jsonb, ${by}, now(), ${short.length > 0})
      ON CONFLICT (source, source_ref) WHERE source <> 'office' DO UPDATE SET arrived = EXCLUDED.arrived, arrived_by = EXCLUDED.arrived_by, arrived_at = EXCLUDED.arrived_at, short = EXCLUDED.short
    `);
  }
  for (const line of arrived) {
    if (line.supplyId === null || line.got <= 0) continue;
    statements.push(
      sql`
        INSERT INTO site_shelf (account_id, supply_id, account_name, qty, updated_by) VALUES (${entry.accountId}, ${line.supplyId}, ${entry.accountName}, ${line.got}, ${by})
        ON CONFLICT (account_id, supply_id) DO UPDATE SET qty = site_shelf.qty + EXCLUDED.qty, account_name = EXCLUDED.account_name, updated_by = EXCLUDED.updated_by, updated_at = now()
      `,
      sql`
        INSERT INTO supply_moves (supply_id, item_name, qty, kind, account_id, account_name, staff_name, order_id, note)
        VALUES (${line.supplyId}, ${line.name}, ${line.got}, 'arrive', ${entry.accountId}, ${entry.accountName}, ${by}, ${entry.ref}, ${line.got < line.qty ? `Arrived ${line.got} of ${line.qty}` : "Arrived"})
      `
    );
  }
  if (entry.source === "crew-order") statements.push(sql`UPDATE supply_orders SET status = 'delivered', updated_at = now() WHERE id = ${Number(entry.ref)} AND status IN ('new', 'ordered')`);
  if (entry.source === "sub-order") {
    statements.push(
      sql.query(
        `UPDATE sub_supply_orders SET status = 'Completed', step = CASE WHEN line_source <> '' THEN 'delivered' ELSE step END, step_by = $2::text, step_at = now(), updated_at = now()
         WHERE ${SUB_GROUP} = $1::text AND ${OPEN_SUB_STATUS}`,
        [entry.ref, by]
      )
    );
  }
  await sql.transaction(statements);
  if (short.length > 0) await flagShort(entry, short, by);
  return { short };
}

const shortText = (line: ArrivedLine) => `${line.name}: ${line.got} of ${line.qty}${line.unit ? ` ${line.unit}` : ""}${line.got === 0 ? " (missing)" : ""}`;

/** The office hears about it: an email, and a paper in the Pin Board's Supply orders square. Never throws. */
async function flagShort(entry: Waiting, short: ArrivedLine[], by: string): Promise<void> {
  const lines = short.map(shortText);
  try {
    await sendInternalNotification(`Short delivery: ${entry.accountName}`, [
      `${by} confirmed a delivery at ${entry.accountName}. Something was short or missing:`,
      "",
      ...lines.map((line) => `- ${line}`),
      "",
      "See it on the Supply Orders page.",
    ]);
  } catch (error) {
    console.error("[shelves] short email:", error instanceof Error ? error.message : error);
  }
  try {
    if (await boardReady()) {
      // The Supply orders square is not a person's square: no text goes out.
      await pinPaper({ text: `Short delivery: ${entry.accountName}`, accountId: entry.accountId, accountName: entry.accountName, square: "", by, notes: lines.join("; ").slice(0, 900), box: "supply" });
    }
  } catch (error) {
    console.error("[shelves] short paper:", error instanceof Error ? error.message : error);
  }
}

/* ---------- 4. Case empty ---------- */

export async function caseEmpty(input: { accountId: string; supplyId: number; by: string }): Promise<{ qty: number }> {
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
    INSERT INTO supply_moves (supply_id, item_name, qty, kind, account_id, account_name, staff_name, note)
    VALUES (${input.supplyId}, ${clean(product[0]?.supply_item)}, -1, 'empty', ${input.accountId}, ${rows[0].account_name}, ${by}, 'Case empty')
  `;
  return { qty: rows[0].qty };
}

/* ---------- the office: what arrived short ---------- */

export type ShortDelivery = { id: number; accountId: string; accountName: string; source: string; ref: string; by: string; at: string; lines: string[] };

export async function shortDeliveries(limit = 20): Promise<ShortDelivery[]> {
  const rows = (await getSql()`
    SELECT id, account_id, account_name, source, source_ref, arrived, arrived_by, arrived_at FROM supply_deliveries
    WHERE short ORDER BY arrived_at DESC LIMIT ${Math.min(100, Math.max(1, limit))}
  `) as { id: string | number; account_id: string; account_name: string; source: string; source_ref: string; arrived: ArrivedLine[] | null; arrived_by: string; arrived_at: string | Date }[];
  return rows.map((row) => ({
    id: Number(row.id),
    accountId: row.account_id,
    accountName: clean(row.account_name),
    source: row.source,
    ref: row.source_ref,
    by: clean(row.arrived_by),
    at: iso(row.arrived_at),
    lines: (row.arrived ?? []).filter((line) => line.got < line.qty).map(shortText),
  }));
}

/* ---------- what a crew sees (Crew Link, sub portal) ---------- */

export type CrewShelfView = {
  shelf: { supplyId: number; name: string; unit: string; photoUrl: string; qty: number; level: Level }[];
  waiting: { key: string; at: string; sent: boolean; lines: { name: string; unit: string; qty: number }[] }[];
};

/** One site's shelf and what is on its way there, with no product codes (staff only) and no costs. */
export async function crewShelfView(accountId: string): Promise<CrewShelfView> {
  const [shelves, onTheWay] = await Promise.all([siteShelves(accountId), waiting(accountId)]);
  return {
    shelf: (shelves[0]?.tiles ?? []).map((item) => ({ supplyId: item.supplyId, name: item.name, unit: item.unit, photoUrl: item.photoUrl, qty: item.qty ?? 0, level: item.level })),
    waiting: onTheWay.map((entry) => ({ key: entry.key, at: entry.at, sent: entry.sentAt !== "", lines: entry.lines.map((line) => ({ name: line.name, unit: line.unit, qty: line.qty })) })),
  };
}
