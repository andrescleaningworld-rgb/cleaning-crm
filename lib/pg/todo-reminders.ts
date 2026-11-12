// The CRM's own due-day reminders for to-dos (cron /api/cron/todo-reminders,
// every 15 minutes). To the assigned manager, by push + text (the same
// Textbelt and OneSignal code as a new to-do, app/api/to-do/route.ts):
//
//   8 AM on the due day   "Today: <account> - <why>" (every to-do with a due date)
//   1 hour before         "In 1 hour: …" (only a to-do with a time, migration 077)
//
// Never for a Done or Cancelled to-do, nor a day already past. Each goes once:
// the to-do is marked first (reminded_day_at / reminded_hour_at), so two runs
// at once never send twice; a new due date or time clears the marks
// (lib/pg/todo-extras.ts resetTodoReminders). Texts never carry a link.
// Before migration 077 runs nothing is sent. Server only.

import { getSql } from "@/lib/db";
import { HIDDEN_ACCOUNT_IDS } from "@/lib/pg/account-live";
import { cleanDueTime, timeLabel, todoExtrasReady } from "@/lib/pg/todo-extras";
import { remindManagerOfToDo } from "@/app/api/to-do/route";

/** The 8 AM reminder, in minutes after midnight (office time). */
const DAY_REMINDER_AT = 8 * 60;
/** The "in 1 hour" reminder goes in the hour before the to-do's time. */
const HOUR_BEFORE = 60;
/** A to-do made this recently already got its "New to-do" notice: no reminder on top. */
const JUST_MADE_MINUTES = 15;

const clean = (value: unknown) => String(value ?? "").trim();

/** Office (New York) day "YYYY-MM-DD" and minutes after midnight. */
function officeClock(at: Date): { day: string; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(at)
      .map((part) => [part.type, part.value])
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

type DueRow = {
  todo_id: string;
  sheet_row: number;
  account_name: string;
  why: string;
  task_type: string;
  assigned_to: string;
  due_time: string;
  created_at: string | Date;
  reminded_day_at: string | null;
  reminded_hour_at: string | null;
};

export type ReminderRun = { checked: number; daySent: number; hourSent: number; skipped: number };

export async function runTodoReminders(origin: string, now = new Date()): Promise<ReminderRun> {
  const result: ReminderRun = { checked: 0, daySent: 0, hourSent: 0, skipped: 0 };
  if (!(await todoExtrasReady())) return result;
  const sql = getSql();
  const today = officeClock(now);
  const rows = (await sql.query(
    `SELECT btrim(todo_id) AS todo_id, sheet_row, account_name, why, task_type, assigned_to, due_time, created_at, reminded_day_at, reminded_hour_at
     FROM todos
     WHERE due_date = $1::date
       AND lower(btrim(status)) NOT IN ('done', 'cancelled', 'canceled')
       AND btrim(assigned_to) <> '' AND btrim(todo_id) <> ''
       AND (account_ref IS NULL OR account_ref NOT IN ${HIDDEN_ACCOUNT_IDS})
       AND (reminded_day_at IS NULL OR (btrim(due_time) <> '' AND reminded_hour_at IS NULL))`,
    [today.day]
  )) as DueRow[];

  // Marks one reminder sent; false when another run got it first.
  const claim = async (sheetRow: number, column: "reminded_day_at" | "reminded_hour_at") =>
    ((await sql.query(`UPDATE todos SET ${column} = now() WHERE sheet_row = $1 AND ${column} IS NULL RETURNING sheet_row`, [sheetRow])) as unknown[]).length > 0;

  for (const row of rows) {
    result.checked += 1;
    const time = cleanDueTime(row.due_time);
    const [h, m] = time ? time.split(":").map(Number) : [0, 0];
    const dueMinutes = time ? h * 60 + m : null;
    const created = officeClock(new Date(row.created_at));
    const minutesSinceMade = (now.getTime() - new Date(row.created_at).getTime()) / 60000;
    const what = [clean(row.account_name), clean(row.why) || clean(row.task_type)].filter(Boolean).join(" - ") || "A to-do";
    const at = time ? ` at ${timeLabel(time)}` : "";

    // 8 AM on the due day. Not when the to-do was made today after 8 (its "New to-do" notice said so),
    // nor when its time has already passed.
    if (!row.reminded_day_at && today.minutes >= DAY_REMINDER_AT) {
      const madeAfterEight = created.day === today.day && created.minutes >= DAY_REMINDER_AT;
      const timePassed = dueMinutes !== null && dueMinutes <= today.minutes;
      if (await claim(row.sheet_row, "reminded_day_at")) {
        if (madeAfterEight || timePassed) result.skipped += 1;
        else {
          const sent = await remindManagerOfToDo(
            row.todo_id,
            row.assigned_to,
            {
              title: `Today: ${clean(row.account_name) || clean(row.why) || "To-do"}`,
              smsBody: `Reminder - today${at}: ${what}\nOpen the Cleaning World app to see it.`,
              pushBody: `Today${at}: ${what}`,
            },
            origin
          ).catch(() => false);
          if (sent) result.daySent += 1;
          else result.skipped += 1;
        }
      }
    }

    // 1 hour before a to-do with a time.
    if (dueMinutes !== null && !row.reminded_hour_at) {
      const minutesLeft = dueMinutes - today.minutes;
      if (minutesLeft >= 0 && minutesLeft <= HOUR_BEFORE && (await claim(row.sheet_row, "reminded_hour_at"))) {
        if (minutesSinceMade < JUST_MADE_MINUTES) result.skipped += 1;
        else {
          const sent = await remindManagerOfToDo(
            row.todo_id,
            row.assigned_to,
            {
              title: `In 1 hour: ${clean(row.account_name) || clean(row.why) || "To-do"}`,
              smsBody: `Reminder - in 1 hour${at}: ${what}\nOpen the Cleaning World app to see it.`,
              pushBody: `In 1 hour${at}: ${what}`,
            },
            origin
          ).catch(() => false);
          if (sent) result.hourSent += 1;
          else result.skipped += 1;
        }
      }
    }
  }
  return result;
}
