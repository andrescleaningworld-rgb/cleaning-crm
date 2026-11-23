// "To-dos done this week", for the Dashboard and the To-Do page.
//
// A to-do does not record the day it was marked Done (the To-Do sheet has no
// such column), so "done this week" is: status Done, and its due date is in
// this week (Monday to Sunday). A Done to-do with no due date counts by the
// day it was created instead. No I/O here: safe in "use client" files.

function parseDay(value: string): Date | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  // A plain YYYY-MM-DD is a calendar day, not midnight UTC (which would land
  // on the evening before in US time zones).
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  const date = iso && text.length <= 10 ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])) : new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Monday 00:00 of the current week, and the Monday after. */
function thisWeek(now = new Date()): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

/** "Old" on the To-Do list: still open and made more than this many days ago. */
export const OLD_TO_DO_DAYS = 30;

/** Whole days since the to-do was made. Null when its date can't be read. */
export function daysSinceMade(createdDate: string, now = new Date()): number | null {
  const made = parseDay(createdDate);
  if (!made) return null;
  const from = Date.UTC(made.getFullYear(), made.getMonth(), made.getDate());
  const to = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((to - from) / 86_400_000);
}

export function isOldOpenToDo(todo: { status: string; createdDate: string }, now = new Date()): boolean {
  if (todo.status === "Done" || todo.status === "Cancelled") return false;
  const days = daysSinceMade(todo.createdDate, now);
  return days !== null && days > OLD_TO_DO_DAYS;
}

export function isDoneStatus(status: string): boolean {
  const clean = String(status ?? "").trim().toLowerCase();
  return clean.includes("done") || clean.includes("completed");
}

export function isToDoDoneThisWeek(todo: { status: string; dueDate: string; createdDate: string }, now = new Date()): boolean {
  if (!isDoneStatus(todo.status)) return false;
  const day = parseDay(todo.dueDate) ?? parseDay(todo.createdDate);
  if (!day) return false;
  const { start, end } = thisWeek(now);
  return day >= start && day < end;
}
