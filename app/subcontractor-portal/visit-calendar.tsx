"use client";

import { useState, useEffect, useCallback } from "react";

type Visit = {
  visitId: string;
  visitDate: string;
  arrivalTime: string;
  notes: string;
};

const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Parse cleaning days text → day-of-week indices (0=Sun … 6=Sat)
function parseCleaningDayIndices(text: string): number[] {
  const map: Record<string, number> = {
    sun: 0, sunday: 0,
    mon: 1, monday: 1,
    tue: 2, tues: 2, tuesday: 2,
    wed: 3, wednesday: 3,
    thu: 4, thur: 4, thurs: 4, thursday: 4,
    fri: 5, friday: 5,
    sat: 6, saturday: 6,
  };
  const found = new Set<number>();
  text
    .toLowerCase()
    .split(/[\s,&/+]+/)
    .forEach((word) => {
      const clean = word.replace(/s$/, ""); // strip trailing 's' (mondays → monday)
      if (map[clean] !== undefined) found.add(map[clean]);
    });
  return [...found];
}

// Generate expected service dates for a given year/month based on frequency + cleaning days
function getScheduledDates(
  year: number,
  month: number,
  frequency: string,
  cleaningDays: string,
): string[] {
  const dayIndices = parseCleaningDayIndices(cleaningDays);
  if (dayIndices.length === 0) return [];

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const freq = frequency.toLowerCase();

  function pad(n: number) { return String(n).padStart(2, "0"); }
  function ds(d: number) { return `${year}-${pad(month + 1)}-${pad(d)}`; }

  // All dates in this month whose weekday matches a cleaning day
  const allMatching: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    if (dayIndices.includes(new Date(year, month, d).getDay())) {
      allMatching.push(ds(d));
    }
  }

  // Group by day-of-week for frequency filtering
  function byDow(): Map<number, string[]> {
    const m = new Map<number, string[]>();
    allMatching.forEach((date) => {
      const dow = new Date(date).getDay();
      if (!m.has(dow)) m.set(dow, []);
      m.get(dow)!.push(date);
    });
    return m;
  }

  if (freq.includes("daily") || freq.includes("every day")) {
    const all: string[] = [];
    for (let d = 1; d <= daysInMonth; d++) all.push(ds(d));
    return all;
  }

  if (
    freq.includes("bi") ||
    freq.includes("every other") ||
    freq.includes("every 2") ||
    freq.includes("2 week")
  ) {
    // Bi-weekly: every other occurrence per cleaning day
    const result: string[] = [];
    byDow().forEach((dates) =>
      dates.forEach((date, i) => { if (i % 2 === 0) result.push(date); }),
    );
    return result.sort();
  }

  if (
    freq.includes("2x") ||
    freq.includes("twice") ||
    freq.includes("2 x") ||
    freq.includes("2 time") ||
    freq.includes("2 per")
  ) {
    // 2×/month: 1st and 3rd occurrence per cleaning day
    const result: string[] = [];
    byDow().forEach((dates) => {
      if (dates[0]) result.push(dates[0]);
      if (dates[2]) result.push(dates[2]);
    });
    return result.sort();
  }

  if (freq.includes("3x") || freq.includes("three")) {
    // 3×/month: first 3 occurrences per cleaning day
    const result: string[] = [];
    byDow().forEach((dates) => result.push(...dates.slice(0, 3)));
    return result.sort();
  }

  if (
    freq.includes("monthly") ||
    freq.includes("1x") ||
    freq.includes("once a month") ||
    freq.includes("once per")
  ) {
    // Monthly: first occurrence per cleaning day
    const result: string[] = [];
    byDow().forEach((dates) => { if (dates[0]) result.push(dates[0]); });
    return result.sort();
  }

  // Default (weekly or unrecognized): every matching day
  return allMatching;
}

function todayDateStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type Props = {
  accountName: string;
  frequency: string;
  cleaningDays: string;
  subEmail: string;
  subName: string;
};

export default function VisitCalendar({
  accountName,
  frequency,
  cleaningDays,
  subEmail,
  subName,
}: Props) {
  const todayStr = todayDateStr();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loadingVisits, setLoadingVisits] = useState(false);
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [arrivalTime, setArrivalTime] = useState("");
  const [visitNotes, setVisitNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const fetchVisits = useCallback(async () => {
    setLoadingVisits(true);
    try {
      const params = new URLSearchParams({ email: subEmail, account: accountName });
      const res = await fetch(`/api/subcontractor-visits?${params.toString()}`);
      const data = (await res.json()) as { visits?: Visit[] };
      setVisits(Array.isArray(data.visits) ? data.visits : []);
    } catch {
      // Calendar is still usable; visits just won't pre-populate
    } finally {
      setLoadingVisits(false);
    }
  }, [subEmail, accountName]);

  useEffect(() => {
    setVisits([]);
    fetchVisits();
  }, [fetchVisits]);

  // Derived sets for fast lookup
  const visitedDates = new Set(visits.map((v) => v.visitDate));
  const scheduledDates = new Set(getScheduledDates(year, month, frequency, cleaningDays));
  const scheduledCount = scheduledDates.size;

  // Calendar grid
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstDow + daysInMonth) / 7) * 7;
  const cells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ...Array<null>(totalCells - firstDow - daysInMonth).fill(null),
  ];

  function pad(n: number) { return String(n).padStart(2, "0"); }
  function dateStr(day: number) { return `${year}-${pad(month + 1)}-${pad(day)}`; }

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  }

  function openModal(day: number) {
    const ds = dateStr(day);
    if (ds > todayStr) return;
    setModalDate(ds);
    setArrivalTime("");
    setVisitNotes("");
    setFormError("");
  }

  async function handleLogVisit() {
    if (!modalDate) return;
    if (!arrivalTime) { setFormError("Please enter your arrival time."); return; }
    setFormError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/subcontractor-visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountName,
          subEmail,
          subName,
          visitDate: modalDate,
          arrivalTime,
          notes: visitNotes,
        }),
      });
      const data = (await res.json()) as { success?: boolean; visitId?: string; error?: string };
      if (!res.ok || !data.success) {
        setFormError(data.error ?? "Failed to save. Please try again.");
        return;
      }
      setVisits((prev) => [
        ...prev,
        { visitId: data.visitId ?? "", visitDate: modalDate, arrivalTime, notes: visitNotes },
      ]);
      setModalDate(null);
      setSuccessMsg("Visit logged.");
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900">Visit Log</h2>
          <p className="mt-1 text-sm leading-5 text-slate-600">
            Tap any past date or today to record a visit.
          </p>
        </div>
        {loadingVisits && (
          <span className="mt-1 text-xs text-slate-400">Loading…</span>
        )}
      </div>

      {/* Schedule summary */}
      {(frequency || cleaningDays) && (
        <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-blue-700">
            Schedule for {accountName}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-800">
            {[frequency, cleaningDays].filter(Boolean).join(" — ")}
          </p>
          {scheduledCount > 0 && (
            <p className="mt-1 text-xs text-blue-600">
              {scheduledCount} expected visit{scheduledCount !== 1 ? "s" : ""} shown this month
            </p>
          )}
        </div>
      )}

      {successMsg && (
        <div className="mt-3 rounded-2xl border border-green-200 bg-green-50 p-3 text-sm font-semibold text-green-700">
          {successMsg}
        </div>
      )}

      {/* Month navigation */}
      <div className="mt-5 flex items-center justify-between">
        <button
          type="button"
          onClick={prevMonth}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 active:scale-95"
        >
          ‹ Prev
        </button>
        <p className="text-base font-black text-slate-900">
          {MONTH_NAMES[month]} {year}
        </p>
        <button
          type="button"
          onClick={nextMonth}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 active:scale-95"
        >
          Next ›
        </button>
      </div>

      {/* Calendar grid */}
      <div className="mt-3">
        {/* Day-of-week header */}
        <div className="mb-1 grid grid-cols-7 gap-0.5">
          {DOW_NAMES.map((d) => (
            <div
              key={d}
              className="py-1 text-center text-[10px] font-black uppercase tracking-wide text-slate-400"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((day, idx) => {
            if (!day) return <div key={idx} className="h-10 rounded-xl" />;

            const ds = dateStr(day);
            const isToday = ds === todayStr;
            const isFuture = ds > todayStr;
            const visited = visitedDates.has(ds);
            const scheduled = scheduledDates.has(ds);
            const missed = !isFuture && !visited && scheduled;

            let bg = "";
            let textColor = "text-slate-700";
            let dotColor = "";

            if (visited) {
              bg = "bg-green-100";
              textColor = "text-green-800";
              dotColor = "bg-green-500";
            } else if (missed) {
              bg = "bg-red-50";
              textColor = "text-red-700";
              dotColor = "bg-red-500";
            } else if (scheduled) {
              bg = isFuture ? "bg-blue-50/60" : "bg-blue-50";
              textColor = isFuture ? "text-blue-400" : "text-blue-700";
              dotColor = "bg-blue-400";
            } else if (isFuture) {
              textColor = "text-slate-400";
            }

            return (
              <button
                key={idx}
                type="button"
                onClick={() => !isFuture && openModal(day)}
                disabled={isFuture}
                className={[
                  "relative flex h-10 flex-col items-center justify-center rounded-xl text-sm font-bold transition",
                  bg,
                  textColor,
                  isToday ? "ring-2 ring-blue-500 ring-offset-1" : "",
                  !isFuture ? "hover:opacity-80 active:scale-95 cursor-pointer" : "cursor-default",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {day}
                {dotColor && (
                  <span
                    className={`absolute bottom-1 h-1 w-1 rounded-full ${dotColor}`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4 text-xs font-semibold text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Visited
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-400" /> Scheduled
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Missed
        </span>
      </div>

      {/* Recent visits list */}
      {visits.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            Recent Visits
          </p>
          <div className="mt-2 space-y-2">
            {[...visits]
              .sort((a, b) => b.visitDate.localeCompare(a.visitDate))
              .slice(0, 6)
              .map((v) => (
                <div
                  key={v.visitId || `${v.visitDate}-${v.arrivalTime}`}
                  className="flex items-start justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800">{v.visitDate}</p>
                    {v.notes && (
                      <p className="mt-0.5 truncate text-xs text-slate-500">{v.notes}</p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700">
                    {v.arrivalTime || "Logged"}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Log visit modal */}
      {modalDate && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-6 sm:items-center sm:pb-0"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalDate(null);
          }}
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-black text-slate-900">Log Visit</h3>
            <p className="mt-1 text-sm text-slate-500">
              {accountName} — {modalDate}
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="text-sm font-bold text-slate-700">
                  Arrival Time <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  value={arrivalTime}
                  onChange={(e) => setArrivalTime(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-blue-600"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-bold text-slate-700">
                  Notes <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={visitNotes}
                  onChange={(e) => setVisitNotes(e.target.value)}
                  rows={3}
                  placeholder="Any observations about this visit."
                  className="mt-2 w-full resize-none rounded-2xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-blue-600"
                />
              </div>

              {formError && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                  {formError}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setModalDate(null)}
                  className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleLogVisit}
                  disabled={submitting}
                  className="flex-1 rounded-2xl bg-blue-700 px-4 py-3 text-sm font-black text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  {submitting ? "Saving…" : "Log Visit"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
