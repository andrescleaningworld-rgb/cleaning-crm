// The complaint response clock: how long a complaint has waited for its first
// answer, in business hours only (Mon–Fri, 8 am – 5 pm, New York time). It
// turns yellow, then red, at the hours set in Settings (feature_settings
// "complaintClock"). Plain TS: the screens and the server use the same math.

export const BUSINESS_START_HOUR = 8;
export const BUSINESS_END_HOUR = 17;

export type ClockSetting = { yellowHours: number; redHours: number };
export type ClockLevel = "green" | "yellow" | "red" | "answered";

/** New York wall-clock time of an instant, as a UTC number (so days and hours can be stepped through). */
function nyWall(date: Date): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
}

/** Business minutes (Mon–Fri 8–5, New York) between two instants. 0 when `end` is not after `start`. */
export function businessMinutesBetween(start: Date, end: Date): number {
  const from = nyWall(start);
  const to = nyWall(end);
  if (!(to > from)) return 0;
  const DAY = 86_400_000;
  let total = 0;
  const first = new Date(from);
  let day = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate());
  // A year at most: older than that is red anyway.
  for (let i = 0; day <= to && i < 400; i++, day += DAY) {
    const weekday = new Date(day).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const open = day + BUSINESS_START_HOUR * 3_600_000;
    const close = day + BUSINESS_END_HOUR * 3_600_000;
    const overlap = Math.min(to, close) - Math.max(from, open);
    if (overlap > 0) total += overlap;
  }
  return Math.floor(total / 60_000);
}

/** "45 min", "2 h", "3 h 15 min" (business time). */
export function minutesLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export type ClockState = { level: ClockLevel; minutes: number; label: string };

/**
 * Where one complaint's clock is. `answeredAt` set = answered (shows how long
 * it took). `open` false (closed / resolved / merged) with no answer = no
 * clock at all (null).
 */
export function clockState(input: { createdAt: string; answeredAt: string; open: boolean; setting: ClockSetting; now?: Date }): ClockState | null {
  const created = new Date(input.createdAt);
  if (Number.isNaN(created.getTime())) return null;
  if (input.answeredAt) {
    const answered = new Date(input.answeredAt);
    if (Number.isNaN(answered.getTime())) return null;
    const minutes = businessMinutesBetween(created, answered);
    return { level: "answered", minutes, label: `Answered in ${minutesLabel(minutes)}` };
  }
  if (!input.open) return null;
  const minutes = businessMinutesBetween(created, input.now ?? new Date());
  const level: ClockLevel = minutes >= input.setting.redHours * 60 ? "red" : minutes >= input.setting.yellowHours * 60 ? "yellow" : "green";
  return { level, minutes, label: `Waiting ${minutesLabel(minutes)}` };
}

/** Still open: not Closed, Resolved (incl. "Resolved by Sub") or Merged. */
export function complaintIsOpen(status: unknown): boolean {
  const value = String(status ?? "").trim().toLowerCase();
  return !value.startsWith("closed") && !value.startsWith("resolved") && !value.startsWith("merged");
}
