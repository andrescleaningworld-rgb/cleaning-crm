// Exercises every Postgres write in lib/pg/scheduling.ts against the dev
// branch, checks the rows, and removes the test rows it made.
//   npx tsx scripts/migrate/check-scheduling-writes.mts
import { loadEnv } from "./lib/env.mjs";
import { assertDevDatabase } from "./lib/guard.mjs";

loadEnv();
process.env.DATABASE_URL = assertDevDatabase(process.env.MIGRATION_DATABASE_URL);
process.env.OUTBOUND_DRY_RUN = "1";
process.env.DATA_SOURCE_SCHEDULING = "postgres";

const data = await import("../../lib/data/scheduling");
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

// Test rows use an account id and a sub email that exist nowhere else.
const ACCOUNT = "zz-migration-write-test";
const SUB = "migration-write-test@example.invalid";
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};
const counts = async () => ({
  schedules: (await data.fetchSubSchedules()).length,
  exceptions: (await data.fetchScheduleExceptions()).length,
  visits: (await data.getAllSubcontractorVisits()).length,
});
const before = await counts();
const mine = async () => (await data.fetchSubSchedules()).filter((s) => s.accountId === ACCOUNT);

try {
  // ----- Schedules
  const lastRow = (await data.fetchSubSchedules()).at(-1)?.sheetRow ?? 1;
  const id1 = await data.appendSubSchedule({ accountId: ACCOUNT, subId: SUB, dayOfWeek: "Monday", timeWindow: "Evening", recurring: "Y", effectiveStart: addDays(-30), effectiveEnd: addDays(300), status: "Active", submittedBy: "Tester", submittedVia: "Admin", frequency: "WEEKLY" });
  check("appendSubSchedule returns SCH-<account>-<stamp>-<4 chars>", new RegExp(`^SCH-${ACCOUNT}-[\\d-]{8}-[a-z0-9]{1,4}$`).test(id1), id1);
  let rows = await mine();
  check(
    "new schedule is the last row, with today's submitted date and blank edit fields",
    rows.length === 1 && rows[0].sheetRow === lastRow + 1 && rows[0].submittedDate === new Date().toISOString().slice(0, 10) && rows[0].lastEditedBy === "" && rows[0].lastEditedDate === "" && rows[0].monthlyOccurrence === "" && rows[0].submittedVia === "Admin" && rows[0].frequency === "WEEKLY"
  );
  const id0 = await data.appendSubSchedule({ accountId: ACCOUNT, subId: SUB, dayOfWeek: "", timeWindow: "Morning", recurring: "N", effectiveStart: "", effectiveEnd: "", status: "Inactive", submittedBy: "Tester", submittedVia: "" });
  rows = await mine();
  check("blank Submitted via reads back as Sub Portal; blank dates stay blank", rows[1].scheduleId === id0 && rows[1].submittedVia === "Sub Portal" && rows[1].effectiveStart === "" && rows[1].frequency === "");
  const typed = (await sql.query(`SELECT effective_start::text AS s, effective_end::text AS e, account_ref, subcontractor_id FROM sub_schedules WHERE schedule_id = $1`, [id1]))[0] as { s: string; e: string; account_ref: string | null; subcontractor_id: string | null };
  check("typed dates are filled; unknown account and sub stay unlinked", typed.s === addDays(-30) && typed.e === addDays(300) && typed.account_ref === null && typed.subcontractor_id === null, JSON.stringify(typed));

  await data.updateSubSchedule(rows[0].sheetRow, { timeWindow: "Morning", lastEditedBy: "Editor" });
  rows = await mine();
  check("updateSubSchedule changes only the sent fields", rows[0].timeWindow === "Morning" && rows[0].lastEditedBy === "Editor" && rows[0].dayOfWeek === "Monday" && rows[0].status === "Active" && rows[0].submittedBy === "Tester");
  await data.updateSubSchedule(rows[0].sheetRow, {});
  check("empty update changes nothing", (await mine())[0].timeWindow === "Morning");

  // Pattern change: close the old row, add a new one from the given date.
  check("pattern change on an unknown id → same error text", await throwsWith(() => data.applySchedulePatternChange("SCH-nope", { dayOfWeek: "Tuesday", timeWindow: "Evening", frequency: "WEEKLY", monthlyOccurrence: "" }, addDays(7), "Editor"), "SubSchedule SCH-nope not found"));
  check("pattern change dated on or before the start → same error text", await throwsWith(() => data.applySchedulePatternChange(id1, { dayOfWeek: "Tuesday", timeWindow: "Evening", frequency: "WEEKLY", monthlyOccurrence: "" }, addDays(-30), "Editor"), "must be after this schedule's current EffectiveStart"));
  const changed = await data.applySchedulePatternChange(id1, { dayOfWeek: "Tuesday", timeWindow: "Evening", frequency: "AS_NEEDED", monthlyOccurrence: "" }, addDays(7), "Editor");
  rows = await mine();
  const oldRow = rows.find((r) => r.scheduleId === id1)!;
  const newRow = rows.find((r) => r.scheduleId === changed.scheduleId)!;
  check("old row: Superseded, ends the day before, edit stamped", oldRow.status === "Superseded" && oldRow.effectiveEnd === addDays(6) && oldRow.lastEditedBy === "Editor" && !Number.isNaN(new Date(oldRow.lastEditedDate).getTime()) && oldRow.dayOfWeek === "Monday");
  check(
    "new row: starts on the date, keeps account, sub, end date, submitter and channel; AS_NEEDED → Recurring N",
    !!newRow && changed.accountId === ACCOUNT && changed.subId === SUB && newRow.effectiveStart === addDays(7) && newRow.effectiveEnd === addDays(300) && newRow.dayOfWeek === "Tuesday" && newRow.frequency === "AS_NEEDED" && newRow.recurring === "N" && newRow.status === "Active" && newRow.submittedBy === "Tester" && newRow.submittedVia === "Admin" && newRow.sheetRow === Math.max(...rows.map((r) => r.sheetRow))
  );

  // Supersede: closes every Active row for the pair, returns what it closed.
  const id2 = await data.appendSubSchedule({ accountId: ACCOUNT, subId: SUB, dayOfWeek: "Friday", timeWindow: "Evening", recurring: "Y", effectiveStart: addDays(-5), effectiveEnd: "", status: "Active", submittedBy: "Tester", submittedVia: "Sub Portal", frequency: "WEEKLY" });
  const closed = await data.supersedeActiveSubSchedulesForSub(ACCOUNT, SUB, "Sub Person");
  rows = await mine();
  check("supersede returns the 2 active rows as they were", closed.length === 2 && closed.every((c) => c.status === "Active") && closed.some((c) => c.scheduleId === id2));
  check("supersede closes them with yesterday's date; the Inactive row is untouched", rows.filter((r) => r.status === "Superseded").length === 3 && rows.find((r) => r.scheduleId === id2)!.effectiveEnd === addDays(-1) && rows.find((r) => r.scheduleId === id0)!.status === "Inactive");
  check("supersede with nothing active returns an empty list", (await data.supersedeActiveSubSchedulesForSub(ACCOUNT, SUB, "x")).length === 0);
  check("supersede is exact on the sub: another sub's rows are not touched", (await data.supersedeActiveSubSchedulesForSub(ACCOUNT, "someone-else@example.invalid", "x")).length === 0);

  // ----- Exceptions
  const excId = await data.appendScheduleException({ accountId: ACCOUNT, originalDate: addDays(3), type: "Skipped", newDate: "", newTimeWindow: "", reason: "holiday", createdBy: "Tester" });
  check("appendScheduleException returns EXC-<account>-<stamp>", new RegExp(`^EXC-${ACCOUNT}-[\\d-]{8}$`).test(excId), excId);
  let exc = (await data.fetchScheduleExceptions()).find((e) => e.exceptionId === excId)!;
  check("new exception: values as sent, created today", !!exc && exc.originalDate === addDays(3) && exc.type === "Skipped" && exc.newDate === "" && exc.reason === "holiday" && exc.createdBy === "Tester" && exc.createdDate === new Date().toISOString().slice(0, 10) && exc.sheetRow >= 2);
  await data.updateScheduleException(exc.sheetRow, { type: "Moved", newDate: addDays(4), newTimeWindow: "Morning" });
  exc = (await data.fetchScheduleExceptions()).find((e) => e.exceptionId === excId)!;
  check("updateScheduleException changes only the sent fields", exc.type === "Moved" && exc.newDate === addDays(4) && exc.newTimeWindow === "Morning" && exc.reason === "holiday" && exc.originalDate === addDays(3));
  await data.deleteScheduleException(exc.sheetRow);
  check("deleteScheduleException removes the row", !(await data.fetchScheduleExceptions()).some((e) => e.exceptionId === excId));

  // ----- Sub visits
  const visitDate = addDays(-1);
  const visId = await data.logSubcontractorVisit({ accountName: "ZZ Migration Write Test", subEmail: SUB, subName: "Test Sub", visitDate, arrivalTime: "18:30", notes: "n" });
  check("logSubcontractorVisit returns VIS-<date>-<stamp>", new RegExp(`^VIS-${visitDate.replace(/-/g, "")}-[\\d-]{8}$`).test(visId), visId);
  let visits = await data.getSubcontractorVisits(SUB.toUpperCase());
  check("visit is found by email whatever the letter case", visits.length === 1 && visits[0].visitId === visId && visits[0].arrivalTime === "18:30");
  check("filter by account name ignores case and spaces; a wrong name finds nothing", (await data.getSubcontractorVisits(SUB, "  zz migration write test ")).length === 1 && (await data.getSubcontractorVisits(SUB, "other")).length === 0);
  check("the visit is in the full list", (await data.getAllSubcontractorVisits()).some((v) => v.visitId === visId));
  await data.updateSubcontractorVisit(visits[0].sheetRow, { arrivalTime: "19:00", notes: "late" });
  visits = await data.getSubcontractorVisits(SUB);
  check("updateSubcontractorVisit changes only the sent fields", visits[0].arrivalTime === "19:00" && visits[0].notes === "late" && visits[0].visitDate === visitDate && visits[0].subName === "Test Sub");
  await data.deleteSubcontractorVisit(visits[0].sheetRow);
  check("deleteSubcontractorVisit removes the row", (await data.getSubcontractorVisits(SUB)).length === 0);
} finally {
  // Remove only what this script made.
  await sql.query(`DELETE FROM sub_schedules WHERE account_id = $1`, [ACCOUNT]);
  await sql.query(`DELETE FROM schedule_exceptions WHERE account_id = $1`, [ACCOUNT]);
  await sql.query(`DELETE FROM subcontractor_visits WHERE lower(sub_email) = $1`, [SUB]);
  const after = await counts();
  check("test rows removed; counts are back to where they started", JSON.stringify(after) === JSON.stringify(before), JSON.stringify(after));
}

console.log(failed ? "\nFAILED" : "\nAll write checks passed.");
if (failed) process.exitCode = 1;
