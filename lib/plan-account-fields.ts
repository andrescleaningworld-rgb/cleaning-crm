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
