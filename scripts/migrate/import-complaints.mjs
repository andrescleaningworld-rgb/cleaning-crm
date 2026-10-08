// Area 8 import: Complaints (MAIN) → Postgres (dev branch only; Sheets
// read-only).
//
//   node scripts/migrate/import-complaints.mjs --dry-run    read, count, report; write nothing
//   node scripts/migrate/import-complaints.mjs              upsert by legacy_key
//
// Safe to re-run. Rows that vanished from Sheets are reported, never deleted.
// Never touches resolution_note (it does not exist in Sheets).
// Run after import-accounts: the link to an account is looked up in Postgres.
import { isBlankRow, readTab } from "./lib/sheets-readonly.mjs";
import { cell, compareKeys, existingKeys, startRun, toDate, toTimestamp, upsertRows } from "./lib/import-helpers.mjs";

const dryRun = process.argv.includes("--dry-run");
const run = await startRun("complaints", { dryRun });
const { sql } = run;

const norm = (text) => String(text ?? "").trim().toLowerCase();

// Accounts by id, and by exact name (null = more than one account has it).
const accountIds = new Set((await sql.query("SELECT id FROM accounts WHERE id IS NOT NULL")).map((r) => r.id));
const accountsByName = new Map();
for (const r of await sql.query("SELECT id, lower(btrim(account_name)) AS name FROM accounts WHERE id IS NOT NULL AND btrim(account_name) <> ''")) {
  accountsByName.set(r.name, accountsByName.has(r.name) ? null : r.id);
}

try {
  // The app (Apps Script getComplaints) returns every row that has data.
  const all = (await readTab("MAIN", "Complaints", { range: "A:P" })).slice(1).map((row, i) => ({ row, sourceRow: i + 2 }));
  const rows = all.filter(({ row }) => !isBlankRow(row));
  const seen = new Set();
  const records = [];
  const byAccountAndIssue = new Map();
  for (const { row, sourceRow } of rows) {
    const complaintId = cell(row, 0).trim();
    let key = complaintId || `row-${sourceRow}`;
    if (!complaintId) run.issue("complaints", key, `Row ${sourceRow}: no Complaint ID. Kept (the list shows it).`);
    if (seen.has(key)) {
      run.issue("complaints", key, `Row ${sourceRow}: this Complaint ID is already used by an earlier row. Both kept.`);
      key = `${complaintId}#${sourceRow}`;
    }
    seen.add(key);

    const byId = accountIds.has(cell(row, 1).trim()) ? cell(row, 1).trim() : null;
    const name = norm(cell(row, 2));
    const byName = name ? accountsByName.get(name) ?? null : null;
    const accountRef = byId ?? byName;
    if (!accountRef) run.issue("complaints", key, "Neither the Account ID nor the Account Name matches an account. Kept as text, not linked.", { rawValue: cell(row, 2) });
    else if (byId && byName && byId !== byName) run.issue("complaints", key, "Account ID and Account Name point at two different accounts. Linked by ID.", { rawValue: cell(row, 2) });

    const dateRaw = cell(row, 3);
    const day = toDate(dateRaw);
    if (dateRaw.trim() && !day) run.issue("complaints", key, "Complaint Date is not a date. Kept as text.", { rawValue: dateRaw });

    // Same account, same issue text, more than once: likely a copy made by
    // "Save changes" on the complaint page (it adds a row instead of editing).
    const twin = `${norm(cell(row, 2))}|${norm(cell(row, 4))}`;
    byAccountAndIssue.set(twin, [...(byAccountAndIssue.get(twin) ?? []), key]);

    records.push({
      legacy_key: key,
      complaint_id: cell(row, 0),
      account_id_raw: cell(row, 1),
      account_name: cell(row, 2),
      account_ref: accountRef,
      complaint_date_raw: dateRaw,
      complaint_date: day,
      issue: cell(row, 4),
      priority: cell(row, 5),
      complaint_validity: cell(row, 6),
      status: cell(row, 7),
      reported_by: cell(row, 8),
      assigned_to: cell(row, 9),
      last_follow_up_date_raw: cell(row, 10),
      last_follow_up_date: toDate(cell(row, 10)),
      resolution_date_raw: cell(row, 11),
      notes: cell(row, 12),
      created_at_raw: cell(row, 13),
      updated_at_raw: cell(row, 14),
      complaint_updated_at: toTimestamp(cell(row, 14)),
      last_follow_up_raw: cell(row, 15),
      sheet_row: sourceRow,
      source_sheet: "MAIN",
      source_row: sourceRow,
    });
  }
  let copies = 0;
  for (const [, keys] of byAccountAndIssue) {
    if (keys.length < 2) continue;
    copies += keys.length - 1;
    run.issue("complaints", keys[0], `${keys.length} complaints have the same account and the same issue text (${keys.join(", ")}). Possibly copies. All kept.`);
  }

  const before = await existingKeys(sql, "complaints");
  const diff = compareKeys(run, "complaints", records.map((r) => r.legacy_key), before);
  if (!dryRun) await upsertRows(sql, "complaints", records);
  run.count("complaints", { sheetRows: rows.length, blank: all.length - rows.length, imported: records.length, ...diff, linkedToAccount: records.filter((r) => r.account_ref).length, possibleCopies: copies });

  await run.finish("ok");
} catch (error) {
  console.error("Import failed:", error);
  await run.finish("failed").catch(() => undefined);
  process.exitCode = 1;
}
