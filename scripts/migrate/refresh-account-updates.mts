// Refreshes ONLY the Account Updates rows from the Sheet (MAIN / Account
// Updates, read-only). Nothing else is read or written: not accounts, not
// checklists, not transfer proposals. Use this, never the full accounts
// import, to bring a database up to date right before
// DATA_SOURCE_ACCOUNT_UPDATES is switched to postgres.
//
//   npx tsx scripts/migrate/refresh-account-updates.mts                 practice database, dry run
//   npx tsx scripts/migrate/refresh-account-updates.mts --write         practice database, copy in
//   npx tsx scripts/migrate/refresh-account-updates.mts --production            production, dry run
//   npx tsx scripts/migrate/refresh-account-updates.mts --production --write    production, copy in
//
// --production reads the database address from DATABASE_URL in
// .env.production.local (never printed) and refuses the practice database's
// address, so the two cannot be mixed up. Take a Neon backup branch first.
//
// Rules: a row already copied is refreshed, never doubled (same key as
// import-accounts.mts). Rows saved by the app itself (no sheet row) are never
// touched. Nothing is ever deleted. No names, notes or emails are printed.
import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { REPO_ROOT, loadEnv } from "./lib/env.mjs";
import { ALLOWED_ENDPOINTS, assertDevDatabase } from "./lib/guard.mjs";
import { cell, sha256, toDate } from "./lib/import-helpers.mjs";
import { isBlankRow, readTab } from "./lib/sheets-readonly.mjs";

loadEnv();
const write = process.argv.includes("--write");
const production = process.argv.includes("--production");

function productionUrl(): string {
  const file = path.join(REPO_ROOT, ".env.production.local");
  if (!fs.existsSync(file)) throw new Error(".env.production.local is not here. Pull it first; nothing was done.");
  const line = fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith("DATABASE_URL="));
  const url = (line ?? "").slice("DATABASE_URL=".length).trim().replace(/^"|"$/g, "");
  if (!url || url === "[SENSITIVE]") throw new Error("DATABASE_URL in .env.production.local is empty or a placeholder. Nothing was done.");
  const endpoint = new URL(url).hostname.split(".")[0].replace(/-pooler$/, "");
  if (ALLOWED_ENDPOINTS.includes(endpoint)) throw new Error("That DATABASE_URL is the practice database, not production. Nothing was done.");
  return url;
}

const url = production ? productionUrl() : assertDevDatabase(process.env.MIGRATION_DATABASE_URL);
const sql = neon(url);
console.log(`${production ? "PRODUCTION" : "Practice"} database, ${write ? "writing" : "dry run (nothing is written)"}.`);

// Same normalizing and the same key as scripts/migrate/import-accounts.mts.
const norm = (text: unknown) => String(text ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const all = ((await readTab("MAIN", "Account Updates", { range: "A:Q" })) as string[][]).slice(1).map((row, index) => ({ row, sourceRow: index + 2 }));
// Columns A and B are numbering formulas: a row with only those is blank.
const sheetRows = all.filter(({ row }) => !isBlankRow(row) && !isBlankRow(row.slice(2)));

const accounts = (await sql`SELECT pk, account_name FROM accounts`) as { pk: number; account_name: string }[];
const byName = new Map<string, number[]>();
for (const account of accounts) if (norm(account.account_name)) byName.set(norm(account.account_name), [...(byName.get(norm(account.account_name)) ?? []), account.pk]);
const accountPk = (name: string): number | null => {
  const hits = byName.get(norm(name)) ?? [];
  return hits.length === 1 ? hits[0] : null;
};

const seen = new Map<string, number>();
const rows = sheetRows.map(({ row, sourceRow }) => {
  const base = sha256("update", norm(cell(row, 2)), cell(row, 3).trim(), cell(row, 4).trim(), cell(row, 5).trim());
  const n = (seen.get(base) ?? 0) + 1;
  seen.set(base, n);
  const dateRaw = cell(row, 3);
  return {
    legacy_key: n === 1 ? base : `${base}#${n}`,
    update_id_raw: cell(row, 0),
    account_id_raw: cell(row, 1),
    account_pk: accountPk(cell(row, 2)),
    account_name: cell(row, 2),
    update_date: toDate(dateRaw),
    update_date_raw: dateRaw,
    update_type: cell(row, 4),
    notes: cell(row, 5),
    created_by: cell(row, 6),
    notify_email: cell(row, 7),
    created_at_raw: cell(row, 8),
    updated_at_raw: cell(row, 9),
    update_title: cell(row, 10),
    details: cell(row, 11),
    entered_by: cell(row, 12),
    notify_office: cell(row, 13),
    notify_subcontractor: cell(row, 14),
    follow_up_needed: cell(row, 15),
    follow_up_date_raw: cell(row, 16),
    source_sheet: "MAIN",
    source_row: sourceRow,
  };
});

const before = (await sql`SELECT legacy_key, source_sheet IS NULL AS from_app FROM account_updates`) as { legacy_key: string; from_app: boolean }[];
const known = new Set(before.filter((entry) => !entry.from_app).map((entry) => entry.legacy_key));
const fromApp = before.filter((entry) => entry.from_app).length;
const fresh = rows.filter((entry) => !known.has(entry.legacy_key));
const goneFromSheet = [...known].filter((key) => !rows.some((entry) => entry.legacy_key === key)).length;
console.log(`Sheet: ${rows.length} account updates. Database: ${known.size} copied from the sheet, ${fromApp} saved by the app itself (left alone).`);
console.log(`New from the sheet: ${fresh.length}. Already copied (refreshed): ${rows.length - fresh.length}. In the database but no longer in the sheet (kept, never deleted): ${goneFromSheet}.`);
const newest = rows.slice(-3).map((entry) => `${entry.update_date ?? entry.update_date_raw.slice(0, 10)} ${known.has(entry.legacy_key) ? "(already copied)" : "(new)"}`);
console.log(`Newest three sheet rows, by date: ${newest.join(", ")}.`);

if (!write) {
  console.log("Dry run: nothing written. Add --write to copy in.");
} else if (rows.length > 0) {
  const columns = Object.keys(rows[0]);
  const text =
    `INSERT INTO account_updates (${columns.join(", ")}, imported_at) VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")}, now()) ` +
    `ON CONFLICT (legacy_key) DO UPDATE SET ${columns.filter((c) => c !== "legacy_key").map((c) => `${c} = EXCLUDED.${c}`).join(", ")}, imported_at = now(), updated_at = now() ` +
    // Belt and braces: a row the app saved never has a sheet key, and is never overwritten.
    `WHERE account_updates.source_sheet IS NOT NULL`;
  await sql.transaction(rows.map((row) => sql.query(text, columns.map((c) => (row as Record<string, unknown>)[c]))));
  const after = ((await sql`SELECT count(*)::int AS n, count(*) FILTER (WHERE source_sheet IS NOT NULL)::int AS sheet FROM account_updates`) as { n: number; sheet: number }[])[0];
  console.log(`Done. Database now has ${after.n} account updates (${after.sheet} from the sheet). Sheet has ${rows.length}. ${after.sheet - goneFromSheet === rows.length ? "They match." : "THEY DO NOT MATCH: do not switch yet."}`);
}
