// Shared verify logic for scripts/migrate/verify-<area>.mjs: compares Sheets
// with the dev branch table by table and writes
// docs/migration-reports/<area>-verify.md. Counts and column names only, no
// cell values.
//
// A table spec:
//   { table, sheet, tab, range,
//     key(row, sourceRow)   → legacy_key of a sheet row
//     keep(row)             → false for rows the app itself ignores
//     fields: { db_column: (row, sourceRow) => expected text }
//     keyColumn?            → DB column that holds the key (default legacy_key)
//     readOptions?          → extra options for readTab (e.g. { unformatted: true })
//     statusColumn?, dateColumn?, sumColumn? + sheetSum?(row),
//     sampleSize?           → check only N random rows field by field
//                             (default: every row) }
import { getSql } from "./pg.mjs";
import { table, today, writeReport } from "./report.mjs";
import { isBlankRow, readTab } from "./sheets-readonly.mjs";

const iso = (value) => (value ? new Date(value).toISOString() : "");
const asText = (value) => (value === null || value === undefined ? "" : value instanceof Date ? value.toISOString() : String(value));

export async function runVerify(area, tables, { extraSections = [] } = {}) {
  const sql = getSql();
  let failed = false;
  const countRows = [];
  const sections = [];

  for (const spec of tables) {
    const all = (await readTab(spec.sheet, spec.tab, { range: spec.range, ...(spec.readOptions ?? {}) })).slice(1).map((row, i) => ({ row, sourceRow: i + 2 }));
    const sheetRows = all.filter(({ row }) => !isBlankRow(row));
    // The key is worked out once per row, in sheet order, so a key function may count repeats.
    const expected = sheetRows
      .filter(({ row }) => (spec.keep ? spec.keep(row) : true))
      .map((entry) => ({ ...entry, key: spec.key(entry.row, entry.sourceRow) }));
    const dbRows = await sql.query(`SELECT * FROM ${spec.table} WHERE source_sheet IS NOT NULL`);
    const createdHere = (await sql.query(`SELECT count(*)::int AS n FROM ${spec.table} WHERE source_sheet IS NULL`))[0].n;
    // keyColumn: the DB column the sheet key is compared with (default legacy_key).
    const keyColumn = spec.keyColumn ?? "legacy_key";
    const byKey = new Map(dbRows.map((row) => [row[keyColumn], row]));

    // Field-by-field: every row, or a random sample plus nothing else.
    let toCheck = expected;
    if (spec.sampleSize && expected.length > spec.sampleSize) {
      toCheck = [...expected].sort(() => Math.random() - 0.5).slice(0, spec.sampleSize);
    }
    const checkKeys = new Set(toCheck.map((entry) => entry.key));

    const mismatches = new Map();
    let missing = 0;
    const seen = new Set();
    for (const { row, sourceRow, key } of expected) {
      if (seen.has(key)) continue; // duplicate key in Sheets: first row wins, reported by the import
      seen.add(key);
      const db = byKey.get(key);
      if (!db) {
        missing++;
        continue;
      }
      if (!checkKeys.has(key)) continue;
      for (const [column, fromSheet] of Object.entries(spec.fields)) {
        if (asText(db[column]) !== String(fromSheet(row, sourceRow))) mismatches.set(column, (mismatches.get(column) ?? 0) + 1);
      }
    }
    const extra = dbRows.filter((row) => !seen.has(row[keyColumn])).length;
    const duplicates = expected.length - seen.size;
    const mismatchTotal = [...mismatches.values()].reduce((a, b) => a + b, 0);
    const ok = missing === 0 && extra === 0 && mismatchTotal === 0 && seen.size === dbRows.length;
    if (!ok) failed = true;

    countRows.push([
      spec.table,
      `${spec.sheet}/${spec.tab}`,
      sheetRows.length,
      sheetRows.length - expected.length,
      duplicates,
      dbRows.length,
      missing,
      extra,
      mismatchTotal,
      createdHere,
      ok ? "✓" : "✗",
    ]);

    const lines = [`### ${spec.table}`, ""];
    lines.push(
      `${toCheck.length}${toCheck.length < expected.length ? ` random rows of ${expected.length}` : " rows"} checked field by field (${Object.keys(spec.fields).length} columns each): ` +
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
      const [sum] = await sql.query(`SELECT coalesce(sum(${spec.sumColumn}), 0)::text AS total FROM ${spec.table} WHERE source_sheet IS NOT NULL`);
      const sheetTotal = [...seen].length ? expected.reduce((a, { row }) => a + spec.sheetSum(row), 0) : 0;
      const same = Math.abs(Number(sum.total) - sheetTotal) < 0.005;
      if (!same) failed = true;
      lines.push("", `Sum of ${spec.sumColumn}: sheets ${sheetTotal.toFixed(2)} / postgres ${Number(sum.total).toFixed(2)} ${same ? "✓" : "✗"}`);
    }
    sections.push(lines.join("\n"));
    console.log(`${ok ? "OK  " : "FAIL"} ${spec.table}: sheets ${seen.size} / postgres ${dbRows.length}, missing ${missing}, extra ${extra}, field mismatches ${mismatchTotal}`);
  }

  const issues = await sql`SELECT table_name, problem FROM migration_issues WHERE area = ${area} AND status = 'open' ORDER BY table_name, id`;
  const report = [
    `# ${area} – verify`,
    "",
    `Run ${today()} by \`scripts/migrate/verify-${area}.mjs\`. Sheets (read-only) compared with the Neon dev branch. Counts only, no cell values.`,
    "",
    `**Result: ${failed ? "DIFFERENCES FOUND" : "all tables match"}.** Open questions in \`migration_issues\`: ${issues.length}.`,
    "",
    table(
      ["Table", "From", "Sheet rows", "Skipped by rule", "Duplicate keys", "Postgres rows", "Missing", "Extra", "Field mismatches", "Created in Postgres", "OK"],
      countRows
    ),
    "",
    "\"Skipped by rule\" = rows the app itself ignores today. \"Duplicate keys\" = later rows with a key already seen; the first row is kept.",
    "",
    "## Per table",
    "",
    sections.join("\n\n"),
    ...extraSections,
  ].join("\n");
  console.log(`Report: ${writeReport(area, report, "verify")}`);
  process.exitCode = failed ? 1 : 0;
  return { failed, issues };
}
