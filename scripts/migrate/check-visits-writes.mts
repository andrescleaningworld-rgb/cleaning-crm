// Exercises every Postgres write in lib/pg/visits.ts against the dev branch,
// checks the rows, and removes the test rows it made.
//   npx tsx scripts/migrate/check-visits-writes.mts
import { loadEnv } from "./lib/env.mjs";
import { assertDevDatabase } from "./lib/guard.mjs";

loadEnv();
process.env.DATABASE_URL = assertDevDatabase(process.env.MIGRATION_DATABASE_URL);
process.env.OUTBOUND_DRY_RUN = "1";
process.env.DATA_SOURCE_VISITS = "postgres";

const data = await import("../../lib/data/visits");
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
const count = async (table: string) => ((await sql.query(`SELECT count(*)::int AS n FROM ${table}`)) as { n: number }[])[0].n;
const before = { visits: await count("visits"), log: await count("visit_edit_log") };
const lastRow = ((await sql.query(`SELECT max(sheet_row)::int AS n FROM visits`)) as { n: number }[])[0].n;
const made: string[] = [];

try {
  // ----- addVisit (replaces the Apps Script action)
  const first = await data.addVisit({ accountName: NAME, visitDate: "2026-10-01", visitType: "Inspection", completedBy: "Tester", condition: "8", followUpNeeded: "Yes", followUpDate: "2026-10-15", notes: "note" });
  made.push(first.id);
  check("addVisit returns VISIT- + 14 digits", /^VISIT-\d{14}$/.test(first.id), first.id);
  const list = await data.getVisitsAppsScriptShape();
  const mine = list[list.length - 1];
  check("the new visit is last in the list", mine.id === first.id && list.length === before.visits + 1);
  check(
    "list shape: values as sent, manager = completedBy, score = condition, no subcontractor",
    mine.accountName === NAME && mine.date === "2026-10-01" && mine.visitType === "Inspection" && mine.manager === "Tester" && mine.completedBy === "Tester" && mine.condition === "8" && mine.score === "8" && mine.subcontractor === "" && mine.followUpNeeded === "Yes" && mine.followUpDate === "2026-10-15" && mine.notes === "note"
  );
  check("Account ID is what the sheet formula would show for that row", mine.accountId === `ACC-${(lastRow + 1 + 100000).toString(16).toUpperCase()}`, mine.accountId);
  check("Created and Updated show as a day in the list", /^\d{4}-\d{2}-\d{2}$/.test(mine.createdAt) && mine.createdAt === mine.updatedAt, `${mine.createdAt} ${mine.updatedAt}`);
  check("keys are in the Apps Script order", Object.keys(mine).join(",") === "id,accountId,accountName,date,visitType,manager,completedBy,subcontractor,condition,score,followUpNeeded,followUpDate,notes,createdAt,updatedAt");

  let visit = await data.getManagerVisitById(first.id);
  check("the Visit page can open it; Created At is the sheet-style date and time", !!visit && visit.accountName === NAME && visit.date === "2026-10-01" && visit.condition === "8" && /^\d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2}:\d{2}$/.test(visit.createdAt), visit?.createdAt);
  const typed = ((await sql.query(`SELECT visit_date::text AS d, condition_score::text AS c, follow_up_date::text AS f, account_ref, visit_created_at IS NOT NULL AS t FROM visits WHERE visit_id = $1`, [first.id])) as { d: string; c: string; f: string; account_ref: string | null; t: boolean }[])[0];
  check("typed columns are filled; an unknown account name stays unlinked", typed.d === "2026-10-01" && typed.c === "8" && typed.f === "2026-10-15" && typed.account_ref === null && typed.t, JSON.stringify(typed));

  const second = await data.addVisit({ accountName: NAME, visitDate: "2026-10-02", visitType: "", completedBy: "", condition: "0", followUpNeeded: "No", followUpDate: "", notes: "" });
  made.push(second.id);
  check("a second visit in the same second still gets its own ID", second.id !== first.id && second.id.startsWith("VISIT-"), second.id);
  const zero = (await data.getVisitsAppsScriptShape()).find((v) => v.id === second.id)!;
  check("a condition of 0 shows as blank in the list (as Apps Script does)", zero.condition === "" && zero.score === "" && zero.followUpDate === "");
  check("…and as 0 on the Visit page (as the sheet read does)", (await data.getManagerVisitById(second.id))?.condition === "0");

  const noName = await data.addVisit({ accountName: "", visitDate: "2026-10-03", visitType: "x", completedBy: "", condition: "", followUpNeeded: "", followUpDate: "", notes: "" });
  made.push(noName.id);
  check("a visit without an account name has no Account ID and cannot be opened (same as Sheets)", (await data.getVisitsAppsScriptShape()).find((v) => v.id === noName.id)?.accountId === "" && (await data.getManagerVisitById(noName.id)) === null);

  // ----- updateManagerVisit
  const after = await data.updateManagerVisit(first.id, { condition: "6", notes: "changed", followUpDate: "" });
  check("update returns the merged visit with a new ISO Updated At", after.condition === "6" && after.notes === "changed" && after.followUpDate === "" && after.date === "2026-10-01" && after.visitType === "Inspection" && /^\d{4}-\d{2}-\d{2}T/.test(after.updatedAt));
  visit = await data.getManagerVisitById(first.id);
  check("the saved visit equals what update returned", JSON.stringify(visit) === JSON.stringify(after));
  const listed = (await data.getVisitsAppsScriptShape()).find((v) => v.id === first.id)!;
  check("the list passes the ISO Updated At through as it is (as Apps Script does)", listed.updatedAt === after.updatedAt && listed.condition === "6");
  await data.updateManagerVisit(first.id, { date: "2026-09-30" });
  check("changing only the date leaves everything else", (await data.getManagerVisitById(first.id))?.date === "2026-09-30" && (await data.getManagerVisitById(first.id))?.notes === "changed");
  await data.updateManagerVisit(first.id, {});
  check("an empty update only moves Updated At", (await data.getManagerVisitById(first.id))?.condition === "6");
  check("unknown visit → same error text", await throwsWith(() => data.updateManagerVisit("VISIT-nope", { notes: "x" }), 'Visit "VISIT-nope" not found.'));
  check("blank id → same error text", await throwsWith(() => data.updateManagerVisit("  ", { notes: "x" }), 'Visit "  " not found.'));

  // ----- edit log
  check("no edit history to start with", (await data.fetchVisitEditLog(first.id)).length === 0);
  const edit1 = await data.appendVisitEditLog({ visitId: first.id, editedBy: "Tester", changeSummary: "Condition: 8 -> 6" });
  await new Promise((resolve) => setTimeout(resolve, 15));
  const edit2 = await data.appendVisitEditLog({ visitId: first.id, editedBy: "Tester 2", changeSummary: "Notes updated" });
  check("appendVisitEditLog returns EDIT-<stamp>-<4 chars>", /^EDIT-[\d-]{8}-[a-z0-9]{1,4}$/.test(edit1), edit1);
  const history = await data.fetchVisitEditLog(first.id);
  check("history is newest first and only for that visit", history.length === 2 && history[0].id === edit2 && history[1].id === edit1 && history[0].editedBy === "Tester 2" && history[1].changeSummary === "Condition: 8 -> 6");
} finally {
  // Remove only what this script made.
  await sql.query(`DELETE FROM visit_edit_log WHERE visit_id = ANY($1)`, [made]);
  await sql.query(`DELETE FROM visits WHERE visit_id = ANY($1) OR account_name = $2`, [made, NAME]);
  const after = { visits: await count("visits"), log: await count("visit_edit_log") };
  check("test rows removed; counts are back to where they started", JSON.stringify(after) === JSON.stringify(before), JSON.stringify(after));
}

console.log(failed ? "\nFAILED" : "\nAll write checks passed.");
if (failed) process.exitCode = 1;
