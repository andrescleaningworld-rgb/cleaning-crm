"use client";

// The "Next cleaning" card at the top of an account: the next date on this
// account's schedule (Sub Schedules), its time window, then the sub and the
// manager. Reads the same two lists the Sub Schedules calendar reads and
// uses the same date rules (lib/scheduleRecurrence.ts), including skipped
// and rescheduled dates. A cancelled account has no cleanings after its
// final cleaning date (the "Change status" sheet). Nothing is before the
// account's Start Date: while that is still ahead the card says "First
// cleaning" and how many days until the start. Read only. The account
// page puts its Snapshot and its More button at the bottom of this banner
// (children).

import { useEffect, useState, type ReactNode } from "react";
import { generateScheduleDates, isScheduleEffectivelyActive, parseISO, todayISO } from "@/lib/scheduleRecurrence";
import { describeScheduleTime } from "@/lib/schedule-time";

type Schedule = {
  accountId: string;
  dayOfWeek: string;
  timeWindow: string;
  scheduleType?: string;
  startTime?: string;
  effectiveStart: string;
  effectiveEnd: string;
  status: string;
  frequency: string;
  monthlyOccurrence: string;
};

type Exception = {
  accountId: string;
  originalDate: string;
  type: string;
  newDate: string;
  newTimeWindow: string;
};

type Next = { date: string; timeWindow: string } | null;

const LOOK_AHEAD_DAYS = 62;

function findNext(accountId: string, schedules: Schedule[], exceptions: Exception[], finalCleaningDate: string, startDate: string): Next {
  const today = todayISO();
  // Look from the Start Date when it is still ahead, else from today.
  const from = startDate > today ? startDate : today;
  const start = parseISO(from);
  const end = new Date(start);
  end.setDate(end.getDate() + LOOK_AHEAD_DAYS);

  const mine = exceptions.filter((ex) => ex.accountId === accountId);
  const skipped = new Set(mine.filter((ex) => ex.originalDate).map((ex) => ex.originalDate));
  const visits: { date: string; timeWindow: string }[] = [];

  for (const schedule of schedules) {
    if (schedule.accountId !== accountId || !isScheduleEffectivelyActive(schedule, today)) continue;
    for (const date of generateScheduleDates(schedule, start, end)) {
      // Skipped dates drop out; rescheduled dates come back below on their new day.
      if (!skipped.has(date) && date >= from) visits.push({ date, timeWindow: describeScheduleTime(schedule) });
    }
  }
  for (const ex of mine) {
    if (ex.type === "Reschedule" && ex.newDate && ex.newDate >= from) {
      visits.push({ date: ex.newDate, timeWindow: ex.newTimeWindow });
    }
  }
  visits.sort((a, b) => a.date.localeCompare(b.date));
  // Nothing after the final cleaning date, a rescheduled day included.
  return visits.find((visit) => !finalCleaningDate || visit.date <= finalCleaningDate) ?? null;
}

function dayWords(iso: string): string {
  const today = todayISO();
  const date = parseISO(iso);
  const words = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  if (iso === today) return `Today, ${words}`;
  const tomorrow = parseISO(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.getTime() === tomorrow.getTime()) return `Tomorrow, ${words}`;
  return words;
}

/** Whole days from today to a later YYYY-MM-DD. */
function daysUntil(iso: string): number {
  return Math.round((parseISO(iso).getTime() - parseISO(todayISO()).getTime()) / 86_400_000);
}

export default function NextCleaning({
  accountId,
  cleaningDays,
  frequency,
  sub,
  subCompany,
  manager,
  cancelled = false,
  finalCleaningDate = "",
  startDate = "",
  children,
}: {
  accountId: string;
  /** The account's own "Cleaning Days" text, shown when no dated schedule is on file. */
  cleaningDays: string;
  frequency: string;
  sub: string;
  subCompany: string;
  manager: string;
  cancelled?: boolean;
  /** YYYY-MM-DD for a cancelled account that has a final cleaning date, else "". */
  finalCleaningDate?: string;
  /** The account's Start Date, YYYY-MM-DD, or "" when it has none. */
  startDate?: string;
  /** Shown at the bottom of the banner (the account page: its Snapshot and More button). */
  children?: ReactNode;
}) {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [next, setNext] = useState<Next>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [schedulesRes, exceptionsRes] = await Promise.all([
          fetch("/api/admin/sub-schedules", { cache: "no-store" }),
          fetch("/api/admin/schedule-exceptions", { cache: "no-store" }),
        ]);
        if (!schedulesRes.ok) throw new Error("schedules");
        const schedules = ((await schedulesRes.json()) as { schedules?: Schedule[] }).schedules ?? [];
        // The exceptions list is a refinement: without it the plain schedule still shows.
        const exceptions = exceptionsRes.ok ? (((await exceptionsRes.json()) as { exceptions?: Exception[] }).exceptions ?? []) : [];
        if (cancelled) return;
        setNext(findNext(accountId, schedules, exceptions, finalCleaningDate, startDate));
        setState("ready");
      } catch {
        if (!cancelled) setState("failed");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accountId, finalCleaningDate, startDate]);

  const days = cleaningDays && cleaningDays !== "Not provided" ? cleaningDays : "";
  const freq = frequency && frequency !== "Not provided" ? frequency : "";
  // Cancelled and the final cleaning day has passed (or there never was one): there is nothing left to show.
  const ended = cancelled && (finalCleaningDate === "" || finalCleaningDate < todayISO());
  // The account has not started yet: its first cleaning is on or after the Start Date.
  const startsIn = startDate && !ended ? daysUntil(startDate) : 0;
  const label = startsIn > 0 ? "First cleaning" : "Next cleaning";

  return (
    <section className="ui-next" aria-label={label}>
      <p className="ui-next-label">{label}</p>
      {ended ? (
        <>
          <p className="ui-next-day">No more cleanings</p>
          <p className="ui-next-time">{finalCleaningDate ? `Cancelled. The final cleaning was ${dayWords(finalCleaningDate)}.` : "This account is cancelled."}</p>
        </>
      ) : state === "loading" ? (
        <p className="ui-next-day">Checking the schedule…</p>
      ) : next ? (
        <>
          <p className="ui-next-day">{dayWords(next.date)}</p>
          <p className="ui-next-time">{next.timeWindow || "Any time"}</p>
        </>
      ) : (
        <>
          <p className="ui-next-day">{days || "No dates on the schedule"}</p>
          <p className="ui-next-time">
            {state === "failed" ? "The schedule did not load." : days ? [freq, "no dated schedule yet"].filter(Boolean).join(" · ") : freq || "Add a schedule in Sub Schedules."}
          </p>
        </>
      )}
      {startsIn > 0 ? <p className="ui-next-who">Starts in {startsIn === 1 ? "1 day" : `${startsIn} days`}</p> : null}
      {finalCleaningDate && !ended ? (
        <p className="ui-next-who">
          <span className="ui-strong">Final cleaning:</span> {dayWords(finalCleaningDate)}
        </p>
      ) : null}
      <p className="ui-next-who">
        <span className="ui-strong">Sub:</span> {sub}
        {subCompany ? ` (${subCompany})` : ""}
      </p>
      <p className="ui-next-who">
        <span className="ui-strong">Manager:</span> {manager || "Unassigned"}
      </p>
      {children}
    </section>
  );
}
