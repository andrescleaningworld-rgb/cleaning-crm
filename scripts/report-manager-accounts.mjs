// READ-ONLY: the accounts whose saved manager is "CW", "Cleaning World", or
// two managers at once ("Greg , Andres", "Andres , Greg", "Drew/Greg"), so a
// manager can be picked for each. Also the "Claude Test" visit. Changes nothing.
//
// Run: node --env-file=.env.local scripts/report-manager-accounts.mjs

import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run with: node --env-file=.env.local scripts/report-manager-accounts.mjs");
  process.exit(1);
}
const sql = neon(url);
console.log(`Database: ${new URL(url).hostname.split(".")[0]} (read only)\n`);

const rows = await sql.query(`
  SELECT a.id, a.account_name, a.manager_raw, a.status, a.city, a.address,
         COALESCE(NULLIF(btrim(s.company_name), ''), a.subcontractor_raw) AS sub
  FROM accounts a
  LEFT JOIN subcontractors s ON s.id = a.subcontractor_id
  WHERE (to_jsonb(a)->>'deleted_at') IS NULL AND NOT a.is_test
    AND (lower(btrim(a.manager_raw)) IN ('cw', 'cleaning world') OR a.manager_raw ~ '[,/&]' OR a.manager_raw ~* '\\sand\\s')
  ORDER BY lower(btrim(a.manager_raw)), lower(a.account_name)`);

let group = null;
for (const row of rows) {
  if (row.manager_raw !== group) {
    group = row.manager_raw;
    console.log(`\nSaved manager ${JSON.stringify(group)}`);
  }
  const town = (row.city || "").trim() || (row.address || "").split(",").slice(-2, -1)[0]?.trim() || "?";
  console.log(`   ${row.id} | ${row.account_name} | ${town} | sub: ${row.sub || "-"} | ${row.status || "-"}`);
}
console.log(`\n${rows.length} accounts`);

const test = await sql.query(`SELECT visit_id, account_name, visit_date_raw, visit_type FROM visits WHERE btrim(completed_by) = 'Claude Test'`);
console.log(`\n"Claude Test" visits: ${test.length}`);
for (const row of test) console.log(`   ${row.visit_id} | ${row.account_name} | ${row.visit_date_raw} | ${row.visit_type}`);
