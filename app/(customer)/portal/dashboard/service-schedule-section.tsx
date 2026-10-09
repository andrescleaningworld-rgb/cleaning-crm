"use client";

import { useEffect, useState } from "react";

type ScheduleEntry = { dayOfWeek: string; timeWindow: string; recurring: string };
type ExceptionEntry = {
  type: string;
  originalDate: string;
  newDate: string;
  newTimeWindow: string;
  reason: string;
};

const DAY_ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatDateLabel(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

function describeException(ex: ExceptionEntry): string {
  if (ex.type === "Reschedule" && ex.newDate) {
    const base = `Rescheduled ${formatDateLabel(ex.originalDate)} to ${formatDateLabel(ex.newDate)}`;
    return ex.reason ? `${base} — ${ex.reason}` : base;
  }
  const base = `Skipped ${formatDateLabel(ex.originalDate)}`;
  return ex.reason ? `${base} — ${ex.reason}` : base;
}

export default function ServiceScheduleSection() {
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/portal/schedule");
        const data = (await res.json()) as {
          schedules?: ScheduleEntry[];
          exceptions?: ExceptionEntry[];
          error?: string;
        };
        if (!res.ok) {
          if (!cancelled) setError(data.error ?? "We couldn't load your schedule right now.");
          return;
        }
        if (!cancelled) {
          setSchedules(data.schedules ?? []);
          setExceptions(data.exceptions ?? []);
        }
      } catch {
        if (!cancelled) setError("We couldn't load your schedule right now.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedSchedules = [...schedules].sort(
    (a, b) => DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek)
  );

  return (
    <section className="ui-card ui-stack">
      <h2 className="ui-card-title">Your Service Schedule</h2>

      {loading ? (
        <p className="ui-muted">Loading your schedule...</p>
      ) : error ? (
        <p className="ui-muted">{error}</p>
      ) : sortedSchedules.length === 0 ? (
        <p className="ui-muted">
          No schedule on file yet. Contact our office and we&apos;ll get you set up.
        </p>
      ) : (
        <ul className="ui-list-plain">
          {sortedSchedules.map((s, i) => (
            <li key={i} className="ui-card-row">
              <span>
                <span className="ui-strong">{s.dayOfWeek}</span>
                <span className="ui-muted block">{s.recurring === "Y" ? "Every week" : "One-time"}</span>
              </span>
              <span className="ui-tag">{s.timeWindow}</span>
            </li>
          ))}
        </ul>
      )}

      {!loading && !error && exceptions.length > 0 ? (
        <div className="ui-stack">
          <p className="ui-strong">Upcoming Changes</p>
          {exceptions.map((ex, i) => (
            <p key={i}>{describeException(ex)}</p>
          ))}
        </div>
      ) : null}

      <p className="ui-muted">
        Schedule reflects your current recurring service. Recent changes may take a moment to
        appear here. Call our office with any questions.
      </p>
    </section>
  );
}
