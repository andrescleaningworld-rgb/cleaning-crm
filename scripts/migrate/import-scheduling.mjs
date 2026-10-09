// Area 6 import: SubSchedules, ScheduleExceptions (MAIN) and
// subcontractor-visits (PORTAL) → Postgres (dev branch only; Sheets
// read-only).
//
//   node scripts/migrate/import-scheduling.mjs --dry-run    read, count, report; write nothing
//   node scripts/migrate/import-scheduling.mjs              upsert by legacy_key
//
// Safe to re-run. Rows that vanished from Sheets are reported, never deleted.
// Run after import-subs and import-accounts: the links to accounts and
// subcontractors are looked up in Postgres.
import { isBlankRow, readTab } from "./lib/sheets-readonly.mjs";
import { cell, compareKeys, existingKeys, startRun, toDate, toTimestamp, upsertRows } from "./lib/import-helpers.mjs";

const dryRun = process.argv.includes("--dry-run");
const run = await startRun("scheduling", { dryRun });
const { sql } = run;

const norm = (text) => String(text ?? "").trim().toLowerCase();

// Lookups for the links. Only exact matches; nothing is guessed.
const accountIds = new Set((await sql.query("SELECT id FROM accounts WHERE id IS NOT NULL")).map((r) => r.id));
const accountsByName = new Map();
for (const r of await sql.query("SELECT id, lower(btrim(account_name)) AS name FROM accounts WHERE id IS NOT NULL AND btrim(account_name) <> ''")) {
  accountsByName.set(r.name, accountsByName.has(r.name) ? null : r.id); // null = more than one account with this name
}
const subsByEmail = new Map();
for (const r of await sql.query("SELECT id, lower(btrim(email)) AS email FROM subcontractors WHERE btrim(email) <> ''")) {
  subsByEmail.set(r.email, subsByEmail.has(r.email) ? null : r.id); // null = more than one sub with this email
}

/**
 * Reads a tab and turns each non-blank row into a record. The app shows every
 * row, with or without an ID, so every row is kept: the key is the ID, or
 * row-<n> when the ID is blank, or <id>#<n> for a repeated ID.
 */
async function importTable(table, sheet, tab, range, idColumn, toRecord) {
  const all = (await readTab(sheet, tab, { range })).slice(1).map((row, i) => ({ row, sourceRow: i + 2 }));
  const rows = all.filter(({ row }) => !isBlankRow(row));
  const seen = new Set();
  const records = [];
  for (const { row, sourceRow } of rows) {
    const id = cell(row, 0);
    let key = id || `row-${sourceRow}`;
    if (!id) run.issue(table, key, `Row ${sourceRow}: no ID. Kept (the app shows it too).`);
    if (seen.has(key)) {
      run.issue(table, key, `Row ${sourceRow}: this ID is already used by an earlier row. Both kept.`);
      key = `${id}#${sourceRow}`;
    }
    seen.add(key);
    records.push({ legacy_key: key, [idColumn]: id, ...toRecord(row, key), sheet_row: sourceRow, source_sheet: sheet, source_row: sourceRow });
  }
  const before = await existingKeys(sql, table);
  const diff = compareKeys(run, table, records.map((r) => r.legacy_key), before);
  if (!dryRun) await upsertRows(sql, table, records);
  run.count(table, { sheetRows: rows.length, blank: all.length - rows.length, imported: records.length, ...diff });
  return records;
}

/** Notes a date cell that holds text which is not a date. The text is kept either way. */
const checkedDate = (table, key, column, raw) => {
  const value = toDate(raw);
  if (String(raw).trim() && !value) run.issue(table, key, `${column} is not a date. Kept as text.`, { rawValue: raw });
  return value;
};

const accountRef = (table, key, accountId) => {
  if (!accountId.trim()) return null;
  if (accountIds.has(accountId.trim())) return accountId.trim();
  run.issue(table, key, "AccountID matches no account. Kept as text, not linked.", { rawValue: accountId });
  return null;
};

const subRef = (table, key, email) => {
  const wanted = norm(email);
  if (!wanted) return null;
  const id = subsByEmail.get(wanted);
  if (id) return id;
  run.issue(table, key, id === null ? "This email belongs to more than one subcontractor. Kept as text, not linked." : "This email belongs to no current subcontractor. Kept as text, not linked.", { rawValue: email });
  return null;
};

try {
  const schedules = await importTable("sub_schedules", "MAIN", "SubSchedules", "A:P", "schedule_id", (row, key) => ({
    account_id: cell(row, 1),
    account_ref: accountRef("sub_schedules", key, cell(row, 1)),
    sub_id_raw: cell(row, 2),
    subcontractor_id: subRef("sub_schedules", key, cell(row, 2)),
    day_of_week: cell(row, 3),
    time_window: cell(row, 4),
    recurring: cell(row, 5),
    effective_start_raw: cell(row, 6),
    effective_start: checkedDate("sub_schedules", key, "EffectiveStart", cell(row, 6)),
    effective_end_raw: cell(row, 7),
    effective_end: checkedDate("sub_schedules", key, "EffectiveEnd", cell(row, 7)),
    status: cell(row, 8),
    submitted_by: cell(row, 9),
    submitted_date_raw: cell(row, 10),
    submitted_date: checkedDate("sub_schedules", key, "SubmittedDate", cell(row, 10)),
    last_edited_by: cell(row, 11),
    last_edited_date_raw: cell(row, 12),
    last_edited_at: toTimestamp(cell(row, 12)),
    frequency: cell(row, 13),
    monthly_occurrence: cell(row, 14),
    submitted_via: cell(row, 15),
  }));
  run.count("sub_schedules", {
    linkedToAccount: schedules.filter((s) => s.account_ref).length,
    linkedToSub: schedules.filter((s) => s.subcontractor_id).length,
    distinctUnlinkedSubEmails: new Set(schedules.filter((s) => !s.subcontractor_id).map((s) => norm(s.sub_id_raw))).size,
  });

  await importTable("schedule_exceptions", "MAIN", "ScheduleExceptions", "A:I", "exception_id", (row, key) => ({
    account_id: cell(row, 1),
    account_ref: accountRef("schedule_exceptions", key, cell(row, 1)),
    original_date_raw: cell(row, 2),
    original_date: checkedDate("schedule_exceptions", key, "OriginalDate", cell(row, 2)),
    type: cell(row, 3),
    new_date_raw: cell(row, 4),
    new_date: checkedDate("schedule_exceptions", key, "NewDate", cell(row, 4)),
    new_time_window: cell(row, 5),
    reason: cell(row, 6),
    created_by: cell(row, 7),
    created_date_raw: cell(row, 8),
    created_date: checkedDate("schedule_exceptions", key, "CreatedDate", cell(row, 8)),
  }));

  const visits = await importTable("subcontractor_visits", "PORTAL", "subcontractor-visits", "A:G", "visit_id", (row, key) => {
    const name = norm(cell(row, 1));
    const byName = name ? accountsByName.get(name) : undefined;
    if (name && !byName) {
      run.issue("subcontractor_visits", key, byName === null ? "More than one account has this name. Kept as text, not linked." : "AccountName matches no account. Kept as text, not linked.", { rawValue: cell(row, 1) });
    }
    return {
      account_name: cell(row, 1),
      account_ref: byName ?? null,
      sub_email: cell(row, 2),
      subcontractor_id: subRef("subcontractor_visits", key, cell(row, 2)),
      sub_name: cell(row, 3),
      visit_date_raw: cell(row, 4),
      visit_date: checkedDate("subcontractor_visits", key, "VisitDate", cell(row, 4)),
      arrival_time: cell(row, 5),
      notes: cell(row, 6),
    };
  });
  run.count("subcontractor_visits", { linkedToAccount: visits.filter((v) => v.account_ref).length, linkedToSub: visits.filter((v) => v.subcontractor_id).length });

  await run.finish("ok");
} catch (error) {
  console.error("Import failed:", error);
  await run.finish("failed").catch(() => undefined);
  process.exitCode = 1;
}
