// Creates (or removes) the portal test customer "ZZ Test Customer" in the
// practice database only. It never exists in Google Sheets.
//
//   npx tsx scripts/migrate/create-test-customer.mts --email <address>
//   npx tsx scripts/migrate/create-test-customer.mts --remove
//
// What it makes, all marked as test data (accounts.is_test = true, so staff
// lists, reports, revenue, maps and sub lists leave it out):
//   - one account with a made-up address and phone (555-01xx numbers are
//     reserved for fiction) and the given email
//   - portal access ON for it
//   - a weekly schedule: Monday and Thursday mornings
//   - a few past visits (two cleanings, one quality check)
// Its rows get negative row numbers, so they can never take the number of a
// row that later arrives from the sheet, and never move the next real number.
// It sets no password: log in through "First time here? Set your password".
// Safe to re-run: it removes its own rows first. The email is not printed.
import { loadEnv } from "./lib/env.mjs";
import { assertDevDatabase } from "./lib/guard.mjs";

loadEnv();
process.env.DATABASE_URL = assertDevDatabase(process.env.MIGRATION_DATABASE_URL);
process.env.OUTBOUND_DRY_RUN = "1";

const { getSql } = await import("../../lib/db");
const sql = getSql();

const NAME = "ZZ Test Customer";
const args = process.argv.slice(2);
const remove = args.includes("--remove");
const email = (args.includes("--email") ? args[args.indexOf("--email") + 1] ?? "" : "").trim().toLowerCase();

async function removeAll() {
  const ids = ((await sql.query(`SELECT id FROM accounts WHERE is_test AND account_name = $1`, [NAME])) as { id: string }[]).map((r) => r.id);
  const emails = ((await sql.query(`SELECT lower(btrim(email)) AS email FROM accounts WHERE is_test AND account_name = $1 AND btrim(email) <> ''`, [NAME])) as { email: string }[]).map((r) => r.email);
  await sql.query(`DELETE FROM portal_requests WHERE account_ref = ANY($1::text[]) OR account_name = $2`, [ids, NAME]);
  await sql.query(`DELETE FROM sub_schedules WHERE account_ref = ANY($1::text[]) AND source_sheet IS NULL`, [ids]);
  await sql.query(`DELETE FROM schedule_exceptions WHERE account_ref = ANY($1::text[]) AND source_sheet IS NULL`, [ids]);
  await sql.query(`DELETE FROM visits WHERE account_ref = ANY($1::text[]) AND source_sheet IS NULL`, [ids]);
  await sql.query(`DELETE FROM subcontractor_visits WHERE account_ref = ANY($1::text[]) AND source_sheet IS NULL`, [ids]);
  await sql.query(`DELETE FROM portal_access WHERE account_ref = ANY($1::text[]) AND source_sheet IS NULL`, [ids]);
  // The login belongs to the email; remove it only when no real account uses that email.
  for (const e of emails) {
    const others = ((await sql.query(`SELECT count(*)::int AS n FROM accounts WHERE NOT is_test AND lower(btrim(email)) = $1`, [e])) as { n: number }[])[0].n;
    if (others === 0) {
      await sql.query(`DELETE FROM portal_tokens WHERE email = $1`, [e]);
      await sql.query(`DELETE FROM portal_users WHERE email = $1`, [e]);
    }
  }
  await sql.query(`DELETE FROM accounts WHERE is_test AND account_name = $1 AND source_sheet IS NULL`, [NAME]);
}

await removeAll();

if (!remove) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error("Give the test customer's email: --email <address>");
    process.exit(1);
  }
  const accounts = await import("../../lib/pg/accounts");
  const { accountId } = await accounts.addAccount({
    accountName: NAME,
    address: "100 Test Street",
    city: "Testville",
    zip: "07000",
    status: "Active",
    serviceType: "Office Cleaning",
    frequency: "2x per week",
    cleaningDays: "Mon, Thu",
    scopeOfWork: "Vacuum, dust, trash, restrooms",
    contactName: "Test Customer",
    phone: "(555) 010-0100",
    email,
  });
  await sql.query(`UPDATE accounts SET is_test = true, email = $2 WHERE id = $1`, [accountId, email]);

  await sql.query(
    `INSERT INTO portal_access (legacy_key, account_id_raw, account_name, account_ref, phone, portal_code, portal_access, sheet_row)
     SELECT 'test-portal-' || $1::text, $1::text, $2::text, $1::text, '(555) 010-0100', 'CW-TEST00', 'YES', LEAST(COALESCE(MIN(sheet_row), 0), 0) - 1 FROM portal_access`,
    [accountId, NAME]
  );

  for (const day of ["Monday", "Thursday"]) {
    await sql.query(
      `INSERT INTO sub_schedules (legacy_key, schedule_id, account_id, account_ref, sub_id_raw, day_of_week, time_window, recurring,
         effective_start_raw, effective_start, status, submitted_by, frequency, submitted_via, sheet_row)
       SELECT 'test-sched-' || $1::text || '-' || $2::text, 'TEST-SCHED-' || $2::text, $1::text, $1::text, '', $2::text, 'Morning', 'Y',
         to_char(CURRENT_DATE - 60, 'YYYY-MM-DD'), CURRENT_DATE - 60, 'Active', 'Test data', 'WEEKLY', 'Test data', LEAST(COALESCE(MIN(sheet_row), 0), 0) - 1
       FROM sub_schedules`,
      [accountId, day]
    );
  }

  // Past visits: the two most recent cleaning days, and one quality check.
  for (const [table, daysAgo, extra] of [
    ["subcontractor_visits", 3, ""],
    ["subcontractor_visits", 7, ""],
    ["visits", 12, "Quality"],
  ] as const) {
    if (table === "subcontractor_visits") {
      await sql.query(
        `INSERT INTO subcontractor_visits (legacy_key, visit_id, account_name, account_ref, visit_date_raw, visit_date, sheet_row)
         SELECT 'test-subvisit-' || $1::text || '-' || $3::text, 'TEST-SV-' || $3::text, $2::text, $1::text,
           to_char(CURRENT_DATE - $3::int, 'YYYY-MM-DD'), CURRENT_DATE - $3::int, LEAST(COALESCE(MIN(sheet_row), 0), 0) - 1 FROM subcontractor_visits`,
        [accountId, NAME, daysAgo]
      );
    } else {
      await sql.query(
        `INSERT INTO visits (legacy_key, visit_id, account_id_raw, account_name, account_ref, visit_date_raw, visit_date, visit_type, completed_by, sheet_row)
         SELECT 'test-visit-' || $1::text || '-' || $3::text, 'TEST-V-' || $3::text, $1::text, $2::text, $1::text,
           to_char(CURRENT_DATE - $3::int, 'YYYY-MM-DD'), CURRENT_DATE - $3::int, $4::text, 'Test data', LEAST(COALESCE(MIN(sheet_row), 0), 0) - 1 FROM visits`,
        [accountId, NAME, daysAgo, extra]
      );
    }
  }
}

const [state] = (await sql.query(
  `SELECT (SELECT count(*)::int FROM accounts WHERE is_test) AS test_accounts,
          (SELECT count(*)::int FROM portal_access p JOIN accounts a ON a.id = p.account_ref WHERE a.is_test) AS portal_rows,
          (SELECT count(*)::int FROM sub_schedules s JOIN accounts a ON a.id = s.account_ref WHERE a.is_test) AS schedules,
          (SELECT count(*)::int FROM subcontractor_visits v JOIN accounts a ON a.id = v.account_ref WHERE a.is_test) AS cleanings,
          (SELECT count(*)::int FROM visits v JOIN accounts a ON a.id = v.account_ref WHERE a.is_test) AS checks,
          (SELECT count(*)::int FROM accounts WHERE is_test AND btrim(email) <> '') AS with_email`
)) as Record<string, number>[];
console.log(`${remove ? "removed" : "created"}: test accounts ${state.test_accounts} (with an email: ${state.with_email}), portal rows ${state.portal_rows}, schedule rows ${state.schedules}, past cleanings ${state.cleanings}, quality checks ${state.checks}`);
