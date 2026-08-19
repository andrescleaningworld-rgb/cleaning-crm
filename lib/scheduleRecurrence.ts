// Pure date-generation functions for SubSchedule rows. No I/O, no Google
// Sheets/Node dependencies — safe to import from both server code and
// "use client" components.

import { toISO, parseISO, todayISO } from "./dateUtils";

// Re-exported so existing importers of toISO/parseISO/todayISO from this
// module keep working unchanged — the canonical definitions now live in
// lib/dateUtils.ts.
export { toISO, parseISO, todayISO };

export type ScheduleFrequency = "WEEKLY" | "BIWEEKLY" | "MONTHLY_1X" | "MONTHLY_2X" | "AS_NEEDED";

export const SCHEDULE_FREQUENCIES: ScheduleFrequency[] = [
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY_1X",
  "MONTHLY_2X",
  "AS_NEEDED",
];

// Subset of SubSchedule's fields that recurrence generation needs. Each
// MONTHLY_1X/MONTHLY_2X schedule is one row per occurrence (e.g. a "2x per
// month" schedule is two SubSchedule rows, each with its own
// MonthlyOccurrence) — see generateMonthly2xDates below.
export type RecurrenceInput = {
  frequency: string;
  dayOfWeek: string;
  monthlyOccurrence: string;
  effectiveStart: string;
  effectiveEnd: string;
};

const DAYS_MON_FIRST = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ORDINALS = ["1st", "2nd", "3rd", "4th"];

function dayName(d: Date): string {
  return DAYS_MON_FIRST[(d.getDay() + 6) % 7];
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

function withinEffectiveRange(iso: string, effectiveStart: string, effectiveEnd: string): boolean {
  if (effectiveStart && iso < effectiveStart) return false;
  if (effectiveEnd && iso > effectiveEnd) return false;
  return true;
}

function mondayOf(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), diff);
}

// Whole-week difference between the Mondays containing each date. Only its
// parity (even/odd) matters for biweekly gating, so the sign is irrelevant.
function weeksBetweenMondays(a: Date, b: Date): number {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  return Math.round((mondayOf(b).getTime() - mondayOf(a).getTime()) / msPerWeek);
}

export function generateWeeklyDates(row: RecurrenceInput, rangeStart: Date, rangeEnd: Date): string[] {
  const dates: string[] = [];
  for (let d = new Date(rangeStart); d <= rangeEnd; d = addDays(d, 1)) {
    if (dayName(d) !== row.dayOfWeek) continue;
    const iso = toISO(d);
    if (!withinEffectiveRange(iso, row.effectiveStart, row.effectiveEnd)) continue;
    dates.push(iso);
  }
  return dates;
}

// EffectiveStart doubles as the biweekly anchor: the Monday-starting week
// containing it is "week 1" (on), and occurrences repeat every 2 weeks from
// there. Without an EffectiveStart there's no anchor to compute parity
// against, so no dates are generated.
export function generateBiweeklyDates(row: RecurrenceInput, rangeStart: Date, rangeEnd: Date): string[] {
  if (!row.effectiveStart) return [];
  const anchor = parseISO(row.effectiveStart);
  const dates: string[] = [];
  for (let d = new Date(rangeStart); d <= rangeEnd; d = addDays(d, 1)) {
    if (dayName(d) !== row.dayOfWeek) continue;
    const iso = toISO(d);
    if (!withinEffectiveRange(iso, row.effectiveStart, row.effectiveEnd)) continue;
    if (weeksBetweenMondays(anchor, d) % 2 !== 0) continue;
    dates.push(iso);
  }
  return dates;
}

// MonthlyOccurrence format: "<position>:<weekday>", e.g. "1st:Tuesday" or
// "Last:Friday" — same full weekday names as DayOfWeek elsewhere in the
// sheet, rather than a separate 3-letter code convention.
export function parseMonthlyOccurrence(value: string): { position: string; weekday: string } | null {
  const [position, weekday] = (value || "").split(":").map((s) => s.trim());
  if (!position || !weekday) return null;
  if (position !== "Last" && !ORDINALS.includes(position)) return null;
  if (!DAYS_MON_FIRST.includes(weekday)) return null;
  return { position, weekday };
}

function nthWeekdayOfMonth(year: number, month: number, weekday: string, position: string): Date | null {
  const targetDow = DAYS_MON_FIRST.indexOf(weekday);
  if (targetDow === -1) return null;

  if (position === "Last") {
    let d = new Date(year, month + 1, 0);
    while ((d.getDay() + 6) % 7 !== targetDow) d = addDays(d, -1);
    return d;
  }

  const occurrenceIndex = ORDINALS.indexOf(position);
  if (occurrenceIndex === -1) return null;

  let d = new Date(year, month, 1);
  while ((d.getDay() + 6) % 7 !== targetDow) d = addDays(d, 1);
  d = addDays(d, occurrenceIndex * 7);
  if (d.getMonth() !== month) return null; // e.g. no "4th Friday" that month
  return d;
}

export function generateMonthly1xDates(row: RecurrenceInput, rangeStart: Date, rangeEnd: Date): string[] {
  const occurrence = parseMonthlyOccurrence(row.monthlyOccurrence);
  if (!occurrence) return [];

  const dates: string[] = [];
  const rangeStartISO = toISO(rangeStart);
  const rangeEndISO = toISO(rangeEnd);
  let cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  const endCursor = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), 1);

  while (cursor <= endCursor) {
    const match = nthWeekdayOfMonth(cursor.getFullYear(), cursor.getMonth(), occurrence.weekday, occurrence.position);
    if (match) {
      const iso = toISO(match);
      if (iso >= rangeStartISO && iso <= rangeEndISO && withinEffectiveRange(iso, row.effectiveStart, row.effectiveEnd)) {
        dates.push(iso);
      }
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return dates;
}

// MONTHLY_2X schedules are two SubSchedule rows (one per occurrence), each
// carrying its own MonthlyOccurrence — so generating dates for one such row
// is identical to MONTHLY_1X. This wrapper exists for symmetry with the
// other frequencies and to make the dispatcher below read as one-branch-per-
// frequency-type.
export function generateMonthly2xDates(row: RecurrenceInput, rangeStart: Date, rangeEnd: Date): string[] {
  return generateMonthly1xDates(row, rangeStart, rangeEnd);
}

export function generateAsNeededDates(): string[] {
  return [];
}

export function generateScheduleDates(row: RecurrenceInput, rangeStart: Date, rangeEnd: Date): string[] {
  switch (row.frequency) {
    case "WEEKLY":
      return generateWeeklyDates(row, rangeStart, rangeEnd);
    case "BIWEEKLY":
      return generateBiweeklyDates(row, rangeStart, rangeEnd);
    case "MONTHLY_1X":
      return generateMonthly1xDates(row, rangeStart, rangeEnd);
    case "MONTHLY_2X":
      return generateMonthly2xDates(row, rangeStart, rangeEnd);
    case "AS_NEEDED":
      return generateAsNeededDates();
    default:
      return [];
  }
}

// Defense-in-depth on top of the stored Status column: a pattern-change edit
// closes out the superseded row by setting EffectiveEnd and Status =
// "Superseded" (see applySchedulePatternChange in lib/googleSheets.ts), but
// legacy rows written before that fix, or rows where EffectiveEnd was set
// manually without also updating Status, would otherwise still read as
// "Active". This does not touch the stored Status value — it only decides
// what counts as active for rendering/filtering.
export function isScheduleEffectivelyActive(
  schedule: { status: string; effectiveEnd: string },
  todayIso: string = todayISO()
): boolean {
  if (schedule.status.trim().toLowerCase() !== "active") return false;
  if (schedule.effectiveEnd && schedule.effectiveEnd < todayIso) return false;
  return true;
}
