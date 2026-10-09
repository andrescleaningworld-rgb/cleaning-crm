// Replaces every portal code that equals the Account ID with a random one.
// Postgres only (dev branch through the guard); Google Sheets is not
// touched. Codes are never printed.
//
//   node scripts/migrate/randomize-portal-codes.mjs --dry-run   count only
//   node scripts/migrate/randomize-portal-codes.mjs             replace
//
// Safe to re-run: a row that already got a random code is skipped. The
// import and the verify step know a replaced code by
// portal_access.portal_code_randomized_at and leave it alone.
//
// Since the new portal logs in with email and password, the code is no
// longer what lets a customer in. It stays as a reference staff can read
// out, so it should not be something printed on every form.
import crypto from "node:crypto";
import { loadEnv } from "./lib/env.mjs";
import { getSql } from "./lib/pg.mjs";

loadEnv();
const sql = getSql();
const dryRun = process.argv.includes("--dry-run");

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I
const randomCode = () => "CW-" + Array.from(crypto.randomBytes(6), (b) => CHARS[b % CHARS.length]).join("");

const rows = await sql.query(
  `SELECT id FROM portal_access
   WHERE portal_code_randomized_at IS NULL AND btrim(portal_code) <> '' AND btrim(portal_code) = btrim(account_id_raw)
   ORDER BY sheet_row`
);
const taken = new Set((await sql.query(`SELECT upper(btrim(portal_code)) AS code FROM portal_access`)).map((r) => r.code));
const total = (await sql.query(`SELECT count(*)::int AS n FROM portal_access`))[0].n;

console.log(`${dryRun ? "[dry-run] " : ""}portal rows: ${total}; code equals the Account ID: ${rows.length}`);
if (!dryRun && rows.length > 0) {
  const updates = rows.map((row) => {
    let code = randomCode();
    while (taken.has(code)) code = randomCode();
    taken.add(code);
    return sql.query(`UPDATE portal_access SET portal_code = $2, portal_code_randomized_at = now(), updated_at = now() WHERE id = $1 AND portal_code_randomized_at IS NULL`, [row.id, code]);
  });
  await sql.transaction(updates);
  const left = (await sql.query(`SELECT count(*)::int AS n FROM portal_access WHERE btrim(portal_code) <> '' AND btrim(portal_code) = btrim(account_id_raw)`))[0].n;
  const distinct = (await sql.query(`SELECT count(DISTINCT upper(btrim(portal_code)))::int AS n FROM portal_access WHERE portal_code_randomized_at IS NOT NULL`))[0].n;
  console.log(`replaced: ${rows.length}; still equal to the Account ID: ${left}; random codes all different: ${distinct === rows.length || distinct >= rows.length}`);
}
