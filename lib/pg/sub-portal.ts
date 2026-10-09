// The subcontractor portal on Postgres: what a sub sees after logging in,
// the issues a sub reports (sub_portal_issues), and the portal's activity
// log (sub_activity_log).
//
// Until now all of this lived behind Apps Script, whose source is not in
// this repo. The issue list is checked against the live Apps Script answer
// (scripts/migrate/check-sub-portal-apps-script.mts). The login answer is
// put together from the three lists that were each proven identical to
// Apps Script in their own areas (subcontractors, accounts, complaints); it
// could not be compared with a live login answer, because asking for one
// means logging in as a real subcontractor.

import { getSql } from "@/lib/db";
import { getAccountsAppsScriptShape } from "@/lib/pg/accounts";
import { getComplaintsAppsScriptShape, type AppsScriptComplaint } from "@/lib/pg/complaints";
import { getSubcontractorsAppsScriptShape, type AppsScriptSubcontractor } from "@/lib/pg/subs";

const text = (value: unknown) => String(value ?? "").trim();
const lower = (value: unknown) => text(value).toLowerCase();

function newYorkParts(now: Date): Record<string, string> {
  return Object.fromEntries(
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
}

/** "10/8/2026 14:05:09", the way the sheet shows a date-time (US Eastern). */
function sheetStamp(now = new Date()): string {
  const p = newYorkParts(now);
  return `${p.month}/${p.day}/${p.year} ${Number(p.hour)}:${p.minute}:${p.second}`;
}

/** YYYY-MM-DD from "M/D/YYYY …" or "YYYY-MM-DD…"; null when the text is not a date. */
function toDay(value: string): string | null {
  const v = text(value);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(v);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

/** "SUBISSUE-20261008140509": a prefix plus the moment, as the sheet's ids are made. */
function stampId(prefix: string, now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${prefix}-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

// ─── What a subcontractor sees ───────────────────────────────────────────────

export type PortalSupplyItem = {
  rowNumber: number;
  supplyItem: string;
  category: string;
  description: string;
  itemDescription: string;
  unit: string;
  notes: string;
  status: string;
  active: string;
};

export type SubPortalData = {
  subcontractor: AppsScriptSubcontractor;
  accounts: Record<string, string | number>[];
  complaints: AppsScriptComplaint[];
  supplyItems: PortalSupplyItem[];
};

const CANCELLED = new Set(["cancelled", "canceled"]);

/**
 * The portal for the subcontractor with this email, or null when no
 * subcontractor has it.
 *
 *   subcontractor  the row from the subcontractor list (first one with the
 *                  email, in sheet order, when two rows share it).
 *   accounts       the accounts tied to that subcontractor, in the shape of
 *                  the accounts list; cancelled accounts are left out.
 *   complaints     the complaints on those accounts, every status (the
 *                  screen shows the open ones).
 *   supplyItems    the supply list without the inactive items.
 */
export async function getSubPortalByEmail(email: string): Promise<SubPortalData | null> {
  const wanted = lower(email);
  if (!wanted) return null;

  const sql = getSql();
  const [subs, idRows] = await Promise.all([
    getSubcontractorsAppsScriptShape(),
    sql.query(`SELECT id FROM subcontractors WHERE lower(btrim(email)) = $1::text ORDER BY source_row NULLS LAST, created_at, id LIMIT 1`, [wanted]) as unknown as Promise<
      { id: string }[]
    >,
  ]);
  const subcontractor = subs.find((s) => lower(s.email) === wanted);
  const subId = (await idRows)[0]?.id;
  if (!subcontractor || !subId) return null;

  const [linked, allAccounts, allComplaints, supplyRows] = await Promise.all([
    sql.query(`SELECT source_row, COALESCE(id, '') AS id FROM accounts WHERE subcontractor_id = $1::text`, [subId]) as unknown as Promise<
      { source_row: number | null; id: string }[]
    >,
    getAccountsAppsScriptShape("getAccounts"),
    getComplaintsAppsScriptShape(),
    sql.query(
      `SELECT supply_item, category, description, unit, status, notes, active_raw, sheet_row
       FROM sub_supplies WHERE btrim(supply_item) <> '' ORDER BY sheet_row`
    ) as unknown as Promise<
      { supply_item: string; category: string; description: string; unit: string; status: string; notes: string; active_raw: string; sheet_row: number }[]
    >,
  ]);

  const linkedRows = new Set(linked.map((r) => Number(r.source_row ?? 0)).filter((n) => n > 0));
  const linkedIds = new Set(linked.map((r) => text(r.id)).filter(Boolean));
  const accounts = allAccounts.filter((account) => {
    const mine = linkedRows.has(Number(account.rowNumber)) || (text(account.accountId) !== "" && linkedIds.has(text(account.accountId)));
    return mine && !CANCELLED.has(lower(account.status));
  });

  const accountIds = new Set(accounts.map((a) => text(a.accountId)).filter(Boolean));
  const accountNames = new Set(accounts.map((a) => lower(a.accountName)).filter(Boolean));
  const complaints = allComplaints.filter((c) => (text(c.accountId) !== "" && accountIds.has(text(c.accountId))) || (text(c.accountName) !== "" && accountNames.has(lower(c.accountName))));

  const inactive = new Set(["inactive", "discontinued", "no", "false", "disabled", "removed"]);
  const supplyItems = supplyRows
    .filter((row) => !inactive.has(lower(row.status)) && !inactive.has(lower(row.active_raw)))
    .map((row) => ({
      rowNumber: row.sheet_row,
      supplyItem: text(row.supply_item),
      category: text(row.category),
      description: text(row.description),
      itemDescription: text(row.description),
      unit: text(row.unit),
      notes: text(row.notes),
      status: text(row.status),
      active: text(row.active_raw),
    }));

  return { subcontractor, accounts, complaints, supplyItems };
}

// ─── Activity log ────────────────────────────────────────────────────────────

/** One line in the portal's activity log ("Login", "Viewed Accounts", …). */
export async function logSubcontractorActivity(input: { email: string; name: string; actionType: string; details: string }): Promise<void> {
  const actionType = text(input.actionType);
  if (!actionType) return;
  const stamp = sheetStamp();
  const sql = getSql();
  await sql.query(
    `INSERT INTO sub_activity_log (legacy_key, logged_at, logged_at_raw, subcontractor_id, subcontractor_email, subcontractor_name, action_type, details)
     VALUES (
       'pg-' || md5(random()::text || clock_timestamp()::text),
       to_timestamp($1::text, 'MM/DD/YYYY HH24:MI:SS')::timestamp, $1::text,
       (SELECT CASE WHEN count(*) = 1 THEN min(id) END FROM subcontractors WHERE btrim($2::text) <> '' AND lower(btrim(email)) = lower(btrim($2::text))),
       $2::text, $3::text, $4::text, $5::text)`,
    [stamp, text(input.email), text(input.name), actionType, text(input.details)]
  );
}

// ─── Issues a subcontractor reports ──────────────────────────────────────────

export type SubPortalIssue = {
  rowNumber: number;
  timestamp: string;
  issueId: string;
  subcontractorEmail: string;
  subcontractorName: string;
  accountId: string;
  accountName: string;
  issueType: string;
  urgency: string;
  description: string;
  photoCount: string;
  status: string;
  notes: string;
};

type IssueRow = {
  timestamp_raw: string;
  issue_id: string;
  subcontractor_email: string;
  subcontractor_name: string;
  account_id_raw: string;
  account_name: string;
  issue_type: string;
  urgency: string;
  description: string;
  photo_count_raw: string;
  status: string;
  notes: string;
  sheet_row: number;
};

/** The getSubPortalIssues answer: the issues newest first, and how many are still "New". */
export async function getSubPortalIssuesShape(): Promise<{ issues: SubPortalIssue[]; newCount: number; message: string }> {
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT timestamp_raw, issue_id, subcontractor_email, subcontractor_name, account_id_raw, account_name, issue_type, urgency,
            description, photo_count_raw, status, notes, sheet_row
     FROM sub_portal_issues ORDER BY sheet_row DESC`
  )) as IssueRow[];
  const issues = rows.map((row) => ({
    rowNumber: row.sheet_row,
    timestamp: toDay(row.timestamp_raw) ?? text(row.timestamp_raw),
    issueId: text(row.issue_id),
    subcontractorEmail: text(row.subcontractor_email),
    subcontractorName: text(row.subcontractor_name),
    accountId: text(row.account_id_raw),
    accountName: text(row.account_name),
    issueType: text(row.issue_type),
    urgency: text(row.urgency),
    description: text(row.description),
    // A count of 0 is an empty cell in the sheet, and Apps Script answers "".
    photoCount: text(row.photo_count_raw) === "0" ? "" : text(row.photo_count_raw),
    status: text(row.status),
    notes: text(row.notes),
  }));
  return { issues, newCount: issues.filter((i) => i.status.toLowerCase() === "new").length, message: "Sub portal issues loaded." };
}

export type NewSubPortalIssue = {
  issueId: string;
  rowNumber: number;
  subcontractorEmail: string;
  subcontractorName: string;
  accountName: string;
  issueType: string;
  urgency: string;
  description: string;
  photoCount: string;
  status: string;
};

export async function submitSubPortalIssue(issue: Record<string, unknown>): Promise<NewSubPortalIssue> {
  const description = text(issue.description);
  if (!description) throw new Error("Please describe the issue.");
  const now = new Date();
  const base = stampId("SUBISSUE", now);
  const stamp = sheetStamp(now);
  const values = {
    subcontractorEmail: text(issue.subcontractorEmail),
    subcontractorName: text(issue.subcontractorName),
    accountId: text(issue.accountId),
    accountName: text(issue.accountName),
    issueType: text(issue.issueType),
    urgency: text(issue.urgency) || "Normal",
    description,
    photoCount: text(issue.photoCount),
    status: text(issue.status) || "New",
  };

  const sql = getSql();
  const rows = (await sql.query(
    `WITH next AS (SELECT COALESCE(MAX(sheet_row), 1) + 1 AS n FROM sub_portal_issues),
          taken AS (SELECT count(*)::int AS c FROM sub_portal_issues WHERE issue_id = $1::text OR issue_id LIKE $1::text || '-%')
     INSERT INTO sub_portal_issues (legacy_key, timestamp_raw, reported_on, issue_id, subcontractor_email, subcontractor_name, subcontractor_id,
       account_id_raw, account_name, account_ref, issue_type, urgency, description, photo_count_raw, status, sheet_row)
     SELECT
       'pg-' || $1::text || '-' || next.n::text, $2::text, $3::date,
       CASE WHEN taken.c = 0 THEN $1::text ELSE $1::text || '-' || (taken.c + 1)::text END,
       $4::text, $5::text,
       (SELECT CASE WHEN count(*) = 1 THEN min(id) END FROM subcontractors WHERE btrim($4::text) <> '' AND lower(btrim(email)) = lower(btrim($4::text))),
       $6::text, $7::text,
       COALESCE(
         (SELECT id FROM accounts WHERE btrim($6::text) <> '' AND id = btrim($6::text) LIMIT 1),
         (SELECT CASE WHEN count(*) = 1 THEN min(id) END FROM accounts WHERE btrim($7::text) <> '' AND lower(btrim(account_name)) = lower(btrim($7::text)))
       ),
       $8::text, $9::text, $10::text, $11::text, $12::text, next.n
     FROM next, taken
     RETURNING issue_id, sheet_row`,
    [
      base,
      stamp,
      toDay(stamp),
      values.subcontractorEmail,
      values.subcontractorName,
      values.accountId,
      values.accountName,
      values.issueType,
      values.urgency,
      values.description,
      values.photoCount,
      values.status,
    ]
  )) as { issue_id: string; sheet_row: number }[];
  return { ...values, issueId: rows[0].issue_id, rowNumber: rows[0].sheet_row };
}

/** Staff set an issue's status (and notes), found by its row number, else by its issue id. */
export async function updateSubPortalIssueStatus(issue: Record<string, unknown>): Promise<{ issueId: string; status: string }> {
  const status = text(issue.status);
  if (!status) throw new Error("Status is required.");
  const rowNumber = Number(issue.rowNumber);
  const issueId = text(issue.issueId) || text(issue.id);
  const hasNotes = issue.notes !== undefined && issue.notes !== null;
  const sql = getSql();
  const set = `status = $2::text, notes = CASE WHEN $4::boolean THEN $3::text ELSE notes END, updated_at = now()`;
  let rows: { issue_id: string }[] = [];
  if (Number.isInteger(rowNumber) && rowNumber > 1) {
    rows = (await sql.query(
      `UPDATE sub_portal_issues SET ${set} WHERE sheet_row = $1::int AND ($5::text = '' OR btrim(issue_id) = $5::text) RETURNING issue_id`,
      [rowNumber, status, text(issue.notes), hasNotes, issueId]
    )) as { issue_id: string }[];
  }
  if (rows.length === 0 && issueId) {
    rows = (await sql.query(`UPDATE sub_portal_issues SET ${set} WHERE btrim(issue_id) = $1::text RETURNING issue_id`, [
      issueId,
      status,
      text(issue.notes),
      hasNotes,
    ])) as { issue_id: string }[];
  }
  if (rows.length === 0) throw new Error("Could not find the issue to update.");
  return { issueId: text(rows[0].issue_id), status };
}
