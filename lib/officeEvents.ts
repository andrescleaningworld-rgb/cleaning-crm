// The days the board calendar and the TV show besides cleanings: birthdays
// and work anniversaries (staff and managers only), holidays, office closed,
// and company events. Plain TS with no server imports. The database side is
// lib/pg/office-events.ts; the tables are in db/migrations/030.

export type OfficeEventKind = "birthday" | "anniversary" | "holiday" | "closed" | "event";

export type OfficeEvent = {
  /** "event:12" for a day added by hand (it can be removed); "staff:..." for a birthday or anniversary. */
  id: string;
  kind: OfficeEventKind;
  title: string;
  /** YYYY-MM-DD. */
  day: string;
  /** Added by hand on the calendar, so it can be taken off there. */
  byHand: boolean;
  yearly: boolean;
};

/** The three kinds that are added by hand. */
export const HAND_KINDS: { value: Exclude<OfficeEventKind, "birthday" | "anniversary">; label: string }[] = [
  { value: "holiday", label: "Holiday" },
  { value: "closed", label: "Office closed" },
  { value: "event", label: "Company event" },
];

export const EVENT_LABEL: Record<OfficeEventKind, string> = {
  birthday: "Birthday",
  anniversary: "Work anniversary",
  holiday: "Holiday",
  closed: "Office closed",
  event: "Company event",
};

export const EVENT_ICON: Record<OfficeEventKind, string> = {
  birthday: "🎂",
  anniversary: "🎉",
  holiday: "⭐",
  closed: "🚪",
  event: "📣",
};

/** What the TV and the calendar say for one of them: "Happy birthday, Maria!" */
export function eventLine(event: Pick<OfficeEvent, "kind" | "title">): string {
  if (event.kind === "birthday") return `Happy birthday, ${event.title}!`;
  if (event.kind === "closed") return `Office closed: ${event.title}`;
  return event.title;
}

/** Month and day of a YYYY-MM-DD in a given year; February 29 is February 28 in a year without one. */
export function dayInYear(day: string, year: number): string {
  const [, month, date] = day.split("-").map(Number);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const d = month === 2 && date === 29 && !leap ? 28 : date;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
