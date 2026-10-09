// Area 10 import: "Sales & Commissions" (MAIN) → Postgres (dev branch only;
// Sheets read-only).
//
//   node scripts/migrate/import-sales.mjs --dry-run    read, count, report; write nothing
//   node scripts/migrate/import-sales.mjs              upsert by legacy_key
//
// Safe to re-run. Rows that vanished from Sheets are reported, never deleted.
// Run after import-accounts: the link to an account is looked up in Postgres.
import { isBlankRow, readTab } from "./lib/sheets-readonly.mjs";
import { cell, compareKeys, existingKeys, startRun, toDate, toTimestamp, upsertRows } from "./lib/import-helpers.mjs";

const dryRun = process.argv.includes("--dry-run");
const run = await startRun("sales", { dryRun });
const { sql } = run;

const norm = (text) => String(text ?? "").trim().toLowerCase();
/** A number for the typed column: "$1,200.50" and "4%" are accepted; anything else → null. */
const toNumber = (raw) => {
  const text = String(raw ?? "").replace(/[$,%\s]/g, "");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

const accountIds = new Set((await sql.query("SELECT id FROM accounts WHERE id IS NOT NULL")).map((r) => r.id));
const accountsByName = new Map();
for (const r of await sql.query("SELECT id, lower(btrim(account_name)) AS name FROM accounts WHERE id IS NOT NULL AND btrim(account_name) <> ''")) {
  accountsByName.set(r.name, accountsByName.has(r.name) ? null : r.id);
}

try {
  const all = (await readTab("MAIN", "Sales & Commissions", { range: "A:T" })).slice(1).map((row, i) => ({ row, sourceRow: i + 2 }));
  const rows = all.filter(({ row }) => !isBlankRow(row));
  const seen = new Set();
  const records = [];
  for (const { row, sourceRow } of rows) {
    const saleId = cell(row, 0).trim();
    let key = saleId || `row-${sourceRow}`;
    if (!saleId) run.issue("sales", key, `Row ${sourceRow}: no Sale ID. Kept; the app does not show this row.`);
    if (seen.has(key)) {
      run.issue("sales", key, `Row ${sourceRow}: this Sale ID is already used by an earlier row. Both kept.`);
      key = `${saleId}#${sourceRow}`;
    }
    seen.add(key);

    const byId = accountIds.has(cell(row, 1).trim()) ? cell(row, 1).trim() : null;
    const name = norm(cell(row, 2));
    const accountRef = byId ?? (name ? accountsByName.get(name) ?? null : null);
    if (!accountRef && (cell(row, 1).trim() || name)) run.issue("sales", key, "Neither the Account ID nor the Account Name matches an account. Kept as text, not linked.", { rawValue: cell(row, 2) });

    // The app reads these with Number(): text like "$500.00" counts as 0 on the screens.
    for (const [column, index] of [["Amount Sold", 7], ["Commission %", 8], ["Commission $", 9], ["Amount", 16]]) {
      const text = cell(row, index).trim();
      if (text && !Number.isFinite(Number(text))) run.issue("sales", key, `${column} is not a plain number, so the app reads it as 0.`, { rawValue: text });
    }
    if (cell(row, 7).trim() === "" && cell(row, 16).trim() !== "") run.issue("sales", key, "Amount Sold (column H) is empty but the old Amount column (Q) has a value.", { rawValue: cell(row, 16) });

    records.push({
      legacy_key: key,
      sale_id: cell(row, 0),
      account_id_raw: cell(row, 1),
      account_name: cell(row, 2),
      account_ref: accountRef,
      sale_date_raw: cell(row, 3),
      sale_date: toDate(cell(row, 3)),
      service_sold: cell(row, 4),
      work_order_estimate_number: cell(row, 5),
      sold_by: cell(row, 6),
      amount_sold_raw: cell(row, 7),
      amount_sold: toNumber(cell(row, 7)),
      commission_percent_raw: cell(row, 8),
      commission_percent: toNumber(cell(row, 8)),
      commission_amount_raw: cell(row, 9),
      commission_amount: toNumber(cell(row, 9)),
      status: cell(row, 10),
      notes: cell(row, 11),
      created_at_raw: cell(row, 12),
      sale_created_at: toTimestamp(cell(row, 12)),
      updated_at_raw: cell(row, 13),
      sale_updated_at: toTimestamp(cell(row, 13)),
      service_type: cell(row, 14),
      manager: cell(row, 15),
      amount_raw: cell(row, 16),
      commission_amount_old_raw: cell(row, 17),
      recurring_start_date_raw: cell(row, 18),
      recurring_start_date: toDate(cell(row, 18)),
      recurring_end_date_raw: cell(row, 19),
      recurring_end_date: toDate(cell(row, 19)),
      sheet_row: sourceRow,
      source_sheet: "MAIN",
      source_row: sourceRow,
    });
  }

  const before = await existingKeys(sql, "sales");
  const diff = compareKeys(run, "sales", records.map((r) => r.legacy_key), before);
  if (!dryRun) await upsertRows(sql, "sales", records);
  run.count("sales", { sheetRows: rows.length, blank: all.length - rows.length, imported: records.length, ...diff, linkedToAccount: records.filter((r) => r.account_ref).length });

  await run.finish("ok");
} catch (error) {
  console.error("Import failed:", error);
  await run.finish("failed").catch(() => undefined);
  process.exitCode = 1;
}
