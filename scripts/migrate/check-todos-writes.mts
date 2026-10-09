// Exercises every Postgres write in lib/pg/todos.ts against the dev branch,
// checks the rows, and removes the test rows it made. Sends nothing (these
// functions do not text or touch Calendar; the route does, and it is not
// called here).
//   npx tsx scripts/migrate/check-todos-writes.mts
import { loadEnv } from "./lib/env.mjs";
import { assertDevDatabase } from "./lib/guard.mjs";

loadEnv();
process.env.DATABASE_URL = assertDevDatabase(process.env.MIGRATION_DATABASE_URL);
process.env.OUTBOUND_DRY_RUN = "1";
process.env.DATA_SOURCE_TODOS = "postgres";

const data = await import("../../lib/data/todos");
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

const MARK = "zz-migration-write-test";
const count = async (table: string) => ((await sql.query(`SELECT count(*)::int AS n FROM ${table}`)) as { n: number }[])[0].n;
const before = { todos: await count("todos"), sms: await count("todo_sms_log") };
const lastRow = ((await sql.query(`SELECT max(sheet_row)::int AS n FROM todos`)) as { n: number }[])[0].n;
const quotaBefore = await data.fetchLatestSmsQuota();
const base = { dueDate: "2026-10-20", assignedTo: "Tester", accountName: MARK, taskType: "Visit", why: "because", status: "Open", notes: "" };
const mine = async () => (await data.fetchToDos()).filter((t) => t.accountName === MARK);

try {
  // ----- create one
  const id = await data.appendToDo(base);
  check("appendToDo returns TODO-<stamp>", /^TODO-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/.test(id), id);
  let rows = await mine();
  check(
    "new to-do: last row, created today, defaults (sync on, Medium, nothing else)",
    rows.length === 1 && rows[0].id === id && rows[0].sheetRow === lastRow + 1 && rows[0].createdDate === new Date().toISOString().slice(0, 10) && rows[0].dueDate === "2026-10-20" && rows[0].status === "Open" && rows[0].syncToCalendar === true && rows[0].priority === "Medium" && rows[0].calendarSyncFailed === false && rows[0].groupId === "" && rows[0].outcome === "" && rows[0].calendarEventId === "" && rows[0].accountId === ""
  );
  const stored = ((await sql.query(`SELECT sync_to_calendar_raw AS s, priority_raw AS p, calendar_sync_failed_raw AS f, due_date::text AS d, account_ref FROM todos WHERE todo_id = $1`, [id])) as { s: string; p: string; f: string; d: string; account_ref: string | null }[])[0];
  check("stored as the sheet would hold it: TRUE, Medium, blank; typed due date; unknown account unlinked", stored.s === "TRUE" && stored.p === "Medium" && stored.f === "" && stored.d === "2026-10-20" && stored.account_ref === null, JSON.stringify(stored));

  // ----- create a batch (the recurring-visit form)
  const ids = await data.appendToDos([
    { ...base, why: "batch 0", groupId: "grp-1", syncToCalendar: false, priority: "High", calendarEventId: "evt-0" },
    { ...base, why: "batch 1", groupId: "grp-1", calendarSyncFailed: true, accountId: "zz-none" },
    { ...base, why: "batch 2", groupId: "grp-1", priority: "nonsense" as never },
  ]);
  check("appendToDos returns one id per entry, suffixed -0 -1 -2", ids.length === 3 && ids.every((x, i) => new RegExp(`^TODO-[\\d-]{19}-${i}$`).test(x)), ids.join(" "));
  rows = await mine();
  const batch = ids.map((x) => rows.find((r) => r.id === x)!);
  check("the batch lands together, in order, on consecutive rows", batch.every(Boolean) && batch[1].sheetRow === batch[0].sheetRow + 1 && batch[2].sheetRow === batch[1].sheetRow + 1);
  check("batch values: sync off / High / event id; sync-failed + account id; a bad priority becomes Medium", batch[0].syncToCalendar === false && batch[0].priority === "High" && batch[0].calendarEventId === "evt-0" && batch[1].calendarSyncFailed === true && batch[1].accountId === "zz-none" && batch[2].priority === "Medium" && batch.every((b) => b.groupId === "grp-1"));
  check("appendToDos([]) does nothing", (await data.appendToDos([])).length === 0 && (await count("todos")) === before.todos + 4);

  // ----- status
  const statusResult = await data.updateToDoStatus(ids[0], "Completed", "done note");
  check("updateToDoStatus returns account, why and the event id", statusResult.accountName === MARK && statusResult.why === "batch 0" && statusResult.calendarEventId === "evt-0");
  rows = await mine();
  check("status and notes changed, nothing else", rows.find((r) => r.id === ids[0])!.status === "Completed" && rows.find((r) => r.id === ids[0])!.notes === "done note" && rows.find((r) => r.id === ids[0])!.priority === "High");
  check("unknown id → same error text", await throwsWith(() => data.updateToDoStatus("TODO-nope", "x", ""), 'To-do "TODO-nope" not found.'));
  check("blank id → same error text", await throwsWith(() => data.updateToDoStatus(" ", "x", ""), "Missing to-do id."));

  // ----- calendar bookkeeping
  await data.setToDoCalendarSyncFailed(id, true);
  check("setToDoCalendarSyncFailed(true)", (await mine()).find((r) => r.id === id)!.calendarSyncFailed === true);
  await data.setToDoCalendarFields(id, { calendarEventId: "evt-9", calendarSyncFailed: false });
  let t = (await mine()).find((r) => r.id === id)!;
  check("setToDoCalendarFields sets the event id and clears the flag", t.calendarEventId === "evt-9" && t.calendarSyncFailed === false);
  await data.setToDoCalendarFields(id, {});
  check("empty calendar update changes nothing", (await mine()).find((r) => r.id === id)!.calendarEventId === "evt-9");
  await data.setToDoCalendarFieldsBatch([
    { sheetRow: batch[1].sheetRow, calendarEventId: "evt-b1", calendarSyncFailed: false },
    { sheetRow: -1, calendarEventId: "ignored" },
    { sheetRow: batch[2].sheetRow, calendarSyncFailed: true },
  ]);
  rows = await mine();
  check("batch calendar update by row number; the not-found placeholder is skipped", rows.find((r) => r.id === ids[1])!.calendarEventId === "evt-b1" && rows.find((r) => r.id === ids[1])!.calendarSyncFailed === false && rows.find((r) => r.id === ids[2])!.calendarSyncFailed === true);

  // ----- edit
  const edit = await data.updateToDo(id, { assignedTo: "Someone Else", dueDate: "2026-11-01", syncToCalendar: false });
  check(
    "updateToDo returns resolved values plus the previous assignee and event id",
    edit.assignedTo === "Someone Else" && edit.previousAssignedTo === "Tester" && edit.dueDate === "2026-11-01" && edit.syncToCalendar === false && edit.taskType === "Visit" && edit.status === "Open" && edit.priority === "Medium" && edit.previousCalendarEventId === "evt-9" && edit.accountName === MARK && edit.why === "because"
  );
  t = (await mine()).find((r) => r.id === id)!;
  check("only the sent fields were written", t.assignedTo === "Someone Else" && t.dueDate === "2026-11-01" && t.syncToCalendar === false && t.taskType === "Visit" && t.notes === "" && t.calendarEventId === "evt-9");
  const noChange = await data.updateToDo(id, {});
  check("an empty edit writes nothing and still returns the current values", noChange.assignedTo === "Someone Else" && noChange.syncToCalendar === false);

  const bulk = await data.updateToDosBatch([
    { toDoId: ids[1], updates: { status: "Completed", priority: "Low" } },
    { toDoId: "TODO-nope", updates: { status: "Completed" } },
    { toDoId: ids[2], updates: { taskType: "Reminder" } },
  ]);
  check("bulk edit: one result per entry, the unknown id flagged notFound with row -1", bulk.length === 3 && bulk[0].sheetRow === batch[1].sheetRow && bulk[0].status === "Completed" && bulk[0].priority === "Low" && bulk[1].notFound === true && bulk[1].sheetRow === -1 && bulk[2].taskType === "Reminder" && bulk[2].status === "Open");
  rows = await mine();
  check("bulk edit wrote each row's own fields", rows.find((r) => r.id === ids[1])!.status === "Completed" && rows.find((r) => r.id === ids[1])!.priority === "Low" && rows.find((r) => r.id === ids[2])!.taskType === "Reminder");
  check("bulk edit with no ids returns nothing", (await data.updateToDosBatch([{ toDoId: " ", updates: { status: "x" } }])).length === 0);

  await data.updateToDoOutcome(id, "found a leak");
  check("updateToDoOutcome", (await mine()).find((r) => r.id === id)!.outcome === "found a leak");

  // ----- text log
  check("no text attempts yet", (await data.fetchSmsLogForToDo(id)).length === 0);
  await data.appendSmsLog({ toDoId: id, textId: "", managerPhone: "000", status: "failed" });
  await new Promise((resolve) => setTimeout(resolve, 15));
  await data.appendSmsLog({ toDoId: id, textId: `${MARK}-text-1`, managerPhone: "000", status: "sent", quotaRemaining: 0 });
  let attempts = await data.fetchSmsLogForToDo(id);
  check("two attempts, newest first; a quota of 0 is stored as 0, a missing one as blank", attempts.length === 2 && attempts[0].textId === `${MARK}-text-1` && attempts[0].quotaRemaining === "0" && attempts[1].quotaRemaining === "" && attempts[1].status === "failed" && attempts[0].lastCheckedAt === "");
  const latest = await data.fetchLatestSmsQuota();
  check("fetchLatestSmsQuota picks the newest send that reported a quota (the one just made: 0)", latest?.quotaRemaining === 0 && latest.sentAt === attempts[0].sentAt);
  await data.updateSmsLogStatus(`${MARK}-text-1`, "DELIVERED");
  attempts = await data.fetchSmsLogForToDo(id);
  check("updateSmsLogStatus sets the status and the checked time, and leaves the sent time", attempts[0].status === "DELIVERED" && attempts[0].lastCheckedAt !== "" && !Number.isNaN(new Date(attempts[0].lastCheckedAt).getTime()) && attempts[1].status === "failed");
  await data.updateSmsLogStatus("", "X");
  await data.updateSmsLogStatus("text-does-not-exist", "X");
  check("blank or unknown text id: nothing changes", (await data.fetchSmsLogForToDo(id)).every((a) => a.status !== "X"));
} finally {
  // Remove only what this script made.
  const ids = ((await sql.query(`SELECT todo_id FROM todos WHERE account_name = $1`, [MARK])) as { todo_id: string }[]).map((r) => r.todo_id);
  await sql.query(`DELETE FROM todo_sms_log WHERE todo_id = ANY($1) OR text_id LIKE $2`, [ids, `${MARK}%`]);
  await sql.query(`DELETE FROM todos WHERE account_name = $1`, [MARK]);
  const after = { todos: await count("todos"), sms: await count("todo_sms_log") };
  check("test rows removed; counts are back to where they started", JSON.stringify(after) === JSON.stringify(before), JSON.stringify(after));
  check("the latest quota is what it was before", JSON.stringify(await data.fetchLatestSmsQuota()) === JSON.stringify(quotaBefore));
}

console.log(failed ? "\nFAILED" : "\nAll write checks passed.");
if (failed) process.exitCode = 1;
