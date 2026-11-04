// One account's schedule as the shared schedule form sees it
// (app/components/schedule-editor.tsx). Pure: safe in server code and
// "use client" components.
//
// Stored the same way as always: one sub_schedules row per day (or per
// monthly visit). This file turns those rows into a "plan" for the form and
// the plan back into rows, and writes the plain-English line people read:
//   "Mon–Fri, between 6:00 pm and 10:00 pm, about 2h 30m each visit".
//
// Each day has a time ("Anytime between…" or "At exactly…") and an optional
// time on site. "Same time every day" means one time for all of them.

import { parseMonthlyOccurrence, type ScheduleFrequency } from "@/lib/scheduleRecurrence";
import { formatClock, parseClock, scheduleWindowHours, toClock, windowForStartTime } from "@/lib/schedule-time";
import { formatMinutes, MAX_MINUTES_ON_SITE, MIN_MINUTES_ON_SITE } from "@/lib/time-on-site";

export const WEEK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const WEEK_POSITIONS = ["1st", "2nd", "3rd", "4th", "Last"];

export type TimeKind = "between" | "exact";

/** One day's time. Minutes after midnight; minutes = time on site, null = not set. */
export type DayTime = { kind: TimeKind; start: number; end: number; minutes: number | null };

export type MonthlyVisit = { position: string; weekday: string };

export type SchedulePlan = {
  /** "" until someone picks one. */
  frequency: ScheduleFrequency | "";
  /** Weekly / every 2 weeks: the days, Monday first. */
  days: string[];
  /** 1x a month: one visit; 2x a month: two. */
  visits: MonthlyVisit[];
  sameTime: boolean;
  /** The time for every day when sameTime is on. */
  all: DayTime;
  /**
   * Each day's own time, by day name (or "visit1" / "visit2"). Kept when a
   * day is unticked or "Same time" is switched back on, so nothing typed is lost.
   */
  perDay: Record<string, DayTime>;
};

/** What one stored row says (a SubSchedule, or the bits of one the form needs). */
export type ScheduleRowLike = {
  frequency: string;
  dayOfWeek: string;
  monthlyOccurrence: string;
  timeWindow: string;
  scheduleType?: string;
  startTime?: string;
  windowStart?: string | null;
  windowEnd?: string | null;
  minutesOnSite?: number | null;
};

/** What the form sends for one row. */
export type ScheduleEntry = {
  dayOfWeek?: string;
  monthlyOccurrence?: string;
  timeWindow: string;
  scheduleType: "window" | "appointment";
  startTime?: string;
  windowStart?: string;
  windowEnd?: string;
  minutesOnSite?: number | null;
};

export const DEFAULT_DAY_TIME: DayTime = { kind: "between", start: 18 * 60, end: 22 * 60, minutes: null };

export function emptyPlan(): SchedulePlan {
  return { frequency: "", days: [], visits: [], sameTime: true, all: { ...DEFAULT_DAY_TIME }, perDay: {} };
}

export const FREQUENCY_CHOICES: { id: ScheduleFrequency; label: string }[] = [
  { id: "WEEKLY", label: "Weekly" },
  { id: "BIWEEKLY", label: "Every 2 weeks" },
  { id: "MONTHLY_1X", label: "1x a month" },
  { id: "MONTHLY_2X", label: "2x a month" },
  { id: "AS_NEEDED", label: "As needed" },
];

export const isByWeekday = (frequency: string) => frequency === "WEEKLY" || frequency === "BIWEEKLY";
export const isMonthly = (frequency: string) => frequency === "MONTHLY_1X" || frequency === "MONTHLY_2X";
export const visitsNeeded = (frequency: string) => (frequency === "MONTHLY_2X" ? 2 : frequency === "MONTHLY_1X" ? 1 : 0);

/** The days (or monthly visits) that get a time, in order, with the words shown for each. */
export function planSlots(plan: SchedulePlan): { key: string; label: string }[] {
  if (isByWeekday(plan.frequency)) return sortDays(plan.days).map((day) => ({ key: day, label: day }));
  if (isMonthly(plan.frequency)) {
    return Array.from({ length: visitsNeeded(plan.frequency) }, (_, index) => {
      const visit = plan.visits[index];
      const words = visit?.position && visit.weekday ? `${visit.position} ${visit.weekday}` : `Visit ${index + 1}`;
      return { key: `visit${index + 1}`, label: words };
    });
  }
  return [];
}

export function sortDays(days: string[]): string[] {
  return WEEK_DAYS.filter((day) => days.includes(day));
}

/** The time that applies to one day. */
export function timeFor(plan: SchedulePlan, key: string): DayTime {
  if (plan.sameTime) return plan.all;
  return plan.perDay[key] ?? plan.all;
}

/* ---------- rows → plan ---------- */

/** False for an old row saved with no time at all (no window, no exact time). */
export function rowHasTime(row: ScheduleRowLike): boolean {
  const exact = row.scheduleType === "appointment" && parseClock(row.startTime) !== null;
  return exact || scheduleWindowHours(row) !== null;
}

function rowTime(row: ScheduleRowLike): DayTime {
  const minutes = typeof row.minutesOnSite === "number" && row.minutesOnSite > 0 ? row.minutesOnSite : null;
  const start = parseClock(row.startTime);
  if (row.scheduleType === "appointment" && start !== null) return { kind: "exact", start, end: start + 60, minutes };
  const hours = scheduleWindowHours(row);
  if (hours) return { kind: "between", start: hours.start, end: hours.end, minutes };
  return { ...DEFAULT_DAY_TIME, minutes };
}

const sameDayTime = (a: DayTime, b: DayTime) =>
  a.kind === b.kind && a.start === b.start && (a.kind === "exact" || a.end === b.end) && a.minutes === b.minutes;

/**
 * The rows of one schedule (one account, one sub, created together) as a
 * plan. Rows from before per-day times read as "Same time every day" with
 * their own times and no time on site; days that really differ keep their
 * own times.
 */
export function rowsToPlan(rows: ScheduleRowLike[]): SchedulePlan {
  const plan = emptyPlan();
  if (rows.length === 0) return plan;
  const frequency = rows[0].frequency as ScheduleFrequency;
  plan.frequency = FREQUENCY_CHOICES.some((choice) => choice.id === frequency) ? frequency : "WEEKLY";
  if (plan.frequency === "AS_NEEDED") return plan;

  const timed: { key: string; time: DayTime }[] = [];
  if (isMonthly(plan.frequency)) {
    rows.slice(0, visitsNeeded(plan.frequency)).forEach((row, index) => {
      const occurrence = parseMonthlyOccurrence(row.monthlyOccurrence);
      plan.visits.push({ position: occurrence?.position ?? "", weekday: occurrence?.weekday ?? "" });
      timed.push({ key: `visit${index + 1}`, time: rowTime(row) });
    });
  } else {
    for (const row of rows) {
      if (!WEEK_DAYS.includes(row.dayOfWeek) || plan.days.includes(row.dayOfWeek)) continue;
      plan.days.push(row.dayOfWeek);
      timed.push({ key: row.dayOfWeek, time: rowTime(row) });
    }
    plan.days = sortDays(plan.days);
  }

  if (timed.length === 0) return plan;
  plan.all = { ...timed[0].time };
  plan.sameTime = timed.every((entry) => sameDayTime(entry.time, timed[0].time));
  for (const entry of timed) plan.perDay[entry.key] = { ...entry.time };
  return plan;
}

/* ---------- plan → rows ---------- */

function entryTimes(time: DayTime): Omit<ScheduleEntry, "dayOfWeek" | "monthlyOccurrence"> {
  const minutes = time.minutes === null ? null : Math.min(MAX_MINUTES_ON_SITE, Math.max(MIN_MINUTES_ON_SITE, time.minutes));
  if (time.kind === "exact") {
    return { timeWindow: windowForStartTime(time.start), scheduleType: "appointment", startTime: toClock(time.start), minutesOnSite: minutes };
  }
  return {
    // The named window the start falls in, so screens that sort or group by window keep working.
    timeWindow: windowForStartTime(time.start),
    scheduleType: "window",
    windowStart: toClock(time.start),
    windowEnd: toClock(time.end),
    minutesOnSite: minutes,
  };
}

/** The rows to save. As needed: none (the server adds its one empty row). */
export function planToEntries(plan: SchedulePlan): ScheduleEntry[] {
  if (isByWeekday(plan.frequency)) {
    return sortDays(plan.days).map((day) => ({ dayOfWeek: day, ...entryTimes(timeFor(plan, day)) }));
  }
  if (isMonthly(plan.frequency)) {
    return planSlots(plan).map((slot, index) => {
      const visit = plan.visits[index] ?? { position: "", weekday: "" };
      return { monthlyOccurrence: `${visit.position}:${visit.weekday}`, ...entryTimes(timeFor(plan, slot.key)) };
    });
  }
  return [];
}

/** Nothing picked yet: the account forms save the account without a schedule. */
export function planIsEmpty(plan: SchedulePlan): boolean {
  if (plan.frequency === "") return plan.days.length === 0;
  if (isByWeekday(plan.frequency)) return plan.days.length === 0;
  if (isMonthly(plan.frequency)) return plan.visits.every((visit) => !visit.position && !visit.weekday);
  return false;
}

/** Two plans that would save the same rows. */
export function samePlan(a: SchedulePlan, b: SchedulePlan): boolean {
  return a.frequency === b.frequency && JSON.stringify(planToEntries(a)) === JSON.stringify(planToEntries(b));
}

/* ---------- mistakes, in plain words ---------- */

// The times to check: one when every day shares it, else each day with its name.
function timesToCheck(plan: SchedulePlan): { label: string; time: DayTime }[] {
  const slots = planSlots(plan);
  if (plan.sameTime || slots.length <= 1) return [{ label: "", time: timeFor(plan, slots[0]?.key ?? "") }];
  return slots.map((slot) => ({ label: slot.label, time: timeFor(plan, slot.key) }));
}

/** Problems that stop a save. Nothing typed is cleared. */
export function planProblems(plan: SchedulePlan): string[] {
  const problems: string[] = [];
  if (plan.frequency === "") {
    problems.push("Pick how often (Weekly, Every 2 weeks …).");
    return problems;
  }
  if (isByWeekday(plan.frequency) && plan.days.length === 0) problems.push("Pick at least one day.");
  if (isMonthly(plan.frequency)) {
    planSlots(plan).forEach((slot, index) => {
      const visit = plan.visits[index];
      if (!visit?.position || !visit.weekday) {
        problems.push(visitsNeeded(plan.frequency) === 1 ? "Pick the week and the day." : `Visit ${index + 1}: pick the week and the day.`);
      }
    });
  }
  const checks = timesToCheck(plan);
  for (const { label, time } of checks) {
    if (plan.frequency === "AS_NEEDED") break;
    if (time.kind === "between" && time.end <= time.start) {
      problems.push(label ? `${label}: the end time must be after the start time.` : "The end time must be after the start time.");
    }
  }
  return problems;
}

/** Things worth a look that do not stop a save. */
export function planNotes(plan: SchedulePlan): string[] {
  const notes: string[] = [];
  if (plan.frequency === "AS_NEEDED") return notes;
  const checks = timesToCheck(plan);
  for (const { label, time } of checks) {
    if (time.kind === "between" && time.end > time.start && time.minutes !== null && time.minutes > time.end - time.start) {
      notes.push(`${label ? `${label}: ` : ""}${formatMinutes(time.minutes)} on site is longer than ${formatClock(time.start)} to ${formatClock(time.end)}.`);
    }
  }
  return notes;
}

/* ---------- the plain-English line ---------- */

const SHORT: Record<string, string> = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun",
};

/** ["Monday" … "Friday"] → "Mon–Fri"; every day → "Every day"; Sat + Sun → "Weekends"; else "Mon, Wed & Fri". */
export function describeDays(days: string[]): string {
  const sorted = sortDays(days);
  if (sorted.length === 0) return "";
  if (sorted.length === 7) return "Every day";
  if (sorted.length === 2 && sorted[0] === "Saturday" && sorted[1] === "Sunday") return "Weekends";
  const indexes = sorted.map((day) => WEEK_DAYS.indexOf(day));
  const inARow = indexes.every((value, index) => index === 0 || value === indexes[index - 1] + 1);
  if (sorted.length >= 3 && inARow) return `${SHORT[sorted[0]]}–${SHORT[sorted[sorted.length - 1]]}`;
  const names = sorted.map((day) => SHORT[day]);
  return names.length === 1 ? sorted[0] : `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

/** "between 6:00 pm and 10:00 pm" or "at 7:00 pm". */
export function describeTime(time: DayTime): string {
  return time.kind === "exact" ? `at ${formatClock(time.start)}` : `between ${formatClock(time.start)} and ${formatClock(time.end)}`;
}

const aboutMinutes = (time: DayTime) => (time.minutes !== null ? `about ${formatMinutes(time.minutes)}` : "");

/**
 * The line people read, live while the form changes and on the account page
 * and Sub Center: "Mon–Fri, between 6:00 pm and 10:00 pm, about 2h 30m each visit".
 */
export function describePlan(plan: SchedulePlan, timeKnown = true): string {
  if (plan.frequency === "") return planIsEmpty(plan) ? "No schedule yet" : "Pick how often";
  if (plan.frequency === "AS_NEEDED") return "As needed, no set days";

  const slots = planSlots(plan);
  const prefix = plan.frequency === "BIWEEKLY" ? "Every 2 weeks: " : isMonthly(plan.frequency) ? `${plan.frequency === "MONTHLY_2X" ? "2x a month" : "1x a month"}: ` : "";
  if (slots.length === 0) return `${prefix}no days picked yet`;

  const whenWords = (keys: string[]) => {
    if (isByWeekday(plan.frequency)) return describeDays(keys);
    return keys.map((key) => slots.find((slot) => slot.key === key)?.label ?? key).join(" & ");
  };

  // Old rows saved with no time at all: say so instead of a made-up time.
  if (!timeKnown) return `${prefix}${whenWords(slots.map((slot) => slot.key))}, no time set`;

  // Days that share a time are told together.
  const groups: { keys: string[]; time: DayTime }[] = [];
  for (const slot of slots) {
    const time = timeFor(plan, slot.key);
    const group = groups.find((entry) => sameDayTime(entry.time, time));
    if (group) group.keys.push(slot.key);
    else groups.push({ keys: [slot.key], time });
  }

  if (groups.length === 1) {
    const time = groups[0].time;
    const about = aboutMinutes(time);
    const each = slots.length > 1 ? " each visit" : "";
    return `${prefix}${whenWords(groups[0].keys)}, ${describeTime(time)}${about ? `, ${about}${each}` : ""}`;
  }
  return (
    prefix +
    groups
      .map((group) => {
        const about = aboutMinutes(group.time);
        return `${whenWords(group.keys)} ${describeTime(group.time)}${about ? ` (${about})` : ""}`;
      })
      .join("; ")
  );
}

/** The line for stored rows (account page, Sub Center). */
export function describeRows(rows: ScheduleRowLike[]): string {
  return rows.length === 0 ? "No schedule yet" : describePlan(rowsToPlan(rows), rows.some(rowHasTime));
}

/** One row's own time words, for one day on a calendar: "between 6:00 pm and 10:00 pm, about 2h 30m". */
export function describeRowTime(row: ScheduleRowLike): string {
  if (row.frequency === "AS_NEEDED") return "As needed";
  const time = rowTime(row);
  const about = aboutMinutes(time);
  return `${rowHasTime(row) ? describeTime(time) : "no time set"}${about ? `, ${about}` : ""}`;
}

/** Minutes after midnight a row's cleaning can start, for sorting a day. */
export function rowStartMinutes(row: ScheduleRowLike): number {
  return rowTime(row).start;
}

/** The time on site used most across the plan's days, or null when none is set. */
export function commonMinutes(plan: SchedulePlan): number | null {
  const counts = new Map<number, number>();
  for (const entry of planToEntries(plan)) {
    if (typeof entry.minutesOnSite === "number") counts.set(entry.minutesOnSite, (counts.get(entry.minutesOnSite) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [minutes, count] of counts) {
    if (count > bestCount) {
      best = minutes;
      bestCount = count;
    }
  }
  return best;
}

/* ---------- rows that belong together ---------- */

export type GroupableRow = ScheduleRowLike & {
  scheduleId: string;
  accountId: string;
  subId: string;
  status: string;
  effectiveStart: string;
  effectiveEnd: string;
  storedEffectiveEnd?: string;
};

export type ScheduleGroup<Row extends GroupableRow = GroupableRow> = { key: string; accountId: string; subId: string; rows: Row[] };

/**
 * One schedule = the rows saved together: same account, sub, frequency,
 * dates and status. That is how every form saves them (one row per day).
 */
export function groupScheduleRows<Row extends GroupableRow>(rows: Row[]): ScheduleGroup<Row>[] {
  const groups = new Map<string, ScheduleGroup<Row>>();
  for (const row of rows) {
    const key = [
      row.accountId.trim(),
      row.subId.trim().toLowerCase(),
      row.frequency,
      row.effectiveStart,
      row.storedEffectiveEnd ?? row.effectiveEnd,
      row.status.trim().toLowerCase(),
    ].join("|");
    const group = groups.get(key);
    if (group) group.rows.push(row);
    else groups.set(key, { key, accountId: row.accountId.trim(), subId: row.subId.trim(), rows: [row] });
  }
  return Array.from(groups.values());
}
