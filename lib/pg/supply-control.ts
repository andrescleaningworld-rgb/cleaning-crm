// The warehouse side of the supplies system (lib/pg/shelves.ts has the
// orders, deliveries and sites): each product's warehouse facts (cost,
// vendor, place on the shelf, minimum, count), the Supply Check tablet (take
// and return), the weekly count, the history, and each site's monthly spend.
// Migration 027 added what the warehouse needs. Postgres only.
//
// The old switch (FEATURE_SUPPLY_CONTROL) and this file's own order steps
// (shelf / buy lines, pick, restock orders, auto-approve) are gone: every
// order goes through the one inbox now (Supply Orders).
import { getSql } from "@/lib/db";
import { ACTIVE_ITEM } from "@/lib/pg/supply-active";
import { syncCrewItem } from "@/lib/pg/supply-list";
import { shelvesReady } from "@/lib/pg/shelves";

/* ---------- on / off ---------- */

/** On once this database has the whole supplies system (migrations 027 through 040). */
export async function supplyControlReady(): Promise<boolean> {
  return shelvesReady();
}

/* ---------- shapes ---------- */

/** Taken for the van or for general use: no site, no job. */
export const OFFICE_USE = "Van / general";
/** Purchase orders made by the old order steps to refill the warehouse; they are never a site. */
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
  accountId: string;
  accountName: string;
  cost: number;
  staffName: string;
  note: string;
  /** office | tablet | crew-link | sub-portal; "" = before migration 040. */
  source: string;
  at: string;
};

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
  input: { unit?: unknown; photoUrl?: unknown; unitCost?: unknown; vendor?: unknown; shelfLocation?: unknown; minLevel?: unknown; shelfCount?: unknown; reason?: unknown },
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
  // A changed count is an office edit: it needs a short reason (a first count does not).
  const reason = text(input.reason).slice(0, 200);
  if (count !== null && before[0].shelf_count !== null && count !== before[0].shelf_count && reason.length < 3) throw new Error("Write a short reason for the new count.");
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
      INSERT INTO supply_moves (supply_id, item_name, qty, kind, account_name, unit_cost, staff_name, note, source)
      VALUES (${id}, ${before[0].supply_item.trim()}, ${count - (before[0].shelf_count ?? 0)}, 'set', '', ${cost}, ${by}, ${before[0].shelf_count === null ? "Starting count" : `Count ${before[0].shelf_count} -> ${count}: ${reason}`}, 'office')
    `;
  }
}

/* ---------- taking and returning (the Supply Check tablet) ---------- */

export type TakeLine = { supplyId: number; qty: number };

/**
 * Someone takes items for an in-house job or the van, or brings them back.
 * (Taking for an account is a delivery: lib/pg/shelves.ts sendToSite.) The
 * warehouse count moves, and each line is logged with its cost, who, when and
 * where it was done. All lines together or none.
 */
export async function moveFromShelf(input: {
  kind: "take" | "return";
  lines: TakeLine[];
  accountId: string;
  accountName: string;
  staffId: string;
  staffName: string;
  note?: string;
  /** extra_jobs.id, when it was for that job. */
  extraJobId?: string;
  source?: "office" | "tablet";
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
        INSERT INTO supply_moves (supply_id, item_name, qty, kind, account_id, account_name, unit_cost, staff_id, staff_name, note, source, extra_job_id)
        VALUES (${line.supplyId}, ${item.supply_item.trim()}, ${sign * line.qty}, ${input.kind}, ${text(input.accountId)}, ${accountName}, ${unitCost}, ${text(input.staffId)}, ${text(input.staffName)}, ${text(input.note).slice(0, 200)}, ${input.source ?? "office"}, ${text(input.extraJobId)})
      `,
    ];
  });
  await sql.transaction(statements);
  return { items: lines.reduce((sum, line) => sum + line.qty, 0), cost: money(cost) };
}

type MoveRow = { id: string | number; item_name: string; qty: number; kind: string; account_id: string; account_name: string; unit_cost: string | null; staff_name: string; note: string; source: string; created_at: string | Date };

/** The newest moves: who, what, when, where it went and where it was done. One account's only, with `accountId`. */
export async function listMoves(limit = 60, accountId = ""): Promise<SupplyMove[]> {
  const one = text(accountId);
  const rows = (await getSql()`
    SELECT id, item_name, qty, kind, account_id, account_name, unit_cost::text, staff_name, note, source, created_at
    FROM supply_moves WHERE ${one} = '' OR account_id = ${one}
    ORDER BY created_at DESC, id DESC LIMIT ${Math.min(200, Math.max(1, limit))}
  `) as MoveRow[];
  return rows.map((row) => ({
    id: Number(row.id),
    itemName: row.item_name,
    qty: row.qty,
    kind: row.kind,
    accountId: row.account_id,
    accountName: row.account_name,
    cost: money(Math.abs(row.qty) * money(row.unit_cost ?? 0)),
    staffName: row.staff_name,
    note: row.note,
    source: row.source,
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
          INSERT INTO supply_moves (supply_id, item_name, qty, kind, account_name, unit_cost, staff_name, note, source)
          VALUES (${entry.supplyId}, ${rows[0].supply_item.trim()}, ${entry.counted - (before ?? 0)}, 'count', '', ${rows[0].unit_cost === null ? null : money(rows[0].unit_cost)}, ${staffName},
                  ${before === null ? "Weekly count: first count" : `Weekly count: shelf said ${before}, counted ${entry.counted}`}, 'tablet')
        `
      );
    }
    await sql.transaction(statements);
  }
  return { different };
}
