// Postgres versions of the equipment reads/writes in lib/googleSheets.ts
// (EquipmentCategories, Equipment, EquipmentCheckouts, EquipmentRepairs,
// EquipmentParts). Same function names, arguments, return shapes, ordering
// and error messages, so lib/data/equipment.ts can switch between the two.
//
// Every value the app reads back is kept as the text that was written
// (*_raw columns for dates, money and status); the typed columns next to
// them are filled on the side for reporting and are never read here.
//
// sheet_row is the row's position as the app sees it: imported rows keep
// their sheet row number, rows created here get the next one (where Sheets
// would have appended them). updateEquipmentCheckout addresses a row by it,
// exactly as the Sheets version does.

import { getSql } from "@/lib/db";
import type {
  EquipmentCategory,
  EquipmentCheckout,
  EquipmentHolderType,
  EquipmentItem,
  EquipmentPart,
  EquipmentRepair,
  EquipmentRepairStatus,
  EquipmentStatus,
  PartStockAdjustReason,
} from "@/lib/googleSheets";

// Same id shape as lib/googleSheets.ts: PREFIX-<last 8 chars of the UTC
// timestamp>-<4 random chars>.
function newId(prefix: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${stamp.slice(-8)}-${rand}`;
}

// The next row number for a table: after the last row, never before row 2
// (row 1 is the header in Sheets).
const nextRow = (table: string) => `(SELECT COALESCE(MAX(sheet_row), 1) + 1 FROM ${table})`;

/** ISO timestamp for the typed column, or null when the text is not a date. */
function toTimestamp(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** YYYY-MM-DD for the typed column, or null. */
function toDate(text: string): string | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text.trim());
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
}

function toNumber(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/* ---------- EquipmentCategories ---------- */

type CategoryRow = { id: string; name: string; active_raw: string; sheet_row: number };

export async function fetchEquipmentCategories(): Promise<EquipmentCategory[]> {
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT id, name, active_raw, sheet_row FROM equipment_categories ORDER BY sheet_row`
  )) as CategoryRow[];
  return rows
    .map((r) => ({
      sheetRow: r.sheet_row,
      id: r.id,
      name: r.name,
      active: r.active_raw.trim().toUpperCase() !== "NO",
    }))
    .filter((c) => c.id);
}

export async function appendEquipmentCategory(name: string): Promise<string> {
  const id = newId("CAT");
  const sql = getSql();
  await sql.query(
    `INSERT INTO equipment_categories (id, legacy_key, name, active_raw, active, sheet_row)
     VALUES ($1, $1, $2, 'Yes', TRUE, ${nextRow("equipment_categories")})`,
    [id, name]
  );
  return id;
}

export async function updateEquipmentCategory(
  id: string,
  fields: Partial<{ name: string; active: boolean }>
): Promise<void> {
  const targetId = id.trim();
  if (!targetId) throw new Error("Missing equipment category id.");

  const sql = getSql();
  const found = (await sql.query(`SELECT id FROM equipment_categories WHERE btrim(id) = $1 ORDER BY sheet_row LIMIT 1`, [
    targetId,
  ])) as { id: string }[];
  if (found.length === 0) throw new Error(`Equipment category "${targetId}" not found.`);

  const sets: string[] = [];
  const params: unknown[] = [found[0].id];
  if (fields.name !== undefined) {
    params.push(fields.name);
    sets.push(`name = $${params.length}`);
  }
  if (fields.active !== undefined) {
    params.push(fields.active ? "Yes" : "No", fields.active);
    sets.push(`active_raw = $${params.length - 1}`, `active = $${params.length}`);
  }
  if (sets.length === 0) return;

  await sql.query(`UPDATE equipment_categories SET ${sets.join(", ")}, updated_at = now() WHERE id = $1`, params);
}

/* ---------- Equipment ---------- */

type EquipmentRow = {
  id: string;
  name: string;
  category_id: string;
  serial_number: string;
  purchase_date_raw: string;
  purchase_cost_raw: string;
  status_raw: string;
  current_holder_type: string;
  current_holder_id: string;
  current_holder_name: string;
  condition_notes: string;
  photo_url: string;
  item_created_at_raw: string;
  checked_out_at_raw: string;
  expected_return_at_raw: string;
  needs_maintenance_review_raw: string;
  sheet_row: number;
};

function normalizeEquipmentStatus(value: string): EquipmentStatus {
  const trimmed = value.trim();
  if (trimmed === "Available" || trimmed === "CheckedOut" || trimmed === "InRepair" || trimmed === "Retired") {
    return trimmed;
  }
  return "Available";
}

function getOverdueThresholdDays(): number {
  const raw = Number(process.env.EQUIPMENT_OVERDUE_DEFAULT_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : 7;
}

function computeEquipmentOverdue(status: EquipmentStatus, checkedOutAt: string, expectedReturnAt: string): boolean {
  if (status !== "CheckedOut") return false;

  if (expectedReturnAt) {
    const expected = new Date(expectedReturnAt).getTime();
    return Number.isFinite(expected) && expected < Date.now();
  }

  if (!checkedOutAt) return false;
  const checkedOut = new Date(checkedOutAt).getTime();
  if (!Number.isFinite(checkedOut)) return false;

  const thresholdMs = getOverdueThresholdDays() * 24 * 60 * 60 * 1000;
  return Date.now() - checkedOut > thresholdMs;
}

function rowToEquipmentItem(r: EquipmentRow): EquipmentItem {
  const status = normalizeEquipmentStatus(r.status_raw);
  const holderType = r.current_holder_type.trim();
  return {
    sheetRow: r.sheet_row,
    id: r.id,
    name: r.name,
    categoryId: r.category_id,
    serialNumber: r.serial_number,
    purchaseDate: r.purchase_date_raw,
    purchaseCost: Number(r.purchase_cost_raw) || 0,
    status,
    currentHolderType: holderType === "InsideStaff" || holderType === "Sub" ? holderType : "",
    currentHolderId: r.current_holder_id,
    currentHolderName: r.current_holder_name,
    conditionNotes: r.condition_notes,
    photoUrl: r.photo_url,
    createdAt: r.item_created_at_raw,
    checkedOutAt: r.checked_out_at_raw,
    expectedReturnAt: r.expected_return_at_raw,
    needsMaintenanceReview: r.needs_maintenance_review_raw.trim().toUpperCase() === "YES",
    overdue: computeEquipmentOverdue(status, r.checked_out_at_raw, r.expected_return_at_raw),
  };
}

export async function fetchEquipmentList(): Promise<EquipmentItem[]> {
  const sql = getSql();
  const rows = (await sql.query(`SELECT * FROM equipment ORDER BY sheet_row`)) as EquipmentRow[];
  return rows.map(rowToEquipmentItem).filter((e) => e.id);
}

export async function getEquipmentById(id: string): Promise<EquipmentItem | null> {
  const targetId = id.trim();
  if (!targetId) return null;
  const items = await fetchEquipmentList();
  return items.find((e) => e.id === targetId) ?? null;
}

export async function appendEquipmentItem(data: {
  name: string;
  categoryId: string;
  serialNumber: string;
  purchaseDate: string;
  purchaseCost: number;
  conditionNotes: string;
  photoUrl: string;
}): Promise<string> {
  const id = newId("EQP");
  const costRaw = String(data.purchaseCost || 0);
  const createdRaw = new Date().toISOString();
  const sql = getSql();
  await sql.query(
    `INSERT INTO equipment (
       id, legacy_key, name, category_id, serial_number, purchase_date_raw, purchase_date,
       purchase_cost_raw, purchase_cost, status_raw, condition_notes, photo_url,
       item_created_at_raw, item_created_at, sheet_row)
     VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, 'Available', $9, $10, $11, $12, ${nextRow("equipment")})`,
    [
      id,
      data.name,
      data.categoryId,
      data.serialNumber,
      data.purchaseDate,
      toDate(data.purchaseDate),
      costRaw,
      toNumber(costRaw),
      data.conditionNotes,
      data.photoUrl,
      createdRaw,
      createdRaw,
    ]
  );
  return id;
}

// Field name → the text column it is written to, plus the typed column that
// follows it (if any).
const EQUIPMENT_FIELD_COLUMNS: Record<string, { column: string; typed?: { column: string; value: (text: string) => unknown } }> = {
  name: { column: "name" },
  categoryId: { column: "category_id" },
  serialNumber: { column: "serial_number" },
  purchaseDate: { column: "purchase_date_raw", typed: { column: "purchase_date", value: toDate } },
  purchaseCost: { column: "purchase_cost_raw", typed: { column: "purchase_cost", value: toNumber } },
  status: { column: "status_raw" },
  currentHolderType: { column: "current_holder_type" },
  currentHolderId: { column: "current_holder_id" },
  currentHolderName: { column: "current_holder_name" },
  conditionNotes: { column: "condition_notes" },
  photoUrl: { column: "photo_url" },
  checkedOutAt: { column: "checked_out_at_raw", typed: { column: "checked_out_at", value: toTimestamp } },
  expectedReturnAt: { column: "expected_return_at_raw", typed: { column: "expected_return_at", value: toTimestamp } },
  needsMaintenanceReview: { column: "needs_maintenance_review_raw" },
};

export async function updateEquipmentFields(
  id: string,
  fields: Partial<{
    name: string;
    categoryId: string;
    serialNumber: string;
    purchaseDate: string;
    purchaseCost: number;
    status: EquipmentStatus;
    currentHolderType: EquipmentHolderType | "";
    currentHolderId: string;
    currentHolderName: string;
    conditionNotes: string;
    photoUrl: string;
    checkedOutAt: string;
    expectedReturnAt: string;
    needsMaintenanceReview: boolean;
  }>
): Promise<void> {
  const targetId = id.trim();
  if (!targetId) throw new Error("Missing equipment id.");

  const sql = getSql();
  const found = (await sql.query(`SELECT id FROM equipment WHERE btrim(id) = $1 ORDER BY sheet_row LIMIT 1`, [targetId])) as {
    id: string;
  }[];
  if (found.length === 0) throw new Error(`Equipment "${targetId}" not found.`);

  const sets: string[] = [];
  const params: unknown[] = [found[0].id];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    const target = EQUIPMENT_FIELD_COLUMNS[key];
    if (!target) continue;
    const written = key === "needsMaintenanceReview" ? (value ? "Yes" : "No") : String(value);
    params.push(written);
    sets.push(`${target.column} = $${params.length}`);
    if (target.typed) {
      params.push(target.typed.value(written));
      sets.push(`${target.typed.column} = $${params.length}`);
    }
  }
  if (sets.length === 0) return;

  await sql.query(`UPDATE equipment SET ${sets.join(", ")}, updated_at = now() WHERE id = $1`, params);
}

/* ---------- EquipmentCheckouts ---------- */

type CheckoutRow = {
  id: string;
  equipment_id: string;
  holder_type: string;
  holder_id: string;
  holder_name: string;
  account_id: string;
  checked_out_at_raw: string;
  expected_return_at_raw: string;
  returned_at_raw: string;
  condition_at_checkout: string;
  condition_at_return: string;
  signed_out_by_staff_id: string;
  signed_out_by_staff_name: string;
  signed_in_by_staff_id: string;
  signed_in_by_staff_name: string;
  notes: string;
  work_order_number: string;
  sheet_row: number;
};

function rowToEquipmentCheckout(r: CheckoutRow): EquipmentCheckout {
  const holderType = r.holder_type.trim();
  return {
    sheetRow: r.sheet_row,
    id: r.id,
    equipmentId: r.equipment_id,
    holderType: holderType === "InsideStaff" || holderType === "Sub" ? holderType : "",
    holderId: r.holder_id,
    holderName: r.holder_name,
    accountId: r.account_id,
    checkedOutAt: r.checked_out_at_raw,
    expectedReturnAt: r.expected_return_at_raw,
    returnedAt: r.returned_at_raw,
    conditionAtCheckout: r.condition_at_checkout,
    conditionAtReturn: r.condition_at_return,
    signedOutByStaffId: r.signed_out_by_staff_id,
    signedOutByStaffName: r.signed_out_by_staff_name,
    signedInByStaffId: r.signed_in_by_staff_id,
    signedInByStaffName: r.signed_in_by_staff_name,
    notes: r.notes,
    workOrderNumber: r.work_order_number,
  };
}

async function allCheckouts(): Promise<EquipmentCheckout[]> {
  const sql = getSql();
  const rows = (await sql.query(`SELECT * FROM equipment_checkouts ORDER BY sheet_row`)) as CheckoutRow[];
  return rows.map(rowToEquipmentCheckout).filter((c) => c.id);
}

export async function fetchEquipmentCheckouts(equipmentId?: string): Promise<EquipmentCheckout[]> {
  const all = await allCheckouts();
  const filtered = equipmentId ? all.filter((c) => c.equipmentId === equipmentId) : all;
  return filtered.sort((a, b) => (b.checkedOutAt || "").localeCompare(a.checkedOutAt || ""));
}

export async function appendEquipmentCheckout(data: {
  equipmentId: string;
  holderType: EquipmentHolderType;
  holderId: string;
  holderName: string;
  accountId: string;
  checkedOutAt: string;
  expectedReturnAt: string;
  conditionAtCheckout: string;
  signedOutByStaffId: string;
  signedOutByStaffName: string;
  workOrderNumber: string;
}): Promise<string> {
  const id = newId("CHK");
  const sql = getSql();
  await sql.query(
    `INSERT INTO equipment_checkouts (
       id, legacy_key, equipment_id, holder_type, holder_id, holder_name, account_id,
       checked_out_at_raw, checked_out_at, expected_return_at_raw, expected_return_at,
       condition_at_checkout, signed_out_by_staff_id, signed_out_by_staff_name, work_order_number, sheet_row)
     VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, ${nextRow("equipment_checkouts")})`,
    [
      id,
      data.equipmentId,
      data.holderType,
      data.holderId,
      data.holderName,
      data.accountId,
      data.checkedOutAt,
      toTimestamp(data.checkedOutAt),
      data.expectedReturnAt,
      toTimestamp(data.expectedReturnAt),
      data.conditionAtCheckout,
      data.signedOutByStaffId,
      data.signedOutByStaffName,
      data.workOrderNumber,
    ]
  );
  return id;
}

export async function getOpenCheckoutForEquipment(equipmentId: string): Promise<EquipmentCheckout | null> {
  const open = (await allCheckouts())
    .filter((c) => c.equipmentId === equipmentId && !c.returnedAt)
    .sort((a, b) => b.sheetRow - a.sheetRow);
  return open[0] ?? null;
}

// Same targets as the Sheets version, including its quirk: the Sheets code
// writes signedInByStaffId / signedInByStaffName into columns L and M, which
// are the SignedOutBy columns (SignedInBy are N and O). So a return replaces
// who signed the item OUT with who signed it IN, and SignedInBy stays empty.
// Kept identical here on purpose; fixing it is a behavior change that waits
// for approval (see the Area 5 report).
export async function updateEquipmentCheckout(
  sheetRow: number,
  fields: Partial<{
    returnedAt: string;
    conditionAtReturn: string;
    signedInByStaffId: string;
    signedInByStaffName: string;
  }>
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [sheetRow];
  const set = (column: string, value: unknown) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };
  if (fields.returnedAt !== undefined) {
    set("returned_at_raw", fields.returnedAt);
    set("returned_at", toTimestamp(fields.returnedAt));
  }
  if (fields.conditionAtReturn !== undefined) set("condition_at_return", fields.conditionAtReturn);
  if (fields.signedInByStaffId !== undefined) set("signed_out_by_staff_id", fields.signedInByStaffId);
  if (fields.signedInByStaffName !== undefined) set("signed_out_by_staff_name", fields.signedInByStaffName);
  if (sets.length === 0) return;

  const sql = getSql();
  await sql.query(`UPDATE equipment_checkouts SET ${sets.join(", ")}, updated_at = now() WHERE sheet_row = $1`, params);
}

// For lib/data/people.ts: has this person ever signed equipment out or in?
export async function staffHasEquipmentCheckoutHistory(staffId: string): Promise<boolean> {
  const checkouts = await fetchEquipmentCheckouts();
  return checkouts.some((c) => c.signedOutByStaffId === staffId || c.signedInByStaffId === staffId);
}

/* ---------- EquipmentRepairs ---------- */

type RepairRow = {
  id: string;
  equipment_id: string;
  started_at_raw: string;
  completed_at_raw: string;
  description: string;
  cost_raw: string;
  performed_by: string;
  parts_used: string;
  status_raw: string;
  sheet_row: number;
};

function normalizeEquipmentRepairStatus(value: string): EquipmentRepairStatus {
  return value.trim() === "Completed" ? "Completed" : "Open";
}

function rowToEquipmentRepair(r: RepairRow): EquipmentRepair {
  return {
    sheetRow: r.sheet_row,
    id: r.id,
    equipmentId: r.equipment_id,
    startedAt: r.started_at_raw,
    completedAt: r.completed_at_raw,
    description: r.description,
    cost: Number(r.cost_raw) || 0,
    performedBy: r.performed_by,
    partsUsed: r.parts_used,
    status: normalizeEquipmentRepairStatus(r.status_raw),
  };
}

async function allRepairs(): Promise<EquipmentRepair[]> {
  const sql = getSql();
  const rows = (await sql.query(`SELECT * FROM equipment_repairs ORDER BY sheet_row`)) as RepairRow[];
  return rows.map(rowToEquipmentRepair).filter((rep) => rep.id);
}

export async function fetchEquipmentRepairs(equipmentId?: string): Promise<EquipmentRepair[]> {
  const all = await allRepairs();
  const filtered = equipmentId ? all.filter((rep) => rep.equipmentId === equipmentId) : all;
  return filtered.sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""));
}

export async function getOpenRepairForEquipment(equipmentId: string): Promise<EquipmentRepair | null> {
  const open = (await allRepairs())
    .filter((rep) => rep.equipmentId === equipmentId && rep.status === "Open")
    .sort((a, b) => b.sheetRow - a.sheetRow);
  return open[0] ?? null;
}

export async function appendEquipmentRepair(data: {
  equipmentId: string;
  description: string;
  cost?: number;
  performedBy?: string;
  partsUsed?: string;
  startedAt?: string;
}): Promise<string> {
  const id = newId("REP");
  const startedRaw = data.startedAt || new Date().toISOString();
  const costRaw = data.cost ? String(data.cost) : "";
  const sql = getSql();
  await sql.query(
    `INSERT INTO equipment_repairs (
       id, legacy_key, equipment_id, started_at_raw, started_at, description, cost_raw, cost,
       performed_by, parts_used, status_raw, sheet_row)
     VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, 'Open', ${nextRow("equipment_repairs")})`,
    [
      id,
      data.equipmentId,
      startedRaw,
      toTimestamp(startedRaw),
      data.description,
      costRaw,
      toNumber(costRaw),
      data.performedBy ?? "",
      data.partsUsed ?? "",
    ]
  );
  return id;
}

// Only ever used to mark a repair Completed (see the Sheets version).
export async function completeEquipmentRepair(
  equipmentId: string,
  repairId: string,
  fields: Partial<{ cost: number; performedBy: string; partsUsed: string }>
): Promise<void> {
  const sql = getSql();
  const found = (await sql.query(
    `SELECT id FROM equipment_repairs WHERE btrim(id) = $1 AND btrim(equipment_id) = $2 ORDER BY sheet_row LIMIT 1`,
    [repairId, equipmentId]
  )) as { id: string }[];
  if (found.length === 0) throw new Error(`Equipment repair "${repairId}" not found.`);

  const completedRaw = new Date().toISOString();
  const sets = ["completed_at_raw = $2", "completed_at = $3", "status_raw = 'Completed'"];
  const params: unknown[] = [found[0].id, completedRaw, completedRaw];
  if (fields.cost !== undefined) {
    params.push(String(fields.cost), fields.cost);
    sets.push(`cost_raw = $${params.length - 1}`, `cost = $${params.length}`);
  }
  if (fields.performedBy !== undefined) {
    params.push(fields.performedBy);
    sets.push(`performed_by = $${params.length}`);
  }
  if (fields.partsUsed !== undefined) {
    params.push(fields.partsUsed);
    sets.push(`parts_used = $${params.length}`);
  }

  await sql.query(`UPDATE equipment_repairs SET ${sets.join(", ")}, updated_at = now() WHERE id = $1`, params);
}

/* ---------- EquipmentParts ---------- */

type PartRow = {
  id: string;
  part_name: string;
  compatible_equipment_id: string;
  supplier: string;
  unit_cost_raw: string;
  stock_qty_raw: string;
  low_stock_threshold_raw: string;
  sheet_row: number;
};

export async function fetchEquipmentParts(): Promise<EquipmentPart[]> {
  const sql = getSql();
  const rows = (await sql.query(`SELECT * FROM equipment_parts ORDER BY sheet_row`)) as PartRow[];
  return rows
    .map((r) => {
      const stockQty = Number(r.stock_qty_raw) || 0;
      const lowStockThreshold = Number(r.low_stock_threshold_raw) || 0;
      return {
        sheetRow: r.sheet_row,
        id: r.id,
        partName: r.part_name,
        compatibleEquipmentId: r.compatible_equipment_id,
        supplier: r.supplier,
        unitCost: Number(r.unit_cost_raw) || 0,
        stockQty,
        lowStockThreshold,
        lowStock: stockQty <= lowStockThreshold,
      };
    })
    .filter((p) => p.id);
}

export async function appendEquipmentPart(data: {
  partName: string;
  compatibleEquipmentId: string;
  supplier: string;
  unitCost: number;
  stockQty: number;
  lowStockThreshold: number;
}): Promise<string> {
  const id = newId("PRT");
  const unitCost = String(data.unitCost || 0);
  const stockQty = String(data.stockQty || 0);
  const threshold = String(data.lowStockThreshold || 0);
  const sql = getSql();
  await sql.query(
    `INSERT INTO equipment_parts (
       id, legacy_key, part_name, compatible_equipment_id, supplier, unit_cost_raw, unit_cost,
       stock_qty_raw, stock_qty, low_stock_threshold_raw, low_stock_threshold, sheet_row)
     VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, ${nextRow("equipment_parts")})`,
    [id, data.partName, data.compatibleEquipmentId, data.supplier, unitCost, toNumber(unitCost), stockQty, toNumber(stockQty), threshold, toNumber(threshold)]
  );
  return id;
}

// delta is signed; the result never goes below 0. The reason is checked by
// the route and not stored, same as the Sheets version.
export async function adjustEquipmentPartStock(
  id: string,
  delta: number,
  reason: PartStockAdjustReason
): Promise<EquipmentPart> {
  void reason;
  const targetId = id.trim();
  if (!targetId) throw new Error("Missing equipment part id.");

  const sql = getSql();
  const found = (await sql.query(`SELECT id, stock_qty_raw FROM equipment_parts WHERE btrim(id) = $1 ORDER BY sheet_row LIMIT 1`, [
    targetId,
  ])) as { id: string; stock_qty_raw: string }[];
  if (found.length === 0) throw new Error(`Equipment part "${targetId}" not found.`);

  const currentQty = Number(found[0].stock_qty_raw) || 0;
  const newQty = Math.max(0, currentQty + delta);
  await sql.query(`UPDATE equipment_parts SET stock_qty_raw = $2, stock_qty = $3, updated_at = now() WHERE id = $1`, [
    found[0].id,
    String(newQty),
    newQty,
  ]);

  const parts = await fetchEquipmentParts();
  const updated = parts.find((p) => p.id === targetId);
  if (!updated) throw new Error(`Equipment part "${targetId}" not found after update.`);
  return updated;
}
