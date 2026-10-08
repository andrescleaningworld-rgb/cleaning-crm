// Postgres versions of the Staff and Managers reads/writes in
// lib/googleSheets.ts. Same names, arguments, return shapes, ordering and
// error messages, so lib/data/people.ts can switch between the two.

import { getSql } from "@/lib/db";
import type { Manager, Staff, StaffRole } from "@/lib/googleSheets";

const SHEET_ORDER = "source_row NULLS LAST, created_at, id";

// Same id shape as lib/googleSheets.ts (stampId / appendManager).
function newId(prefix: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${stamp.slice(-8)}-${rand}`;
}

/* ---------- Managers ---------- */

type ManagerRow = {
  manager_id: string;
  name: string;
  phone: string;
  status: string;
  calendar_color_id: string;
  row_no: number;
};

// Every row, including ones without a Manager ID, like the Sheets version.
// sheetRow is row_no: the stable number updateManager() addresses a row by.
export async function fetchManagers(): Promise<Manager[]> {
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT manager_id, name, phone, status, calendar_color_id, row_no FROM managers ORDER BY row_no`
  )) as ManagerRow[];
  return rows.map((row) => ({
    sheetRow: row.row_no,
    managerId: row.manager_id,
    name: row.name,
    phone: row.phone,
    status: row.status,
    calendarColorId: row.calendar_color_id,
  }));
}

export async function getManagerCalendarColorId(assignedTo: string): Promise<string | undefined> {
  const target = assignedTo.trim().toLowerCase();
  if (!target) return undefined;

  const managers = await fetchManagers();
  const match = managers.find((manager) => manager.name.trim().toLowerCase() === target);
  return match?.calendarColorId || undefined;
}

export async function appendManager(data: { name: string; phone: string; status: string }): Promise<string> {
  const sql = getSql();
  const managerId = newId("MGR");
  // row_no = next free number, where Sheets would have appended the row.
  // Row 1 is the header, so the first manager ever is row 2.
  await sql`
    INSERT INTO managers (legacy_key, manager_id, name, phone, status, row_no)
    SELECT ${managerId}, ${managerId}, ${data.name}, ${data.phone}, ${data.status}, COALESCE(MAX(row_no), 1) + 1
    FROM managers
  `;
  return managerId;
}

export async function updateManager(
  sheetRow: number,
  fields: Partial<{
    name: string;
    phone: string;
    status: string;
    calendarColorId: string;
  }>
): Promise<void> {
  if (Object.values(fields).every((value) => value === undefined)) return;

  const sql = getSql();
  // A row number that does not exist changes nothing, as in Sheets (which
  // would write into an empty row the app then never lists by id).
  await sql`
    UPDATE managers SET
      name              = COALESCE(${fields.name ?? null}, name),
      phone             = COALESCE(${fields.phone ?? null}, phone),
      status            = COALESCE(${fields.status ?? null}, status),
      calendar_color_id = COALESCE(${fields.calendarColorId ?? null}, calendar_color_id),
      updated_at        = now()
    WHERE row_no = ${sheetRow}
  `;
}

/* ---------- Staff ---------- */

type StaffRow = {
  id: string;
  name: string;
  role: StaffRole;
  active: boolean;
  source_row: number | null;
};

export async function fetchStaff(): Promise<Staff[]> {
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT id, name, role, active, source_row FROM staff ORDER BY ${SHEET_ORDER}`
  )) as StaffRow[];
  return rows.map((row) => ({
    sheetRow: row.source_row ?? 0,
    id: row.id,
    name: row.name,
    role: row.role,
    active: row.active,
  }));
}

export async function getStaffById(id: string): Promise<Staff | null> {
  const targetId = id.trim();
  if (!targetId) return null;
  const staff = await fetchStaff();
  return staff.find((s) => s.id === targetId) ?? null;
}

// Only an Active Staff record with Role Manager or OfficeStaff may authorize
// an equipment checkout/return.
export async function getActiveSigningStaffById(id: string): Promise<Staff | null> {
  const staff = await getStaffById(id);
  if (!staff || !staff.active) return null;
  if (staff.role !== "Manager" && staff.role !== "OfficeStaff") return null;
  return staff;
}

export async function appendStaff(data: { name: string; role: StaffRole; active: boolean }): Promise<string> {
  const sql = getSql();
  const id = newId("STF");
  await sql`
    INSERT INTO staff (id, legacy_key, name, role, role_raw, active)
    VALUES (${id}, ${id}, ${data.name}, ${data.role}, ${data.role}, ${data.active})
  `;
  return id;
}

export async function updateStaff(
  id: string,
  fields: Partial<{ name: string; role: StaffRole; active: boolean }>
): Promise<void> {
  const targetId = id.trim();
  if (!targetId) throw new Error("Missing staff id.");

  const sql = getSql();
  const updated = await sql`
    UPDATE staff SET
      name       = COALESCE(${fields.name ?? null}, name),
      role       = COALESCE(${fields.role ?? null}, role),
      role_raw   = COALESCE(${fields.role ?? null}, role_raw),
      active     = COALESCE(${fields.active ?? null}, active),
      updated_at = now()
    WHERE id = ${targetId}
    RETURNING id
  `;
  if (updated.length === 0) throw new Error(`Staff "${targetId}" not found.`);
}

// Hard delete. Callers must check staffHasEquipmentCheckoutHistory first
// (see app/api/staff/[id]/route.ts); this function does not, same as the
// Sheets version. A manager linked to this staff record is unlinked, not
// removed (managers.staff_id ON DELETE SET NULL).
export async function deleteStaff(id: string): Promise<void> {
  const targetId = id.trim();
  if (!targetId) throw new Error("Missing staff id.");

  const sql = getSql();
  const deleted = await sql`DELETE FROM staff WHERE id = ${targetId} RETURNING id`;
  if (deleted.length === 0) throw new Error(`Staff "${targetId}" not found.`);
}
