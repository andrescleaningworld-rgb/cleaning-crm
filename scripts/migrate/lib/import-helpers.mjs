// Shared pieces for scripts/migrate/import-<area>.mjs.
import crypto from "node:crypto";
import { getSql } from "./pg.mjs";

export const sha256 = (...parts) => crypto.createHash("sha256").update(parts.map((p) => String(p ?? "")).join("\u001f")).digest("hex");

export const cell = (row, index) => String(row?.[index] ?? "");

/** ISO timestamp or null. Never guesses: anything Date cannot parse is null. */
export function toTimestamp(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** YYYY-MM-DD or null. Accepts YYYY-MM-DD and M/D/YYYY (how Sheets shows US dates). */
export function toDate(raw) {
  const text = String(raw ?? "").trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

/**
 * One import run: counts per table, issues, and the migration_runs row.
 * With dryRun nothing is written anywhere, including migration_runs.
 */
export async function startRun(area, { dryRun }) {
  const sql = getSql();
  const tables = {};
  const issues = [];
  let runId = null;
  if (!dryRun) {
    const [row] = await sql`INSERT INTO migration_runs (area, kind, dry_run) VALUES (${area}, 'import', false) RETURNING id`;
    runId = row.id;
  }
  return {
    sql,
    dryRun,
    runId,
    tables,
    issues,
    /** Records what a table's import saw and did. */
    count(table, counts) {
      tables[table] = { ...(tables[table] ?? {}), ...counts };
    },
    /**
     * A row the import could not resolve with certainty: a question for Andres.
     * @param {string} table
     * @param {string} legacyKey
     * @param {string} problem
     * @param {{ rawValue?: string | null, candidates?: unknown[] }} [options]
     */
    issue(table, legacyKey, problem, { rawValue = null, candidates = [] } = {}) {
      issues.push({ table, legacyKey: String(legacyKey), problem, rawValue, candidates });
    },
    async finish(status = "ok") {
      for (const [table, counts] of Object.entries(tables)) {
        console.log(`${dryRun ? "[dry-run] " : ""}${table}: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}`);
      }
      console.log(`${dryRun ? "[dry-run] " : ""}issues: ${issues.length}`);
      for (const i of issues.slice(0, 20)) console.log(`  - ${i.table} ${i.legacyKey}: ${i.problem}`);
      if (dryRun) return;
      for (const i of issues) {
        await sql`
          INSERT INTO migration_issues (area, table_name, legacy_key, problem, raw_value, candidates, run_id)
          VALUES (${area}, ${i.table}, ${i.legacyKey}, ${i.problem}, ${i.rawValue}, ${JSON.stringify(i.candidates)}::jsonb, ${runId})
          ON CONFLICT (area, table_name, legacy_key, problem)
          DO UPDATE SET raw_value = EXCLUDED.raw_value, candidates = EXCLUDED.candidates, run_id = EXCLUDED.run_id, updated_at = now()
        `;
      }
      await sql`
        UPDATE migration_runs
        SET status = ${status}, finished_at = now(), summary = ${JSON.stringify({ tables, issues: issues.length })}::jsonb
        WHERE id = ${runId}
      `;
    },
  };
}

/** legacy keys already in a table, to tell new rows from updates and to find rows gone from Sheets. */
export async function existingKeys(sql, table) {
  const rows = await sql.query(`SELECT legacy_key FROM ${table} WHERE source_sheet IS NOT NULL`);
  return new Set(rows.map((r) => r.legacy_key));
}

/**
 * Compares the keys seen in Sheets with the imported keys already in the
 * table. Rows that disappeared from Sheets are reported, never deleted.
 */
export function compareKeys(run, table, seenKeys, before) {
  const seen = new Set(seenKeys);
  const added = [...seen].filter((k) => !before.has(k)).length;
  const gone = [...before].filter((k) => !seen.has(k));
  for (const key of gone) run.issue(table, key, "Row was imported before but is no longer in Sheets. Not deleted here.");
  return { new: added, updated: seen.size - added, goneFromSheets: gone.length };
}

/** Duplicate legacy keys within one tab: first row wins, the rest become issues. */
export function dedupe(run, table, rows) {
  const byKey = new Map();
  for (const row of rows) {
    if (byKey.has(row.legacy_key)) {
      run.issue(table, row.legacy_key, `Duplicate key in Sheets: rows ${byKey.get(row.legacy_key).source_row} and ${row.source_row}. Kept the first.`);
      continue;
    }
    byKey.set(row.legacy_key, row);
  }
  return [...byKey.values()];
}

/**
 * INSERT … ON CONFLICT (legacy_key) DO UPDATE for all rows, in one
 * transaction (all or nothing). Every row object must have the same keys;
 * keys are column names. imported_at and updated_at are set here.
 * `keep` lists columns an update must not overwrite (e.g. an id resolved by
 * a later area).
 */
export async function upsertRows(sql, table, rows, { keep = [] } = {}) {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  const updatable = columns.filter((c) => c !== "legacy_key" && !keep.includes(c));
  const text =
    `INSERT INTO ${table} (${columns.join(", ")}, imported_at) ` +
    `VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")}, now()) ` +
    `ON CONFLICT (legacy_key) DO UPDATE SET ` +
    `${updatable.map((c) => `${c} = EXCLUDED.${c}`).join(", ")}, imported_at = now(), updated_at = now()`;
  await sql.transaction(rows.map((row) => sql.query(text, columns.map((c) => row[c]))));
}
