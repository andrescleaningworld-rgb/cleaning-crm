"use client";

import { useState } from "react";

type Visit = {
  visitDate: string;
  timeWindow: string;
  status: string;
};

const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DOT_COLOR: Record<string, string> = {
  Morning:   "bg-yellow-500",
  Midday:    "bg-green-500",
  Afternoon: "bg-orange-500",
  Evening:   "bg-purple-500",
};

const BADGE_COLOR: Record<string, string> = {
  Morning:   "bg-yellow-100 text-yellow-800",
  Midday:    "bg-green-100 text-green-800",
  Afternoon: "bg-orange-100 text-orange-800",
  Evening:   "bg-purple-100 text-purple-800",
};

function pad(n: number) { return String(n).padStart(2, "0"); }

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function PortalVisitCalendar({ visits }: { visits: Visit[] }) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());

  const today = todayStr();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstDow + daysInMonth) / 7) * 7;

  const cells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ...Array<null>(totalCells - firstDow - daysInMonth).fill(null),
  ];

  const visitsByDate = new Map<string, Visit>();
  const prefix = `${year}-${pad(month + 1)}`;
  visits.forEach((v) => {
    if (v.visitDate.startsWith(prefix)) visitsByDate.set(v.visitDate, v);
  });

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  }

  const upcoming = visits
    .filter((v) => v.visitDate >= today)
    .sort((a, b) => a.visitDate.localeCompare(b.visitDate))
    .slice(0, 8);

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
        Your Visit Schedule
      </p>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={prevMonth}
          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-50 active:scale-95"
        >
          ‹
        </button>
        <p className="text-sm font-bold text-slate-800">
          {MONTH_NAMES[month]} {year}
        </p>
        <button
          type="button"
          onClick={nextMonth}
          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-50 active:scale-95"
        >
          ›
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-0.5">
        {DOW_NAMES.map((d) => (
          <div
            key={d}
            className="py-1 text-center text-[10px] font-black uppercase tracking-wide text-slate-400"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} className="h-10 rounded-xl" />;

          const ds = `${year}-${pad(month + 1)}-${pad(day)}`;
          const isToday = ds === today;
          const visit = visitsByDate.get(ds);
          const dotColor = visit ? (DOT_COLOR[visit.timeWindow] ?? "bg-blue-500") : "";

          return (
            <div
              key={idx}
              title={visit ? `${visit.timeWindow}` : undefined}
              className={[
                "relative flex h-10 flex-col items-center justify-center rounded-xl text-xs font-bold",
                visit ? "bg-blue-50 text-blue-700" : "text-slate-500",
                isToday ? "ring-2 ring-blue-500 ring-offset-1" : "",
              ].filter(Boolean).join(" ")}
            >
              {day}
              {dotColor && (
                <span className={`absolute bottom-1 h-1.5 w-1.5 rounded-full ${dotColor}`} />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-3">
        {(["Morning", "Midday", "Afternoon", "Evening"] as const).map((w) => (
          <span key={w} className="flex items-center gap-1 text-[10px] font-semibold text-slate-500">
            <span className={`h-2 w-2 rounded-full ${DOT_COLOR[w]}`} />
            {w}
          </span>
        ))}
      </div>

      <div className="mt-4">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Upcoming Visits
        </p>
        {upcoming.length === 0 ? (
          <p className="text-xs text-slate-400">No upcoming visits scheduled.</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map((v) => (
              <div
                key={`${v.visitDate}-${v.timeWindow}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
              >
                <span className="text-sm font-semibold text-slate-800">
                  {formatDisplayDate(v.visitDate)}
                </span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${BADGE_COLOR[v.timeWindow] ?? "bg-blue-100 text-blue-800"}`}>
                  {v.timeWindow}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
