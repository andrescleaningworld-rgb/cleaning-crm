// Clock times for schedules (db/migrations/042_time_on_site.sql). Pure, safe
// in both server code and "use client" components.
//
// A schedule day is either a time window (Morning, Midday, Afternoon,
// Evening) or an appointment at an exact start time. An appointment still
// carries the window its start time falls in, so every screen that sorts or
// shows by window keeps working. Times are minutes after midnight in here,
// "HH:MM" when stored or sent.

export type ScheduleType = "window" | "appointment";

export const toScheduleType = (value: unknown): ScheduleType => (value === "appointment" ? "appointment" : "window");

/** "Evening" ends here unless the office set another time (schedule_settings). */
export const DEFAULT_EVENING_ENDS = 23 * 60;

/** The four windows, start and end. Evening's end is the office setting. */
export function windowHours(window: string, eveningEnds = DEFAULT_EVENING_ENDS): { start: number; end: number } | null {
  switch (window) {
    case "Morning":
      return { start: 7 * 60, end: 10 * 60 };
    case "Midday":
      return { start: 10 * 60, end: 13 * 60 };
    case "Afternoon":
      return { start: 13 * 60, end: 17 * 60 };
    case "Evening":
      return { start: 17 * 60, end: eveningEnds };
    default:
      return null;
  }
}

/** The window an exact start time falls in. */
export function windowForStartTime(minutes: number): string {
  if (minutes < 10 * 60) return "Morning";
  if (minutes < 13 * 60) return "Midday";
  if (minutes < 17 * 60) return "Afternoon";
  return "Evening";
}

/** "19:00" or "19:00:00" → 1140. null when it is not a time. */
export function parseClock(value: unknown): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** 1140 → "19:00", for storing and sending. */
export function toClock(minutes: number): string {
  const clamped = Math.min(24 * 60 - 1, Math.max(0, Math.round(minutes)));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

/** 1140 → "7:00 pm", for people. */
export function formatClock(minutes: number): string {
  const wrapped = ((Math.round(minutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(wrapped / 60);
  const rest = wrapped % 60;
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}:${String(rest).padStart(2, "0")} ${hours < 12 ? "am" : "pm"}`;
}

/** The − / + on a start time move by half an hour, from 5:00 am to 11:30 pm. */
export const START_TIME_STEP = 30;
export const START_TIME_MIN = 5 * 60;
export const START_TIME_MAX = 23 * 60 + 30;
export const DEFAULT_START_TIME = 19 * 60;

/** How a schedule day reads: "📌 7:00 pm" for an appointment, else its window. */
export function describeScheduleTime(schedule: { scheduleType?: string; startTime?: string; timeWindow: string }): string {
  const start = parseClock(schedule.startTime);
  if (schedule.scheduleType === "appointment" && start !== null) return `📌 ${formatClock(start)}`;
  return schedule.timeWindow;
}
