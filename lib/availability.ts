// Coverage → "Who's free?": can a sub take a new job on a weekday, at a
// time, for a length? Pure (no I/O), so it can be checked on its own; the
// data comes from lib/pg/availability.ts.
//
// For each of the next 4 times that weekday comes round, the sub's
// cleanings that day are laid out on their crews:
//   - an appointment is fixed: start time to start + time on site;
//   - a time-window cleaning can go anywhere in its window (it must fit
//     inside it; one longer than its window starts when the window opens);
//   - travel between two sites is about 5 minutes + 2.5 minutes a mile in a
//     straight line (15 minutes when a site has no map position).
// The new job is tried before, between and after the cleanings of each crew.
//   🟢 Free:  it fits with 30 minutes to spare on both sides (beyond travel).
//   🟡 Tight: it fits, but with less than that.
//   🔴 Busy:  it does not fit.
// The worst week counts, and the card says how many weeks were busy or tight.

import { generateScheduleDates, isScheduleEffectivelyActive, parseISO, toISO } from "@/lib/scheduleRecurrence";
import { formatClock, parseClock, windowHours } from "@/lib/schedule-time";

export const SPARE_MINUTES = 30;
export const WEEKS_CHECKED = 4;
const TRAVEL_BASE_MINUTES = 5;
const TRAVEL_MINUTES_PER_MILE = 2.5;
const TRAVEL_UNKNOWN_MINUTES = 15;

export type Point = { lat: number; lng: number };
export type Availability = "free" | "tight" | "busy";

export type AvailabilitySchedule = {
  accountId: string;
  accountName: string;
  frequency: string;
  dayOfWeek: string;
  monthlyOccurrence: string;
  effectiveStart: string;
  effectiveEnd: string;
  status: string;
  timeWindow: string;
  scheduleType: string;
  startTime: string;
  minutesOnSite: number;
  /** The time on site is still the 1h 30m estimate. */
  estimated: boolean;
  point: Point | null;
};

export type AvailabilitySub = {
  subId: string;
  name: string;
  crews: number;
  schedules: AvailabilitySchedule[];
  /** Active accounts of this sub with no live schedule: not counted. */
  unscheduled: number;
  /** Map positions of the sub's active accounts, for "how far". */
  accountPoints: Point[];
};

export type NewJob = { weekday: string; start: number; minutes: number; point: Point | null };

export type DayCleaning = { accountName: string; start: number; end: number; exact: boolean; estimated: boolean; minutesOnSite: number };

export type SubAvailability = {
  subId: string;
  name: string;
  crews: number;
  status: Availability;
  busyWeeks: number;
  tightWeeks: number;
  weeks: number;
  /** Miles from the new job to the sub's nearest account; null without a spot or positions. */
  distanceMiles: number | null;
  /** That weekday's cleanings in the worst week, as laid out. */
  day: DayCleaning[];
  /** The date the day line is for. */
  dayDate: string;
  unscheduled: number;
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function haversineMiles(a: Point, b: Point): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function travelMinutes(a: Point | null, b: Point | null): number {
  if (!a || !b) return TRAVEL_UNKNOWN_MINUTES;
  return Math.round(TRAVEL_BASE_MINUTES + TRAVEL_MINUTES_PER_MILE * haversineMiles(a, b));
}

/** The next WEEKS_CHECKED dates (ISO) that fall on the weekday, from today on. */
export function nextDates(weekday: string, today: Date, weeks = WEEKS_CHECKED): string[] {
  const target = DAYS.indexOf(weekday);
  if (target === -1) return [];
  const first = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  first.setDate(first.getDate() + ((target - first.getDay() + 7) % 7));
  return Array.from({ length: weeks }, (_, index) => {
    const date = new Date(first);
    date.setDate(first.getDate() + index * 7);
    return toISO(date);
  });
}

// One job to lay out: it may start anywhere from earliest to latest.
type Job = { key: string; earliest: number; latest: number; duration: number; point: Point | null; cleaning?: DayCleaning; isNew?: boolean };

function jobFor(schedule: AvailabilitySchedule, eveningEnds: number): Job | null {
  const duration = schedule.minutesOnSite;
  const start = parseClock(schedule.startTime);
  const cleaning = { accountName: schedule.accountName, start: 0, end: 0, exact: false, estimated: schedule.estimated, minutesOnSite: duration };
  if (schedule.scheduleType === "appointment" && start !== null) {
    return { key: schedule.accountId, earliest: start, latest: start, duration, point: schedule.point, cleaning: { ...cleaning, exact: true } };
  }
  const hours = windowHours(schedule.timeWindow, eveningEnds);
  if (!hours) return null;
  return { key: schedule.accountId, earliest: hours.start, latest: Math.max(hours.start, hours.end - duration), duration, point: schedule.point, cleaning };
}

// Lays a crew's jobs out in this order, each as early as it can go. Returns
// the starts, or null when a job would start after its latest start. A job
// that was already late before the new job came (an overbooked day) is
// allowed to stay late: the question is only whether the new job fits.
function layOut(jobs: Job[], alreadyLate: Set<string>): number[] | null {
  const starts: number[] = [];
  let free = -Infinity;
  let at: Point | null = null;
  for (const job of jobs) {
    const arrive = starts.length === 0 ? -Infinity : free + travelMinutes(at, job.point);
    const start = Math.max(job.earliest, arrive);
    if (start > job.latest && !(alreadyLate.has(job.key) && !job.isNew)) return null;
    starts.push(start);
    free = start + job.duration;
    at = job.point;
  }
  return starts;
}

// The day's cleanings shared out over the crews: earliest deadline first,
// each to the crew where it can start soonest.
function shareOut(jobs: Job[], crews: number): { crews: Job[][]; late: Set<string> } {
  const lists: Job[][] = Array.from({ length: Math.max(1, crews) }, () => []);
  const late = new Set<string>();
  for (const job of [...jobs].sort((a, b) => a.latest - b.latest || a.earliest - b.earliest)) {
    let best = 0;
    let bestStart = Infinity;
    lists.forEach((list, index) => {
      const starts = layOut([...list, job], new Set(list.map((j) => j.key)));
      const start = starts ? starts[starts.length - 1] : Infinity;
      if (start < bestStart) {
        bestStart = start;
        best = index;
      }
    });
    if (bestStart === Infinity) {
      // Does not fit anywhere: on the least busy crew, late.
      best = lists.reduce((low, list, index) => (list.length < lists[low].length ? index : low), 0);
      late.add(job.key);
    }
    lists[best].push(job);
  }
  return { crews: lists, late };
}

// Does the new job fit, with this much spare before and after it?
function fits(crews: Job[][], late: Set<string>, job: NewJob, spare: number): Job[] | null {
  const block: Job = { key: "__new__", earliest: job.start - spare, latest: job.start - spare, duration: job.minutes + 2 * spare, point: job.point, isNew: true };
  for (const list of crews) {
    for (let position = 0; position <= list.length; position += 1) {
      const order = [...list.slice(0, position), block, ...list.slice(position)];
      if (layOut(order, late)) return order;
    }
  }
  return null;
}

function dayLine(crews: Job[][], late: Set<string>): DayCleaning[] {
  const line: DayCleaning[] = [];
  for (const list of crews) {
    const starts = layOut(list, late) ?? list.map((job) => job.earliest);
    list.forEach((job, index) => {
      if (job.cleaning) line.push({ ...job.cleaning, start: starts[index], end: starts[index] + job.duration });
    });
  }
  return line.sort((a, b) => a.start - b.start);
}

export function checkSub(sub: AvailabilitySub, job: NewJob, dates: string[], eveningEnds: number): SubAvailability {
  const order: Availability[] = ["free", "tight", "busy"];
  let worst: Availability = "free";
  let worstDay: DayCleaning[] = [];
  let worstDate = dates[0] ?? "";
  let busyWeeks = 0;
  let tightWeeks = 0;

  dates.forEach((date, index) => {
    const day = parseISO(date);
    const jobs = sub.schedules
      .filter((schedule) => isScheduleEffectivelyActive(schedule, date) && generateScheduleDates(schedule, day, day).includes(date))
      .map((schedule) => jobFor(schedule, eveningEnds))
      .filter((found): found is Job => found !== null);
    const { crews, late } = shareOut(jobs, sub.crews);
    const status: Availability = fits(crews, late, job, SPARE_MINUTES) ? "free" : fits(crews, late, job, 0) ? "tight" : "busy";
    if (status === "busy") busyWeeks += 1;
    if (status === "tight") tightWeeks += 1;
    if (index === 0 || order.indexOf(status) > order.indexOf(worst)) {
      worst = status;
      worstDay = dayLine(crews, late);
      worstDate = date;
    }
  });

  const distances = job.point ? sub.accountPoints.map((point) => haversineMiles(job.point as Point, point)) : [];
  return {
    subId: sub.subId,
    name: sub.name,
    crews: sub.crews,
    status: worst,
    busyWeeks,
    tightWeeks,
    weeks: dates.length,
    distanceMiles: distances.length > 0 ? Math.min(...distances) : null,
    day: worstDay,
    dayDate: worstDate,
    unscheduled: sub.unscheduled,
  };
}

/** Every sub, Free first, then Tight, then Busy; nearest first within each. */
export function checkAll(subs: AvailabilitySub[], job: NewJob, today: Date, eveningEnds: number): SubAvailability[] {
  const dates = nextDates(job.weekday, today);
  const rank: Record<Availability, number> = { free: 0, tight: 1, busy: 2 };
  return subs
    .map((sub) => checkSub(sub, job, dates, eveningEnds))
    .sort((a, b) => rank[a.status] - rank[b.status] || (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity) || a.name.localeCompare(b.name));
}

/** "5:00–6:30 pm" for a day line. */
export function describeSpan(start: number, end: number): string {
  return `${formatClock(start)}–${formatClock(end)}`;
}
