"use client";

import { useState } from "react";
import { Icon } from "@/app/ui";

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

const DOT_CLASS: Record<string, string> = {
  Morning:   "ui-mini-cal-dot-morning",
  Midday:    "ui-mini-cal-dot-midday",
  Afternoon: "ui-mini-cal-dot-afternoon",
  Evening:   "ui-mini-cal-dot-evening",
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
    <section className="ui-card ui-stack">
      <h2 className="ui-card-title">Your Visit Schedule</h2>

      <div className="ui-card-row">
        <button type="button" onClick={prevMonth} className="ui-btn ui-btn-second ui-btn-icon" aria-label="Previous month">
          <Icon name="back" />
        </button>
        <p className="ui-strong" aria-live="polite">
          {MONTH_NAMES[month]} {year}
        </p>
        <button type="button" onClick={nextMonth} className="ui-btn ui-btn-second ui-btn-icon" aria-label="Next month">
          <Icon name="chevron" />
        </button>
      </div>

      <div className="ui-mini-cal" aria-hidden="true">
        {DOW_NAMES.map((d) => (
          <div key={d} className="ui-mini-cal-dow">
            {d}
          </div>
        ))}
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} className="ui-mini-cal-day" />;

          const ds = `${year}-${pad(month + 1)}-${pad(day)}`;
          const isToday = ds === today;
          const visit = visitsByDate.get(ds);

          return (
            <div
              key={idx}
              title={visit ? `${visit.timeWindow}` : undefined}
              className={["ui-mini-cal-day", visit ? "ui-mini-cal-visit" : "", isToday ? "ui-mini-cal-today" : ""].filter(Boolean).join(" ")}
            >
              {day}
              {visit ? <span className={`ui-mini-cal-dot ${DOT_CLASS[visit.timeWindow] ?? ""}`} /> : null}
            </div>
          );
        })}
      </div>

      <div className="ui-taglist">
        {(["Morning", "Midday", "Afternoon", "Evening"] as const).map((w) => (
          <span key={w} className="ui-mini-cal-legend">
            <span className={`ui-mini-cal-dot ${DOT_CLASS[w]}`} />
            {w}
          </span>
        ))}
      </div>

      <h3 className="ui-card-title">Upcoming Visits</h3>
      {upcoming.length === 0 ? (
        <p className="ui-muted">No upcoming visits scheduled.</p>
      ) : (
        <ul className="ui-list-plain">
          {upcoming.map((v) => (
            <li key={`${v.visitDate}-${v.timeWindow}`} className="ui-card-row">
              <span className="ui-strong">{formatDisplayDate(v.visitDate)}</span>
              <span className="ui-tag">{v.timeWindow}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
