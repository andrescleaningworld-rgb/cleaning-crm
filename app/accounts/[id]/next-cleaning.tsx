"use client";

// The "Next cleaning" card at the top of an account: the next date on this
// account's schedule (Sub Schedules), its time window, then the sub and the
// manager. Reads the same two lists the Sub Schedules calendar reads and
// uses the same date rules (lib/scheduleRecurrence.ts), including skipped
// and rescheduled dates. Read only.

import { useEffect, useState } from "react";
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

function findNext(accountId: string, schedules: Schedule[], exceptions: Exception[]): Next {
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
  return visits[0] ?? null;
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
}: {
  accountId: string;
  /** The account's own "Cleaning Days" text, shown when no dated schedule is on file. */
  cleaningDays: string;
  frequency: string;
  sub: string;
  subCompany: string;
  manager: string;
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
        setNext(findNext(accountId, schedules, exceptions));
        setState("ready");
      } catch {
        if (!cancelled) setState("failed");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const days = cleaningDays && cleaningDays !== "Not provided" ? cleaningDays : "";
  const freq = frequency && frequency !== "Not provided" ? frequency : "";

  return (
    <section className="ui-next" aria-label="Next cleaning">
      <p className="ui-next-label">Next cleaning</p>
      {state === "loading" ? (
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
      <p className="ui-next-who">
        <span className="ui-strong">Sub:</span> {sub}
        {subCompany ? ` (${subCompany})` : ""}
      </p>
      <p className="ui-next-who">
        <span className="ui-strong">Manager:</span> {manager || "Unassigned"}
      </p>
    </section>
  );
}
