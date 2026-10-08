// Exercises the Postgres writes in lib/pg/customer-portal.ts against the dev
// branch, checks the rows, and removes the test rows it made.
//   npx tsx scripts/migrate/check-customer-portal-writes.mts
// The phone and codes used here are made up; no real one is read or printed.
import { loadEnv } from "./lib/env.mjs";
import { assertDevDatabase } from "./lib/guard.mjs";

loadEnv();
process.env.DATABASE_URL = assertDevDatabase(process.env.MIGRATION_DATABASE_URL);
process.env.OUTBOUND_DRY_RUN = "1";
process.env.DATA_SOURCE_CUSTOMER_PORTAL = "postgres";

const data = await import("../../lib/data/customer-portal");
const { getSql } = await import("../../lib/db");
const sql = getSql();

let failed = false;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` – ${detail}` : ""}`);
};

const NAME = "ZZ Migration Write Test";
const PHONE = "(555) 010-9999"; // 555-01xx is reserved for made-up numbers
const one = async <T,>(text: string, params: unknown[] = []) => ((await sql.query(text, params)) as T[])[0];
const accessCount = async () => (await one<{ n: number }>(`SELECT count(*)::int AS n FROM portal_access`)).n;
const requestCount = async () => (await one<{ n: number }>(`SELECT count(*)::int AS n FROM portal_requests`)).n;
const beforeAccess = await accessCount();
const beforeRequests = await requestCount();
const lastRow = (await one<{ n: number }>(`SELECT max(sheet_row)::int AS n FROM portal_access`)).n;
const real = await one<{ id: string }>(`SELECT id FROM accounts WHERE id IS NOT NULL ORDER BY pk LIMIT 1`);
const untouched = async () => (await one<{ h: string }>(`SELECT md5(string_agg(portal_code || '|' || portal_access || '|' || phone || '|' || next_scheduled_service, ',' ORDER BY sheet_row)) AS h FROM portal_access WHERE source_sheet IS NOT NULL`)).h;
const hashBefore = await untouched();

try {
  // ----- Settings → Portal
  const code = await data.enablePortalAccount(NAME, PHONE, "ZZ-TEST-ID");
  check("enablePortalAccount: the code is the account ID that was sent", code === "ZZ-TEST-ID");
  const row = await one<{ sheet_row: number; portal_access: string; account_ref: string | null; phone: string; source_sheet: string | null }>(`SELECT sheet_row, portal_access, account_ref, phone, source_sheet FROM portal_access WHERE account_name = $1`, [NAME]);
  check("the new row is last, access YES, not linked (unknown ID and name), marked as created here", row.sheet_row === lastRow + 1 && row.portal_access === "YES" && row.account_ref === null && row.phone === PHONE && row.source_sheet === null);

  const generated = await data.enablePortalAccount(`${NAME} 2`, "", "");
  check("with no account ID a CW-xxxxx code is made", /^CW-[A-HJ-NP-Z2-9]{5}$/.test(generated));
  await data.enablePortalAccount(`${NAME} 3`, "", real.id);
  const linked = await one<{ account_ref: string | null }>(`SELECT account_ref FROM portal_access WHERE account_name = $1`, [`${NAME} 3`]);
  check("a row enabled with a real account ID is linked to that account", linked.account_ref === real.id);

  const list = await data.listPortalAccounts();
  const mine = list.find((a) => a.accountName === NAME);
  check("listPortalAccounts shows the new row with its row number", mine?.sheetRow === row.sheet_row && mine.portalAccess === "YES" && list.length === beforeAccess + 3);

  // ----- login lookups (made-up phone)
  const byPhone = await data.getCustomerByPhone("555 010 9999");
  const byPhone11 = await data.getCustomerByPhone("+1 (555) 010-9999");
  const byCode = await data.getCustomerByPortalCode(" zz-test-id ");
  check("getCustomerByPhone finds it however the phone is typed", byPhone?.accountName === NAME && byPhone11?.accountName === NAME);
  check("getCustomerByPortalCode ignores case and spaces", byCode?.accountName === NAME && byCode.accountId === "ZZ-TEST-ID");
  check("the customer answer has the 18 fields and no Monthly Revenue", byCode !== null && Object.keys(byCode).length === 18 && !("monthlyRevenue" in byCode));
  check("text with no digits matches nobody (the Sheets version returns an account here)", (await data.getCustomerByPhone("abc")) === null && (await data.getCustomerByPhone("   ")) === null);

  await data.updatePortalAccountFields(row.sheet_row, { portalAccess: "NO" });
  check("access turned off: the phone no longer finds the account, the code still does (the login then refuses it)", (await data.getCustomerByPhone(PHONE)) === null && (await data.getCustomerByPortalCode("ZZ-TEST-ID"))?.portalAccess === "NO");
  await data.updatePortalAccountFields(row.sheet_row, { portalAccess: "YES", portalCode: "CW-TEST9", phone: "5550109998", nextScheduledService: "November 3 - Morning", estimatedMonthlyTotal: "$123.45" });
  const after = await data.getCustomerByPortalCode("CW-TEST9");
  check("updatePortalAccountFields saves all five fields", after?.phone === "5550109998" && after.nextScheduledService === "November 3 - Morning" && after.estimatedMonthlyTotal === "$123.45" && after.portalAccess === "YES" && (await data.getCustomerByPortalCode("ZZ-TEST-ID")) === null);
  await data.updatePortalAccountFields(row.sheet_row, {});
  await data.updatePortalAccountFields(999999, { portalAccess: "NO" });
  check("no fields = no change; an unknown row number changes nothing", (await data.getCustomerByPortalCode("CW-TEST9"))?.portalAccess === "YES" && (await accessCount()) === beforeAccess + 3);
  check("no imported row was touched", (await untouched()) === hashBefore);

  // ----- what customers send from /portal
  const newBefore = await data.getPortalNewCount();
  await data.appendPortalRequest("portal-complaints", ["ZZ-TEST-ID", NAME, "10/6/2026", "Missed area", "desc", "2026-10-05", "New", "", "https://example.com/a.jpg, https://example.com/b.jpg"]);
  await data.appendPortalRequest("portal-service-requests", ["ZZ-TEST-ID", NAME, "10/7/2026", "Carpet cleaning", "details", "2026-11-01", "New", ""]);
  await data.appendPortalRequest("portal-date-changes", ["ZZ-TEST-ID", NAME, "10/8/2026", "2026-10-12", "2026-10-14", "holiday", "New", ""]);
  await data.appendPortalRequest("portal-billing-requests", ["ZZ-TEST-ID", NAME, "10/8/2026", "Copy of invoice", "last month", "New", ""]);
  await data.appendPortalRequest("portal-billing-requests", [real.id, "name that matches nothing", "10/8/2026", `${NAME} linked`, "", "New", ""]);
  check("four kinds saved; the New count goes up by 5", (await data.getPortalNewCount()) === newBefore + 5 && (await requestCount()) === beforeRequests + 5);

  const subs = (await data.listPortalSubmissions()).filter((s) => s.accountName === NAME);
  const of = (tab: string) => subs.find((s) => s.tab === tab);
  check("newest first", subs.length === 4 && subs[0].date === "10/8/2026" && subs[3].tab === "portal-complaints");
  check("complaint fields", JSON.stringify(of("portal-complaints")?.fields) === JSON.stringify({ "Issue Type": "Missed area", Description: "desc", "Incident Date": "2026-10-05", Photos: "https://example.com/a.jpg, https://example.com/b.jpg" }));
  check("service request fields", JSON.stringify(of("portal-service-requests")?.fields) === JSON.stringify({ "Service Requested": "Carpet cleaning", Details: "details", "Preferred Date": "2026-11-01" }));
  check("date change fields", JSON.stringify(of("portal-date-changes")?.fields) === JSON.stringify({ "Current Date": "2026-10-12", "Requested Date": "2026-10-14", Reason: "holiday" }));
  check("billing request fields, status and empty notes", JSON.stringify(of("portal-billing-requests")?.fields) === JSON.stringify({ "Request Type": "Copy of invoice", Details: "last month" }) && of("portal-billing-requests")?.status === "New" && of("portal-billing-requests")?.notes === "");
  const rowsPerTab = (await sql.query(`SELECT tab, min(sheet_row)::int AS lo, max(sheet_row)::int AS hi, count(*)::int AS n FROM portal_requests WHERE legacy_key LIKE 'pg-%' GROUP BY tab`)) as { tab: string; lo: number; hi: number; n: number }[];
  check("each kind counts its own rows (two billing rows are one after the other)", rowsPerTab.every((r) => r.hi - r.lo === r.n - 1) && rowsPerTab.find((r) => r.tab === "portal-billing-requests")?.n === 2);
  const stored = await one<{ d: string; account_ref: string | null }>(`SELECT submitted_date::text AS d, account_ref FROM portal_requests WHERE field_1 = $1`, [`${NAME} linked`]);
  check("the typed date is filled; a request sent with a real account ID is linked", stored.d === "2026-10-08" && stored.account_ref === real.id);

  const complaint = of("portal-complaints")!;
  await data.updateSubmissionStatus(complaint.tab, complaint.sheetRow, "In Progress", "called the customer");
  const updated = (await data.listPortalSubmissions()).filter((s) => s.accountName === NAME);
  check("updateSubmissionStatus changes only that row", updated.find((s) => s.tab === "portal-complaints")?.status === "In Progress" && updated.find((s) => s.tab === "portal-complaints")?.notes === "called the customer" && updated.filter((s) => s.status === "New").length === 3 && (await data.getPortalNewCount()) === newBefore + 4);
} finally {
  await sql.query(`DELETE FROM portal_requests WHERE account_name = $1 OR field_1 LIKE $2`, [NAME, `${NAME}%`]);
  await sql.query(`DELETE FROM portal_access WHERE account_name LIKE $1`, [`${NAME}%`]);
  check("test rows removed; counts are back to where they started", (await accessCount()) === beforeAccess && (await requestCount()) === beforeRequests);
  check("no imported row was changed by the test", (await untouched()) === hashBefore);
}

console.log(failed ? "\nFAILED" : "\nAll write checks passed.");
if (failed) process.exitCode = 1;
