// Area 1 verify: compares Sheets with Postgres (dev) and writes
// docs/migration-reports/catalogs-verify.md. Read-only on both sides.
//
//   node scripts/migrate/verify-catalogs.mjs
//
// Checks: row counts, every row field by field (these tabs are small, so all
// rows instead of a sample of 10), status counts, date ranges. The report
// holds counts and column names only, no cell values.
import { getSql } from "./lib/pg.mjs";
import { cell, sha256 } from "./lib/import-helpers.mjs";
import { table, today, writeReport } from "./lib/report.mjs";
import { isBlankRow, readTab } from "./lib/sheets-readonly.mjs";

const sql = getSql();
const iso = (value) => (value ? new Date(value).toISOString() : "");

// For each table: where it comes from, how a sheet row maps to its key, and
// which DB column must equal which sheet cell (as text).
const TABLES = [
  {
    table: "changelog_entries",
    sheet: "PORTAL",
    tab: "ChangeLog",
    range: "A:C",
    key: (r) => sha256(cell(r, 0).trim(), cell(r, 1).trim(), cell(r, 2).trim()),
    keep: () => true,
    fields: { entry_date_raw: (r) => cell(r, 0), version: (r) => cell(r, 1), description: (r) => cell(r, 2) },
    dateColumn: "entry_date",
  },
  {
    table: "geocode_cache",
    sheet: "MAIN",
    tab: "GeocodeCache",
    range: "A:D",
    key: (r) => cell(r, 0).trim(),
    keep: (r) => cell(r, 0).trim() !== "" && cell(r, 1).trim() !== "" && cell(r, 2).trim() !== "" && !Number.isNaN(Number(cell(r, 1))) && !Number.isNaN(Number(cell(r, 2))),
    fields: { latitude: (r) => String(Number(cell(r, 1))), longitude: (r) => String(Number(cell(r, 2))), geocoded_at_raw: (r) => cell(r, 3) },
    dateColumn: "geocoded_at",
  },
  {
    table: "extra_services",
    sheet: "PORTAL",
    tab: "ExtraServices",
    range: "A:F",
    key: (r) => cell(r, 0),
    keep: (r) => cell(r, 0) !== "",
    fields: {
      name: (r) => cell(r, 1),
      description: (r) => cell(r, 2),
      image_url: (r) => cell(r, 3),
      active: (r) => String(cell(r, 4).trim().toUpperCase() !== "NO"),
      sort_order: (r) => String(Math.trunc(Number(cell(r, 5))) || 0),
    },
    statusColumn: "active",
  },
  {
    table: "documents",
    sheet: "MAIN",
    tab: "Documents",
    range: "A:H",
    key: (r) => cell(r, 0),
    keep: (r) => cell(r, 0) !== "",
    fields: {
      name: (r) => cell(r, 1),
      category: (r) => cell(r, 2),
      file_name: (r) => cell(r, 3),
      file_url: (r) => cell(r, 4),
      file_size: (r) => String(Math.trunc(Number(cell(r, 5))) || 0),
      uploaded_at_raw: (r) => cell(r, 6),
      uploaded_by: (r) => cell(r, 7),
    },
    statusColumn: "category",
    dateColumn: "uploaded_at",
    sumColumn: "file_size",
    sheetSum: (r) => Math.trunc(Number(cell(r, 5))) || 0,
  },
  {
    table: "document_sends",
    sheet: "MAIN",
    tab: "DocumentSends",
    range: "A:H",
    key: (r) => cell(r, 0),
    keep: (r) => cell(r, 0) !== "",
    fields: {
      document_id: (r) => cell(r, 1),
      document_name: (r) => cell(r, 2),
      subcontractor_id_raw: (r) => cell(r, 3),
      subcontractor_name: (r) => cell(r, 4),
      sent_by: (r) => cell(r, 5),
      sent_at_raw: (r) => cell(r, 6),
      note: (r) => cell(r, 7),
    },
    dateColumn: "sent_at",
  },
];

let failed = false;
const countRows = [];
const sections = [];

for (const spec of TABLES) {
  const sheetRows = (await readTab(spec.sheet, spec.tab, { range: spec.range })).slice(1).filter((r) => !isBlankRow(r));
  const expected = sheetRows.filter(spec.keep);
  const dbRows = await sql.query(`SELECT * FROM ${spec.table} WHERE source_sheet IS NOT NULL`);
  const createdHere = (await sql.query(`SELECT count(*)::int AS n FROM ${spec.table} WHERE source_sheet IS NULL`))[0].n;
  const byKey = new Map(dbRows.map((row) => [row.legacy_key, row]));

  const mismatches = new Map(); // column → rows that differ
  let missing = 0;
  for (const row of expected) {
    const db = byKey.get(spec.key(row));
    if (!db) {
      missing++;
      continue;
    }
    for (const [column, fromSheet] of Object.entries(spec.fields)) {
      if (String(db[column] ?? "") !== fromSheet(row)) mismatches.set(column, (mismatches.get(column) ?? 0) + 1);
    }
  }
  const expectedKeys = new Set(expected.map(spec.key));
  const extra = dbRows.filter((row) => !expectedKeys.has(row.legacy_key)).length;
  const mismatchTotal = [...mismatches.values()].reduce((a, b) => a + b, 0);
  const ok = missing === 0 && extra === 0 && mismatchTotal === 0 && expectedKeys.size === dbRows.length;
  if (!ok) failed = true;

  countRows.push([
    spec.table,
    `${spec.sheet}/${spec.tab}`,
    sheetRows.length,
    sheetRows.length - expected.length,
    dbRows.length,
    missing,
    extra,
    mismatchTotal,
    createdHere,
    ok ? "✓" : "✗",
  ]);

  const lines = [`### ${spec.table}`, ""];
  lines.push(
    `${expected.length} rows checked field by field (${Object.keys(spec.fields).length} columns each): ` +
      (mismatchTotal === 0 ? "all equal." : [...mismatches].map(([c, n]) => `${c} differs in ${n} rows`).join("; ") + ".")
  );
  if (spec.statusColumn) {
    const counts = await sql.query(`SELECT ${spec.statusColumn}::text AS value, count(*)::int AS n FROM ${spec.table} GROUP BY 1 ORDER BY 1`);
    lines.push("", `Counts by ${spec.statusColumn}: ${counts.map((c) => `${c.value || "(blank)"} ${c.n}`).join(", ") || "none"}.`);
  }
  if (spec.dateColumn) {
    const [range] = await sql.query(
      `SELECT min(${spec.dateColumn}) AS lo, max(${spec.dateColumn}) AS hi, count(*) FILTER (WHERE ${spec.dateColumn} IS NULL)::int AS unparsed FROM ${spec.table}`
    );
    lines.push("", `${spec.dateColumn}: ${iso(range.lo).slice(0, 10) || "–"} to ${iso(range.hi).slice(0, 10) || "–"}; ${range.unparsed} rows where the text is not a date.`);
  }
  if (spec.sumColumn) {
    const [sum] = await sql.query(`SELECT coalesce(sum(${spec.sumColumn}), 0)::bigint AS total FROM ${spec.table} WHERE source_sheet IS NOT NULL`);
    const sheetTotal = expected.reduce((a, r) => a + spec.sheetSum(r), 0);
    if (String(sum.total) !== String(sheetTotal)) failed = true;
    lines.push("", `Sum of ${spec.sumColumn}: sheets ${sheetTotal} / postgres ${sum.total} ${String(sum.total) === String(sheetTotal) ? "✓" : "✗"}`);
  }
  sections.push(lines.join("\n"));
  console.log(`${ok ? "OK  " : "FAIL"} ${spec.table}: sheets ${expected.length} / postgres ${dbRows.length}, missing ${missing}, extra ${extra}, field mismatches ${mismatchTotal}`);
}

const [issues] = await sql`SELECT count(*)::int AS n FROM migration_issues WHERE area = 'catalogs' AND status = 'open'`;
const report = [
  "# catalogs – verify",
  "",
  `Run ${today()} by \`scripts/migrate/verify-catalogs.mjs\`. Sheets (read-only) compared with the Neon dev branch. Counts only, no cell values.`,
  "",
  `**Result: ${failed ? "DIFFERENCES FOUND" : "all tables match"}.** Open questions in \`migration_issues\`: ${issues.n}.`,
  "",
  table(
    ["Table", "From", "Sheet rows", "Skipped by rule", "Postgres rows", "Missing", "Extra", "Field mismatches", "Created in Postgres", "OK"],
    countRows
  ),
  "",
  "\"Skipped by rule\" = rows the app itself ignores today (no ID, or a geocode row without coordinates).",
  "",
  "## Per table",
  "",
  sections.join("\n\n"),
].join("\n");
console.log(`Report: ${writeReport("catalogs", report, "verify")}`);
process.exitCode = failed ? 1 : 0;
