// An account's cleaning time (migration 050), saved as one short text:
//   "18:00-21:00"  a time window: the crew comes any time from 6 pm to 9 pm
//   "19:00"        an exact appointment: the crew comes at 7 pm
//   ""             not set
// Plain TS, no server imports, so the forms and the server share it.

import { formatClock, parseClock, toClock } from "@/lib/schedule-time";

export type CleaningTime = { kind: "window"; from: number; to: number } | { kind: "exact"; at: number };

/** The saved text as a time window or an exact time; null when blank or not readable. */
export function parseCleaningTime(value: unknown): CleaningTime | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const window = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(text);
  if (window) {
    const from = parseClock(window[1]);
    const to = parseClock(window[2]);
    return from !== null && to !== null ? { kind: "window", from, to } : null;
  }
  const at = parseClock(text);
  return at !== null ? { kind: "exact", at } : null;
}

/** The text to save for a window or an exact time. */
export function cleaningTimeText(time: CleaningTime): string {
  return time.kind === "window" ? `${toClock(time.from)}-${toClock(time.to)}` : toClock(time.at);
}

/** "Between 6:00 pm and 9:00 pm", "At 7:00 pm", or "" when not set. */
export function describeCleaningTime(value: unknown): string {
  const time = parseCleaningTime(value);
  if (!time) return "";
  return time.kind === "window" ? `Between ${formatClock(time.from)} and ${formatClock(time.to)}` : `At ${formatClock(time.at)}`;
}

/** The start time to offer a sub: the window's start, or the appointment time. null when not set. */
export function cleaningStartMinutes(value: unknown): number | null {
  const time = parseCleaningTime(value);
  if (!time) return null;
  return time.kind === "window" ? time.from : time.at;
}
