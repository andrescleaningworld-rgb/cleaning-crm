// Creates (or removes) the portal test subcontractor "ZZ Test Sub" in the
// practice database only. It never exists in Google Sheets.
//
//   npx tsx scripts/migrate/create-test-sub.mts
//   npx tsx scripts/migrate/create-test-sub.mts --remove
//
// What it makes:
//   - one subcontractor, "ZZ Test Sub" (contact "Zeta Test"), status Active,
//     with a made-up email at example.com and a made-up phone (555-01xx
//     numbers are reserved for fiction), so no real text can reach anyone
//   - no accounts: outside production its portal home shows one made-up
//     site, "ZZ Test Site", so every button can be tried
// It sets no PIN: open the sub's page as staff and tap "Text the PIN setup
// link"; outside production the link is shown on screen.
// Safe to re-run: it removes its own rows first. Rows it makes carry no
// source_sheet, so an import from Sheets never touches them.
import { loadEnv } from "./lib/env.mjs";
import { assertDevDatabase } from "./lib/guard.mjs";

loadEnv();
process.env.DATABASE_URL = assertDevDatabase(process.env.MIGRATION_DATABASE_URL);
process.env.OUTBOUND_DRY_RUN = "1";

const { getSql } = await import("../../lib/db");
const sql = getSql();

const ID = "zz-test-sub";
const NAME = "ZZ Test Sub";
const EMAIL = "zz-test-sub@example.com";
const SITE = "ZZ Test Site";
const remove = process.argv.includes("--remove");

async function removeAll() {
  await sql.query(`DELETE FROM handoff_items WHERE lower(data->>'subEmail') = $1`, [EMAIL]).catch(() => undefined);
  await sql.query(`DELETE FROM sub_site_photos WHERE sub_email = $1`, [EMAIL]).catch(() => undefined);
  await sql.query(`DELETE FROM sub_setup_links WHERE email = $1`, [EMAIL]).catch(() => undefined);
  await sql.query(`DELETE FROM sub_pins WHERE email = $1`, [EMAIL]).catch(() => undefined);
  // What the test sub sent from the made-up site (rows made by the app carry no source_sheet).
  await sql.query(`DELETE FROM handoff_items WHERE account_name = $1`, [SITE]).catch(() => undefined);
  await sql.query(`DELETE FROM sub_supply_orders WHERE account_name = $1 AND source_sheet IS NULL`, [SITE]).catch(() => undefined);
  await sql.query(`DELETE FROM sub_portal_issues WHERE account_name = $1 AND source_sheet IS NULL`, [SITE]).catch(() => undefined);
  await sql.query(`DELETE FROM sub_activity_log WHERE lower(subcontractor_email) = $1`, [EMAIL]).catch(() => undefined);
  await sql.query(`DELETE FROM subcontractors WHERE id = $1 AND source_sheet IS NULL`, [ID]);
}

await removeAll();

if (remove) {
  console.log(`${NAME}: removed from the practice database.`);
} else {
  await sql.query(
    `INSERT INTO subcontractors (id, legacy_key, legacy_row_id, display_id_raw, contact_name, company_name, phone, email, status, notes)
     VALUES ($1, $1, $1, $1, 'Zeta Test', $2, '201-555-0142', $3, 'Active', 'Test subcontractor. Practice database only.')`,
    [ID, NAME, EMAIL]
  );
  console.log(`${NAME}: created in the practice database (email at example.com, made-up phone).`);
  console.log(`It has no real accounts. Outside production its portal home shows one made-up site, "ZZ Test Site".`);
  console.log(`Log in: Sub portal -> email login with the test email, or as staff open the sub's page and tap "Text the PIN setup link".`);
}
