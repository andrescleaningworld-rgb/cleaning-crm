"use client";

import { useMemo, useState, FormEvent } from "react";

type Props = {
  accountName: string;
  accountId: string;
  subEmail: string;
  subName: string;
  frequency: string;
  cleaningDays: string;
};

const TIME_WINDOWS = [
  { id: "Morning",   label: "Morning",   hours: "7am – 10am" },
  { id: "Midday",    label: "Midday",    hours: "10am – 1pm" },
  { id: "Afternoon", label: "Afternoon", hours: "1pm – 5pm"  },
  { id: "Evening",   label: "Evening",   hours: "5pm+"       },
] as const;

type TimeWindowId = typeof TIME_WINDOWS[number]["id"];

const DOW_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function getTomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function fmtDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

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
  text.toLowerCase().split(/[\s,&/+]+/).forEach((word) => {
    const clean = word.replace(/s$/, "");
    if (map[clean] !== undefined) found.add(map[clean]);
  });
  return [...found];
}

type FreqType = "5x_week" | "2x_week" | "2x_month" | "1x_week";

function getFreqType(freq: string): FreqType {
  const f = freq.toLowerCase().trim();
  if (f.includes("5x") || f.includes("every day") || f.includes("daily")) return "5x_week";
  const has2x = f.includes("2x") || f.includes("twice") || f.includes("2 x") || f.includes("2 per");
  if (has2x && f.includes("week")) return "2x_week";
  if (
    (has2x && f.includes("month")) ||
    f.includes("every other") ||
    f.includes("bi-week") ||
    f.includes("biweek") ||
    f.includes("every 2 week")
  ) return "2x_month";
  return "1x_week";
}

type RecurringResult = { dates: string[]; label: string };

function computeRecurring(
  startDateStr: string,
  frequency: string,
  cleaningDays: string,
): RecurringResult {
  if (!startDateStr) return { dates: [], label: "" };
  if (!frequency) return { dates: [startDateStr], label: "" };

  const start = localDate(startDateStr);
  const startDow = start.getDay();
  const endDate = new Date(start.getFullYear(), start.getMonth() + 12, start.getDate());
  const freqType = getFreqType(frequency);
  const dates: string[] = [];

  if (freqType === "5x_week") {
    const cur = new Date(start);
    while (cur <= endDate) {
      if (cur.getDay() >= 1 && cur.getDay() <= 5) dates.push(fmtDate(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return { dates, label: `Monday–Friday every week for 12 months (${dates.length} visits)` };
  }

  if (freqType === "2x_week") {
    const parsed = parseCleaningDayIndices(cleaningDays);
    const others = parsed.filter((d) => d !== startDow);
    const secondDow = others.length > 0 ? others[0] : (startDow + 3) % 7;
    const targetDows = new Set([startDow, secondDow]);
    const cur = new Date(start);
    while (cur <= endDate) {
      if (targetDows.has(cur.getDay())) dates.push(fmtDate(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return {
      dates,
      label: `Every ${DOW_FULL[startDow]} and ${DOW_FULL[secondDow]} for 12 months (${dates.length} visits)`,
    };
  }

  if (freqType === "2x_month") {
    const cur = new Date(start);
    while (cur <= endDate) {
      dates.push(fmtDate(cur));
      cur.setDate(cur.getDate() + 14);
    }
    return {
      dates,
      label: `Every other ${DOW_FULL[startDow]} for 12 months (${dates.length} visits)`,
    };
  }

  // 1x_week: every week on startDow
  const cur = new Date(start);
  while (cur <= endDate) {
    dates.push(fmtDate(cur));
    cur.setDate(cur.getDate() + 7);
  }
  return {
    dates,
    label: `Every ${DOW_FULL[startDow]} for 12 months (${dates.length} visits)`,
  };
}

export default function ScheduleVisit({
  accountName,
  accountId,
  subEmail,
  subName,
  frequency,
  cleaningDays,
}: Props) {
  const [visitDate, setVisitDate]   = useState("");
  const [timeWindow, setTimeWindow] = useState<TimeWindowId | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState("");
  const [success, setSuccess]       = useState("");

  const recurring = useMemo(
    () => computeRecurring(visitDate, frequency, cleaningDays),
    [visitDate, frequency, cleaningDays],
  );

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!visitDate)  { setError("Please pick a date.");        return; }
    if (!timeWindow) { setError("Please pick a time window."); return; }

    setError("");
    setSuccess("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/portal/schedule-visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountName,
          accountId,
          subEmail,
          subName,
          visitDates: recurring.dates.length > 0 ? recurring.dates : [visitDate],
          timeWindow,
        }),
      });

      const data = (await res.json()) as { success?: boolean; scheduleLabel?: string; error?: string };

      if (!res.ok || !data.success) {
        setError(data.error ?? "Failed to schedule. Please try again.");
        return;
      }

      const count = recurring.dates.length;
      setSuccess(
        count > 1
          ? `Scheduled ${count} visits — ${recurring.label}`
          : `Scheduled: ${data.scheduleLabel ?? visitDate}`,
      );
      setVisitDate("");
      setTimeWindow("");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const tomorrow = getTomorrow();

  return (
    <section className="ui-card">
      <h2 className="ui-card-title">Schedule Next Visit</h2>
      <p className="ui-muted">
        Pick a start date for{" "}
        <span className="ui-strong">{accountName}</span>. The recurring
        schedule will be saved automatically based on the account frequency.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-5">
        <div>
          <label className="ui-label">Start Date</label>
          <input
            type="date"
            value={visitDate}
            min={tomorrow}
            onChange={(e) => setVisitDate(e.target.value)}
            className="ui-input w-full"
            required
          />
        </div>

        {visitDate && recurring.label && (
          <div className="ui-stat">
            <p className="ui-strong">
              Recurring Schedule Preview
            </p>
            <p className="ui-strong">
              {recurring.label}
            </p>
            {frequency && (
              <p className="ui-muted">
                Based on account frequency: <span className="ui-strong">{frequency}</span>
              </p>
            )}
          </div>
        )}

        <div>
          <label className="ui-label">Time Window</label>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TIME_WINDOWS.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setTimeWindow(w.id)}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  timeWindow === w.id
                    ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100"
                    : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50"
                }`}
              >
                <p className="ui-strong">{w.label}</p>
                <p className="ui-muted">{w.hours}</p>
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div className="ui-field-error">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="ui-savestatus ui-savestatus-saved">
            {success}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="ui-btn ui-btn-second w-full"
        >
          {submitting
            ? "Scheduling..."
            : recurring.dates.length > 1
              ? `Schedule ${recurring.dates.length} Visits`
              : "Schedule Visit"}
        </button>
      </form>
    </section>
  );
}
