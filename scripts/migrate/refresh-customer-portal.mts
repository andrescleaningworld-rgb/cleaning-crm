// Refreshes ONLY the customer portal's rows from the Sheet (PORTAL, read
// only): who has portal access (the customer-portal tab) and the requests
// customers sent through the old portal (the three portal-* tabs). Same row
// keys as import-customer-portal.mjs, so a row is refreshed and never
// doubled. Use it right before DATA_SOURCE_CUSTOMER_PORTAL is switched to
// postgres: until that switch, staff still edit portal access in the Sheet.
//
//   npx tsx scripts/migrate/refresh-customer-portal.mts                 practice database, dry run
//   npx tsx scripts/migrate/refresh-customer-portal.mts --write         practice database, copy in
//   ... add --production for the production database (.env.production.local).
//   Only with the owner's OK, after a Neon backup branch.
//
// What it never does:
//   - It never touches a row the app made itself (a test customer, a request
//     sent through the new portal): those have no sheet row.
//   - It never brings back a portal code that was replaced by a random one.
//   - It deletes nothing. A row that is gone from the Sheet is reported.
//   - It does not run AFTER the switch. Once staff edit portal access in the
//     app, the Sheet is the old copy and writing it over the database would
//     undo their work. It checks for rows edited in the database since the
//     last copy and stops if it finds any (--force goes on anyway; do not
//     use it unless you know why those rows changed).
// No names, phones, emails or codes are printed: only counts.
import { neon } from "@neondatabase/serverless";
import { loadEnv } from "./lib/env.mjs";
import { assertDevDatabase } from "./lib/guard.mjs";
import { cell, toDate } from "./lib/import-helpers.mjs";
import { productionUrl } from "./lib/production.mjs";
import { isBlankRow, readTab } from "./lib/sheets-readonly.mjs";

loadEnv();
const args = process.argv.slice(2);
const write = args.includes("--write");
const production = args.includes("--production");
const force = args.includes("--force");
const sql = neon(production ? productionUrl() : assertDevDatabase(process.env.MIGRATION_DATABASE_URL));
console.log(`${production ? "PRODUCTION" : "Practice"} database, ${write ? "writing" : "dry run (nothing is written)"}.`);

const norm = (text: unknown) => String(text ?? "").trim().toLowerCase();

// The account a row belongs to: by its Account ID, else by its exact name when one account has it.
const accountIds = new Set(((await sql`SELECT id FROM accounts WHERE id IS NOT NULL`) as { id: string }[]).map((r) => r.id));
const accountsByName = new Map<string, string | null>();
for (const r of (await sql`SELECT id, lower(btrim(account_name)) AS name FROM accounts WHERE id IS NOT NULL AND btrim(account_name) <> ''`) as { id: string; name: string }[]) {
  accountsByName.set(r.name, accountsByName.has(r.name) ? null : r.id);
}
const linkAccount = (idText: string, nameText: string): string | null => {
  const id = idText.trim();
  if (accountIds.has(id)) return id;
  const name = norm(nameText);
  return name ? (accountsByName.get(name) ?? null) : null;
};

type Row = Record<string, string | number | null>;

/* ---------- who has portal access ---------- */

const accessRows: Row[] = ((await readTab("PORTAL", "customer-portal", { range: "A:S" })) as string[][])
  .slice(1)
  .map((row, i) => ({ row, sourceRow: i + 2 }))
  .filter(({ row }) => !isBlankRow(row))
  .map(({ row, sourceRow }) => ({
    legacy_key: `row-${sourceRow}`,
    account_id_raw: cell(row, 0),
    account_name: cell(row, 1),
    account_ref: linkAccount(cell(row, 0), cell(row, 1)),
    service_date_raw: cell(row, 2),
    service_type: cell(row, 3),
    frequency: cell(row, 4),
    cleaning_days: cell(row, 5),
    address: cell(row, 6),
    contact_name: cell(row, 7),
    phone: cell(row, 8),
    email: cell(row, 9),
    scope_of_work: cell(row, 10),
    status: cell(row, 11),
    last_visit_date_raw: cell(row, 12),
    next_scheduled_service: cell(row, 13),
    last_invoice_date_raw: cell(row, 14),
    monthly_revenue_raw: cell(row, 15),
    estimated_monthly_total_raw: cell(row, 16),
    portal_code: cell(row, 17),
    portal_access: cell(row, 18),
    sheet_row: sourceRow,
    source_sheet: "PORTAL",
    source_row: sourceRow,
  }));

// A code that was replaced by a random one is kept: the Sheet still has the old code.
const randomized = new Map(((await sql`SELECT legacy_key, portal_code FROM portal_access WHERE portal_code_randomized_at IS NOT NULL`) as { legacy_key: string; portal_code: string }[]).map((r) => [r.legacy_key, r.portal_code]));
for (const record of accessRows) if (randomized.has(String(record.legacy_key))) record.portal_code = randomized.get(String(record.legacy_key))!;

/* ---------- the requests sent through the old portal ---------- */

const REQUEST_TABS = [
  { tab: "portal-complaints", range: "A:I", status: 6, notes: 7, photos: 8 as number | null },
  { tab: "portal-service-requests", range: "A:H", status: 6, notes: 7, photos: null },
  { tab: "portal-date-changes", range: "A:H", status: 6, notes: 7, photos: null },
];
const requestRows: Row[] = [];
const perTab: Record<string, number> = {};
for (const spec of REQUEST_TABS) {
  const rows = ((await readTab("PORTAL", spec.tab, { range: spec.range })) as string[][])
    .slice(1)
    .map((row, i) => ({ row, sourceRow: i + 2 }))
    .filter(({ row }) => !isBlankRow(row));
  perTab[spec.tab] = rows.length;
  for (const { row, sourceRow } of rows) {
    requestRows.push({
      legacy_key: `${spec.tab}:row-${sourceRow}`,
      tab: spec.tab,
      account_id_raw: cell(row, 0),
      account_name: cell(row, 1),
      account_ref: linkAccount(cell(row, 0), cell(row, 1)),
      submitted_date_raw: cell(row, 2),
      submitted_date: toDate(cell(row, 2)),
      field_1: cell(row, 3),
      field_2: cell(row, 4),
      field_3: cell(row, 5),
      status: cell(row, spec.status),
      staff_notes: cell(row, spec.notes),
      photos: spec.photos === null ? "" : cell(row, spec.photos),
      sheet_row: sourceRow,
      source_sheet: "PORTAL",
      source_row: sourceRow,
    });
  }
}

/* ---------- what is there now ---------- */

type Known = { legacy_key: string; from_sheet: boolean; edited_here: boolean };
const knownOf = async (table: "portal_access" | "portal_requests") =>
  (await sql.query(
    `SELECT legacy_key, source_sheet IS NOT NULL AS from_sheet,
            (source_sheet IS NOT NULL AND imported_at IS NOT NULL AND updated_at > imported_at + interval '1 minute') AS edited_here
     FROM ${table}`
  )) as Known[];
const [accessKnown, requestsKnown] = await Promise.all([knownOf("portal_access"), knownOf("portal_requests")]);

const report = (label: string, sheet: Row[], known: Known[]) => {
  const sheetKeys = new Set(sheet.map((r) => String(r.legacy_key)));
  const fromSheet = known.filter((k) => k.from_sheet);
  const have = new Set(fromSheet.map((k) => k.legacy_key));
  const fresh = sheet.filter((r) => !have.has(String(r.legacy_key))).length;
  const gone = fromSheet.filter((k) => !sheetKeys.has(k.legacy_key)).length;
  const edited = fromSheet.filter((k) => k.edited_here).length;
  console.log(`${label}: Sheet ${sheet.length} rows. Database: ${fromSheet.length} from the Sheet, ${known.length - fromSheet.length} made by the app (left alone).`);
  console.log(`   new from the Sheet: ${fresh}. Already copied (refreshed): ${sheet.length - fresh}. In the database but gone from the Sheet (kept): ${gone}. Edited in the database since the last copy: ${edited}.`);
  return edited;
};
const editedAccess = report("Portal access", accessRows, accessKnown);
console.log(`   with access YES: ${accessRows.filter((r) => String(r.portal_access).trim().toUpperCase() === "YES").length}. With an email: ${accessRows.filter((r) => String(r.email).trim() !== "").length}. Tied to an account: ${accessRows.filter((r) => r.account_ref).length}. Random codes kept: ${randomized.size}.`);
const editedRequests = report("Old-portal requests", requestRows, requestsKnown);
console.log(`   ${Object.entries(perTab).map(([tab, n]) => `${tab}: ${n}`).join(", ")}`);

const edited = editedAccess + editedRequests;
if (edited > 0 && !force) {
  console.log(`\nSTOPPED: ${edited} row${edited === 1 ? " was" : "s were"} changed in the database after the last copy. That means the app is already being used for these, and writing the Sheet over them would undo that work. Nothing was written.`);
  process.exitCode = 1;
} else if (!write) {
  console.log("\nDry run: nothing written. Add --write to copy in.");
} else {
  const upsert = (table: string, rows: Row[]) => {
    if (rows.length === 0) return [];
    const columns = Object.keys(rows[0]);
    const statement =
      `INSERT INTO ${table} (${columns.join(", ")}, imported_at) VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")}, now()) ` +
      `ON CONFLICT (legacy_key) DO UPDATE SET ${columns.filter((c) => c !== "legacy_key").map((c) => `${c} = EXCLUDED.${c}`).join(", ")}, imported_at = now(), updated_at = now() ` +
      `WHERE ${table}.source_sheet IS NOT NULL`;
    return rows.map((row) => sql.query(statement, columns.map((c) => row[c])));
  };
  // All of it or none of it.
  await sql.transaction([...upsert("portal_access", accessRows), ...upsert("portal_requests", requestRows)]);
  const after = (await sql`
    SELECT (SELECT count(*)::int FROM portal_access WHERE source_sheet IS NOT NULL) AS access,
           (SELECT count(*)::int FROM portal_requests WHERE source_sheet IS NOT NULL) AS requests`) as { access: number; requests: number }[];
  const ok = after[0].access >= accessRows.length && after[0].requests >= requestRows.length;
  console.log(`\nDone. Database now has ${after[0].access} portal access rows and ${after[0].requests} old-portal requests from the Sheet (Sheet: ${accessRows.length} and ${requestRows.length}). ${ok ? "Every Sheet row is in." : "ROWS ARE MISSING: do not switch yet."}`);
  if (!ok) process.exitCode = 1;
}
