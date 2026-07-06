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

const BADGE_COLOR: Record<string, string> = {
  Morning: "bg-yellow-100 text-yellow-800",
  Midday: "bg-green-100 text-green-800",
  Afternoon: "bg-orange-100 text-orange-800",
  Evening: "bg-purple-100 text-purple-800",
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
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
        Your Service Schedule
      </p>

      {loading ? (
        <p className="mt-3 text-sm text-slate-500">Loading your schedule...</p>
      ) : error ? (
        <p className="mt-3 text-sm text-slate-500">{error}</p>
      ) : sortedSchedules.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          No schedule on file yet — contact our office and we&apos;ll get you set up.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {sortedSchedules.map((s, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
            >
              <div>
                <p className="text-sm font-semibold text-slate-800">{s.dayOfWeek}</p>
                <p className="text-xs text-slate-500">{s.recurring === "Y" ? "Every week" : "One-time"}</p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  BADGE_COLOR[s.timeWindow] ?? "bg-slate-100 text-slate-700"
                }`}
              >
                {s.timeWindow}
              </span>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && exceptions.length > 0 ? (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold text-slate-600">Upcoming Changes</p>
          <div className="mt-2 space-y-1.5">
            {exceptions.map((ex, i) => (
              <p key={i} className="text-sm text-slate-700">
                {describeException(ex)}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      <p className="mt-4 text-xs leading-relaxed text-slate-400">
        Schedule reflects your current recurring service. Recent changes may take a moment to
        appear here — call our office with any questions.
      </p>
    </div>
  );
}
