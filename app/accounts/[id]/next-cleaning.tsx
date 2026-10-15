"use client";

// The "Next cleaning" card at the top of an account: the next date on this
// account's schedule (Sub Schedules), its time window, then the sub and the
// manager. Reads the same two lists the Sub Schedules calendar reads and
// uses the same date rules (lib/scheduleRecurrence.ts), including skipped
// and rescheduled dates. A cancelled account has no cleanings after its
// final cleaning date (the "Change status" sheet). Read only. The account
// page puts its Snapshot and its More button at the bottom of this banner
// (children).

import { useEffect, useState, type ReactNode } from "react";
import { generateScheduleDates, isScheduleEffectivelyActive, parseISO, todayISO } from "@/lib/scheduleRecurrence";

type Schedule = {
  accountId: string;
  dayOfWeek: string;
  timeWindow: string;
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

function findNext(accountId: string, schedules: Schedule[], exceptions: Exception[], finalCleaningDate: string): Next {
  const today = todayISO();
  const start = parseISO(today);
  const end = new Date(start);
  end.setDate(end.getDate() + LOOK_AHEAD_DAYS);

  const mine = exceptions.filter((ex) => ex.accountId === accountId);
  const skipped = new Set(mine.filter((ex) => ex.originalDate).map((ex) => ex.originalDate));
  const visits: { date: string; timeWindow: string }[] = [];

  for (const schedule of schedules) {
    if (schedule.accountId !== accountId || !isScheduleEffectivelyActive(schedule, today)) continue;
    for (const date of generateScheduleDates(schedule, start, end)) {
      // Skipped dates drop out; rescheduled dates come back below on their new day.
      if (!skipped.has(date)) visits.push({ date, timeWindow: schedule.timeWindow });
    }
  }
  for (const ex of mine) {
    if (ex.type === "Reschedule" && ex.newDate && ex.newDate >= today) {
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

export default function NextCleaning({
  accountId,
  cleaningDays,
  frequency,
  sub,
  subCompany,
  manager,
  cancelled = false,
  finalCleaningDate = "",
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
        setNext(findNext(accountId, schedules, exceptions, finalCleaningDate));
        setState("ready");
      } catch {
        if (!cancelled) setState("failed");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accountId, finalCleaningDate]);

  const days = cleaningDays && cleaningDays !== "Not provided" ? cleaningDays : "";
  const freq = frequency && frequency !== "Not provided" ? frequency : "";
  // Cancelled and the final cleaning day has passed (or there never was one): there is nothing left to show.
  const ended = cancelled && (finalCleaningDate === "" || finalCleaningDate < todayISO());

  return (
    <section className="ui-next" aria-label="Next cleaning">
      <p className="ui-next-label">Next cleaning</p>
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
