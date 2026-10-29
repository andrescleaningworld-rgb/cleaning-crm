// Read-only report, PRODUCTION: likely duplicate complaints made by the old
// complaint edit bug (until Oct 28, 2026, the complaint page's Edit -> Save
// made a NEW complaint from the edited form instead of updating it). Changes
// nothing: SELECTs only. Cleanup is a separate step after review.
//
//   npx tsx scripts/migrate/check-complaint-duplicates-production.mts
//
// A group = complaints on the same account with the same description (case
// and spaces ignored). The first one (lowest complaint number) is taken as
// the original; each later one is a "likely copy". A copy is marked:
//   [same date]   same complaint date as the original (an edit sends it back)
//   [by staff]    its "create complaint" line in the activity log has a staff name
// The edit bug made copies with both marks; a copy with neither may be a real
// second complaint, so look at those closely.
// Not caught: a copy whose description was changed in the same edit.
//
// Grouped by sub (the sub saved on the complaint when filed, else the
// account's sub today, the same rule as the score), with each sub's score
// worked out by the app's own rules twice: with every complaint, and without
// the likely copies.
//
// The address comes from .env.production.local (lib/production.mjs); it is never printed.
import { neon } from "@neondatabase/serverless";
import { productionUrl } from "./lib/production.mjs";
import { buildSubcontractorPerformanceMap } from "../../lib/googleSheets";
import { buildSubcontractorPerformanceKey } from "../../lib/subAccountMatching";
import { HIDDEN_ACCOUNT_IDS, accountLive } from "../../lib/pg/account-live";

const sql = neon(productionUrl());
console.log("PRODUCTION database. Read only: nothing is changed.\n");

type Complaint = {
  sheet_row: number;
  complaint_id: string;
  account_name: string;
  account_ref: string | null;
  complaint_date_raw: string;
  issue: string;
  priority: string;
  complaint_validity: string;
  status: string;
  resolution_date_raw: string;
  updated_at_raw: string;
  sub_at_filing: string | null;
  account_sub: string | null;
  created_by: string | null;
};

const [complaints, accounts, visits, subs] = (await Promise.all([
  sql.query(`
    SELECT c.sheet_row, c.complaint_id, c.account_name, c.account_ref, c.complaint_date_raw, c.issue, c.priority, c.complaint_validity, c.status,
           c.resolution_date_raw, c.updated_at_raw, to_jsonb(c)->>'sub_at_filing' AS sub_at_filing,
           btrim(a.subcontractor_raw) AS account_sub,
           (SELECT l.actor_name FROM activity_log l WHERE l.entity_type = 'complaint' AND l.entity_id = btrim(c.complaint_id) AND l.action = 'create' ORDER BY l.created_at LIMIT 1) AS created_by
    FROM complaints c LEFT JOIN accounts a ON a.id = c.account_ref
    WHERE c.account_ref IS NULL OR c.account_ref NOT IN ${HIDDEN_ACCOUNT_IDS}
    ORDER BY c.sheet_row`),
  sql.query(`SELECT account_name, subcontractor_raw, status FROM accounts WHERE NOT is_test AND ${accountLive("accounts")} ORDER BY source_row NULLS LAST, pk`),
  sql.query(`
    SELECT visit_id, account_id_raw, account_name, visit_date_raw, visit_type, completed_by, condition_raw, follow_up_needed,
           follow_up_date_old_raw, notes, created_at_raw, updated_at_raw, follow_up_date_raw
    FROM visits WHERE account_ref IS NULL OR account_ref NOT IN ${HIDDEN_ACCOUNT_IDS} ORDER BY sheet_row`),
  sql.query(`SELECT display_id_raw, contact_name, company_name FROM subcontractors ORDER BY source_row NULLS LAST, created_at, id`),
])) as [Complaint[], Record<string, string>[], Record<string, string>[], Record<string, string>[]];

/* ---------- the groups ---------- */

const norm = (text: string | null) => String(text ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const sameDay = (a: string, b: string) => {
  const day = (text: string) => {
    const t = text.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? norm(t) : d.toISOString().slice(0, 10);
  };
  return day(a) === day(b);
};

const groups = new Map<string, Complaint[]>();
for (const c of complaints) {
  if (!norm(c.issue)) continue;
  const key = `${c.account_ref ?? norm(c.account_name)}|${norm(c.issue)}`;
  groups.set(key, [...(groups.get(key) ?? []), c]);
}

type Copy = { original: Complaint; copy: Complaint; sameDate: boolean; byStaff: boolean };
const copies: Copy[] = [];
for (const list of groups.values()) {
  if (list.length < 2) continue;
  const [original, ...rest] = list; // sheet_row order: the first one is the original
  for (const copy of rest) copies.push({ original, copy, sameDate: sameDay(original.complaint_date_raw, copy.complaint_date_raw), byStaff: Boolean(String(copy.created_by ?? "").trim()) });
}

const subOf = (c: Complaint) => (c.sub_at_filing !== null && c.sub_at_filing !== undefined ? c.sub_at_filing.trim() : (c.account_sub ?? "").trim()) || "(no sub)";

/* ---------- the score, both ways ---------- */

const row = (width: number, cells: Record<number, unknown>) => {
  const out = Array<string>(width).fill("");
  for (const [index, value] of Object.entries(cells)) out[Number(index)] = String(value ?? "");
  return out;
};
const cut = (cells: unknown[]) => {
  const out = cells.map((c) => String(c ?? ""));
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out;
};
const accountRows = accounts.map((a) => row(26, { 1: a.account_name, 8: a.subcontractor_raw, 16: a.status }));
const visitRows = visits.map((v) => cut([v.visit_id, v.account_id_raw, v.account_name, v.visit_date_raw, v.visit_type, v.completed_by, v.condition_raw, v.follow_up_needed, v.follow_up_date_old_raw, v.notes, v.created_at_raw, v.updated_at_raw, v.follow_up_date_raw]));
const subRows = subs.map((s) => row(26, { 0: s.display_id_raw, 1: s.contact_name, 2: s.company_name }));
const complaintRows = (list: Complaint[]) =>
  list.map((c) =>
    row(18, {
      2: c.account_name, 3: c.complaint_date_raw, 5: c.priority, 6: c.complaint_validity, 7: c.status, 11: c.resolution_date_raw, 14: c.updated_at_raw,
      16: c.sub_at_filing === null || c.sub_at_filing === undefined ? "" : "1",
      17: c.sub_at_filing ?? "",
    })
  );
const copyRows = new Set(copies.map((entry) => entry.copy.sheet_row));
const withAll = buildSubcontractorPerformanceMap(accountRows, visitRows, complaintRows(complaints), subRows);
const withoutCopies = buildSubcontractorPerformanceMap(accountRows, visitRows, complaintRows(complaints.filter((c) => !copyRows.has(c.sheet_row))), subRows);
const subName = new Map(subs.map((s) => [buildSubcontractorPerformanceKey(s.company_name, s.contact_name), (s.company_name || s.contact_name || "").trim()]));

/* ---------- the report ---------- */

if (copies.length === 0) {
  console.log("No likely duplicates found.");
} else {
  const bySub = new Map<string, Copy[]>();
  for (const entry of copies) bySub.set(subOf(entry.copy), [...(bySub.get(subOf(entry.copy)) ?? []), entry]);
  const strong = copies.filter((entry) => entry.sameDate && entry.byStaff).length;
  console.log(`${copies.length} likely copies in ${new Set(copies.map((entry) => entry.original.sheet_row)).size} groups (${strong} with both marks: same date AND made by staff).\n`);
  for (const [sub, list] of [...bySub].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`=== ${sub}: ${list.length} likely ${list.length === 1 ? "copy" : "copies"}`);
    for (const entry of list) {
      const marks = [entry.sameDate ? "[same date]" : "", entry.byStaff ? `[by staff: ${entry.copy.created_by}]` : ""].filter(Boolean).join(" ") || "[no marks: maybe a real second complaint]";
      console.log(`  ${entry.copy.complaint_id.trim()} (row ${entry.copy.sheet_row}, ${entry.copy.status || "no status"}, ${entry.copy.priority || "no priority"}, ${entry.copy.complaint_validity || "no validity"}) copy of ${entry.original.complaint_id.trim()} (row ${entry.original.sheet_row}, ${entry.original.status || "no status"})  ${marks}`);
      console.log(`      ${entry.copy.account_name.trim()}: "${entry.copy.issue.trim().slice(0, 90)}${entry.copy.issue.trim().length > 90 ? "..." : ""}"`);
    }
    console.log("");
  }

  console.log("=== Score by sub: with every complaint -> without the likely copies (only subs whose score or open complaints change)");
  let shown = 0;
  for (const [key, before] of withAll) {
    const after = withoutCopies.get(key);
    if (!after || (after.score === before.score && after.openComplaints === before.openComplaints)) continue;
    shown++;
    console.log(`  ${subName.get(key) || key}: score ${before.score} (${before.scoreStatus}) -> ${after.score} (${after.scoreStatus}); open complaints ${before.openComplaints} -> ${after.openComplaints}`);
  }
  if (shown === 0) console.log("  No sub's score changes (the copies are closed, not valid, or too old to count).");
}
console.log("\nNothing was changed.");
