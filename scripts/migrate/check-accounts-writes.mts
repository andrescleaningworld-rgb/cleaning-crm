// Exercises every Postgres write in lib/pg/accounts.ts against the dev
// branch, checks the rows, and removes / restores what it touched.
//   npx tsx scripts/migrate/check-accounts-writes.mts
// Prints no account data: only pass/fail and made-up test values.
import { loadEnv } from "./lib/env.mjs";
import { assertDevDatabase } from "./lib/guard.mjs";

loadEnv();
process.env.DATABASE_URL = assertDevDatabase(process.env.MIGRATION_DATABASE_URL);
process.env.OUTBOUND_DRY_RUN = "1";
process.env.DATA_SOURCE_ACCOUNTS = "postgres";
process.env.DATA_SOURCE_SUBS = "postgres";
process.env.DATA_SOURCE_PEOPLE = "postgres";

const data = await import("../../lib/data/accounts");
const { getSql } = await import("../../lib/db");
const sql = getSql();

let failed = false;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` – ${detail}` : ""}`);
};
const throwsWith = async (run: () => Promise<unknown>, text: string) => {
  try {
    await run();
    return false;
  } catch (e) {
    return e instanceof Error && e.message.includes(text);
  }
};

const MARK = "__migration-write-test__";
const countBefore = Number((await sql`SELECT count(*)::int AS n FROM accounts`)[0].n);
const snapshot = async () => (await sql`SELECT md5(string_agg(md5(a::text), '' ORDER BY pk)) AS h FROM accounts a WHERE source_sheet IS NOT NULL`)[0].h;
const before = await snapshot();
const [aSub] = (await sql`SELECT id, contact_name FROM subcontractors WHERE id = 'SUB-018'`) as { id: string; contact_name: string }[];
const [aManager] = (await sql`SELECT id, name FROM managers ORDER BY row_no LIMIT 1`) as { id: number; name: string }[];

try {
  /* ---- add ---- */
  const created = await data.addAccount({
    accountName: MARK,
    address: "1 Test St",
    city: "Testville",
    state: "NJ", // no column for it: dropped
    zip: "07000",
    manager: aManager.name,
    subcontractor: aSub.contact_name,
    status: "Active",
    accountStartDate: "2026-10-08",
    monthlyRevenue: "1500",
    monthlySubcontractorPay: "$1,000.50",
    hasKey: "Yes",
    keyAlarmAccessInfo: "test only",
    checklistNeeded: "Yes", // handled by setAccountChecklistNeeded, not here
    madeUpField: "x",
  });
  check("new account gets an ACCT- id with 14 digits", /^ACCT-\d{14}$/.test(created.accountId), created.accountId);
  const [row] = await sql`SELECT * FROM accounts WHERE id = ${created.accountId}`;
  check("fields land in their columns", row.account_name === MARK && row.city === "Testville" && row.zip === "07000" && row.has_key === "Yes" && row.status === "Active" && row.status_key === "active");
  check("typed values are set", String(row.monthly_revenue) === "1500.00" && String(row.monthly_sub_pay) === "1000.50" && new Date(row.start_date).toISOString().slice(0, 10) === "2026-10-08");
  check("subcontractor and manager are linked by name", row.subcontractor_id === aSub.id && Number(row.manager_id) === Number(aManager.id));
  check("Last Updated is stamped", /^\d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2}:\d{2}$/.test(row.last_updated_raw), row.last_updated_raw);
  check("checklistNeeded is not written by add", row.checklist_needed === "");
  const listed = (await data.getAccountsAppsScriptShape("getAllAccounts")).find((a) => a.id === created.accountId)!;
  check("it shows in the account list, amounts as plain numbers", listed.accountName === MARK && listed.monthlyRevenue === "1500" && listed.monthlySubcontractorPay === "1000.5" && listed.accountStartDate === "2026-10-08" && listed.state === "" && listed.rowNumber === 0);
  check("it is last in the list", (await data.getAccountsAppsScriptShape("getAccounts")).at(-1)!.id === created.accountId);
  check("not on the map list (no latitude)", !(await data.getAccountsAppsScriptShape("getMapAccounts")).some((a) => a.id === created.accountId));
  check("customer-safe shape has it, without money or keys", JSON.stringify(Object.keys((await data.getMainAccountById(created.accountId))!).sort()) === JSON.stringify(["accountId", "accountName", "address", "checklistNeeded", "cleaningDays", "contactName", "frequency", "lastVisitDate", "managerName", "phone", "scopeOfWork", "serviceType", "startDate", "status"].sort()));

  /* ---- checklist needed ---- */
  await data.setAccountChecklistNeeded(created.accountId, true);
  check("setAccountChecklistNeeded(true)", (await data.getMainAccountById(created.accountId))!.checklistNeeded === true);
  await data.setAccountChecklistNeeded(` ${created.accountId} `, false);
  check("setAccountChecklistNeeded(false), padded id", (await sql`SELECT checklist_needed FROM accounts WHERE id = ${created.accountId}`)[0].checklist_needed === "No");
  check("missing account says so", await throwsWith(() => data.setAccountChecklistNeeded("no-such-id", true), 'account "no-such-id" not found'));

  /* ---- the edit page save ---- */
  const result = await data.updateAccountFieldsDirect(created.accountId, { notes: "n1", latitude: "40.5", longitude: "-74.25", subcontractorPay: "900", id: "hacked", madeUp: "x", accountStartDate: "10/9/2026" });
  check("before/after are keyed by sheet header, 35 each", Object.keys(result.before).length === 35 && result.before.Notes === "" && result.after.Notes === "n1" && result.after["Monthly Subcontractor Pay"] === "900" && result.after["Start Date"] === "10/9/2026" && result.after["Account ID"] === created.accountId);
  const [after] = await sql`SELECT * FROM accounts WHERE id = ${created.accountId}`;
  check("only the sent fields changed, typed values follow", after.notes === "n1" && Number(after.latitude) === 40.5 && String(after.monthly_sub_pay) === "900.00" && new Date(after.start_date).toISOString().slice(0, 10) === "2026-10-09" && after.city === "Testville");
  check("now on the map list", (await data.getAccountsAppsScriptShape("getMapAccounts")).some((a) => a.id === created.accountId && a.latitude === "40.5"));
  await data.updateAccountFieldsDirect(created.accountId, { subcontractor: "Nobody By This Name", manager: "" });
  const [unlinked] = await sql`SELECT subcontractor_id, manager_id, subcontractor_raw FROM accounts WHERE id = ${created.accountId}`;
  check("a sub name that fits nobody unlinks, text kept", unlinked.subcontractor_id === null && unlinked.manager_id === null && unlinked.subcontractor_raw === "Nobody By This Name");
  check("no recognised fields: nothing changes", JSON.stringify((await data.updateAccountFieldsDirect(created.accountId, { madeUp: 1 })).before) === JSON.stringify((await data.updateAccountFieldsDirect(created.accountId, {})).after));
  check("missing account says not found", await throwsWith(() => data.updateAccountFieldsDirect("no-such-id", { notes: "x" }), 'Account "no-such-id" not found.'));
  check("blank id is refused", await throwsWith(() => data.updateAccountFieldsDirect(" ", { notes: "x" }), "Missing account id."));

  /* ---- full-record update: only real changes are written ---- */
  const full = { ...(await data.getAccountsAppsScriptShape("getAllAccounts")).find((a) => a.id === created.accountId)! };
  const same = await data.updateAccountFromPayload(created.accountId, full);
  check("saving the record back unchanged writes nothing", same.changed.length === 0);
  const changed = await data.updateAccountFromPayload(created.accountId, { ...full, status: "Cancelled", cancelledDate: "10/8/2026" });
  check("a changed record writes only what changed", JSON.stringify(changed.changed.sort()) === JSON.stringify(["Cancelled Date", "Status"]), changed.changed.join(", "));
  const shown = (await data.getAccountsAppsScriptShape("getAllAccounts")).find((a) => a.id === created.accountId)!;
  check("cancelled date reads back in the Apps Script date format", shown.cancelledDate === "Thu Oct 08 2026 00:00:00 GMT-0400 (Eastern Daylight Time)", String(shown.cancelledDate));

  /* ---- onboarding checklist ---- */
  check("no checklist yet", (await data.fetchOnboardingChecklist(created.accountId)) === null);
  const first = await data.setOnboardingChecklistItem({ accountId: created.accountId, accountName: MARK, itemKey: "sale.scopeDocumented", checked: true, note: "scope note" });
  check("first tick creates the checklist", first.items["sale.scopeDocumented"].checked === true && first.startedAt !== "" && first.completedAt === "" && first.accountName === MARK);
  const second = await data.setOnboardingChecklistItem({ accountId: created.accountId, accountName: "", itemKey: "sale.scopeDocumented", checked: false, note: "", fieldOverwriteNote: "was different" });
  check("second save updates the same checklist, keeps start time and name", second.startedAt === first.startedAt && second.accountName === MARK && second.items["sale.scopeDocumented"].checked === false && second.items["sale.scopeDocumented"].completedAt === null && second.items["sale.scopeDocumented"].fieldOverwriteNote === "was different");
  check("reads back the same", JSON.stringify(await data.fetchOnboardingChecklist(created.accountId)) === JSON.stringify(second));
  check("unknown item is refused", await throwsWith(() => data.setOnboardingChecklistItem({ accountId: created.accountId, accountName: "", itemKey: "nope", checked: true, note: "" }), 'Unknown checklist item "nope".'));
  await data.markOnboardingAutoStableApplied(created.accountId);
  check("auto-stable mark is stored", (await data.fetchOnboardingChecklist(created.accountId))!.autoStableAppliedAt !== "");
  await data.markOnboardingAutoStableApplied("no-such-id");
  check("marking a missing checklist does nothing", true);
} finally {
  await sql`DELETE FROM onboarding_checklists WHERE source_sheet IS NULL AND account_name = ${MARK}`;
  await sql`DELETE FROM accounts WHERE source_sheet IS NULL AND account_name = ${MARK}`;
}

check("test rows removed; imported accounts untouched", Number((await sql`SELECT count(*)::int AS n FROM accounts`)[0].n) === countBefore && (await snapshot()) === before);
process.exitCode = failed ? 1 : 0;
