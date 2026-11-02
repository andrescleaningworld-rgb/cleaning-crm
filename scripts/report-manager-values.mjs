// READ-ONLY report for the Manager dropdown cleanup. Changes nothing.
// Prints:
//   1. every distinct manager value saved on accounts (manager_raw), with how
//      many accounts have it, and which managers-table row it is linked to
//   2. the Managers list (Settings -> Managers): name, status
//   3. the Staff list (Settings -> Equipment Categories and Staff): name, role, active
//   4. the manager login picker: what it would show (Staff role Manager + active)
// Names and counts only; it never prints the database address.
//
// Run: node --env-file=.env.local scripts/report-manager-values.mjs

import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run with: node --env-file=.env.local scripts/report-manager-values.mjs");
  process.exit(1);
}
const sql = neon(url);
const host = (() => {
  try {
    return new URL(url).hostname.split(".")[0];
  } catch {
    return "?";
  }
})();
console.log(`Database: ${host} (read only)\n`);

const show = (value) => JSON.stringify(value ?? "");

const values = await sql.query(`
  SELECT a.manager_raw AS raw, COALESCE(m.name, '') AS linked, count(*)::int AS n,
         count(*) FILTER (WHERE a.status_key = 'active')::int AS active_n
  FROM accounts a
  LEFT JOIN managers m ON m.id = a.manager_id
  WHERE (to_jsonb(a)->>'deleted_at') IS NULL AND NOT a.is_test
  GROUP BY a.manager_raw, m.name
  ORDER BY n DESC, a.manager_raw`);
console.log("1. Manager values saved on accounts (not deleted, not test)");
console.log("   count (active) | saved value | linked to Managers row");
for (const row of values) console.log(`   ${String(row.n).padStart(5)} (${String(row.active_n).padStart(3)}) | ${show(row.raw)} | ${row.linked ? show(row.linked) : "-"}`);

const managers = await sql.query(`SELECT name, status FROM managers ORDER BY row_no`);
console.log("\n2. Managers list (Settings -> Managers)");
for (const row of managers) console.log(`   ${show(row.name)} | status ${show(row.status)}`);

const staff = await sql.query(`SELECT name, role, active FROM staff ORDER BY lower(name)`);
console.log("\n3. Staff list (Settings -> Equipment Categories and Staff)");
for (const row of staff) console.log(`   ${show(row.name)} | ${row.role} | ${row.active ? "active" : "not active"}`);

console.log("\n4. Manager login picker shows (Staff role Manager, active)");
for (const row of staff.filter((s) => s.role === "Manager" && s.active)) console.log(`   ${show(row.name)}`);

for (const [label, query] of [
  ["5. Manager values on visits", `SELECT btrim(completed_by) AS raw, count(*)::int AS n FROM visits GROUP BY 1 ORDER BY n DESC LIMIT 40`],
  ["6. Manager values on account updates", `SELECT btrim(created_by) AS raw, count(*)::int AS n FROM account_updates GROUP BY 1 ORDER BY n DESC LIMIT 40`],
]) {
  try {
    const rows = await sql.query(query);
    console.log(`\n${label}`);
    for (const row of rows) console.log(`   ${String(row.n).padStart(5)} | ${show(row.raw)}`);
  } catch (error) {
    console.log(`\n${label}: could not read (${error instanceof Error ? error.message.split("\n")[0] : error})`);
  }
}
