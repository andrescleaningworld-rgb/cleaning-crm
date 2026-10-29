// Postgres versions of the complaint reads/writes: appendComplaint from
// lib/googleSheets.ts, and the three Apps Script actions the complaint
// screens use (getComplaints, closeComplaint, resendComplaintNotification).
// Same shapes and ordering as today, so app/api/complaints/route.ts can
// switch with lib/data/complaints.ts.
//
// Rows are read in sheet order (sheet_row). The list shows sheet_row as
// rowNumber and sends it back to close a complaint, so rows created here
// get the next number (where Sheets would have put them).

import { getSql } from "@/lib/db";
import { HIDDEN_ACCOUNT_IDS } from "@/lib/pg/account-live";
import { dateOrNull, toISO } from "@/lib/dateUtils";
import type { ComplaintInput } from "@/lib/googleSheets";

type ComplaintRow = {
  complaint_id: string;
  account_id_raw: string;
  account_name: string;
  account_ref: string | null;
  complaint_date_raw: string;
  issue: string;
  priority: string;
  complaint_validity: string;
  status: string;
  reported_by: string;
  assigned_to: string;
  last_follow_up_date_raw: string;
  notes: string;
  sheet_row: number;
  /** The account's sub when the complaint was filed; null = not recorded (migration 031). */
  sub_at_filing: string | null;
  /** The text typed when it was closed, or saved from the edit page (not a sheet column). */
  resolution_note: string;
};

// sub_at_filing is read through to_jsonb so the list still loads in a
// database where migration 031 has not been applied yet (it is null there).
const COMPLAINT_COLUMNS =
  "complaint_id, account_id_raw, account_name, account_ref, complaint_date_raw, issue, priority, complaint_validity, status, reported_by, assigned_to, last_follow_up_date_raw, notes, sheet_row, to_jsonb(complaints)->>'sub_at_filing' AS sub_at_filing, resolution_note";

async function allComplaintRows(): Promise<ComplaintRow[]> {
  const sql = getSql();
  return (await sql.query(`SELECT ${COMPLAINT_COLUMNS} FROM complaints WHERE account_ref IS NULL OR account_ref NOT IN ${HIDDEN_ACCOUNT_IDS} ORDER BY sheet_row`)) as ComplaintRow[];
}

/* ---------- Apps Script getComplaints, rebuilt ---------- */

// What Apps Script answers for a date cell: a real date becomes YYYY-MM-DD,
// text that already starts with an ISO day is passed through, anything
// unparseable stays as text.
function scriptDate(raw: string): string {
  const text = raw.trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return raw;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? raw : toISO(d);
}

// A cell holding 0 comes back as "" (Apps Script's `value || ""`).
const scriptText = (raw: string): string => (raw.trim() === "0" ? "" : raw);

export type AppsScriptComplaint = {
  rowNumber: number;
  id: string;
  date: string;
  accountId: string;
  accountName: string;
  complaintType: string;
  priority: string;
  severity: string;
  status: string;
  complaintValidity: string;
  manager: string;
  subcontractor: string;
  subAtFiling: string | null;
  description: string;
  resolution: string;
  followUpDate: string;
  notes: string;
  reportedBy: string;
};

// The list GET /api/complaints returns: every row with data, in sheet
// order, same keys in the same order as the Apps Script answer. Four of the
// fields are always blank in that answer today (the sheet has no column
// Apps Script could read them from) and are blank here too: complaintType,
// subcontractor, resolution and followUpDate. Checked against the live
// answer row by row (scripts/migrate/check-complaints-apps-script.mts).
export async function getComplaintsAppsScriptShape(): Promise<AppsScriptComplaint[]> {
  return (await allComplaintRows()).map((r) => ({
    rowNumber: r.sheet_row,
    id: scriptText(r.complaint_id),
    date: scriptDate(r.complaint_date_raw),
    accountId: scriptText(r.account_id_raw),
    accountName: scriptText(r.account_name),
    complaintType: "",
    priority: scriptText(r.priority),
    severity: scriptText(r.priority),
    status: scriptText(r.status),
    complaintValidity: scriptText(r.complaint_validity),
    manager: scriptText(r.assigned_to),
    subcontractor: "",
    // The sub who had the account when the complaint was filed (null = not
    // recorded: it counts for the account's sub of today). The sub's page
    // uses it; the score reads it in lib/pg/performance.ts.
    subAtFiling: r.sub_at_filing,
    description: scriptText(r.issue),
    // The real values, so the edit page starts from what is saved (it used to start them blank and a Save wiped them).
    resolution: scriptText(r.resolution_note ?? ""),
    followUpDate: scriptDate(r.last_follow_up_date_raw),
    notes: scriptText(r.notes),
    reportedBy: scriptText(r.reported_by),
  }));
}

/* ---------- Create ---------- */

export async function appendComplaint(data: ComplaintInput): Promise<string> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  // Same ID format as the Sheets version ("COMP-20260615170222").
  const id = `COMP-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  const sql = getSql();
  // Two complaints saved in the same second share an ID in Sheets too; the
  // internal key gets a suffix so both rows can exist.
  const saved = (await sql.query(
    `WITH next AS (SELECT COALESCE(MAX(sheet_row), 1) + 1 AS n FROM complaints)
     INSERT INTO complaints (
       legacy_key, complaint_id, account_id_raw, account_name, account_ref,
       complaint_date_raw, complaint_date, issue, priority, complaint_validity, status,
       reported_by, assigned_to, last_follow_up_date_raw, last_follow_up_date, notes, sheet_row)
     SELECT
       CASE WHEN EXISTS (SELECT 1 FROM complaints WHERE legacy_key = $1::text) THEN $1::text || '#' || next.n::text ELSE $1::text END,
       $1::text, $2::text, $3::text,
       COALESCE(
         (SELECT id FROM accounts WHERE id = btrim($2::text) LIMIT 1),
         (SELECT CASE WHEN count(*) = 1 THEN min(id) END FROM accounts WHERE (to_jsonb(accounts)->>'deleted_at') IS NULL AND btrim($3::text) <> '' AND lower(btrim(account_name)) = lower(btrim($3::text)))
       ),
       $4::text, $5::date, $6::text, $7::text, $8::text, $9::text, $10::text, $11::text, $12::text, $13::date, $14::text, next.n
     FROM next
     RETURNING id`,
    [
      id,
      data.accountId,
      data.accountName,
      data.complaintDate,
      dateOrNull(data.complaintDate),
      data.issue,
      data.priority,
      data.complaintValidity,
      data.status,
      data.reportedBy,
      data.assignedTo,
      data.lastFollowUpDate,
      dateOrNull(data.lastFollowUpDate),
      data.notes,
    ]
  )) as { id: string }[];

  // The sub who has the account right now is saved on the complaint, so it
  // stays this sub's complaint if the account changes subs later. Its own
  // step, after the save: where migration 031 is not applied yet the column
  // is not there, and the complaint must still be saved.
  if (saved[0]) {
    try {
      await sql.query(
        `UPDATE complaints c SET sub_at_filing = COALESCE((SELECT btrim(a.subcontractor_raw) FROM accounts a WHERE a.id = c.account_ref), '') WHERE c.id = $1`,
        [saved[0].id]
      );
    } catch (error) {
      if ((error as { code?: string }).code !== "42703") console.error("[complaints] the sub was not saved on the complaint:", error instanceof Error ? error.message : error);
    }
  }
  return id;
}

/* ---------- Close (Apps Script closeComplaint, rebuilt) ---------- */

function newYorkStamp(): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value])
  );
  return `${p.month}/${p.day}/${p.year} ${Number(p.hour)}:${p.minute}:${p.second}`;
}

async function findComplaint(rowNumber: string | number | undefined, id: string): Promise<ComplaintRow | null> {
  const rows = await allComplaintRows();
  const n = Number(rowNumber);
  const byRow = Number.isInteger(n) && n > 1 ? rows.find((r) => r.sheet_row === n) : undefined;
  if (byRow && (!id || byRow.complaint_id.trim() === id)) return byRow;
  // The row number can be stale (a list loaded before another change); the ID wins.
  return (id ? rows.find((r) => r.complaint_id.trim() === id) : byRow) ?? null;
}

export type CloseComplaintInput = {
  rowNumber?: string | number;
  id: string;
  status: string;
  resolution: string;
};

// Replaces the Apps Script closeComplaint action. Its source is not in the
// repo. Rebuilt from the 15 rows it has closed: it sets Status and stamps
// Updated At ("M/D/YYYY H:MM:SS", New York time), and nothing else in the
// row changes (Resolution Date is empty on every closed row, Notes are not
// touched). The resolution text the screen makes people type is kept here
// in resolution_note; the sheet has nowhere for it.
// Nothing is sent to anyone on close (no sign that Apps Script does).
export async function closeComplaint(input: CloseComplaintInput): Promise<{ rowNumber: number; status: string }> {
  const row = await findComplaint(input.rowNumber, input.id.trim());
  if (!row) throw new Error("Complaint not found.");

  const status = input.status.trim() || "Closed";
  const stamp = newYorkStamp();
  const sql = getSql();
  await sql.query(
    `UPDATE complaints
        SET status = $2::text, updated_at_raw = $3::text, complaint_updated_at = now(),
            resolution_note = CASE WHEN btrim($4::text) = '' THEN resolution_note ELSE $4::text END,
            updated_at = now()
      WHERE sheet_row = $1`,
    [row.sheet_row, status, stamp, input.resolution]
  );
  return { rowNumber: row.sheet_row, status };
}

/* ---------- Edit (the complaint page's Edit -> Save) ---------- */

export type EditComplaintInput = {
  rowNumber?: string | number;
  id: string;
  accountId: string;
  accountName: string;
  complaintDate: string;
  issue: string;
  priority: string;
  status: string;
  complaintValidity: string;
  assignedTo: string;
  reportedBy: string;
  followUpDate: string;
  notes: string;
  resolution: string;
};

/** One field that changed, in the words of the edit form. */
export type ComplaintChange = { label: string; before: string; after: string };

// The edit form's fields: its label, the column, what the form sent, and
// whether it is a date (compared by the day it means, so "6/15/2026" and
// "2026-06-15" are the same).
type Editable = { label: string; column: "account_name" | "complaint_date_raw" | "issue" | "priority" | "status" | "complaint_validity" | "assigned_to" | "reported_by" | "last_follow_up_date_raw" | "notes" | "resolution_note"; value: (input: EditComplaintInput) => string; date?: boolean };
const EDITABLE: Editable[] = [
  { label: "Account", column: "account_name", value: (input) => input.accountName },
  { label: "Date", column: "complaint_date_raw", value: (input) => input.complaintDate, date: true },
  { label: "Description", column: "issue", value: (input) => input.issue },
  { label: "Priority", column: "priority", value: (input) => input.priority },
  { label: "Status", column: "status", value: (input) => input.status },
  { label: "Validity", column: "complaint_validity", value: (input) => input.complaintValidity },
  { label: "Assigned to", column: "assigned_to", value: (input) => input.assignedTo },
  { label: "Reported by", column: "reported_by", value: (input) => input.reportedBy },
  { label: "Follow-up date", column: "last_follow_up_date_raw", value: (input) => input.followUpDate, date: true },
  { label: "Notes", column: "notes", value: (input) => input.notes },
  { label: "Resolution", column: "resolution_note", value: (input) => input.resolution },
];

const sameValue = (field: Editable, before: string, after: string) => {
  if (field.date) {
    const a = dateOrNull(before);
    const b = dateOrNull(after);
    if (a || b) return a === b;
  }
  // The list shows a cell holding "0" as blank (scriptText): that is no change either.
  return scriptText(before).trim() === after.trim();
};

/**
 * Saves the complaint page's Edit on THE SAME complaint (same number, same
 * row). Only the fields that really changed are written; every other field
 * stays exactly as stored. Updated At is stamped. Never makes a new
 * complaint and never sends anything. The sub at filing is kept as it was.
 * Returns what changed ([] = nothing did, and nothing is written).
 */
export async function editComplaint(input: EditComplaintInput): Promise<{ rowNumber: number; id: string; changes: ComplaintChange[] }> {
  const found = await findComplaint(input.rowNumber, input.id.trim());
  if (!found) throw new Error("Complaint not found. It may have been removed; reload the page.");

  const next: Record<Editable["column"], string> = {
    account_name: found.account_name,
    complaint_date_raw: found.complaint_date_raw,
    issue: found.issue,
    priority: found.priority,
    status: found.status,
    complaint_validity: found.complaint_validity,
    assigned_to: found.assigned_to,
    reported_by: found.reported_by,
    last_follow_up_date_raw: found.last_follow_up_date_raw,
    notes: found.notes,
    resolution_note: found.resolution_note ?? "",
  };
  const changes: ComplaintChange[] = [];
  for (const field of EDITABLE) {
    const before = String(next[field.column] ?? "");
    const after = String(field.value(input) ?? "").trim();
    if (sameValue(field, before, after)) continue;
    changes.push({ label: field.label, before: before.trim(), after });
    next[field.column] = after;
  }
  // A different account picked (its Account ID), even with the same name.
  const accountId = input.accountId.trim();
  const accountIdChanged = accountId !== "" && accountId !== found.account_id_raw.trim();
  if (accountIdChanged && !changes.some((change) => change.label === "Account")) changes.push({ label: "Account", before: found.account_name.trim(), after: input.accountName.trim() });
  if (changes.length === 0) return { rowNumber: found.sheet_row, id: found.complaint_id.trim(), changes };

  const accountTouched = changes.some((change) => change.label === "Account");
  const sql = getSql();
  await sql.query(
    `UPDATE complaints SET
       account_id_raw = CASE WHEN $17::boolean AND btrim($2::text) <> '' THEN btrim($2::text) ELSE account_id_raw END,
       account_name = $3::text,
       account_ref = CASE WHEN NOT $17::boolean THEN account_ref ELSE COALESCE(
         (SELECT id FROM accounts WHERE id = btrim($2::text) LIMIT 1),
         (SELECT CASE WHEN count(*) = 1 THEN min(id) END FROM accounts WHERE (to_jsonb(accounts)->>'deleted_at') IS NULL AND btrim($3::text) <> '' AND lower(btrim(account_name)) = lower(btrim($3::text)))
       ) END,
       complaint_date_raw = $4::text, complaint_date = CASE WHEN $4::text = complaint_date_raw THEN complaint_date ELSE $5::date END,
       issue = $6::text, priority = $7::text, status = $8::text, complaint_validity = $9::text,
       assigned_to = $10::text, reported_by = $11::text,
       last_follow_up_date_raw = $12::text, last_follow_up_date = CASE WHEN $12::text = last_follow_up_date_raw THEN last_follow_up_date ELSE $13::date END,
       notes = $14::text, resolution_note = $15::text,
       updated_at_raw = $16::text, complaint_updated_at = now(), updated_at = now()
     WHERE sheet_row = $1`,
    [
      found.sheet_row,
      accountId,
      next.account_name,
      next.complaint_date_raw,
      dateOrNull(next.complaint_date_raw),
      next.issue,
      next.priority,
      next.status,
      next.complaint_validity,
      next.assigned_to,
      next.reported_by,
      next.last_follow_up_date_raw,
      dateOrNull(next.last_follow_up_date_raw),
      next.notes,
      next.resolution_note,
      newYorkStamp(),
      accountTouched,
    ]
  );
  return { rowNumber: found.sheet_row, id: found.complaint_id.trim(), changes };
}

/* ---------- Resend the subcontractor email ---------- */

export type ComplaintForResend = {
  accountName: string;
  complaintDate: string;
  priority: string;
  complaintValidity: string;
  issue: string;
  lastFollowUpDate: string;
  assignedTo: string;
  /** The Subcontractor text on the linked account; "" when there is no linked account. */
  subcontractorName: string;
};

// What the route needs to send the "New Complaint" email again: the
// complaint, and the subcontractor named on its account (a complaint has no
// subcontractor column of its own).
export async function getComplaintForResend(rowNumber: string | number | undefined, id: string): Promise<ComplaintForResend | null> {
  const row = await findComplaint(rowNumber, id.trim());
  if (!row) return null;
  const sql = getSql();
  const account = row.account_ref
    ? ((await sql.query(`SELECT subcontractor_raw FROM accounts WHERE id = $1 LIMIT 1`, [row.account_ref])) as { subcontractor_raw: string }[])[0]
    : undefined;
  return {
    accountName: row.account_name,
    complaintDate: scriptDate(row.complaint_date_raw),
    priority: row.priority,
    complaintValidity: row.complaint_validity,
    issue: row.issue,
    lastFollowUpDate: row.last_follow_up_date_raw,
    assignedTo: row.assigned_to,
    subcontractorName: (account?.subcontractor_raw ?? "").trim(),
  };
}
