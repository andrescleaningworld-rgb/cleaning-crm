// Fixed timezone for every Team Hub "today" / "this week" / "this month"
// boundary calculation — rounds' daily check-in reset, checklist weekly/
// monthly due dates. Every call site imports TEAM_HUB_TIMEZONE from here
// rather than hardcoding the string, so a later phase can swap this for a
// per-hub_sites timezone column without hunting through call sites.
export const TEAM_HUB_TIMEZONE = "America/New_York";

function zonedDateParts(instant: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

// UTC-minute offset of `timeZone` at `instant` (e.g. -240 for EDT, -300 for
// EST) — used to turn a local calendar boundary back into a real UTC
// instant for Postgres comparisons.
function timeZoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(instant);
  const offsetPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+0";
  const match = /GMT([+-]\d+)(?::(\d+))?/.exec(offsetPart);
  if (!match) return 0;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  return hours * 60 + (hours < 0 ? -minutes : minutes);
}

function localMidnightUtc(year: number, month: number, day: number, offsetMinutes: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMinutes * 60000);
}

// Midnight of `instant`'s calendar day in `timeZone`, as a real UTC instant.
export function startOfDayInTimeZone(instant: Date, timeZone: string): Date {
  const { year, month, day } = zonedDateParts(instant, timeZone);
  return localMidnightUtc(year, month, day, timeZoneOffsetMinutes(instant, timeZone));
}

// Midnight of the Monday of `instant`'s calendar week in `timeZone`. Uses
// the UTC offset at `instant` itself (not at the historical Monday) — off
// by up to an hour only during the ~1 week/year that straddles a DST
// change, which is acceptable for a weekly due-date boundary.
export function startOfWeekInTimeZone(instant: Date, timeZone: string): Date {
  const { year, month, day } = zonedDateParts(instant, timeZone);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const monday = new Date(Date.UTC(year, month - 1, day - daysSinceMonday));
  return localMidnightUtc(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate(), timeZoneOffsetMinutes(instant, timeZone));
}

// Midnight of the 1st of `instant`'s calendar month in `timeZone`.
export function startOfMonthInTimeZone(instant: Date, timeZone: string): Date {
  const { year, month } = zonedDateParts(instant, timeZone);
  return localMidnightUtc(year, month, 1, timeZoneOffsetMinutes(instant, timeZone));
}
