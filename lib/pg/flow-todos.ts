// A new account's steps as normal to-dos, so they get what every to-do gets:
// the To-Do list, the operations Google Calendar (with the account address
// as the location), the manager's "New to-do" text + push, and the CRM's own
// due-day reminders (app/api/cron/todo-reminders).
//
//   survey        "Site survey"                    the day and time picked on the account's setup panel
//   walkthrough   "Crew walkthrough"               the day and time picked on the account's setup panel
//   firstClean    "First cleaning"                 the account's Start Date (all day)
//   followUp      "Follow up after first cleaning" the day after the start date (all day)
//
// Each is tagged with its account and step (todos.flow_key, migration 077),
// so an account never gets a second one. Assigned to the flow's manager, task
// type "New Account Onboarding". When a step is marked done its to-do is
// Done (First cleaning goes Done with the follow-up); a step's Undo puts it
// back to Open, with its calendar reminders. Before 077 runs nothing here
// does anything. Every call is best-effort: a to-do or calendar problem is
// logged, never fails the step itself. Server only.

import { randomBytes } from "node:crypto";
import { getSql } from "@/lib/db";
import { dayAfter, doneStepsOf, flowIndex, isFlowStep, type FlowSlot, type FlowStep } from "@/lib/accountFlow";
import { appendToDoWithId, updateToDo, updateToDoStatus, setToDoCalendarFields } from "@/lib/pg/todos";
import { cleanDueTime, todoExtrasReady, todoLocation, resetTodoReminders } from "@/lib/pg/todo-extras";
import { createCalendarEventForToDo, deleteCalendarEventForToDo, updateCalendarEventForToDo } from "@/lib/googleCalendar";
import { notifyManagerOfNewToDo } from "@/app/api/to-do/route";

export type FlowToDoKey = "survey" | "walkthrough" | "firstClean" | "followUp";

/** What each step's to-do says (its "why"). */
export const FLOW_TODO_WHY: Record<FlowToDoKey, string> = {
  survey: "Site survey",
  walkthrough: "Crew walkthrough",
  firstClean: "First cleaning",
  followUp: "Follow up after first cleaning",
};

/** The flow step whose "done" finishes each to-do. */
const DONE_BY: Record<FlowToDoKey, FlowStep> = { survey: "survey", walkthrough: "walkthrough", firstClean: "followUp", followUp: "followUp" };

const TASK_TYPE = "New Account Onboarding";
const clean = (value: unknown) => String(value ?? "").trim();
const isFinished = (status: string) => ["done", "cancelled", "canceled"].includes(status.trim().toLowerCase());
const flowKey = (accountId: string, key: FlowToDoKey) => `${accountId}:${key}`;
const dayOf = (value: string | Date | null | undefined): string => {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
};

type FlowToDoRow = { todo_id: string; due_date_raw: string; due_time: string; status: string; notes: string; calendar_event_id: string; sync_to_calendar_raw: string; sheet_row: number };

async function stepToDo(accountId: string, key: FlowToDoKey): Promise<FlowToDoRow | null> {
  const rows = (await getSql().query(
    `SELECT todo_id, due_date_raw, due_time, status, notes, calendar_event_id, sync_to_calendar_raw, sheet_row FROM todos WHERE flow_key = $1 LIMIT 1`,
    [flowKey(accountId, key)]
  )) as FlowToDoRow[];
  return rows[0] ?? null;
}

/** The flow, the account and which steps are done. Null when the account has no flow. */
async function flowFacts(accountId: string) {
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT f.step, f.manager, f.follow_up_due, COALESCE(NULLIF(btrim(a.account_name), ''), f.account_name) AS account_name, a.start_date
     FROM account_flows f LEFT JOIN accounts a ON a.id = f.account_id WHERE f.account_id = $1 LIMIT 1`,
    [accountId]
  )) as { step: string; manager: string; follow_up_due: string | Date | null; account_name: string; start_date: string | Date | null }[];
  const row = rows[0];
  if (!row) return null;
  const events = (await sql.query(`SELECT step, action FROM account_flow_events WHERE account_id = $1 ORDER BY at ASC, id ASC`, [accountId])) as { step: string; action: string }[];
  const pointer: FlowStep = isFlowStep(row.step) ? row.step : "packet";
  const marked = doneStepsOf(events);
  // The same rule as the tracker: before the current step, or marked done ahead of it.
  const isDone = (step: FlowStep) => pointer === "live" || flowIndex(step) < flowIndex(pointer) || marked.includes(step);
  const startDate = dayOf(row.start_date);
  return {
    manager: clean(row.manager),
    accountName: clean(row.account_name),
    startDate,
    followUpDue: dayOf(row.follow_up_due) || (startDate ? dayAfter(startDate) : ""),
    isDone,
  };
}

/** A new step to-do: calendar event, row, its tag and time, then the manager's "New to-do" notice. */
async function createStepToDo(
  accountId: string,
  key: FlowToDoKey,
  facts: { manager: string; accountName: string },
  dueDate: string,
  dueTime: string,
  origin: string
): Promise<void> {
  const input = {
    dueDate,
    assignedTo: facts.manager,
    accountName: facts.accountName,
    taskType: TASK_TYPE,
    why: FLOW_TODO_WHY[key],
    status: "Open",
    notes: "",
    syncToCalendar: true,
  };
  const location = await todoLocation(accountId, facts.accountName);
  const { eventId, failed } = await createCalendarEventForToDo({ ...input, dueTime, location });
  const id = `TODO-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}-${randomBytes(3).toString("hex")}`;
  await appendToDoWithId(id, { ...input, accountId, calendarEventId: eventId ?? "", calendarSyncFailed: failed });
  try {
    await getSql().query(`UPDATE todos SET flow_key = $2, due_time = $3 WHERE btrim(todo_id) = $1`, [id, flowKey(accountId, key), dueTime]);
  } catch (error) {
    // 23505: another request made this step's to-do at the same moment. Keep that one, take this one back.
    if ((error as { code?: string })?.code === "23505") {
      await getSql().query(`DELETE FROM todos WHERE btrim(todo_id) = $1 AND flow_key IS NULL`, [id]);
      if (eventId) await deleteCalendarEventForToDo(eventId);
      return;
    }
    throw error;
  }
  if (origin) await notifyManagerOfNewToDo(id, input, origin).catch(() => undefined);
}

/** A step to-do's day / time moved: the row, the reminders and the calendar event follow. */
async function moveStepToDo(row: FlowToDoRow, facts: { accountName: string; manager: string }, accountId: string, why: string, dueDate: string, dueTime: string): Promise<void> {
  const sql = getSql();
  await updateToDo(row.todo_id, { dueDate });
  await sql.query(`UPDATE todos SET due_time = $2 WHERE sheet_row = $1`, [row.sheet_row, dueTime]);
  await resetTodoReminders(row.sheet_row);
  if (row.calendar_event_id) {
    const location = await todoLocation(accountId, facts.accountName);
    const result = await updateCalendarEventForToDo({ eventId: row.calendar_event_id, accountName: facts.accountName, why, status: row.status, dueDate, dueTime, location, assignedTo: facts.manager });
    await setToDoCalendarFields(row.todo_id, { calendarSyncFailed: result.failed });
  } else if (row.sync_to_calendar_raw !== "FALSE") {
    const location = await todoLocation(accountId, facts.accountName);
    const result = await createCalendarEventForToDo({
      dueDate,
      dueTime,
      location,
      assignedTo: facts.manager,
      accountName: facts.accountName,
      taskType: TASK_TYPE,
      why,
      status: row.status,
      notes: "",
      syncToCalendar: true,
    });
    await setToDoCalendarFields(row.todo_id, { calendarEventId: result.eventId ?? "", calendarSyncFailed: result.failed });
  }
}

/** Open ↔ Done, with the calendar title and reminders (Undo brings the reminders back). */
async function setStepStatus(row: FlowToDoRow, facts: { accountName: string }, accountId: string, why: string, status: "Open" | "Done"): Promise<void> {
  // The notes the manager wrote on it stay.
  await updateToDoStatus(row.todo_id, status, row.notes ?? "");
  if (!row.calendar_event_id) return;
  const result = await updateCalendarEventForToDo({
    eventId: row.calendar_event_id,
    accountName: facts.accountName,
    why,
    status,
    ...(status === "Open" ? { restoreReminders: true, dueDate: row.due_date_raw, dueTime: cleanDueTime(row.due_time) } : {}),
  });
  await setToDoCalendarFields(row.todo_id, { calendarSyncFailed: result.failed });
}

/**
 * Brings the account's step to-dos in line with its flow: First cleaning on
 * the start date and the follow-up the day after (made, or moved when the
 * start date moved), and each step's to-do Done once its step is done.
 * `reopen`: someone just tapped Undo. A Done to-do whose step is no longer
 * done goes back to Open (an Undo on an earlier step takes the later ones back too).
 * `origin` (the site's address): for the manager's "New to-do" notice; none = no notice.
 */
export async function syncFlowToDos(accountId: string, options: { origin?: string; reopen?: boolean } = {}): Promise<void> {
  try {
    if (!accountId || !(await todoExtrasReady())) return;
    const facts = await flowFacts(accountId);
    if (!facts) return;
    const origin = options.origin ?? "";

    // First cleaning and its follow-up: from the start date.
    const dated: [FlowToDoKey, string][] = [
      ["firstClean", facts.startDate],
      ["followUp", facts.followUpDue],
    ];
    for (const [key, dueDate] of dated) {
      if (!dueDate) continue;
      const row = await stepToDo(accountId, key);
      if (!row) {
        // Not made for a step that is already done (the account was set up before this).
        if (!facts.isDone(DONE_BY[key])) await createStepToDo(accountId, key, facts, dueDate, "", origin);
      } else if (row.due_date_raw !== dueDate && !isFinished(row.status)) {
        await moveStepToDo(row, facts, accountId, FLOW_TODO_WHY[key], dueDate, "");
      }
    }

    // Done when its step is done; back to Open when that step was just undone.
    for (const key of Object.keys(FLOW_TODO_WHY) as FlowToDoKey[]) {
      const row = await stepToDo(accountId, key);
      if (!row) continue;
      const step = DONE_BY[key];
      if (facts.isDone(step) && !isFinished(row.status)) await setStepStatus(row, facts, accountId, FLOW_TODO_WHY[key], "Done");
      else if (options.reopen && !facts.isDone(step) && row.status.trim().toLowerCase() === "done") await setStepStatus(row, facts, accountId, FLOW_TODO_WHY[key], "Open");
    }
  } catch (error) {
    console.error("[flow to-dos]", accountId, error instanceof Error ? error.message : error);
  }
}


/** What the setup panel shows: the site survey's and the walkthrough's picked day and time, if any. */
export async function flowSchedule(accountId: string): Promise<{ survey: FlowSlot | null; walkthrough: FlowSlot | null } | null> {
  try {
    if (!(await todoExtrasReady())) return null;
    const [survey, walkthrough] = await Promise.all([stepToDo(accountId, "survey"), stepToDo(accountId, "walkthrough")]);
    const slot = (row: FlowToDoRow | null): FlowSlot | null => (row ? { date: dayOf(row.due_date_raw), time: cleanDueTime(row.due_time), status: clean(row.status) } : null);
    return { survey: slot(survey), walkthrough: slot(walkthrough) };
  } catch (error) {
    console.error("[flow schedule]", error instanceof Error ? error.message : error);
    return null;
  }
}

export class FlowScheduleError extends Error {}

/**
 * "Save" on the site survey or the walkthrough: the day and time it happens.
 * The first time makes its to-do (with the calendar event and the manager's
 * notice); after that the to-do, its event and its reminders move.
 */
export async function scheduleFlowStep(accountId: string, key: "survey" | "walkthrough", date: string, time: string, origin: string): Promise<void> {
  if (!(await todoExtrasReady())) throw new FlowScheduleError("Scheduling needs a database update first (migration 077). Ask the office admin.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new FlowScheduleError("Pick the day.");
  const dueTime = cleanDueTime(time);
  if (!dueTime) throw new FlowScheduleError("Pick the time.");
  const facts = await flowFacts(accountId);
  if (!facts) throw new FlowScheduleError("This account has no new-account steps.");
  if (facts.isDone(key)) throw new FlowScheduleError("That step is already done.");
  const row = await stepToDo(accountId, key);
  if (!row) await createStepToDo(accountId, key, facts, date, dueTime, origin);
  else if (row.due_date_raw !== date || cleanDueTime(row.due_time) !== dueTime) {
    // A Done / Cancelled one (done by hand on the To-Do page) is opened again with the new time.
    if (isFinished(row.status)) await setStepStatus(row, facts, accountId, FLOW_TODO_WHY[key], "Open");
    await moveStepToDo({ ...row, status: isFinished(row.status) ? "Open" : row.status }, facts, accountId, FLOW_TODO_WHY[key], date, dueTime);
  }
}
