// Exercises lib/pg/sub-portal.ts against the dev branch: the rules of the
// login answer (on real rows, printing counts only), the saves (on made-up
// rows it removes afterwards), and the issue list against the cached Apps
// Script answer when --cache <dir> has one.
//   npx tsx scripts/migrate/check-sub-portal-writes.mts [--cache <dir>]
import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "./lib/env.mjs";
import { assertDevDatabase } from "./lib/guard.mjs";

loadEnv();
process.env.DATABASE_URL = assertDevDatabase(process.env.MIGRATION_DATABASE_URL);
process.env.OUTBOUND_DRY_RUN = "1";
process.env.DATA_SOURCE_SUB_PORTAL = "postgres";

const data = await import("../../lib/data/sub-portal");
const { getSql } = await import("../../lib/db");
const sql = getSql();

let failed = false;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` – ${detail}` : ""}`);
};
const rejects = async (fn: () => Promise<unknown>, message: string) => {
  try {
    await fn();
    return false;
  } catch (e) {
    return e instanceof Error && e.message === message;
  }
};
const one = async <T,>(text: string, params: unknown[] = []) => ((await sql.query(text, params)) as T[])[0];
const count = async (table: string) => (await one<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).n;

// ----- the issue list against Apps Script
const args = process.argv.slice(2);
const cacheDir = args.includes("--cache") ? args[args.indexOf("--cache") + 1] : "";
const cacheFile = cacheDir ? path.join(cacheDir, "getSubPortalIssues.json") : "";
if (cacheFile && fs.existsSync(cacheFile)) {
  const theirs = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as { issues: Record<string, unknown>[]; newCount: number; message: string };
  const ours = await data.getSubPortalIssuesShape();
  const same = JSON.stringify(theirs.issues) === JSON.stringify(ours.issues);
  check(`issue list identical to the Apps Script answer (${theirs.issues.length} rows, keys, order, values), same count of new ones and message`, same && theirs.newCount === ours.newCount && theirs.message === ours.message);
} else {
  console.log("SKIP  issue list vs Apps Script: no cached answer given (--cache <dir>)");
}

// ----- the login answer, on real rows (counts only, nothing printed)
type Sub = { id: string; email: string; n: number; cancelled: number };
const subs = (await sql.query(
  `SELECT s.id, lower(btrim(s.email)) AS email,
          (SELECT count(*)::int FROM accounts a WHERE a.subcontractor_id = s.id AND a.status_key NOT IN ('cancelled', 'canceled')) AS n,
          (SELECT count(*)::int FROM accounts a WHERE a.subcontractor_id = s.id AND a.status_key IN ('cancelled', 'canceled')) AS cancelled
   FROM subcontractors s
   WHERE btrim(s.email) <> '' AND (SELECT count(*) FROM subcontractors s2 WHERE lower(btrim(s2.email)) = lower(btrim(s.email))) = 1
   ORDER BY 3 DESC`
)) as Sub[];
const busiest = subs[0];
const withCancelled = subs.find((s) => s.cancelled > 0 && s.n > 0) ?? busiest;
const noAccounts = subs.find((s) => s.n === 0);

const portal = await data.getSubPortalByEmail(`  ${busiest.email.toUpperCase()} `);
check("login answer for the sub with the most accounts: found whatever the email's case or spaces", !!portal && portal.subcontractor.email.toLowerCase() === busiest.email);
check("it has exactly that sub's accounts that are not cancelled", portal?.accounts.length === busiest.n, `${portal?.accounts.length} accounts`);
const linkedIds = new Set(((await sql.query(`SELECT COALESCE(id, '') AS id FROM accounts WHERE subcontractor_id = $1`, [busiest.id])) as { id: string }[]).map((r) => r.id));
check("every account in the answer is tied to that sub and none is cancelled", !!portal && portal.accounts.every((a) => linkedIds.has(String(a.accountId)) && !/^cancel/i.test(String(a.status))));
const names = new Set(portal?.accounts.map((a) => String(a.accountName).trim().toLowerCase()));
const ids = new Set(portal?.accounts.map((a) => String(a.accountId).trim()).filter(Boolean));
check("every complaint in the answer is on one of those accounts", !!portal && portal.complaints.every((c) => ids.has(c.accountId.trim()) || names.has(c.accountName.trim().toLowerCase())), `${portal?.complaints.length} complaints`);
const expectedComplaints = (await one<{ n: number }>(`SELECT count(*)::int AS n FROM complaints c WHERE (btrim(c.account_id_raw) <> '' AND btrim(c.account_id_raw) = ANY($1::text[])) OR lower(btrim(c.account_name)) = ANY($2::text[])`, [[...ids], [...names]])).n;
check("and no complaint on those accounts is missing", portal?.complaints.length === expectedComplaints, `${expectedComplaints} expected`);
check("the account rows carry sub pay and the fields the screen reads", !!portal && portal.accounts.every((a) => "monthlySubcontractorPay" in a && "accountName" in a && "address" in a && "cleaningDays" in a && "scopeOfWork" in a));
const activeSupplies = (await one<{ n: number }>(`SELECT count(*)::int AS n FROM sub_supplies WHERE btrim(supply_item) <> '' AND lower(btrim(status)) NOT IN ('inactive', 'discontinued') AND lower(btrim(active_raw)) NOT IN ('no', 'false', 'inactive', 'disabled', 'removed')`)).n;
check("the supply list is the active supplies", portal?.supplyItems.length === activeSupplies, String(activeSupplies));
const other = await data.getSubPortalByEmail(withCancelled.email);
check("a sub with cancelled accounts does not get them", other?.accounts.length === withCancelled.n, `${withCancelled.cancelled} cancelled left out`);
if (noAccounts) check("a sub with no accounts logs in and gets empty lists", (await data.getSubPortalByEmail(noAccounts.email))?.accounts.length === 0);
check("an unknown email, an empty one and text that is not an email find nobody", (await data.getSubPortalByEmail("zz-nobody@example.com")) === null && (await data.getSubPortalByEmail("   ")) === null && (await data.getSubPortalByEmail("%")) === null);
const shared = await one<{ email: string; first_id: string } | undefined>(`SELECT lower(btrim(email)) AS email, (array_agg(id ORDER BY source_row NULLS LAST, created_at, id))[1] AS first_id FROM subcontractors WHERE btrim(email) <> '' GROUP BY 1 HAVING count(*) > 1 LIMIT 1`);
if (shared) {
  const firstAccounts = (await one<{ n: number }>(`SELECT count(*)::int AS n FROM accounts WHERE subcontractor_id = $1 AND status_key NOT IN ('cancelled', 'canceled')`, [shared.first_id])).n;
  check("an email two subs share logs in as the first of them", (await data.getSubPortalByEmail(shared.email))?.accounts.length === firstAccounts);
}

// ----- saves, on made-up rows
const NAME = "ZZ Migration Write Test";
const EMAIL = "zz-write-test@example.com";
const before = { issues: await count("sub_portal_issues"), log: await count("sub_activity_log") };
const lastIssue = (await one<{ n: number | null }>(`SELECT max(sheet_row)::int AS n FROM sub_portal_issues`)).n ?? 1;
const importedHash = async () => (await one<{ h: string }>(`SELECT md5(COALESCE(string_agg(issue_id || status || notes, '|' ORDER BY sheet_row), '')) AS h FROM sub_portal_issues WHERE source_sheet IS NOT NULL`)).h;
const hashBefore = await importedHash();

try {
  await data.logSubcontractorActivity({ email: EMAIL, name: NAME, actionType: "Login", details: "" });
  await data.logSubcontractorActivity({ email: busiest.email, name: NAME, actionType: "Viewed Accounts", details: "zz test line" });
  await data.logSubcontractorActivity({ email: EMAIL, name: NAME, actionType: "  ", details: "ignored" });
  const lines = (await sql.query(`SELECT action_type, logged_at_raw, logged_at IS NOT NULL AS typed, subcontractor_id, source_sheet FROM sub_activity_log WHERE subcontractor_name = $1 ORDER BY created_at, id`, [NAME])) as { action_type: string; logged_at_raw: string; typed: boolean; subcontractor_id: string | null; source_sheet: string | null }[];
  check("logSubcontractorActivity writes one line per call; a line with no action is not written", lines.length === 2 && (await count("sub_activity_log")) === before.log + 2);
  check("the time is in the sheet's format and also typed; a known email is tied to its sub, an unknown one is not", lines.every((l) => /^\d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2}:\d{2}$/.test(l.logged_at_raw) && l.typed && l.source_sheet === null) && lines[0].subcontractor_id === null && lines[1].subcontractor_id === busiest.id);

  const first = await data.submitSubPortalIssue({ subcontractorEmail: EMAIL, subcontractorName: NAME, accountId: "zz-none", accountName: NAME, issueType: "Supplies Needed", urgency: "Urgent", description: "test issue", photoCount: 0, status: "New" });
  const second = await data.submitSubPortalIssue({ subcontractorEmail: busiest.email, subcontractorName: NAME, accountId: [...ids][0] ?? "", accountName: "name that matches nothing", issueType: "Other", description: "second", photoCount: 2 });
  check("submitSubPortalIssue: ids look like SUBISSUE-<14 digits>, different even in the same second, rows go after the last one", /^SUBISSUE-\d{14}(-\d+)?$/.test(first.issueId) && first.issueId !== second.issueId && first.rowNumber === lastIssue + 1 && second.rowNumber === lastIssue + 2, `${first.issueId} ${second.issueId}`);
  let list = await data.getSubPortalIssuesShape();
  const mine = list.issues.find((i) => i.issueId === first.issueId);
  check("the list is newest first, shows both, and counts the new ones", list.issues[0].issueId === second.issueId && list.issues[1].issueId === first.issueId && list.issues.length === before.issues + 2);
  check("values as sent; a photo count of 0 reads as empty, 2 as 2; no urgency or status sent means Normal and New", !!mine && /^\d{4}-\d{2}-\d{2}$/.test(mine.timestamp) && mine.subcontractorEmail === EMAIL && mine.accountName === NAME && mine.issueType === "Supplies Needed" && mine.urgency === "Urgent" && mine.description === "test issue" && mine.photoCount === "" && mine.status === "New" && list.issues[0].photoCount === "2" && list.issues[0].urgency === "Normal" && list.issues[0].status === "New");
  const newBefore = list.newCount;
  const links = (await sql.query(`SELECT issue_id, subcontractor_id, account_ref FROM sub_portal_issues WHERE subcontractor_name = $1`, [NAME])) as { issue_id: string; subcontractor_id: string | null; account_ref: string | null }[];
  check("unknown sub and account stay unlinked; a real sub email and account ID are linked", links.find((l) => l.issue_id === first.issueId)?.subcontractor_id === null && links.find((l) => l.issue_id === first.issueId)?.account_ref === null && links.find((l) => l.issue_id === second.issueId)?.subcontractor_id === busiest.id && (ids.size === 0 || links.find((l) => l.issue_id === second.issueId)?.account_ref === [...ids][0]));

  await data.updateSubPortalIssueStatus({ issueId: first.issueId, rowNumber: first.rowNumber, status: "Reviewed" });
  await data.updateSubPortalIssueStatus({ issueId: second.issueId, status: "Resolved", notes: "called them" });
  list = await data.getSubPortalIssuesShape();
  check("updateSubPortalIssueStatus by row + id (notes left alone) and by id alone (notes saved); the new count goes down", list.issues.find((i) => i.issueId === first.issueId)?.status === "Reviewed" && list.issues.find((i) => i.issueId === first.issueId)?.notes === "" && list.issues.find((i) => i.issueId === second.issueId)?.notes === "called them" && list.newCount === newBefore - 2);
  check("an unknown issue, an empty status and an issue with no description are refused", (await rejects(() => data.updateSubPortalIssueStatus({ issueId: "SUBISSUE-0", status: "Reviewed" }), "Could not find the issue to update.")) && (await rejects(() => data.updateSubPortalIssueStatus({ issueId: first.issueId }), "Status is required.")) && (await rejects(() => data.submitSubPortalIssue({ description: "  " }), "Please describe the issue.")));
  check("no imported issue was touched", (await importedHash()) === hashBefore);
} finally {
  await sql.query(`DELETE FROM sub_portal_issues WHERE subcontractor_name = $1 AND source_sheet IS NULL`, [NAME]);
  await sql.query(`DELETE FROM sub_activity_log WHERE subcontractor_name = $1 AND source_sheet IS NULL`, [NAME]);
  check("test rows removed; counts are back to where they started", (await count("sub_portal_issues")) === before.issues && (await count("sub_activity_log")) === before.log);
}

console.log(failed ? "\nFAILED" : "\nAll checks passed.");
if (failed) process.exitCode = 1;
