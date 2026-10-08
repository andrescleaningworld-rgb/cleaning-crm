// Exercises every Postgres write in lib/pg/complaints.ts against the dev
// branch, checks the rows, and removes the test rows it made. Sends nothing
// (these functions do not send; the route does, and it is not called here).
//   npx tsx scripts/migrate/check-complaints-writes.mts
import { loadEnv } from "./lib/env.mjs";
import { assertDevDatabase } from "./lib/guard.mjs";

loadEnv();
process.env.DATABASE_URL = assertDevDatabase(process.env.MIGRATION_DATABASE_URL);
process.env.OUTBOUND_DRY_RUN = "1";
process.env.DATA_SOURCE_COMPLAINTS = "postgres";

const data = await import("../../lib/data/complaints");
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

const NAME = "ZZ Migration Write Test";
const count = async () => ((await sql.query(`SELECT count(*)::int AS n FROM complaints`)) as { n: number }[])[0].n;
const before = await count();
const lastRow = ((await sql.query(`SELECT max(sheet_row)::int AS n FROM complaints`)) as { n: number }[])[0].n;
// A real account, to check the link and the resend lookup (read only).
const real = ((await sql.query(`SELECT id, account_name, subcontractor_raw FROM accounts WHERE id IS NOT NULL AND btrim(subcontractor_raw) <> '' ORDER BY pk LIMIT 1`)) as { id: string; account_name: string; subcontractor_raw: string }[])[0];

try {
  // ----- create
  const id = await data.appendComplaint({ accountId: "zz-none", accountName: NAME, complaintDate: "2026-10-06", issue: "test issue", priority: "High", complaintValidity: "Needs Review", status: "Open", reportedBy: "Tester", assignedTo: "Manager", lastFollowUpDate: "2026-10-09", notes: "n" });
  check("appendComplaint returns COMP- + 14 digits", /^COMP-\d{14}$/.test(id), id);
  let list = await data.getComplaintsAppsScriptShape();
  let mine = list[list.length - 1];
  check("the new complaint is last, with the next row number", mine.id === id && mine.rowNumber === lastRow + 1 && list.length === before + 1);
  check(
    "list shape: values as sent; severity = priority, manager = assigned to, description = issue",
    mine.accountName === NAME && mine.accountId === "zz-none" && mine.date === "2026-10-06" && mine.priority === "High" && mine.severity === "High" && mine.status === "Open" && mine.complaintValidity === "Needs Review" && mine.manager === "Manager" && mine.description === "test issue" && mine.notes === "n" && mine.reportedBy === "Tester"
  );
  check("the four fields Apps Script always leaves blank are blank (even though a follow-up date was sent)", mine.complaintType === "" && mine.subcontractor === "" && mine.resolution === "" && mine.followUpDate === "");
  check("keys are in the Apps Script order", Object.keys(mine).join(",") === "rowNumber,id,date,accountId,accountName,complaintType,priority,severity,status,complaintValidity,manager,subcontractor,description,resolution,followUpDate,notes,reportedBy");
  const stored = ((await sql.query(`SELECT complaint_date::text AS d, last_follow_up_date_raw AS f, last_follow_up_date::text AS fd, account_ref, updated_at_raw FROM complaints WHERE complaint_id = $1`, [id])) as { d: string; f: string; fd: string; account_ref: string | null; updated_at_raw: string }[])[0];
  check("the follow-up date IS stored (column K), dates are typed, an unknown account stays unlinked, Updated At is blank", stored.d === "2026-10-06" && stored.f === "2026-10-09" && stored.fd === "2026-10-09" && stored.account_ref === null && stored.updated_at_raw === "", JSON.stringify(stored));

  const linkedId = await data.appendComplaint({ accountId: real.id, accountName: "wrong name on purpose", complaintDate: "2026-10-06", issue: `${NAME} linked`, priority: "Medium", complaintValidity: "Valid", status: "Open", reportedBy: "", assignedTo: "", lastFollowUpDate: "", notes: "" });
  const linkedRef = ((await sql.query(`SELECT account_ref FROM complaints WHERE issue = $1`, [`${NAME} linked`])) as { account_ref: string | null }[])[0].account_ref;
  check("a complaint sent with a real account ID is linked to that account", linkedRef === real.id);
  const byNameId = await data.appendComplaint({ accountId: "", accountName: real.account_name, complaintDate: "", issue: `${NAME} by name`, priority: "Low", complaintValidity: "Valid", status: "Open", reportedBy: "", assignedTo: "", lastFollowUpDate: "", notes: "" });
  check("three complaints in the same second all exist", (await count()) === before + 3 && linkedId.startsWith("COMP-") && byNameId.startsWith("COMP-"));

  // ----- close
  const closed = await data.closeComplaint({ rowNumber: mine.rowNumber, id, status: "Closed", resolution: "fixed it" });
  check("closeComplaint returns the row number and the status", closed.rowNumber === mine.rowNumber && closed.status === "Closed");
  list = await data.getComplaintsAppsScriptShape();
  mine = list.find((c) => c.rowNumber === closed.rowNumber)!;
  check("in the list: status Closed, everything else unchanged, resolution still blank (as today)", mine.status === "Closed" && mine.notes === "n" && mine.description === "test issue" && mine.resolution === "" && mine.priority === "High");
  const afterClose = ((await sql.query(`SELECT updated_at_raw, resolution_note, notes FROM complaints WHERE sheet_row = $1`, [closed.rowNumber])) as { updated_at_raw: string; resolution_note: string; notes: string }[])[0];
  check("Updated At is stamped sheet-style; the resolution text is kept in its own column", /^\d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2}:\d{2}$/.test(afterClose.updated_at_raw) && afterClose.resolution_note === "fixed it" && afterClose.notes === "n", afterClose.updated_at_raw);
  const reopened = await data.closeComplaint({ rowNumber: "", id, status: "", resolution: "" });
  check("found by ID alone; a blank status means Closed; a blank resolution keeps the earlier text", reopened.rowNumber === closed.rowNumber && reopened.status === "Closed" && ((await sql.query(`SELECT resolution_note FROM complaints WHERE sheet_row = $1`, [closed.rowNumber])) as { resolution_note: string }[])[0].resolution_note === "fixed it");
  const stale = await data.closeComplaint({ rowNumber: 2, id, status: "Closed", resolution: "" });
  check("a stale row number does not close the wrong complaint: the ID wins", stale.rowNumber === closed.rowNumber);
  check("unknown complaint → error", await throwsWith(() => data.closeComplaint({ rowNumber: "", id: "COMP-nope", status: "Closed", resolution: "" }), "Complaint not found."));

  // ----- resend lookup (read only)
  const forResend = await data.getComplaintForResend(mine.rowNumber, id);
  check("resend lookup: the complaint's facts; no linked account → no subcontractor", !!forResend && forResend.accountName === NAME && forResend.complaintDate === "2026-10-06" && forResend.priority === "High" && forResend.issue === "test issue" && forResend.lastFollowUpDate === "2026-10-09" && forResend.assignedTo === "Manager" && forResend.subcontractorName === "");
  const linkedRow = ((await sql.query(`SELECT sheet_row FROM complaints WHERE issue = $1`, [`${NAME} linked`])) as { sheet_row: number }[])[0].sheet_row;
  check("resend lookup: a linked complaint names the subcontractor on its account", (await data.getComplaintForResend(linkedRow, ""))?.subcontractorName === real.subcontractor_raw.trim());
  check("resend lookup: unknown complaint → null", (await data.getComplaintForResend("", "COMP-nope")) === null);
} finally {
  // Remove only what this script made.
  await sql.query(`DELETE FROM complaints WHERE account_name = $1 OR issue LIKE $2`, [NAME, `${NAME}%`]);
  const after = await count();
  check("test rows removed; the count is back to where it started", after === before, String(after));
}

console.log(failed ? "\nFAILED" : "\nAll write checks passed.");
if (failed) process.exitCode = 1;
