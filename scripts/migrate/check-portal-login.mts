// Checks the new customer portal's login rules and home-screen data against
// the practice database, using the test customer ("ZZ Test Customer",
// create-test-customer.mts). Prints no email, password, link or code.
//
//   npx tsx scripts/migrate/check-portal-login.mts
//
// It leaves the test customer with NO password (as created), removes the
// requests it sent, and never changes "Portal open to customers".
import { loadEnv } from "./lib/env.mjs";
import { assertDevDatabase } from "./lib/guard.mjs";

loadEnv();
process.env.DATABASE_URL = assertDevDatabase(process.env.MIGRATION_DATABASE_URL);
process.env.OUTBOUND_DRY_RUN = "1";
for (const area of ["CUSTOMER_PORTAL", "ACCOUNTS", "SUBS", "SCHEDULING", "VISITS", "COMPLAINTS", "TODOS"]) process.env[`DATA_SOURCE_${area}`] = "postgres";

const auth = await import("../../lib/pg/portal-auth");
const home = await import("../../lib/pg/portal-home");
const portal = await import("../../lib/data/customer-portal");
const accountsPg = await import("../../lib/pg/accounts");
const scheduling = await import("../../lib/data/scheduling");
const visits = await import("../../lib/pg/visits");
const performance = await import("../../lib/pg/performance");
const { getSql } = await import("../../lib/db");
const sql = getSql();

let failed = false;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` – ${detail}` : ""}`);
};
const one = async <T,>(text: string, params: unknown[] = []) => ((await sql.query(text, params)) as T[])[0];

const test = await one<{ id: string; email: string; account_name: string } | undefined>(`SELECT id, lower(btrim(email)) AS email, account_name FROM accounts WHERE is_test AND account_name = 'ZZ Test Customer'`);
if (!test) {
  console.log("FAIL  no test customer: run create-test-customer.mts first");
  process.exit(1);
}
const EMAIL = test.email;
const PASSWORD = `Zz-${Math.random().toString(36).slice(2)}-pw1`;
const openBefore = await auth.isPortalOpen();
const real = await one<{ email: string } | undefined>(
  `SELECT lower(btrim(a.email)) AS email FROM accounts a
   WHERE NOT a.is_test AND btrim(a.email) <> '' AND a.status_key NOT IN ('cancelled', 'canceled')
     AND EXISTS (SELECT 1 FROM portal_access p WHERE p.account_ref = a.id AND upper(btrim(p.portal_access)) = 'YES') LIMIT 1`
);

try {
  await sql.query(`DELETE FROM portal_users WHERE email = $1`, [EMAIL]);
  await sql.query(`DELETE FROM portal_tokens WHERE email = $1`, [EMAIL]);

  // ----- the portal is closed: only the test account counts
  check("\"Portal open to customers\" is OFF", openBefore === false);
  const mine = await auth.accountsForEmail(`  ${EMAIL.toUpperCase()} `);
  check("the test customer's email opens exactly the test account (any case, spaces ignored)", mine.length === 1 && mine[0].accountId === test.id && mine[0].isTest);
  if (real) {
    check("a real customer's email opens nothing while the portal is closed", (await auth.accountsForEmail(real.email)).length === 0);
    check("and gets no link", (await auth.createPasswordLink(real.email, "set")) === null);
    check("and cannot log in (same answer as a wrong password)", JSON.stringify(await auth.verifyLogin(real.email, "whatever-password")) === JSON.stringify({ ok: false, reason: "wrong" }));
  }
  check("an email on no account, an empty one and text that is not an email open nothing", (await auth.accountsForEmail("zz-nobody@example.com")).length === 0 && (await auth.accountsForEmail("")).length === 0 && (await auth.accountsForEmail("not an email")).length === 0 && (await auth.createPasswordLink("zz-nobody@example.com", "set")) === null);

  // ----- links
  const link = await auth.createPasswordLink(EMAIL, "set", "check");
  check("a link is made for the test customer and is marked test-only", !!link && link.testOnly === true && link.token.length >= 40);
  const stored = await one<{ token_hash: string; hours: number }>(`SELECT token_hash, round(extract(epoch FROM (expires_at - created_at)) / 3600)::int AS hours FROM portal_tokens WHERE email = $1 ORDER BY id DESC LIMIT 1`, [EMAIL]);
  check("only the link's fingerprint is stored, and it is valid 24 hours", stored.token_hash !== link!.token && /^[0-9a-f]{64}$/.test(stored.token_hash) && stored.hours === 24);
  check("the link names its email; a made-up or empty link names nobody", (await auth.emailForToken(link!.token)) === EMAIL && (await auth.emailForToken("not-a-real-token")) === null && (await auth.emailForToken("")) === null);
  check("a password under 8 characters is refused and the link still works", JSON.stringify(await auth.setPasswordWithToken(link!.token, "short12")) === JSON.stringify({ ok: false, reason: "short" }) && (await auth.emailForToken(link!.token)) === EMAIL);

  const older = await auth.createPasswordLink(EMAIL, "reset", "check");
  const set = await auth.setPasswordWithToken(link!.token, PASSWORD);
  check("the password is set through the link", set.ok === true && set.email === EMAIL);
  const user = await one<{ password_hash: string }>(`SELECT password_hash FROM portal_users WHERE email = $1`, [EMAIL]);
  check("it is stored as a bcrypt hash, not as the password", /^\$2[aby]\$10\$/.test(user.password_hash) && !user.password_hash.includes(PASSWORD));
  check("the link works once; setting a password also ends every older link", JSON.stringify(await auth.setPasswordWithToken(link!.token, PASSWORD)) === JSON.stringify({ ok: false, reason: "link" }) && (await auth.emailForToken(older!.token)) === null);
  const expired = await auth.createPasswordLink(EMAIL, "reset", "check");
  await sql.query(`UPDATE portal_tokens SET expires_at = now() - interval '1 minute' WHERE email = $1 AND used_at IS NULL`, [EMAIL]);
  check("a link older than 24 hours does not work", (await auth.emailForToken(expired!.token)) === null && JSON.stringify(await auth.setPasswordWithToken(expired!.token, PASSWORD)) === JSON.stringify({ ok: false, reason: "link" }));

  // ----- login and lockout
  const good = await auth.verifyLogin(EMAIL, PASSWORD);
  check("the right password logs in and returns the test location", good.ok === true && good.accounts.length === 1 && good.accounts[0].accountId === test.id);
  const tries: string[] = [];
  for (let i = 0; i < 5; i++) {
    const r = await auth.verifyLogin(EMAIL, "wrong-password");
    tries.push(r.ok ? "ok" : r.reason);
  }
  check("4 wrong passwords answer 'wrong', the 5th locks the login", tries.join(",") === "wrong,wrong,wrong,wrong,locked", tries.join(","));
  const whileLocked = await auth.verifyLogin(EMAIL, PASSWORD);
  check("while locked even the right password is refused, with the minutes left (15)", whileLocked.ok === false && whileLocked.reason === "locked" && whileLocked.minutesLeft >= 14 && whileLocked.minutesLeft <= 15, whileLocked.ok ? "" : JSON.stringify(whileLocked));
  await sql.query(`UPDATE portal_users SET locked_until = now() - interval '1 second' WHERE email = $1`, [EMAIL]);
  check("after the wait the right password works again", (await auth.verifyLogin(EMAIL, PASSWORD)).ok === true);
  await auth.verifyLogin(EMAIL, "wrong-password");
  await auth.verifyLogin(EMAIL, PASSWORD);
  check("a successful login clears the count of wrong tries", (await one<{ n: number }>(`SELECT failed_attempts AS n FROM portal_users WHERE email = $1`, [EMAIL])).n === 0);
  const reset = await auth.createPasswordLink(EMAIL, "reset", "check");
  await sql.query(`UPDATE portal_users SET locked_until = now() + interval '15 minutes' WHERE email = $1`, [EMAIL]);
  const NEW_PASSWORD = `${PASSWORD}-new`;
  await auth.setPasswordWithToken(reset!.token, NEW_PASSWORD);
  check("a reset link replaces the password and lifts a lock; the old password stops working", (await auth.verifyLogin(EMAIL, NEW_PASSWORD)).ok === true && (await auth.verifyLogin(EMAIL, PASSWORD)).ok === false);

  // ----- access rules follow the account
  await sql.query(`UPDATE portal_access SET portal_access = 'NO' WHERE account_ref = $1`, [test.id]);
  check("portal access turned off in Settings: the email opens nothing and the login is refused", (await auth.accountsForEmail(EMAIL)).length === 0 && (await auth.verifyLogin(EMAIL, NEW_PASSWORD)).ok === false);
  await sql.query(`UPDATE portal_access SET portal_access = 'YES' WHERE account_ref = $1`, [test.id]);
  await sql.query(`UPDATE accounts SET status = 'Cancelled', status_key = 'cancelled' WHERE id = $1`, [test.id]);
  check("a cancelled account cannot log in", (await auth.accountsForEmail(EMAIL)).length === 0);
  await sql.query(`UPDATE accounts SET status = 'Active', status_key = 'active' WHERE id = $1`, [test.id]);
  check("back to active with access on: it opens again", (await auth.accountsForEmail(EMAIL)).length === 1);

  // ----- home screen data
  const account = await home.getPortalHomeAccount(test.id);
  check("home account: name, address, test flag; nothing about money or keys", !!account && account.accountName === "ZZ Test Customer" && account.address.includes("100 Test Street") && account.isTest && !Object.keys(account).some((k) => /revenue|pay|margin|key|alarm|notes/i.test(k)));
  const next = await home.getNextCleanings(test.id, 6);
  const weekday = (iso: string) => new Date(`${iso}T12:00:00`).getDay();
  const today = new Date().toLocaleDateString("en-CA");
  check("next cleanings: 6 days, soonest first, all Mondays or Thursdays, none in the past, all Morning", next.length === 6 && next.every((c, i) => [1, 4].includes(weekday(c.date)) && c.date >= today && c.timeWindow === "Morning" && (i === 0 || next[i - 1].date < c.date)), next.map((c) => c.date).join(" "));
  // A skipped day and a moved day.
  await sql.query(
    `INSERT INTO schedule_exceptions (legacy_key, exception_id, account_id, account_ref, original_date_raw, original_date, type, new_date_raw, new_date, new_time_window, sheet_row)
     SELECT 'test-exc-skip', 'TEST-EXC-1', $1::text, $1::text, $2::text, $2::date, 'Skip', '', NULL, '', COALESCE(MAX(sheet_row), 1) + 1 FROM schedule_exceptions`,
    [test.id, next[0].date]
  );
  const movedTo = new Date(`${next[1].date}T12:00:00`);
  movedTo.setDate(movedTo.getDate() + 1);
  const movedIso = movedTo.toLocaleDateString("en-CA");
  await sql.query(
    `INSERT INTO schedule_exceptions (legacy_key, exception_id, account_id, account_ref, original_date_raw, original_date, type, new_date_raw, new_date, new_time_window, sheet_row)
     SELECT 'test-exc-move', 'TEST-EXC-2', $1::text, $1::text, $2::text, $2::date, 'Reschedule', $3::text, $3::date, 'Afternoon', COALESCE(MAX(sheet_row), 1) + 1 FROM schedule_exceptions`,
    [test.id, next[1].date, movedIso]
  );
  const adjusted = await home.getNextCleanings(test.id, 6);
  check("a skipped day is gone; a moved day shows on its new day, in its new time window, marked as moved", !adjusted.some((c) => c.date === next[0].date) && !adjusted.some((c) => c.date === next[1].date) && adjusted[0].date === movedIso && adjusted[0].timeWindow === "Afternoon" && adjusted[0].moved === true);
  await sql.query(`DELETE FROM schedule_exceptions WHERE legacy_key IN ('test-exc-skip', 'test-exc-move')`);

  const past = await home.getPastVisits(test.id, test.account_name);
  check("past visits: 3, newest first, two cleanings and a quality check, dates only", past.length === 3 && past[0].date > past[1].date && past[1].date > past[2].date && past.filter((v) => v.kind === "cleaning").length === 2 && past[2].kind === "check" && Object.keys(past[0]).join(",") === "date,kind");

  check("no requests yet", (await home.getMyRequests(test.id)).length === 0);
  await portal.appendPortalRequest("portal-complaints", [test.id, test.account_name, "10/8/2026", "Quality Issue", "check: test problem", "", "New", "", ""]);
  await portal.appendPortalRequest("portal-date-changes", [test.id, test.account_name, "10/8/2026", "2026-10-12", "2026-10-14", "check", "New", ""]);
  await portal.appendPortalRequest("portal-billing-requests", [test.id, test.account_name, "10/8/2026", "Invoice Copy", "check", "New", ""]);
  const sent = (await portal.listPortalSubmissions()).filter((s) => s.accountName === test.account_name);
  check("requests arrive in the staff list (Portal Requests) as before", sent.length === 3 && sent.every((s) => s.status === "New"));
  await portal.updateSubmissionStatus(sent.find((s) => s.tab === "portal-complaints")!.tab, sent.find((s) => s.tab === "portal-complaints")!.sheetRow, "In Progress", "staff note the customer must not see");
  await portal.updateSubmissionStatus(sent.find((s) => s.tab === "portal-billing-requests")!.tab, sent.find((s) => s.tab === "portal-billing-requests")!.sheetRow, "Resolved", "");
  const myRequests = await home.getMyRequests(test.id);
  const state = (kind: string) => myRequests.find((r) => r.kind === kind)?.state;
  check("My requests: staff statuses in plain words (New → received, In Progress → working, Resolved → done)", myRequests.length === 3 && state("date") === "received" && state("problem") === "working" && state("billing") === "done");
  check("a date change reads 'from → to'; staff notes are not in the customer's list", myRequests.find((r) => r.kind === "date")?.summary === "2026-10-12 → 2026-10-14" && !JSON.stringify(myRequests).includes("staff note"));
  check("plain words for every staff status", home.plainState("New") === "received" && home.plainState("") === "received" && home.plainState("In Progress") === "working" && home.plainState("Reviewed") === "working" && home.plainState("Resolved") === "done" && home.plainState("Closed") === "done");
  const other = await one<{ id: string } | undefined>(`SELECT id FROM accounts WHERE NOT is_test AND id IS NOT NULL ORDER BY pk LIMIT 1`);
  if (other) check("another account sees none of the test customer's requests", !(await home.getMyRequests(other.id)).some((r) => r.summary.includes("check")));

  // ----- the test account is left out of every staff list
  const staffAccounts = await accountsPg.fetchAccountRows();
  check("staff account list, the Apps Script account list and Settings → Portal do not have the test account", !staffAccounts.some((a) => a.id === test.id) && !(await accountsPg.getAccountsAppsScriptShape("getAllAccounts")).some((a) => a.accountId === test.id) && !(await accountsPg.getAccountsAppsScriptShape("getMapAccounts")).some((a) => a.accountId === test.id) && !(await portal.getMergedPortalAccounts()).some((a) => a.mainAccountId === test.id));
  check("staff schedules, sub-logged visits and the Visits list do not have its rows", !(await scheduling.fetchSubSchedules()).some((s) => s.accountId === test.id) && !(await visits.getVisitsAppsScriptShape()).some((v) => String((v as Record<string, unknown>).accountName ?? "") === test.account_name));
  const scores = await performance.getSubcontractorPerformanceMap();
  check("the subcontractor scores still cover 38 subs", scores.size === 38, String(scores.size));
} finally {
  await sql.query(`DELETE FROM schedule_exceptions WHERE legacy_key IN ('test-exc-skip', 'test-exc-move')`);
  await sql.query(`DELETE FROM portal_requests WHERE account_ref = $1 OR account_name = $2`, [test.id, test.account_name]);
  await sql.query(`UPDATE portal_access SET portal_access = 'YES' WHERE account_ref = $1`, [test.id]);
  await sql.query(`UPDATE accounts SET status = 'Active', status_key = 'active' WHERE id = $1`, [test.id]);
  await sql.query(`DELETE FROM portal_tokens WHERE email = $1`, [EMAIL]);
  await sql.query(`DELETE FROM portal_users WHERE email = $1`, [EMAIL]);
  check("cleaned up: no password, no links, no requests left for the test customer; the portal setting is unchanged", (await one<{ n: number }>(`SELECT ((SELECT count(*) FROM portal_users WHERE email = $1) + (SELECT count(*) FROM portal_tokens WHERE email = $1) + (SELECT count(*) FROM portal_requests WHERE account_ref = $2))::int AS n`, [EMAIL, test.id])).n === 0 && (await auth.isPortalOpen()) === openBefore);
}

console.log(failed ? "\nFAILED" : "\nAll checks passed.");
if (failed) process.exitCode = 1;
