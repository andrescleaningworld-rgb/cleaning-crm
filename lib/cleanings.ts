// The Cleaning calendar (/board/calendar) and the TV's "Today's cleanings":
// the shared words and rules. Plain TS with no server imports. The database
// side is lib/pg/cleanings.ts.
//
// What counts as cleaned (agreed with Andres, Oct 9 2026):
//   cleaned        that day has a Crew Link checklist, a visit the sub logged
//                  or a sub's "after" photo, or a manager tapped "Cleaned"
//   missed         a manager tapped "Missed", or the account has the Crew
//                  Link checklist turned on and nothing was sent that day
//   not confirmed  any other scheduled day in the past (gray, like scheduled)
//   scheduled      today or later, nothing in yet
// A manager's own visit (Routine Visit, Quality Check) is shown as "visited";
// it does not make the day cleaned.

export type CleaningStatus = "cleaned" | "scheduled" | "unconfirmed" | "missed" | "extra";

export type CleaningProof = "" | "checklist" | "sub-visit" | "photo" | "marked";

export type Cleaning = {
  /** YYYY-MM-DD, office time (America/New_York). */
  day: string;
  accountId: string;
  accountName: string;
  /** The sub's name, as on the schedule. "" when the schedule has none. */
  sub: string;
  subId: string;
  manager: string;
  timeWindow: string;
  status: CleaningStatus;
  proof: CleaningProof;
  /** A manager logged a visit to the account that day. */
  visited: boolean;
  /** Cleaned on a day the schedule did not have. */
  unscheduled: boolean;
  /** Extra jobs only: the board paper it comes from. */
  paperId: string;
  /** A missed cleaning that is already pinned to the board. */
  pinned: boolean;
};

export type CalendarData = {
  today: string;
  from: string;
  to: string;
  cleanings: Cleaning[];
  managers: string[];
  subs: string[];
};

export const STATUS_LABEL: Record<CleaningStatus, string> = {
  cleaned: "Cleaned",
  scheduled: "Scheduled",
  unconfirmed: "Not confirmed",
  missed: "Missed",
  extra: "Extra job",
};

export const PROOF_LABEL: Record<CleaningProof, string> = {
  "": "",
  checklist: "Crew checklist sent",
  "sub-visit": "The sub logged the visit",
  photo: "The sub sent an after photo",
  marked: "Marked by a manager",
};

export const OFFICE_TIME_ZONE = "America/New_York";

/** The calendar day in office time for an instant: YYYY-MM-DD. */
export function officeDay(value: Date | string = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-CA", { timeZone: OFFICE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** A YYYY-MM-DD day as a local Date at noon, safe to add days to. */
export function dayToDate(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12);
}

export function dateToDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function addDays(day: string, count: number): string {
  const date = dayToDate(day);
  date.setDate(date.getDate() + count);
  return dateToDay(date);
}

/** The Monday of the week the day is in. */
export function mondayOf(day: string): string {
  const date = dayToDate(day);
  const weekday = date.getDay();
  return addDays(day, weekday === 0 ? -6 : 1 - weekday);
}

export function isDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(dayToDate(value).getTime());
}

/** The counters at the top: everything on the schedule, how much is done, how much was missed. */
export function countCleanings(cleanings: Cleaning[]): { total: number; done: number; missed: number } {
  return {
    total: cleanings.length,
    done: cleanings.filter((cleaning) => cleaning.status === "cleaned").length,
    missed: cleanings.filter((cleaning) => cleaning.status === "missed").length,
  };
}
