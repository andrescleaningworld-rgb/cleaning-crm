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
import { toISO } from "@/lib/dateUtils";
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
};

const COMPLAINT_COLUMNS =
  "complaint_id, account_id_raw, account_name, account_ref, complaint_date_raw, issue, priority, complaint_validity, status, reported_by, assigned_to, last_follow_up_date_raw, notes, sheet_row";

async function allComplaintRows(): Promise<ComplaintRow[]> {
  const sql = getSql();
  return (await sql.query(`SELECT ${COMPLAINT_COLUMNS} FROM complaints ORDER BY sheet_row`)) as ComplaintRow[];
}

/** YYYY-MM-DD for the typed column, or null. */
function toDay(text: string): string | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(text ?? "").trim());
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
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
    description: scriptText(r.issue),
    resolution: "",
    followUpDate: "",
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
  await sql.query(
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
         (SELECT CASE WHEN count(*) = 1 THEN min(id) END FROM accounts WHERE btrim($3::text) <> '' AND lower(btrim(account_name)) = lower(btrim($3::text)))
       ),
       $4::text, $5::date, $6::text, $7::text, $8::text, $9::text, $10::text, $11::text, $12::text, $13::date, $14::text, next.n
     FROM next`,
    [
      id,
      data.accountId,
      data.accountName,
      data.complaintDate,
      toDay(data.complaintDate),
      data.issue,
      data.priority,
      data.complaintValidity,
      data.status,
      data.reportedBy,
      data.assignedTo,
      data.lastFollowUpDate,
      toDay(data.lastFollowUpDate),
      data.notes,
    ]
  );
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
