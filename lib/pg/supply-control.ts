// Supply control (FEATURE_SUPPLY_CONTROL): the supply shelf, counted and
// charged. Built on the supplies and supply orders that already exist
// (sub_supplies, sub_supply_orders); migration 027 adds what the shelf needs.
// Postgres only. Nothing here reads or writes Google Sheets or Apps Script.
import { getSql } from "@/lib/db";
import { createSupplyOrder } from "@/lib/pg/supplies";
import { ACTIVE_ITEM } from "@/lib/pg/supply-active";
import { syncCrewItem } from "@/lib/pg/supply-list";

/* ---------- on / off ---------- */

/**
 * "1" = on, "0" = off. Unset: off on Production, on in local dev and on
 * Vercel preview/development, the same rule as the other FEATURE_ switches.
 */
export function supplyControlFlagOn(): boolean {
  const flag = (process.env.FEATURE_SUPPLY_CONTROL ?? "").trim();
  if (flag === "1") return true;
  if (flag === "0") return false;
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "development";
}

let ready: boolean | null = null;

/** The switch is on AND this database has had migration 027. */
export async function supplyControlReady(): Promise<boolean> {
  if (!supplyControlFlagOn()) return false;
  if (ready === true) return true;
  try {
    const rows = (await getSql()`SELECT to_regclass('public.supply_moves') IS NOT NULL AS ok`) as { ok: boolean }[];
    ready = rows[0]?.ok === true;
  } catch {
    ready = false;
  }
  return ready === true;
}

/* ---------- shapes ---------- */

export const OFFICE_USE = "Office use";
/** A purchase order that refills the shelf, not for a site. */
export const SHELF_RESTOCK = "Shelf restock";

export type ShelfItem = {
  id: number;
  name: string;
  category: string;
  unit: string;
  photoUrl: string;
  /** Dollars; null = no cost typed yet. */
  unitCost: number | null;
  vendor: string;
  shelfLocation: string;
  minLevel: number | null;
  /** null = never counted. */
  shelfCount: number | null;
  /** At or below the minimum: on the red Reorder list. */
  low: boolean;
};

export type SupplyMove = {
  id: number;
  itemName: string;
  qty: number;
  kind: string;
  accountName: string;
  cost: number;
  staffName: string;
  note: string;
  at: string;
};

export type OrderLine = {
  rowNumber: number;
  orderId: string;
  groupId: string;
  day: string;
  accountId: string;
  accountName: string;
  item: string;
  quantity: number;
  unit: string;
  /** "shelf" | "buy". */
  source: string;
  /** ordered | approved | picked | bought | delivered. */
  step: string;
  cost: number;
  orderedBy: string;
  poNumber: string;
  notes: string;
};

export const ORDER_STEPS = ["ordered", "approved", "picked", "bought", "delivered"] as const;

const text = (value: unknown) => String(value ?? "").trim();
const money = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const wholeNumber = (value: unknown, max = 9999): number | null => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
};
const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : text(value));

type ShelfRow = {
  id: string | number;
  supply_item: string;
  category: string;
  unit: string;
  photo_url: string;
  unit_cost: string | null;
  vendor: string;
  shelf_location: string;
  min_level: number | null;
  shelf_count: number | null;
};

function toShelf(row: ShelfRow): ShelfItem {
  const minLevel = row.min_level;
  const shelfCount = row.shelf_count;
  return {
    id: Number(row.id),
    name: row.supply_item.trim(),
    category: row.category.trim(),
    unit: row.unit.trim(),
    photoUrl: row.photo_url.trim(),
    unitCost: row.unit_cost === null ? null : money(row.unit_cost),
    vendor: row.vendor.trim(),
    shelfLocation: row.shelf_location.trim(),
    minLevel,
    shelfCount,
    low: minLevel !== null && shelfCount !== null && shelfCount <= minLevel,
  };
}

/* ---------- the shelf ---------- */

/** Every active supply item, by name. */
export async function listShelf(): Promise<ShelfItem[]> {
  const rows = (await getSql().query(
    `SELECT id, supply_item, category, unit, photo_url, unit_cost::text, vendor, shelf_location, min_level, shelf_count
     FROM sub_supplies WHERE ${ACTIVE_ITEM} ORDER BY lower(supply_item)`
  )) as ShelfRow[];
  return rows.map(toShelf);
}

/** The office edits an item's shelf facts. A new shelf count is logged as a move ("set"). */
export async function saveShelfItem(
  id: number,
  input: { unit?: unknown; photoUrl?: unknown; unitCost?: unknown; vendor?: unknown; shelfLocation?: unknown; minLevel?: unknown; shelfCount?: unknown },
  by: string
): Promise<void> {
  const sql = getSql();
  const cost = text(input.unitCost) === "" ? null : money(input.unitCost);
  if (cost !== null && (cost < 0 || cost > 100000)) throw new Error("The cost does not look right.");
  const min = text(input.minLevel) === "" ? null : wholeNumber(input.minLevel);
  if (text(input.minLevel) !== "" && min === null) throw new Error("The minimum must be a whole number.");
  const count = text(input.shelfCount) === "" ? null : wholeNumber(input.shelfCount, 99999);
  if (text(input.shelfCount) !== "" && count === null) throw new Error("The shelf count must be a whole number.");

  const before = (await sql`SELECT supply_item, shelf_count, unit_cost::text FROM sub_supplies WHERE id = ${id}`) as { supply_item: string; shelf_count: number | null; unit_cost: string | null }[];
  if (before.length === 0) throw new Error("That item was not found.");
  const photo = text(input.photoUrl);
  await sql`
    UPDATE sub_supplies SET
      unit = CASE WHEN ${text(input.unit)} = '' THEN unit ELSE ${text(input.unit)} END,
      photo_url = CASE WHEN ${photo} = '' THEN photo_url ELSE ${photo} END,
      unit_cost = ${cost}, vendor = ${text(input.vendor).slice(0, 120)}, shelf_location = ${text(input.shelfLocation).slice(0, 80)},
      min_level = ${min}, shelf_count = COALESCE(${count}, shelf_count), updated_by = ${by}, updated_at = now()
    WHERE id = ${id}
  `;
  // Its Crew Link face follows the product's unit and photo.
  await syncCrewItem(id);
  if (count !== null && count !== before[0].shelf_count) {
    await sql`
      INSERT INTO supply_moves (supply_id, item_name, qty, kind, account_name, unit_cost, staff_name, note)
      VALUES (${id}, ${before[0].supply_item.trim()}, ${count - (before[0].shelf_count ?? 0)}, 'set', '', ${cost}, ${by}, ${before[0].shelf_count === null ? "Starting count" : "Count typed by the office"})
    `;
  }
}

/* ---------- taking and returning (the Supply Check tablet) ---------- */

export type TakeLine = { supplyId: number; qty: number };

/**
 * Someone takes items for a site (or Office use), or brings them back.
 * The shelf count moves, and each line is logged with its cost, who and when.
 * All lines together or none.
 */
export async function moveFromShelf(input: {
  kind: "take" | "return";
  lines: TakeLine[];
  accountId: string;
  accountName: string;
  staffId: string;
  staffName: string;
  note?: string;
}): Promise<{ items: number; cost: number }> {
  const lines = input.lines.filter((line) => Number.isInteger(line.supplyId) && Number.isInteger(line.qty) && line.qty > 0 && line.qty <= 500);
  if (lines.length === 0) throw new Error("Nothing was picked.");
  const accountName = text(input.accountName) || OFFICE_USE;
  const sql = getSql();
  const ids = lines.map((line) => line.supplyId);
  const items = (await sql`SELECT id, supply_item, unit_cost::text FROM sub_supplies WHERE id = ANY(${ids}::bigint[])`) as { id: string | number; supply_item: string; unit_cost: string | null }[];
  const byId = new Map(items.map((item) => [Number(item.id), item]));
  if (lines.some((line) => !byId.has(line.supplyId))) throw new Error("One of those items is not on the list any more.");
  const sign = input.kind === "take" ? -1 : 1;
  let cost = 0;
  const statements = lines.flatMap((line) => {
    const item = byId.get(line.supplyId)!;
    const unitCost = item.unit_cost === null ? null : money(item.unit_cost);
    cost += (unitCost ?? 0) * line.qty;
    return [
      sql`UPDATE sub_supplies SET shelf_count = COALESCE(shelf_count, 0) + ${sign * line.qty}, updated_at = now() WHERE id = ${line.supplyId}`,
      sql`
        INSERT INTO supply_moves (supply_id, item_name, qty, kind, account_id, account_name, unit_cost, staff_id, staff_name, note)
        VALUES (${line.supplyId}, ${item.supply_item.trim()}, ${sign * line.qty}, ${input.kind}, ${text(input.accountId)}, ${accountName}, ${unitCost}, ${text(input.staffId)}, ${text(input.staffName)}, ${text(input.note).slice(0, 200)})
      `,
    ];
  });
  await sql.transaction(statements);
  return { items: lines.reduce((sum, line) => sum + line.qty, 0), cost: money(cost) };
}

type MoveRow = { id: string | number; item_name: string; qty: number; kind: string; account_name: string; unit_cost: string | null; staff_name: string; note: string; created_at: string | Date };

/** The newest moves: who took what, where it went. */
export async function listMoves(limit = 60): Promise<SupplyMove[]> {
  const rows = (await getSql()`
    SELECT id, item_name, qty, kind, account_name, unit_cost::text, staff_name, note, created_at
    FROM supply_moves ORDER BY created_at DESC, id DESC LIMIT ${Math.min(200, Math.max(1, limit))}
  `) as MoveRow[];
  return rows.map((row) => ({
    id: Number(row.id),
    itemName: row.item_name,
    qty: row.qty,
    kind: row.kind,
    accountName: row.account_name,
    cost: money(Math.abs(row.qty) * money(row.unit_cost ?? 0)),
    staffName: row.staff_name,
    note: row.note,
    at: iso(row.created_at),
  }));
}

/* ---------- spend, and accounts billed for supplies ---------- */

export type SpendRow = { accountId: string; accountName: string; amount: number; items: number; mode: "included" | "billed"; invoiced: boolean };

const monthOf = (value: string) => (/^\d{4}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 7));

/**
 * What left the shelf (or was bought) for each site in one month, in dollars.
 * Taken and picked items count; returned ones come off. "Office use" is its
 * own line. Months are the office's (US Eastern).
 */
export async function monthSpend(month: string): Promise<{ month: string; rows: SpendRow[]; total: number }> {
  const m = monthOf(month);
  const sql = getSql();
  const rows = (await sql`
    WITH spend AS (
      SELECT account_id, account_name, sum(-qty * COALESCE(unit_cost, 0)) AS amount, sum(-qty) AS items
      FROM supply_moves
      -- 'send': sent to a site from the office shelf (the two shelves, migration 038).
      WHERE kind IN ('take', 'return', 'pick', 'send') AND to_char(created_at AT TIME ZONE 'America/New_York', 'YYYY-MM') = ${m}
      GROUP BY account_id, account_name
      UNION ALL
      SELECT COALESCE(account_ref, btrim(account_id_raw)), btrim(account_name), sum(COALESCE(unit_cost, 0) * NULLIF(regexp_replace(quantity_raw, '[^0-9]', '', 'g'), '')::int), sum(NULLIF(regexp_replace(quantity_raw, '[^0-9]', '', 'g'), '')::int)
      FROM sub_supply_orders
      WHERE line_source = 'buy' AND step IN ('bought', 'delivered') AND btrim(account_name) <> ${SHELF_RESTOCK}
        AND to_char(COALESCE(step_at, created_at) AT TIME ZONE 'America/New_York', 'YYYY-MM') = ${m}
      GROUP BY 1, 2
    )
    SELECT s.account_id, s.account_name, sum(s.amount)::text AS amount, sum(s.items)::int AS items,
           COALESCE(a.mode, 'included') AS mode, (i.account_id IS NOT NULL) AS invoiced
    FROM spend s
    LEFT JOIN supply_account_modes a ON a.account_id = s.account_id AND s.account_id <> ''
    LEFT JOIN supply_invoiced i ON i.account_id = s.account_id AND i.month = ${m} AND s.account_id <> ''
    GROUP BY s.account_id, s.account_name, a.mode, i.account_id
    HAVING sum(s.items) <> 0 OR sum(s.amount) <> 0
    ORDER BY sum(s.amount) DESC, s.account_name
  `) as { account_id: string | null; account_name: string; amount: string | null; items: number | null; mode: "included" | "billed"; invoiced: boolean }[];
  const out = rows.map((row) => ({ accountId: text(row.account_id), accountName: row.account_name || OFFICE_USE, amount: money(row.amount ?? 0), items: row.items ?? 0, mode: row.mode, invoiced: row.invoiced }));
  return { month: m, rows: out, total: money(out.reduce((sum, row) => sum + row.amount, 0)) };
}

/** "Supplies included" (the default) or "Supplies billed to customer", per account. */
export async function getAccountSupplyMode(accountId: string): Promise<"included" | "billed"> {
  const rows = (await getSql()`SELECT mode FROM supply_account_modes WHERE account_id = ${accountId}`) as { mode: "included" | "billed" }[];
  return rows[0]?.mode ?? "included";
}

export async function setAccountSupplyMode(accountId: string, accountName: string, mode: "included" | "billed", by: string): Promise<void> {
  if (!text(accountId)) throw new Error("That account has no id.");
  await getSql()`
    INSERT INTO supply_account_modes (account_id, account_name, mode, updated_by) VALUES (${accountId}, ${accountName}, ${mode}, ${by})
    ON CONFLICT (account_id) DO UPDATE SET account_name = EXCLUDED.account_name, mode = EXCLUDED.mode, updated_by = EXCLUDED.updated_by, updated_at = now()
  `;
}

/** "Mark invoiced" (true) or take the mark off (false) for one billed account and month. */
export async function markInvoiced(accountId: string, month: string, amount: number, on: boolean, by: string): Promise<void> {
  const m = monthOf(month);
  const sql = getSql();
  if (!text(accountId)) throw new Error("That account has no id.");
  if (on) {
    await sql`
      INSERT INTO supply_invoiced (account_id, month, amount, invoiced_by) VALUES (${accountId}, ${m}, ${money(amount)}, ${by})
      ON CONFLICT (account_id, month) DO UPDATE SET amount = EXCLUDED.amount, invoiced_by = EXCLUDED.invoiced_by, invoiced_at = now()
    `;
  } else {
    await sql`DELETE FROM supply_invoiced WHERE account_id = ${accountId} AND month = ${m}`;
  }
}

/* ---------- settings ---------- */

export async function getSupplySettings(): Promise<{ autoApproveAmount: number }> {
  const rows = (await getSql()`SELECT auto_approve_amount::text AS amount FROM supply_control_settings WHERE id`) as { amount: string }[];
  return { autoApproveAmount: money(rows[0]?.amount ?? 50) };
}

export async function saveSupplySettings(autoApproveAmount: unknown, by: string): Promise<{ autoApproveAmount: number }> {
  const amount = money(autoApproveAmount);
  if (text(autoApproveAmount) === "" || amount < 0 || amount > 100000) throw new Error("Type an amount in dollars, 0 or more.");
  await getSql()`
    INSERT INTO supply_control_settings (id, auto_approve_amount, updated_by) VALUES (true, ${amount}, ${by})
    ON CONFLICT (id) DO UPDATE SET auto_approve_amount = EXCLUDED.auto_approve_amount, updated_by = EXCLUDED.updated_by, updated_at = now()
  `;
  return { autoApproveAmount: amount };
}

/* ---------- orders: from the shelf, or bought and shipped direct ---------- */

type LineRow = {
  sheet_row: number;
  order_id: string;
  order_group_id: string;
  ordered_on: string | Date | null;
  account_ref: string | null;
  account_id_raw: string;
  account_name: string;
  supply_item: string;
  quantity_raw: string;
  unit: string;
  line_source: string;
  step: string;
  unit_cost: string | null;
  ordered_by: string;
  po_number: string;
  notes: string;
};

const qtyOf = (raw: string) => Number(String(raw).replace(/[^0-9]/g, "")) || 0;

function toLine(row: LineRow): OrderLine {
  const quantity = qtyOf(row.quantity_raw);
  return {
    rowNumber: row.sheet_row,
    orderId: row.order_id.trim(),
    groupId: row.order_group_id.trim(),
    day: row.ordered_on ? iso(row.ordered_on).slice(0, 10) : "",
    accountId: text(row.account_ref) || row.account_id_raw.trim(),
    accountName: row.account_name.trim(),
    item: row.supply_item.trim(),
    quantity,
    unit: row.unit.trim(),
    source: row.line_source,
    step: row.step,
    cost: money(quantity * money(row.unit_cost ?? 0)),
    orderedBy: row.ordered_by,
    poNumber: row.po_number,
    notes: row.notes.trim(),
  };
}

const SELECT_LINE = `SELECT sheet_row, order_id, order_group_id, ordered_on, account_ref, account_id_raw, account_name, supply_item, quantity_raw, unit, line_source, step, unit_cost::text, ordered_by, po_number, notes FROM sub_supply_orders`;

/** Order lines made with supply control that are not delivered yet, plus the last 30 delivered. */
export async function listOrderLines(): Promise<{ open: OrderLine[]; done: OrderLine[] }> {
  const sql = getSql();
  const [open, done] = await Promise.all([
    sql.query(`${SELECT_LINE} WHERE line_source <> '' AND step <> 'delivered' ORDER BY sheet_row DESC`),
    sql.query(`${SELECT_LINE} WHERE line_source <> '' AND step = 'delivered' ORDER BY step_at DESC NULLS LAST LIMIT 30`),
  ]);
  return { open: (open as LineRow[]).map(toLine), done: (done as LineRow[]).map(toLine) };
}

/**
 * A manager (or the office) orders for a site. Each line is "shelf" or
 * "buy". An order worth the auto-approve amount or less starts Approved.
 * The lines are ordinary supply orders too, so they show on the Supply
 * Orders page and in the Board's Supplies box like any other order.
 */
export async function createControlledOrder(input: {
  accountId: string;
  accountName: string;
  lines: { supplyId: number; qty: number; source: "shelf" | "buy" }[];
  orderedBy: string;
  notes?: string;
}): Promise<{ groupId: string; approved: boolean; total: number; lines: number }> {
  const lines = input.lines.filter((line) => Number.isInteger(line.supplyId) && Number.isInteger(line.qty) && line.qty > 0 && line.qty <= 500);
  if (lines.length === 0) throw new Error("Pick at least one item.");
  if (!text(input.accountName)) throw new Error("Pick the site it is for.");
  const sql = getSql();
  const items = (await sql`SELECT id, supply_item, category, unit, unit_cost::text FROM sub_supplies WHERE id = ANY(${lines.map((line) => line.supplyId)}::bigint[])`) as { id: string | number; supply_item: string; category: string; unit: string; unit_cost: string | null }[];
  const byId = new Map(items.map((item) => [Number(item.id), item]));
  if (lines.some((line) => !byId.has(line.supplyId))) throw new Error("One of those items is not on the list any more.");
  const total = money(lines.reduce((sum, line) => sum + line.qty * money(byId.get(line.supplyId)!.unit_cost ?? 0), 0));
  const { autoApproveAmount } = await getSupplySettings();
  const approved = total <= autoApproveAmount;
  const groupId = `SC-${Date.now().toString(36).toUpperCase()}`;
  for (const line of lines) {
    const item = byId.get(line.supplyId)!;
    const made = await createSupplyOrder({
      supplyItem: item.supply_item.trim(),
      category: item.category,
      quantity: String(line.qty),
      unit: item.unit,
      accountName: input.accountName,
      accountId: input.accountId,
      subcontractor: input.orderedBy,
      orderGroupId: groupId,
      deliveryMode: line.source === "shelf" ? "From shelf" : "Buy / ship direct",
      notes: text(input.notes),
      status: approved ? "Approved" : "New",
    });
    await sql`
      UPDATE sub_supply_orders SET line_source = ${line.source}, step = ${approved ? "approved" : "ordered"}, unit_cost = ${item.unit_cost === null ? null : money(item.unit_cost)},
        ordered_by = ${input.orderedBy}, step_by = ${approved ? "Auto-approved" : input.orderedBy}, step_at = now()
      WHERE sheet_row = ${made.rowNumber}
    `;
  }
  return { groupId, approved, total, lines: lines.length };
}

const STATUS_OF_STEP: Record<string, string> = { ordered: "New", approved: "Approved", picked: "Picked", bought: "Bought", delivered: "Delivered" };

/**
 * Moves one order line to its next step. Picking a shelf line takes it off
 * the shelf (and charges the site); delivering a shelf-restock purchase puts
 * it on the shelf. A step can only move forward, one line at a time.
 */
export async function advanceOrderLine(rowNumber: number, toStep: string, by: string): Promise<OrderLine> {
  const sql = getSql();
  const rows = (await sql.query(`${SELECT_LINE} WHERE sheet_row = $1 AND line_source <> ''`, [rowNumber])) as LineRow[];
  if (rows.length === 0) throw new Error("That order line was not found.");
  const line = toLine(rows[0]);
  const allowed: Record<string, string[]> = {
    ordered: ["approved"],
    approved: [line.source === "shelf" ? "picked" : "bought"],
    picked: ["delivered"],
    bought: ["delivered"],
  };
  if (!(allowed[line.step] ?? []).includes(toStep)) throw new Error("That step does not come next for this line.");
  // The product by its ID (migration 038), else by name as before (older lines).
  const byId = (await sql`
    SELECT s.id, s.unit_cost::text FROM sub_supplies s
    WHERE s.id = (SELECT to_jsonb(o) ->> 'supply_id' FROM sub_supply_orders o WHERE o.sheet_row = ${rowNumber})::bigint
  `.catch(() => [])) as { id: string | number; unit_cost: string | null }[];
  const item = byId.length > 0 ? byId : ((await sql`SELECT id, unit_cost::text FROM sub_supplies WHERE lower(btrim(supply_item)) = lower(${line.item}) ORDER BY id LIMIT 1`) as { id: string | number; unit_cost: string | null }[]);
  const statements = [
    sql`UPDATE sub_supply_orders SET step = ${toStep}, status = ${STATUS_OF_STEP[toStep]}, step_by = ${by}, step_at = now(), updated_at = now() WHERE sheet_row = ${rowNumber}`,
  ];
  const unitCost = rows[0].unit_cost === null ? null : money(rows[0].unit_cost);
  if (item[0] && toStep === "picked") {
    statements.push(
      sql`UPDATE sub_supplies SET shelf_count = COALESCE(shelf_count, 0) - ${line.quantity}, updated_at = now() WHERE id = ${Number(item[0].id)}`,
      sql`
        INSERT INTO supply_moves (supply_id, item_name, qty, kind, account_id, account_name, unit_cost, staff_name, order_id, note)
        VALUES (${Number(item[0].id)}, ${line.item}, ${-line.quantity}, 'pick', ${line.accountId}, ${line.accountName}, ${unitCost}, ${by}, ${line.orderId}, 'Picked for an order')
      `
    );
  }
  if (item[0] && toStep === "delivered" && line.source === "buy" && line.accountName === SHELF_RESTOCK) {
    statements.push(
      sql`UPDATE sub_supplies SET shelf_count = COALESCE(shelf_count, 0) + ${line.quantity}, updated_at = now() WHERE id = ${Number(item[0].id)}`,
      sql`
        INSERT INTO supply_moves (supply_id, item_name, qty, kind, account_name, unit_cost, staff_name, order_id, note)
        VALUES (${Number(item[0].id)}, ${line.item}, ${line.quantity}, 'receive', ${SHELF_RESTOCK}, ${unitCost}, ${by}, ${line.orderId}, 'Purchase order received')
      `
    );
  }
  await sql.transaction(statements);
  return { ...line, step: toStep };
}

/* ---------- the red Reorder list ---------- */

/**
 * One tap on a low item: a purchase order ("buy") that refills the shelf up
 * to twice its minimum. It is skipped when one is already on its way.
 */
export async function reorderItem(supplyId: number, by: string): Promise<{ made: boolean; qty: number }> {
  const sql = getSql();
  const rows = (await sql`SELECT id, supply_item, category, unit, unit_cost::text, min_level, shelf_count, vendor FROM sub_supplies WHERE id = ${supplyId}`) as (ShelfRow & { supply_item: string })[];
  if (rows.length === 0) throw new Error("That item was not found.");
  const item = toShelf({ ...rows[0], photo_url: "", shelf_location: "" });
  const waiting = (await sql`
    SELECT 1 FROM sub_supply_orders WHERE line_source = 'buy' AND step <> 'delivered' AND btrim(account_name) = ${SHELF_RESTOCK} AND lower(btrim(supply_item)) = lower(${item.name}) LIMIT 1
  `) as unknown[];
  if (waiting.length > 0) return { made: false, qty: 0 };
  const qty = Math.max(1, (item.minLevel ?? 1) * 2 - (item.shelfCount ?? 0));
  await createControlledOrder({ accountId: "", accountName: SHELF_RESTOCK, lines: [{ supplyId, qty, source: "buy" }], orderedBy: by, notes: item.vendor ? `Vendor: ${item.vendor}` : "" });
  return { made: true, qty };
}

/* ---------- the weekly count ---------- */

/** The Monday of the office's current week, YYYY-MM-DD. */
export function weekStart(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const day = new Date(Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day"))));
  const back = (["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 7) % 7;
  day.setUTCDate(day.getUTCDate() - back);
  return day.toISOString().slice(0, 10);
}

export type CountAsk = { supplyId: number; name: string; photoUrl: string; unit: string; shelfLocation: string; counted: number | null };

/**
 * This week's five items to count. They are picked the first time anyone
 * asks in a week: the items counted longest ago first. Already counted ones
 * come back with their number, so the tablet knows the count is done.
 */
export async function weeklyCount(): Promise<{ week: string; asks: CountAsk[]; done: boolean }> {
  const sql = getSql();
  const week = weekStart();
  await sql.query(
    `INSERT INTO supply_count_asks (week_start, supply_id, expected)
     SELECT $1::date, s.id, s.shelf_count
     FROM sub_supplies s
     LEFT JOIN LATERAL (SELECT max(counted_at) AS last FROM supply_count_asks a WHERE a.supply_id = s.id AND a.counted_at IS NOT NULL) c ON true
     WHERE ${ACTIVE_ITEM.replace(/supply_item|status|active_raw/g, (column) => `s.${column}`)}
       AND NOT EXISTS (SELECT 1 FROM supply_count_asks w WHERE w.week_start = $1::date)
     ORDER BY c.last ASC NULLS FIRST, s.id
     LIMIT 5
     ON CONFLICT DO NOTHING`,
    [week]
  );
  const rows = (await sql`
    SELECT a.supply_id, s.supply_item, s.photo_url, s.unit, s.shelf_location, a.counted
    FROM supply_count_asks a JOIN sub_supplies s ON s.id = a.supply_id
    WHERE a.week_start = ${week}::date ORDER BY lower(s.supply_item)
  `) as { supply_id: string | number; supply_item: string; photo_url: string; unit: string; shelf_location: string; counted: number | null }[];
  const asks = rows.map((row) => ({ supplyId: Number(row.supply_id), name: row.supply_item.trim(), photoUrl: row.photo_url, unit: row.unit, shelfLocation: row.shelf_location, counted: row.counted }));
  return { week, asks, done: asks.length > 0 && asks.every((ask) => ask.counted !== null) };
}

/** Saves the counted numbers. A number different from the shelf count is logged and becomes the shelf count. */
export async function saveWeeklyCount(counts: { supplyId: number; counted: number }[], staffName: string): Promise<{ different: number }> {
  const sql = getSql();
  const week = weekStart();
  let different = 0;
  for (const entry of counts) {
    if (!Number.isInteger(entry.supplyId) || !Number.isInteger(entry.counted) || entry.counted < 0 || entry.counted > 99999) continue;
    const rows = (await sql`
      SELECT s.supply_item, s.shelf_count, s.unit_cost::text FROM supply_count_asks a JOIN sub_supplies s ON s.id = a.supply_id
      WHERE a.week_start = ${week}::date AND a.supply_id = ${entry.supplyId} AND a.counted IS NULL
    `) as { supply_item: string; shelf_count: number | null; unit_cost: string | null }[];
    if (rows.length === 0) continue;
    const before = rows[0].shelf_count;
    const statements = [sql`UPDATE supply_count_asks SET counted = ${entry.counted}, expected = ${before}, staff_name = ${staffName}, counted_at = now() WHERE week_start = ${week}::date AND supply_id = ${entry.supplyId}`];
    if (before === null || before !== entry.counted) {
      if (before !== null) different++;
      statements.push(
        sql`UPDATE sub_supplies SET shelf_count = ${entry.counted}, updated_at = now() WHERE id = ${entry.supplyId}`,
        sql`
          INSERT INTO supply_moves (supply_id, item_name, qty, kind, account_name, unit_cost, staff_name, note)
          VALUES (${entry.supplyId}, ${rows[0].supply_item.trim()}, ${entry.counted - (before ?? 0)}, 'count', '', ${rows[0].unit_cost === null ? null : money(rows[0].unit_cost)}, ${staffName},
                  ${before === null ? "Weekly count: first count" : `Weekly count: shelf said ${before}, counted ${entry.counted}`})
        `
      );
    }
    await sql.transaction(statements);
  }
  return { different };
}
