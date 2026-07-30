import { google } from "googleapis";
import { getManagerCalendarColorId } from "./googleSheets";

// One-way sync only: this file WRITES to Calendar (create/patch) and never
// reads events back to reconcile state — the Sheet stays the single source
// of truth. Every exported function is best-effort: a Calendar failure logs
// and returns null/void rather than throwing, so a Calendar outage or a
// missing/misconfigured GOOGLE_CALENDAR_ID never blocks saving a to-do.

// Separate scope from lib/googleSheets.ts's spreadsheets scope — the shared
// service account (cw-customer-portal@...) was granted "Make changes to
// events" on the target calendar specifically, so this only requests the
// events scope rather than full calendar management.
function getCalendarAuthClient() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/calendar.events"],
  });
}

function getCalendarClient() {
  return google.calendar({ version: "v3", auth: getCalendarAuthClient() });
}

// All-day events need an exclusive end date (the day AFTER start), even for
// a single-day event — Calendar API convention, not this app's choice.
function nextDay(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

// minutes:0 = "same day" and minutes:1440 = "1 day before", both at the
// calendar's own all-day-event notification time (defaults to 9:00 AM,
// changeable only in that calendar's own Settings — not per-event via the
// API). Applied to every synced to-do's event so reminders fire without
// per-event setup.
const DEFAULT_EVENT_REMINDERS = {
  useDefault: false,
  overrides: [
    { method: "popup", minutes: 0 },
    { method: "popup", minutes: 1440 },
  ],
};

// Only these task types get a calendar event at all — Visit, Customer Call,
// and Other stay Sheets-only.
export const CALENDAR_SYNCED_TASK_TYPES = new Set([
  "Complaint Follow-Up",
  "Account Follow-Up",
  "Subcontractor Follow-Up",
  "New Account Onboarding",
  "Reminder",
]);

// Deterministically recomputed from the to-do's own fields every time
// (create AND update) rather than read back from Calendar and patched
// incrementally — keeps this genuinely one-way and means un-completing a
// to-do correctly drops the "✅ Done —" prefix on the next status change
// instead of needing special-case removal logic.
export function buildEventTitle(accountName: string, why: string, status: string): string {
  const base = accountName ? `${accountName} — ${why}` : why;
  return status === "Done" ? `✅ Done — ${base}` : base;
}

export type ToDoCalendarInput = {
  taskType: string;
  dueDate: string;
  accountName: string;
  why: string;
  notes: string;
  assignedTo: string;
  status: string;
};

// `failed` distinguishes an actual Calendar failure (misconfigured env var,
// API error) from this to-do simply not being calendar-eligible — a normal
// Visit/Customer Call/Other to-do, or one with no due date, returns
// `failed: false` since there was never anything to sync.
export type CalendarSyncResult = {
  eventId: string | null;
  failed: boolean;
};

// Creates (or skips) the calendar event for a newly-created to-do. Returns
// the new event's id to be stored on the to-do's row, or null if this
// to-do isn't calendar-eligible (wrong task type, no due date) or the
// Calendar call itself failed.
export async function createCalendarEventForToDo(input: ToDoCalendarInput): Promise<CalendarSyncResult> {
  if (!CALENDAR_SYNCED_TASK_TYPES.has(input.taskType)) return { eventId: null, failed: false };
  // An all-day event needs a date to land on — a to-do saved without a due
  // date simply doesn't get a calendar event (dueDate isn't a required
  // field on the to-do form).
  if (!input.dueDate) return { eventId: null, failed: false };

  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) {
    console.error("[googleCalendar] GOOGLE_CALENDAR_ID is not configured — skipping event creation.");
    return { eventId: null, failed: true };
  }

  try {
    const colorId = await getManagerCalendarColorId(input.assignedTo);
    const calendar = getCalendarClient();

    const response = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: buildEventTitle(input.accountName, input.why, input.status),
        description: input.notes || input.why || undefined,
        start: { date: input.dueDate },
        end: { date: nextDay(input.dueDate) },
        colorId: colorId || undefined,
        reminders: DEFAULT_EVENT_REMINDERS,
      },
    });

    return { eventId: response.data.id ?? null, failed: false };
  } catch (error) {
    console.error("[googleCalendar] createCalendarEventForToDo failed:", error);
    return { eventId: null, failed: true };
  }
}

// Recomputes and pushes the event's title from the to-do's current fields
// (see buildEventTitle) — never fetches the event first. Called on every
// status change for a to-do that has a stored calendarEventId; clears
// reminders when marking Done so a stale notification doesn't fire for an
// already-finished task.
export async function updateCalendarEventForToDo(
  eventId: string,
  accountName: string,
  why: string,
  status: string
): Promise<{ failed: boolean }> {
  // No stored event id means there was never a synced event to update (e.g.
  // the original create wasn't calendar-eligible) — nothing to report as
  // failed here.
  if (!eventId) return { failed: false };

  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) {
    console.error("[googleCalendar] GOOGLE_CALENDAR_ID is not configured — skipping event update.");
    return { failed: true };
  }

  try {
    const calendar = getCalendarClient();
    await calendar.events.patch({
      calendarId,
      eventId,
      requestBody: {
        summary: buildEventTitle(accountName, why, status),
        ...(status === "Done" ? { reminders: { useDefault: false, overrides: [] } } : {}),
      },
    });
    return { failed: false };
  } catch (error) {
    console.error("[googleCalendar] updateCalendarEventForToDo failed:", error);
    return { failed: true };
  }
}
