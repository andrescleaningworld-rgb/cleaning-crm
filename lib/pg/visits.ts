// Postgres versions of the visit reads/writes: the direct ones in
// lib/googleSheets.ts (Visit page read / edit, VisitEditLog, the customer
// portal's getVisitsByAccountName) and the two Apps Script actions the
// visit list uses (getVisits, addVisit). Same names, arguments, return
// shapes, ordering and error messages, so lib/data/visits.ts can switch.
//
// Every value the app reads back is the text the sheet shows (*_raw for
// dates and the condition score); typed columns next to them are filled on
// the side and never read here. Rows are read in sheet order (sheet_row).

import { getSql } from "@/lib/db";
import { toISO } from "@/lib/dateUtils";
import type { CustomerVisit, ManagerVisit, ManagerVisitUpdateInput, VisitEditLogEntry, VisitEditLogInput } from "@/lib/googleSheets";

type VisitRow = {
  visit_id: string;
  account_id_raw: string;
  account_name: string;
  visit_date_raw: string;
  visit_type: string;
  completed_by: string;
  condition_raw: string;
  follow_up_needed: string;
  notes: string;
  created_at_raw: string;
  updated_at_raw: string;
  follow_up_date_raw: string;
  sheet_row: number;
};

const VISIT_COLUMNS =
  "visit_id, account_id_raw, account_name, visit_date_raw, visit_type, completed_by, condition_raw, follow_up_needed, notes, created_at_raw, updated_at_raw, follow_up_date_raw, sheet_row";

async function allVisitRows(): Promise<VisitRow[]> {
  const sql = getSql();
  return (await sql.query(`SELECT ${VISIT_COLUMNS} FROM visits WHERE account_ref IS NULL OR account_ref NOT IN (SELECT id FROM accounts WHERE is_test AND id IS NOT NULL) ORDER BY sheet_row`)) as VisitRow[];
}

/* ---------- typed-column helpers (never read back by the app) ---------- */

function toDay(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const isoDay = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (isoDay) return `${isoDay[1]}-${isoDay[2]}-${isoDay[3]}`;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : toISO(d);
}

function toNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/* ---------- Visit page: read and edit one visit ---------- */

// Same rule as the Sheets version: "3/26/24" and friends become YYYY-MM-DD,
// an already-ISO day is kept, anything unparseable stays as it is.
function normalizeSheetDate(raw: string | undefined): string {
  const text = (raw ?? "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? text : toISO(d);
}

function rowToManagerVisit(r: VisitRow): ManagerVisit {
  return {
    id: r.visit_id.trim(),
    accountId: r.account_id_raw,
    accountName: r.account_name,
    date: normalizeSheetDate(r.visit_date_raw),
    visitType: r.visit_type,
    completedBy: r.completed_by,
    condition: r.condition_raw,
    followUpNeeded: r.follow_up_needed,
    followUpDate: normalizeSheetDate(r.follow_up_date_raw),
    notes: r.notes,
    createdAt: r.created_at_raw,
    updatedAt: r.updated_at_raw,
  };
}

// The Sheets version only looks at rows that have an Account ID (column B,
// which the sheet fills whenever the row has an account name).
async function findVisitRow(targetId: string): Promise<VisitRow | null> {
  const rows = (await allVisitRows()).filter((r) => r.account_id_raw.trim());
  return rows.find((r) => r.visit_id.trim() === targetId) ?? null;
}

export async function getManagerVisitById(id: string): Promise<ManagerVisit | null> {
  const targetId = id.trim();
  if (!targetId) return null;
  const row = await findVisitRow(targetId);
  return row ? rowToManagerVisit(row) : null;
}

const VISIT_UPDATE_COLUMNS: Record<keyof ManagerVisitUpdateInput, { column: keyof VisitRow; typed?: { column: string; value: (text: string) => unknown } }> = {
  date: { column: "visit_date_raw", typed: { column: "visit_date", value: toDay } },
  visitType: { column: "visit_type" },
  completedBy: { column: "completed_by" },
  condition: { column: "condition_raw", typed: { column: "condition_score", value: toNumber } },
  followUpNeeded: { column: "follow_up_needed" },
  followUpDate: { column: "follow_up_date_raw", typed: { column: "follow_up_date", value: toDay } },
  notes: { column: "notes" },
};

export async function updateManagerVisit(id: string, fields: ManagerVisitUpdateInput): Promise<ManagerVisit> {
  const targetId = id.trim();
  if (!targetId) throw new Error(`Visit "${id}" not found.`);

  const row = await findVisitRow(targetId);
  if (!row) throw new Error(`Visit "${id}" not found.`);

  const merged: VisitRow = { ...row };
  const sets: string[] = [];
  const params: unknown[] = [row.sheet_row];
  const set = (column: string, value: unknown) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };
  for (const [key, value] of Object.entries(fields) as [keyof ManagerVisitUpdateInput, string | undefined][]) {
    if (value === undefined) continue;
    const target = VISIT_UPDATE_COLUMNS[key];
    set(target.column, value);
    if (target.typed) set(target.typed.column, target.typed.value(value));
    (merged[target.column] as string) = value;
  }
  const updatedAt = new Date().toISOString();
  set("updated_at_raw", updatedAt);
  set("visit_updated_at", updatedAt);
  merged.updated_at_raw = updatedAt;

  const sql = getSql();
  await sql.query(`UPDATE visits SET ${sets.join(", ")}, updated_at = now() WHERE sheet_row = $1`, params);
  return rowToManagerVisit(merged);
}

/* ---------- Visit edit log ---------- */

// Most recent first, for one visit.
export async function fetchVisitEditLog(visitId: string): Promise<VisitEditLogEntry[]> {
  const targetId = visitId.trim();
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT id, visit_id, edited_by, edited_at_raw, change_summary FROM visit_edit_log ORDER BY sheet_row`
  )) as { id: string; visit_id: string; edited_by: string; edited_at_raw: string; change_summary: string }[];
  return rows
    .map((r) => ({ id: r.id, visitId: r.visit_id, editedBy: r.edited_by, editedAt: r.edited_at_raw, changeSummary: r.change_summary }))
    .filter((e) => e.id && e.visitId === targetId)
    .sort((a, b) => b.editedAt.localeCompare(a.editedAt));
}

export async function appendVisitEditLog(data: VisitEditLogInput): Promise<string> {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const rand = Math.random().toString(36).slice(2, 6);
  const id = `EDIT-${stamp.slice(-8)}-${rand}`;
  const editedAt = new Date().toISOString();
  const sql = getSql();
  await sql.query(
    `INSERT INTO visit_edit_log (id, legacy_key, visit_id, edited_by, edited_at_raw, edited_at, change_summary, sheet_row)
     VALUES ($1, $1, $2, $3, $4::text, $4::timestamptz, $5, (SELECT COALESCE(MAX(sheet_row), 1) + 1 FROM visit_edit_log))`,
    [id, data.visitId, data.editedBy, editedAt, data.changeSummary]
  );
  return id;
}

/* ---------- Customer portal dashboard ---------- */

// Copies the Sheets version exactly, including the columns it reads: it
// takes column B as the account name, F as the visit date, G as the time
// window and H as the status. In this tab those columns are the formula
// Account ID, Completed By, Condition Score and Follow-Up Needed, so in
// practice it finds nothing (no customer's name equals an "ACC-…" value).
// Kept identical on purpose; see the Area 7 report.
export async function getVisitsByAccountName(accountName: string): Promise<CustomerVisit[]> {
  const accountLower = accountName.trim().toLowerCase();
  return (await allVisitRows())
    .map((r) => ({ accountName: r.account_id_raw, visitDate: r.completed_by, timeWindow: r.condition_raw, status: r.follow_up_needed }))
    .filter((v) => v.accountName.trim().toLowerCase() === accountLower && v.visitDate)
    .map(({ visitDate, timeWindow, status }) => ({ visitDate, timeWindow, status }));
}

/* ---------- Apps Script getVisits, rebuilt ---------- */

// What Apps Script answers for a date cell: a real date becomes YYYY-MM-DD,
// text that already starts with an ISO day (including the full ISO
// timestamps the Visit page writes into Updated At) is passed through as it
// is, anything unparseable stays as text.
function scriptDate(raw: string): string {
  const text = raw.trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return raw;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? raw : toISO(d);
}

// A cell holding 0 comes back as "" (Apps Script's `value || ""`).
const scriptText = (raw: string): string => (raw.trim() === "0" ? "" : raw);

export type AppsScriptVisit = {
  id: string;
  accountId: string;
  accountName: string;
  date: string;
  visitType: string;
  manager: string;
  completedBy: string;
  subcontractor: string;
  condition: string;
  score: string;
  followUpNeeded: string;
  followUpDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

// The list GET /api/visits returns: every row that has any data, in sheet
// order, with the same keys in the same order as the Apps Script answer.
// Checked against the live answer row by row
// (scripts/migrate/check-visits-apps-script.mts).
export async function getVisitsAppsScriptShape(): Promise<AppsScriptVisit[]> {
  return (await allVisitRows()).map((r) => ({
    id: scriptText(r.visit_id),
    accountId: scriptText(r.account_id_raw),
    accountName: scriptText(r.account_name),
    date: scriptDate(r.visit_date_raw),
    visitType: scriptText(r.visit_type),
    manager: scriptText(r.completed_by),
    completedBy: scriptText(r.completed_by),
    subcontractor: "", // the tab has no such column; always blank today
    condition: scriptText(r.condition_raw),
    score: scriptText(r.condition_raw),
    followUpNeeded: scriptText(r.follow_up_needed),
    followUpDate: scriptDate(r.follow_up_date_raw),
    notes: scriptText(r.notes),
    createdAt: scriptDate(r.created_at_raw),
    updatedAt: scriptDate(r.updated_at_raw),
  }));
}

/* ---------- Apps Script addVisit, rebuilt ---------- */

function newYorkParts(options: Intl.DateTimeFormatOptions): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", ...options })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value])
  );
}

export type AddVisitInput = {
  accountName: string;
  visitDate: string;
  visitType: string;
  completedBy: string;
  condition: string;
  followUpNeeded: string;
  followUpDate: string;
  notes: string;
};

// Replaces the Apps Script addVisit action. Its source is not in the repo.
// Rebuilt from the request the app sends and from the 201 rows the action
// has written:
//   - Visit ID is "VISIT-" + 14 digits (the moment it was made, New York time)
//   - Account ID is what the sheet's column-B formula would show for the
//     row: "ACC-" + (row number + 100000) in hex, or blank without a name
//   - Created At and Updated At are "M/D/YYYY H:MM:SS", New York time
//   - the subcontractor the form collects is not stored (the tab has no
//     column for it; same as today)
// Nothing is sent to anyone: no sign was found that Apps Script emails or
// texts when a visit is added. If it does, say so (Area 7 report).
export async function addVisit(data: AddVisitInput): Promise<{ id: string }> {
  const p = newYorkParts({ year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const baseId = `VISIT-${p.year}${p.month}${p.day}${p.hour}${p.minute}${p.second}`;
  const stamp = `${Number(p.month)}/${Number(p.day)}/${p.year} ${Number(p.hour)}:${p.minute}:${p.second}`;
  const now = new Date().toISOString();

  const sql = getSql();
  // Two visits saved in the same second would share an ID; the second one
  // gets a suffix so the Visit page can still tell them apart.
  const rows = (await sql.query(
    `WITH next AS (SELECT COALESCE(MAX(sheet_row), 1) + 1 AS n FROM visits),
          taken AS (SELECT count(*)::int AS c FROM visits WHERE visit_id = $1::text OR visit_id LIKE $1::text || '-%')
     INSERT INTO visits (
       legacy_key, visit_id, account_id_raw, account_name, account_ref,
       visit_date_raw, visit_date, visit_type, completed_by, condition_raw, condition_score,
       follow_up_needed, notes, created_at_raw, visit_created_at, updated_at_raw, visit_updated_at,
       follow_up_date_raw, follow_up_date, sheet_row)
     SELECT
       ids.vid, ids.vid,
       CASE WHEN btrim($2::text) = '' THEN '' ELSE 'ACC-' || upper(to_hex(next.n + 100000)) END,
       $2::text,
       (SELECT CASE WHEN count(*) = 1 THEN min(id) END FROM accounts WHERE btrim($2::text) <> '' AND lower(btrim(account_name)) = lower(btrim($2::text))),
       $3::text, $4::date, $5::text, $6::text, $7::text, $8::numeric, $9::text, $10::text,
       $11::text, $12::timestamptz, $11::text, $12::timestamptz, $13::text, $14::date, next.n
     FROM next, taken, LATERAL (SELECT CASE WHEN taken.c = 0 THEN $1::text ELSE $1::text || '-' || (taken.c + 1)::text END AS vid) ids
     RETURNING visit_id`,
    [
      baseId,
      data.accountName,
      data.visitDate,
      toDay(data.visitDate),
      data.visitType,
      data.completedBy,
      data.condition,
      toNumber(data.condition),
      data.followUpNeeded,
      data.notes,
      stamp,
      now,
      data.followUpDate,
      toDay(data.followUpDate),
    ]
  )) as { visit_id: string }[];
  return { id: rows[0].visit_id };
}
