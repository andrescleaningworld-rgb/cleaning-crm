// Supplies and Supply Orders on Postgres (sub_supplies, sub_supply_orders).
//
// Until now both lists lived behind Apps Script only. The two list
// functions rebuild the Apps Script answers (getSupplyItemsAdmin,
// getSupplyOrders) key for key, checked against the live answers by
// scripts/migrate/check-supplies-apps-script.mts. The save functions do what
// the screens ask for; the Apps Script source is not in this repo, so the
// columns they fill are a careful reading of the sheet, not a copy of code.
//
// Team Hub's supply_items / supply_orders are a different catalog and are
// not read or written here.

import { getSql } from "@/lib/db";

type SupplyRow = {
  supply_item: string;
  category: string;
  description: string;
  unit: string;
  status: string;
  notes: string;
  active_raw: string;
  sheet_row: number;
};

export type SupplyItemAdmin = {
  id: string;
  itemName: string;
  name: string;
  description: string;
  itemDescription: string;
  details: string;
  notes: string;
  category: string;
  unit: string;
  status: string;
  rowNumber: number;
};

/** "10/8/2026 14:05:09", the way the sheet shows a date-time (US Eastern). */
function sheetStamp(now = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return `${parts.month}/${parts.day}/${parts.year} ${Number(parts.hour)}:${parts.minute}:${parts.second}`;
}

/** YYYY-MM-DD from "M/D/YYYY …" or "YYYY-MM-DD…"; null when the text is not a date. */
function toDay(text: string): string | null {
  const value = String(text ?? "").trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(value);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

const text = (value: unknown) => String(value ?? "").trim();

/** Status as the list shows it: the Status cell, else worked out from Active, else "Active". */
function shownStatus(row: SupplyRow): string {
  const status = row.status.trim();
  if (status) return status;
  const active = row.active_raw.trim().toLowerCase();
  if (["no", "false", "inactive", "n", "disabled", "removed"].includes(active)) return "Inactive";
  return "Active";
}

// ─── Supplies ────────────────────────────────────────────────────────────────

/** The getSupplyItemsAdmin list: every row of the catalog, in sheet order. */
export async function getSupplyItemsAdminShape(): Promise<SupplyItemAdmin[]> {
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT supply_item, category, description, unit, status, notes, active_raw, sheet_row
     FROM sub_supplies WHERE btrim(supply_item) <> '' ORDER BY sheet_row`
  )) as SupplyRow[];
  return rows.map((row) => {
    const name = row.supply_item.trim();
    const description = row.description.trim();
    return {
      id: `SUP-${row.sheet_row}`,
      itemName: name,
      name,
      description,
      itemDescription: description,
      details: description,
      // Apps Script answers the description here when the Notes cell is empty.
      notes: row.notes.trim() || description,
      category: row.category.trim(),
      unit: row.unit.trim(),
      status: shownStatus(row),
      rowNumber: row.sheet_row,
    };
  });
}

type SupplyBody = Record<string, unknown>;

function supplyFields(body: SupplyBody) {
  const active = text(body.active).toLowerCase();
  return {
    name: text(body.supplyItem) || text(body.itemName) || text(body.name),
    category: text(body.category),
    description: text(body.description) || text(body.itemDescription),
    unit: text(body.unit),
    status: text(body.status),
    notes: text(body.notes),
    active: active === "no" || active === "false" ? "no" : "yes",
    currentStock: text(body.currentStock),
    minimumStock: text(body.minimumStock),
  };
}

/** The row an edit means: the row number, else the number in "SUP-<row>". */
function supplyRowOf(body: SupplyBody): number | null {
  const direct = Number(body.rowNumber);
  if (Number.isInteger(direct) && direct > 1) return direct;
  const m = /^SUP-(\d+)$/i.exec(text(body.supplyId) || text(body.id));
  return m ? Number(m[1]) : null;
}

export async function addSupplyItem(body: SupplyBody, updatedBy = ""): Promise<{ id: string; rowNumber: number }> {
  const f = supplyFields(body);
  if (!f.name) throw new Error("Supply item name is required.");
  const sql = getSql();
  const rows = (await sql.query(
    `WITH next AS (SELECT COALESCE(MAX(sheet_row), 1) + 1 AS n FROM sub_supplies)
     INSERT INTO sub_supplies (legacy_key, supply_item, category, description, unit, status, notes, active_raw,
       current_stock_raw, minimum_stock_raw, last_updated_raw, updated_by, sheet_row)
     SELECT 'pg-SUP-' || next.n::text, $1::text, $2::text, $3::text, $4::text, $5::text, $6::text, $7::text, $8::text, $9::text, $10::text, $11::text, next.n
     FROM next RETURNING sheet_row`,
    [f.name, f.category, f.description, f.unit, f.status, f.notes, f.active, f.currentStock, f.minimumStock, sheetStamp(), updatedBy]
  )) as { sheet_row: number }[];
  return { id: `SUP-${rows[0].sheet_row}`, rowNumber: rows[0].sheet_row };
}

// The list the screen edits from does not carry the stock numbers (the Apps
// Script list never did), so the edit form sends them empty: an empty stock
// value leaves the stored one alone instead of erasing it.
export async function updateSupplyItem(body: SupplyBody, updatedBy = ""): Promise<void> {
  const row = supplyRowOf(body);
  const f = supplyFields(body);
  if (!f.name) throw new Error("Supply item name is required.");
  const sql = getSql();
  const updated = row
    ? ((await sql.query(
        `UPDATE sub_supplies SET supply_item = $2::text, category = $3::text, description = $4::text, unit = $5::text, status = $6::text,
           notes = $7::text, active_raw = $8::text,
           current_stock_raw = CASE WHEN $9::text = '' THEN current_stock_raw ELSE $9::text END,
           minimum_stock_raw = CASE WHEN $10::text = '' THEN minimum_stock_raw ELSE $10::text END,
           last_updated_raw = $11::text, updated_by = $12::text, updated_at = now()
         WHERE sheet_row = $1::int RETURNING sheet_row`,
        [row, f.name, f.category, f.description, f.unit, f.status, f.notes, f.active, f.currentStock, f.minimumStock, sheetStamp(), updatedBy]
      )) as unknown[])
    : [];
  if (updated.length === 0) throw new Error("Could not find supply item to update.");
}

/** Takes an item off the active list. Nothing is deleted. */
export async function deactivateSupplyItem(body: SupplyBody, updatedBy = ""): Promise<void> {
  const row = supplyRowOf(body);
  const sql = getSql();
  const updated = row
    ? ((await sql.query(
        `UPDATE sub_supplies SET status = 'Inactive', active_raw = 'no', last_updated_raw = $2::text, updated_by = $3::text, updated_at = now()
         WHERE sheet_row = $1::int RETURNING sheet_row`,
        [row, sheetStamp(), updatedBy]
      )) as unknown[])
    : [];
  if (updated.length === 0) throw new Error("Could not find supply item to remove.");
}

// ─── Supply orders ───────────────────────────────────────────────────────────

type OrderRow = {
  timestamp_raw: string;
  order_id: string;
  order_group_id: string;
  subcontractor: string;
  subcontractor_email: string;
  account_name: string;
  account_id_raw: string;
  supply_item: string;
  category: string;
  description: string;
  quantity_raw: string;
  unit: string;
  delivery_mode: string;
  status: string;
  notes: string;
  sheet_row: number;
};

export type SupplyOrderRow = {
  rowNumber: number;
  timestamp: string;
  orderId: string;
  id: string;
  orderGroupId: string;
  subcontractor: string;
  subcontractorName: string;
  subcontractorEmail: string;
  accountName: string;
  accountId: string;
  supplyItem: string;
  item: string;
  category: string;
  description: string;
  quantity: string;
  unit: string;
  deliveryMode: string;
  status: string;
  notes: string;
};

/** The getSupplyOrders list: one row per ordered item, newest first. */
export async function getSupplyOrdersShape(): Promise<SupplyOrderRow[]> {
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT timestamp_raw, order_id, order_group_id, subcontractor, subcontractor_email, account_name, account_id_raw, supply_item,
            category, description, quantity_raw, unit, delivery_mode, status, notes, sheet_row
     FROM sub_supply_orders ORDER BY sheet_row DESC`
  )) as OrderRow[];
  return rows.map((row) => ({
    rowNumber: row.sheet_row,
    timestamp: toDay(row.timestamp_raw) ?? row.timestamp_raw.trim(),
    orderId: row.order_id.trim(),
    id: row.order_id.trim(),
    orderGroupId: row.order_group_id.trim(),
    subcontractor: row.subcontractor.trim(),
    subcontractorName: row.subcontractor.trim(),
    subcontractorEmail: row.subcontractor_email.trim(),
    accountName: row.account_name.trim(),
    accountId: row.account_id_raw.trim(),
    supplyItem: row.supply_item.trim(),
    item: row.supply_item.trim(),
    category: row.category.trim(),
    description: row.description.trim(),
    quantity: row.quantity_raw.trim(),
    unit: row.unit.trim(),
    deliveryMode: row.delivery_mode.trim(),
    status: row.status.trim(),
    notes: row.notes.trim(),
  }));
}

export type NewSupplyOrder = {
  orderId: string;
  rowNumber: number;
  timestamp: string;
  subcontractor: string;
  subcontractorEmail: string;
  accountName: string;
  accountId: string;
  supplyItem: string;
  quantity: string;
  unit: string;
  deliveryMode: string;
  notes: string;
  status: string;
};

/**
 * Adds one ordered item. The email columns start empty; the caller sends the
 * office email and then calls markSupplyOrderEmail.
 */
export async function createSupplyOrder(body: Record<string, unknown>): Promise<NewSupplyOrder> {
  const supplyItem = text(body.supplyItem) || text(body.itemName) || text(body.item);
  if (!supplyItem) throw new Error("Supply item is required.");
  const stamp = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  // Same format as the sheet's order ids ("SUPORD-20260819152856").
  const base = `SUPORD-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}`;
  const order = {
    timestamp: sheetStamp(stamp),
    subcontractor: text(body.subcontractor) || text(body.subcontractorName) || text(body.requestedBy),
    subcontractorEmail: text(body.subcontractorEmail),
    accountName: text(body.accountName),
    accountId: text(body.accountId),
    supplyItem,
    quantity: text(body.quantity),
    unit: text(body.unit),
    deliveryMode: text(body.deliveryMode),
    notes: text(body.notes),
    status: text(body.status) || "New",
  };

  const sql = getSql();
  // Several items of one order arrive in the same second: a later one gets "-2", "-3" … so every row has its own id.
  const rows = (await sql.query(
    `WITH next AS (SELECT COALESCE(MAX(sheet_row), 1) + 1 AS n FROM sub_supply_orders),
          taken AS (SELECT count(*)::int AS c FROM sub_supply_orders WHERE order_id = $1::text OR order_id LIKE $1::text || '-%')
     INSERT INTO sub_supply_orders (legacy_key, timestamp_raw, ordered_on, order_id, order_group_id, subcontractor, subcontractor_email, subcontractor_id,
       account_name, account_id_raw, account_ref, supply_item, category, description, quantity_raw, unit, delivery_mode, notes, status, sheet_row)
     SELECT
       'pg-' || $1::text || '-' || next.n::text,
       $2::text, $3::date,
       CASE WHEN taken.c = 0 THEN $1::text ELSE $1::text || '-' || (taken.c + 1)::text END,
       $4::text, $5::text, $6::text,
       (SELECT CASE WHEN count(*) = 1 THEN min(id) END FROM subcontractors WHERE btrim($6::text) <> '' AND lower(btrim(email)) = lower(btrim($6::text))),
       $7::text, $8::text,
       COALESCE(
         (SELECT id FROM accounts WHERE btrim($8::text) <> '' AND id = btrim($8::text) LIMIT 1),
         (SELECT CASE WHEN count(*) = 1 THEN min(id) END FROM accounts WHERE btrim($7::text) <> '' AND lower(btrim(account_name)) = lower(btrim($7::text)))
       ),
       $9::text, $10::text, $11::text, $12::text, $13::text, $14::text, $15::text, $16::text, next.n
     FROM next, taken
     RETURNING order_id, sheet_row`,
    [
      base,
      order.timestamp,
      toDay(order.timestamp),
      text(body.orderGroupId),
      order.subcontractor,
      order.subcontractorEmail,
      order.accountName,
      order.accountId,
      order.supplyItem,
      text(body.category),
      text(body.description) || text(body.itemDescription),
      order.quantity,
      order.unit,
      order.deliveryMode,
      order.notes,
      order.status,
    ]
  )) as { order_id: string; sheet_row: number }[];
  return { ...order, orderId: rows[0].order_id, rowNumber: rows[0].sheet_row };
}

/** Records where the office email for an order row went and whether it was sent. */
export async function markSupplyOrderEmail(rowNumber: number, sentTo: string, status: string): Promise<void> {
  const sql = getSql();
  await sql.query(`UPDATE sub_supply_orders SET email_sent_to = $2::text, email_status = $3::text, updated_at = now() WHERE sheet_row = $1::int`, [
    rowNumber,
    sentTo,
    status,
  ]);
}

/** Changes the status of one order row, found by its row number, else by its order id. */
export async function updateSupplyOrderStatus(body: Record<string, unknown>): Promise<{ orderId: string; status: string }> {
  const status = text(body.status) || text(body.orderStatus);
  if (!status) throw new Error("Status is required.");
  const rowNumber = Number(body.rowNumber);
  const orderId = text(body.orderId) || text(body.id);
  const sql = getSql();
  let rows: { order_id: string }[] = [];
  if (Number.isInteger(rowNumber) && rowNumber > 1) {
    rows = (await sql.query(
      `UPDATE sub_supply_orders SET status = $2::text, updated_at = now()
       WHERE sheet_row = $1::int AND ($3::text = '' OR btrim(order_id) = $3::text) RETURNING order_id`,
      [rowNumber, status, orderId]
    )) as { order_id: string }[];
  }
  if (rows.length === 0 && orderId) {
    rows = (await sql.query(`UPDATE sub_supply_orders SET status = $2::text, updated_at = now() WHERE btrim(order_id) = $1::text RETURNING order_id`, [
      orderId,
      status,
    ])) as { order_id: string }[];
  }
  if (rows.length === 0) throw new Error("Could not find supply order to update.");
  return { orderId: rows[0].order_id.trim(), status };
}
