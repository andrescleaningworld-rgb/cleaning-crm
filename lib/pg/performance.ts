// The subcontractor performance score on Postgres. The rules live in one
// place (buildSubcontractorPerformanceMap in lib/googleSheets.ts); this file
// only hands it the same four row lists the Sheets version reads, built
// from the tables, with each value in the column position the rules expect.

import { getSql } from "@/lib/db";
import { buildSubcontractorPerformanceMap, type SubcontractorPerformance } from "@/lib/googleSheets";

/** A sheet-like row: the given values at their column positions, "" elsewhere. */
function row(width: number, cells: Record<number, unknown>): string[] {
  const out = Array<string>(width).fill("");
  for (const [index, value] of Object.entries(cells)) out[Number(index)] = String(value ?? "");
  return out;
}

/** A row as the Sheets API returns it: nothing after the last cell that has something in it. */
function cutTrailingBlanks(cells: unknown[]): string[] {
  const out = cells.map((c) => String(c ?? ""));
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out;
}

export async function getSubcontractorPerformanceMap(): Promise<Map<string, SubcontractorPerformance>> {
  const sql = getSql();
  const [accounts, visits, complaints, subs] = (await Promise.all([
    sql.query(`SELECT account_name, subcontractor_raw, status FROM accounts WHERE NOT is_test ORDER BY source_row NULLS LAST, pk`),
    sql.query(
      `SELECT visit_id, account_id_raw, account_name, visit_date_raw, visit_type, completed_by, condition_raw, follow_up_needed,
              follow_up_date_old_raw, notes, created_at_raw, updated_at_raw, follow_up_date_raw
       FROM visits WHERE account_ref IS NULL OR account_ref NOT IN (SELECT id FROM accounts WHERE is_test AND id IS NOT NULL) ORDER BY sheet_row`
    ),
    sql.query(
      `SELECT account_name, complaint_date_raw, priority, complaint_validity, status, resolution_date_raw, updated_at_raw
       FROM complaints WHERE account_ref IS NULL OR account_ref NOT IN (SELECT id FROM accounts WHERE is_test AND id IS NOT NULL) ORDER BY sheet_row`
    ),
    sql.query(`SELECT display_id_raw, contact_name, company_name FROM subcontractors ORDER BY source_row NULLS LAST, created_at, id`),
  ])) as Record<string, string>[][];

  return buildSubcontractorPerformanceMap(
    // Accounts A:Z — B name, I subcontractor, Q status
    accounts.map((a) => row(26, { 1: a.account_name, 8: a.subcontractor_raw, 16: a.status })),
    // Visits A:M, every column, cut after the last filled cell exactly as
    // the Sheets API cuts a row. It matters: the rules read a blank
    // condition as 0 when a later cell of the row is filled, and skip the
    // visit when the row ends before the condition column.
    visits.map((v) =>
      cutTrailingBlanks([
        v.visit_id, v.account_id_raw, v.account_name, v.visit_date_raw, v.visit_type, v.completed_by, v.condition_raw,
        v.follow_up_needed, v.follow_up_date_old_raw, v.notes, v.created_at_raw, v.updated_at_raw, v.follow_up_date_raw,
      ])
    ),
    // Complaints A:P — C account name, D date, F priority, G validity, H status, L resolution date, O updated at
    complaints.map((c) =>
      row(16, { 2: c.account_name, 3: c.complaint_date_raw, 5: c.priority, 6: c.complaint_validity, 7: c.status, 11: c.resolution_date_raw, 14: c.updated_at_raw })
    ),
    // Subcontractors A:Z — A id, B contact, C company
    subs.map((s) => row(26, { 0: s.display_id_raw, 1: s.contact_name, 2: s.company_name }))
  );
}
