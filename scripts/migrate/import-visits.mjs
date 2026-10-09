// Area 7 import: Visits and VisitEditLog (MAIN) → Postgres (dev branch only;
// Sheets read-only).
//
//   node scripts/migrate/import-visits.mjs --dry-run    read, count, report; write nothing
//   node scripts/migrate/import-visits.mjs              upsert by legacy_key
//
// Safe to re-run. Rows that vanished from Sheets are reported, never deleted.
// Run after import-accounts: the link to an account is looked up in Postgres.
import { isBlankRow, readTab } from "./lib/sheets-readonly.mjs";
import { cell, compareKeys, dedupe, existingKeys, startRun, toTimestamp, upsertRows } from "./lib/import-helpers.mjs";

const dryRun = process.argv.includes("--dry-run");
const run = await startRun("visits", { dryRun });
const { sql } = run;

const norm = (text) => String(text ?? "").trim().toLowerCase();
const pad = (n) => String(n).padStart(2, "0");

/**
 * YYYY-MM-DD for the typed column. The sheet holds "3/26/24", "6/9/2026",
 * "6/9/2026 7:40:36", "2026-06-15" and ISO date-times; anything else → null.
 */
const toDay = (raw) => {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const isoDay = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (isoDay) return `${isoDay[1]}-${isoDay[2]}-${isoDay[3]}`;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const toNumber = (raw) => {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

// Accounts by exact name; null = more than one account has this name.
const accountsByName = new Map();
for (const r of await sql.query("SELECT id, lower(btrim(account_name)) AS name FROM accounts WHERE id IS NOT NULL AND btrim(account_name) <> ''")) {
  accountsByName.set(r.name, accountsByName.has(r.name) ? null : r.id);
}

try {
  // ----- Visits. The app (Apps Script getVisits) returns every row that has
  // any data, so every non-blank row is kept, with or without an ID.
  const all = (await readTab("MAIN", "Visits", { range: "A:M" })).slice(1).map((row, i) => ({ row, sourceRow: i + 2 }));
  const rows = all.filter(({ row }) => !isBlankRow(row));
  const seen = new Set();
  const visits = [];
  let linked = 0;
  const unlinkedNames = new Set();
  for (const { row, sourceRow } of rows) {
    const visitId = cell(row, 0).trim();
    let key = visitId || `row-${sourceRow}`;
    if (!visitId) run.issue("visits", key, `Row ${sourceRow}: no Visit ID. Kept (the visit list shows it; the Visit page cannot open it).`);
    if (seen.has(key)) {
      run.issue("visits", key, `Row ${sourceRow}: this Visit ID is already used by an earlier row. Both kept.`);
      key = `${visitId}#${sourceRow}`;
    }
    seen.add(key);

    const name = norm(cell(row, 2));
    const accountRef = name ? accountsByName.get(name) ?? null : null;
    if (accountRef) linked++;
    else if (name) unlinkedNames.add(name);

    const dateRaw = cell(row, 3);
    const day = toDay(dateRaw);
    if (dateRaw.trim() && !day) run.issue("visits", key, "Visit Date is not a date. Kept as text.", { rawValue: dateRaw });
    if (!dateRaw.trim()) run.issue("visits", key, `Row ${sourceRow}: no Visit Date.`);

    visits.push({
      legacy_key: key,
      visit_id: cell(row, 0),
      account_id_raw: cell(row, 1),
      account_name: cell(row, 2),
      account_ref: accountRef,
      visit_date_raw: dateRaw,
      visit_date: day,
      visit_type: cell(row, 4),
      completed_by: cell(row, 5),
      condition_raw: cell(row, 6),
      condition_score: toNumber(cell(row, 6)),
      follow_up_needed: cell(row, 7),
      follow_up_date_old_raw: cell(row, 8),
      notes: cell(row, 9),
      created_at_raw: cell(row, 10),
      visit_created_at: toTimestamp(cell(row, 10)),
      updated_at_raw: cell(row, 11),
      visit_updated_at: toTimestamp(cell(row, 11)),
      follow_up_date_raw: cell(row, 12),
      follow_up_date: toDay(cell(row, 12)),
      sheet_row: sourceRow,
      source_sheet: "MAIN",
      source_row: sourceRow,
    });
  }
  // One question per account name that matches nothing, not one per visit.
  for (const name of unlinkedNames) {
    const count = visits.filter((v) => norm(v.account_name) === name).length;
    run.issue("visits", `account-name:${name}`, `${count} visit(s) name an account that ${accountsByName.get(name) === null ? "more than one account has" : "matches no account"}. Kept as text, not linked.`, { rawValue: name });
  }
  {
    const before = await existingKeys(sql, "visits");
    const diff = compareKeys(run, "visits", visits.map((r) => r.legacy_key), before);
    if (!dryRun) await upsertRows(sql, "visits", visits);
    run.count("visits", { sheetRows: rows.length, blank: all.length - rows.length, imported: visits.length, ...diff, linkedToAccount: linked, accountNamesNotLinked: unlinkedNames.size });
  }

  // ----- VisitEditLog. The app hides rows without an ID.
  const visitIds = new Set(visits.map((v) => v.visit_id.trim()).filter(Boolean));
  const logAll = (await readTab("MAIN", "VisitEditLog", { range: "A:E" })).slice(1).map((row, i) => ({ row, sourceRow: i + 2 }));
  const logRows = logAll.filter(({ row }) => !isBlankRow(row));
  const log = [];
  let skipped = 0;
  for (const { row, sourceRow } of logRows) {
    const id = cell(row, 0);
    if (!id) {
      run.issue("visit_edit_log", `row-${sourceRow}`, `Row ${sourceRow}: no ID. Skipped (the app hides it too).`);
      skipped++;
      continue;
    }
    if (!visitIds.has(cell(row, 1).trim())) run.issue("visit_edit_log", id, "VisitID matches no visit. Kept as it is.", { rawValue: cell(row, 1) });
    log.push({
      id,
      legacy_key: id,
      visit_id: cell(row, 1),
      edited_by: cell(row, 2),
      edited_at_raw: cell(row, 3),
      edited_at: toTimestamp(cell(row, 3)),
      change_summary: cell(row, 4),
      sheet_row: sourceRow,
      source_sheet: "MAIN",
      source_row: sourceRow,
    });
  }
  {
    const unique = dedupe(run, "visit_edit_log", log);
    const before = await existingKeys(sql, "visit_edit_log");
    const diff = compareKeys(run, "visit_edit_log", unique.map((r) => r.legacy_key), before);
    if (!dryRun) await upsertRows(sql, "visit_edit_log", unique);
    run.count("visit_edit_log", { sheetRows: logRows.length, blank: logAll.length - logRows.length, skipped, imported: unique.length, ...diff });
  }

  await run.finish("ok");
} catch (error) {
  console.error("Import failed:", error);
  await run.finish("failed").catch(() => undefined);
  process.exitCode = 1;
}
