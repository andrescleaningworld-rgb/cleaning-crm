// The account's old schedule fields (Frequency, Cleaning Days, Cleaning
// Time), filled in from the Cleaning schedule picker. Add Account and Edit
// Account no longer show those three fields: the picker is the only place to
// set a schedule, and these columns are kept in step on save for the screens
// and reports that still read them.
//
//   Mon, Wed, Fri weekly   → "3x per week", "Mon, Wed, Fri"
//   every 2 weeks, 1 day   → "Every 2 weeks"
//   1x / 2x a month        → "1x per month" / "2x per month", "1st Monday, 3rd Thursday"
//   the time               → "18:00-21:00" (a window) or "19:00" (exact), the
//                            most used one when days have different times
// Plain TS, no server imports.

import { cleaningTimeText } from "@/lib/cleaningTime";
import { isByWeekday, isMonthly, planIsEmpty, planSlots, sortDays, timeFor, type DayTime, type SchedulePlan } from "@/lib/schedule-plan";
import type { ScheduleFrequency } from "@/lib/scheduleRecurrence";
import { weekdaysIn } from "@/lib/availability";

const SHORT: Record<string, string> = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun",
};

export type PlanAccountFields = { frequency: string; cleaningDays: string; cleaningTime: string };

function frequencyOf(plan: SchedulePlan): string {
  const count = plan.days.length;
  if (plan.frequency === "WEEKLY") return count > 0 ? `${count}x per week` : "";
  if (plan.frequency === "BIWEEKLY") return count <= 1 ? "Every 2 weeks" : `${count}x every 2 weeks`;
  if (plan.frequency === "MONTHLY_1X") return "1x per month";
  if (plan.frequency === "MONTHLY_2X") return "2x per month";
  if (plan.frequency === "AS_NEEDED") return "As needed";
  return "";
}

function daysOf(plan: SchedulePlan): string {
  if (isByWeekday(plan.frequency)) return sortDays(plan.days).map((day) => SHORT[day] ?? day).join(", ");
  if (isMonthly(plan.frequency)) {
    return plan.visits
      .filter((visit) => visit.position && visit.weekday)
      .map((visit) => `${visit.position} ${visit.weekday}`)
      .join(", ");
  }
  return "";
}

function timeText(time: DayTime): string {
  return cleaningTimeText(time.kind === "exact" ? { kind: "exact", at: time.start } : { kind: "window", from: time.start, to: time.end });
}

function timeOf(plan: SchedulePlan): string {
  const slots = planSlots(plan);
  if (slots.length === 0) return "";
  // The time most days use (the first one on a tie).
  const counts = new Map<string, number>();
  for (const slot of slots) {
    const text = timeText(timeFor(plan, slot.key));
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [text, count] of counts) {
    if (count > bestCount) {
      best = text;
      bestCount = count;
    }
  }
  return best;
}

/** The three old fields for a picker schedule; null when the picker is empty (then nothing is written). */
export function accountFieldsFromPlan(plan: SchedulePlan): PlanAccountFields | null {
  if (planIsEmpty(plan) || plan.frequency === "") return null;
  return { frequency: frequencyOf(plan), cleaningDays: daysOf(plan), cleaningTime: timeOf(plan) };
}

const lowerFirst = (text: string) => (text ? text.charAt(0).toLowerCase() + text.slice(1) : text);

/** "Old info: 3x per week, Mon, Wed, Friday, between 6:00 pm and 9:00 pm" for an account with old fields and no picker schedule; "" when nothing is there. */
export function oldScheduleInfo(
  fields: { frequency?: string; cleaningDays?: string; cleaningTime?: string },
  describeTime: (value: string) => string,
  /** The words before the colon (the sub portal passes its own language). */
  label = "Old info"
): string {
  const parts = [fields.frequency, fields.cleaningDays, fields.cleaningTime ? lowerFirst(describeTime(fields.cleaningTime)) || fields.cleaningTime : ""]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);
  return parts.length > 0 ? `${label}: ${parts.join(", ")}` : "";
}

/* ---------- the account's three fields back into a plan ---------- */

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const POSITIONS: Record<string, string> = { "1st": "1st", first: "1st", "2nd": "2nd", second: "2nd", "3rd": "3rd", third: "3rd", "4th": "4th", fourth: "4th", last: "Last" };

/** The picker's frequency a Frequency text means ("2x per month" -> MONTHLY_2X); "" when it cannot tell. */
export function frequencyFromText(text: string): ScheduleFrequency | "" {
  const value = text.trim().toLowerCase();
  if (!value) return "";
  if (/as.?needed|on.?call|on.?demand/.test(value)) return "AS_NEEDED";
  if (/\b2\s*x\s*(per|a|\/)?\s*month|twice\s+a\s+month|2\s+times\s+a\s+month|semi.?monthly/.test(value)) return "MONTHLY_2X";
  if (/\b1\s*x\s*(per|a|\/)?\s*month|once\s+a\s+month|^monthly$|per\s+month/.test(value)) return "MONTHLY_1X";
  // "Every other month", "bi-monthly", "quarterly": no picker choice says that. Nothing is guessed.
  if (/month|quarter|year/.test(value)) return "";
  if (/bi.?week|every\s+other\s+week|every\s+(2|two)\s+weeks/.test(value)) return "BIWEEKLY";
  if (/week|daily|\bx\b/.test(value)) return "WEEKLY";
  return "";
}

/** "1st Monday, 3rd Thursday" -> the monthly visits, in order. */
export function monthlyVisitsIn(text: string): { position: string; weekday: string }[] {
  const visits: { position: string; weekday: string }[] = [];
  const pattern = /\b(1st|2nd|3rd|4th|first|second|third|fourth|last)\s+(mon|tue|wed|thu|fri|sat|sun)[a-z]*/gi;
  for (const match of text.matchAll(pattern)) {
    const position = POSITIONS[match[1].toLowerCase()];
    const weekday = WEEKDAY_NAMES.find((day) => day.toLowerCase().startsWith(match[2].toLowerCase()));
    if (position && weekday) visits.push({ position, weekday });
  }
  return visits;
}

/**
 * The plan the account's Frequency / Cleaning days say, with one time for
 * every day (the reverse of accountFieldsFromPlan). Used when a sub says Yes
 * to a new account, so the sub's schedule matches what was picked: weekly,
 * every 2 weeks, 1x or 2x a month, or as needed. `weekdays` is the days to
 * use when the account's own days are not weekdays (e.g. the offer's).
 * Null when it cannot be built exactly (unknown frequency, a monthly visit
 * without its week, no days): then nothing is guessed.
 */
export function planFromAccountFields(fields: { frequency: string; cleaningDays: string }, time: DayTime, weekdays: string[] = []): SchedulePlan | null {
  // No Frequency at all: weekly on the days given (as before). A Frequency it cannot read: nothing is guessed.
  const frequency = fields.frequency.trim()
    ? frequencyFromText(fields.frequency)
    : weekdays.length > 0 || weekdaysIn(fields.cleaningDays).length > 0
      ? "WEEKLY"
      : "";
  if (!frequency) return null;
  const base: SchedulePlan = { frequency, days: [], visits: [], sameTime: true, all: { ...time }, perDay: {} };
  if (frequency === "AS_NEEDED") return base;
  if (isMonthly(frequency)) {
    const needed = frequency === "MONTHLY_2X" ? 2 : 1;
    const visits = monthlyVisitsIn(fields.cleaningDays);
    if (visits.length !== needed) return null;
    return { ...base, visits };
  }
  const own = weekdaysIn(fields.cleaningDays);
  const days = own.length > 0 ? own : weekdays.filter((day) => WEEKDAY_NAMES.includes(day));
  if (days.length === 0) return null;
  return { ...base, days: sortDays(days) };
}
