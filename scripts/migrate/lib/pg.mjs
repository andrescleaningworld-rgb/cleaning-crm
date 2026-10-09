// Postgres access for migration scripts. Always the dev branch: the URL comes
// from MIGRATION_DATABASE_URL only (never DATABASE_URL) and passes guard.mjs.
import { neon } from "@neondatabase/serverless";
import { loadEnv } from "./env.mjs";
import { assertDevDatabase } from "./guard.mjs";

let _sql = null;

export function getSql() {
  if (!_sql) {
    loadEnv();
    _sql = neon(assertDevDatabase(process.env.MIGRATION_DATABASE_URL));
  }
  return _sql;
}

/** Runs the queries built by `build(sql)` in one transaction (all or nothing). */
export async function inTransaction(build) {
  const sql = getSql();
  const queries = build(sql);
  if (queries.length === 0) return [];
  return sql.transaction(queries);
}
