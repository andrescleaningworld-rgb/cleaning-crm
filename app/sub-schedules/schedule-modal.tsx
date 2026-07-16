"use client";

import { FormEvent, useState } from "react";
import { parseMonthlyOccurrence } from "@/lib/scheduleRecurrence";

export type SubSchedule = {
  sheetRow: number;
  scheduleId: string;
  accountId: string;
  subId: string;
  dayOfWeek: string;
  timeWindow: string;
  recurring: string;
  effectiveStart: string;
  effectiveEnd: string;
  status: string;
  submittedBy: string;
  submittedDate: string;
  lastEditedBy: string;
  lastEditedDate: string;
  frequency: string;
  monthlyOccurrence: string;
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TIME_WINDOWS = ["Morning", "Midday", "Afternoon", "Evening"];
const POSITIONS = ["1st", "2nd", "3rd", "4th", "Last"];
const FREQUENCIES: { id: string; label: string }[] = [
  { id: "WEEKLY", label: "Weekly" },
  { id: "BIWEEKLY", label: "Every Other Week" },
  { id: "MONTHLY_1X", label: "1x per Month" },
  { id: "MONTHLY_2X", label: "2x per Month" },
  { id: "AS_NEEDED", label: "As Needed" },
];

// Matches the Eastern-time-safe todayISO() used in sub-schedule-tab.tsx —
// new Date().toISOString() reads UTC, which in the evening (US Eastern) has
// already rolled to the next day and would default EffectiveDate to tomorrow.
function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

type Props = {
  target: SubSchedule;
  adminName: string;
  onClose: () => void;
  onSaved: () => void;
};

export default function ScheduleModal({ target, adminName, onClose, onSaved }: Props) {
  const targetOccurrence = parseMonthlyOccurrence(target.monthlyOccurrence);

  const [frequency, setFrequency] = useState(target.frequency);
  const [dayOfWeek, setDayOfWeek] = useState(target.dayOfWeek);
  const [timeWindow, setTimeWindow] = useState(target.timeWindow);
  const [occurrencePosition, setOccurrencePosition] = useState(targetOccurrence?.position ?? "");
  const [occurrenceWeekday, setOccurrenceWeekday] = useState(targetOccurrence?.weekday ?? "");
  const [effectiveStart, setEffectiveStart] = useState(target.effectiveStart);
  const [effectiveEnd, setEffectiveEnd] = useState(target.effectiveEnd);
  const [effectiveDate, setEffectiveDate] = useState(todayISO());
  const [status, setStatus] = useState(target.status || "Active");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const monthlyOccurrence =
    frequency === "MONTHLY_1X" || frequency === "MONTHLY_2X"
      ? occurrencePosition && occurrenceWeekday
        ? `${occurrencePosition}:${occurrenceWeekday}`
        : ""
      : "";

  // Any change to the pattern itself (as opposed to Status or a manual
  // Effective window tweak) is versioned rather than patched in place — see
  // applySchedulePatternChange in lib/googleSheets.ts.
  const patternChanged =
    frequency !== target.frequency ||
    dayOfWeek !== target.dayOfWeek ||
    timeWindow !== target.timeWindow ||
    monthlyOccurrence !== target.monthlyOccurrence;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!adminName.trim()) {
      setError("Enter your name above before saving.");
      return;
    }

    if (patternChanged) {
      if (!effectiveDate) {
        setError("Choose an effective date for this pattern change.");
        return;
      }
      if ((frequency === "WEEKLY" || frequency === "BIWEEKLY") && (!dayOfWeek || !timeWindow)) {
        setError("Choose a day of week and time window.");
        return;
      }
      if (
        (frequency === "MONTHLY_1X" || frequency === "MONTHLY_2X") &&
        (!occurrencePosition || !occurrenceWeekday || !timeWindow)
      ) {
        setError("Choose a week position, weekday, and time window.");
        return;
      }
    }

    setSubmitting(true);
    setError("");

    try {
      if (patternChanged) {
        const res = await fetch("/api/admin/sub-schedules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scheduleId: target.scheduleId,
            lastEditedBy: adminName.trim(),
            effectiveDate,
            newPattern: {
              frequency,
              dayOfWeek: frequency === "WEEKLY" || frequency === "BIWEEKLY" ? dayOfWeek : "",
              timeWindow: frequency === "AS_NEEDED" ? "" : timeWindow,
              monthlyOccurrence,
              status,
            },
          }),
        });
        const data = (await res.json()) as { success?: boolean; error?: string };
        if (!res.ok || !data.success) {
          setError(data.error ?? "Failed to apply schedule pattern change.");
          return;
        }
      } else {
        const res = await fetch("/api/admin/sub-schedules", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sheetRow: target.sheetRow,
            lastEditedBy: adminName.trim(),
            fields: { status, effectiveStart, effectiveEnd },
          }),
        });
        const data = (await res.json()) as { success?: boolean; error?: string };
        if (!res.ok || !data.success) {
          setError(data.error ?? "Failed to update schedule.");
          return;
        }
      }
      onSaved();
      onClose();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
        <h2 className="text-lg font-black text-slate-900">Edit Schedule {target.scheduleId}</h2>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase text-slate-500">AccountID</label>
              <p className="mt-1 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600">
                {target.accountId}
              </p>
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-slate-500">SubID</label>
              <p className="mt-1 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600">
                {target.subId}
              </p>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase text-slate-500">Frequency</label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
            >
              {FREQUENCIES.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </div>

          {(frequency === "WEEKLY" || frequency === "BIWEEKLY") && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold uppercase text-slate-500">Day of Week</label>
                <select
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                >
                  {DAYS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-slate-500">Time Window</label>
                <select
                  value={timeWindow}
                  onChange={(e) => setTimeWindow(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                >
                  {TIME_WINDOWS.map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {(frequency === "MONTHLY_1X" || frequency === "MONTHLY_2X") && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-bold uppercase text-slate-500">Which Week</label>
                <select
                  value={occurrencePosition}
                  onChange={(e) => setOccurrencePosition(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                >
                  <option value="">Select...</option>
                  {POSITIONS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-slate-500">Weekday</label>
                <select
                  value={occurrenceWeekday}
                  onChange={(e) => setOccurrenceWeekday(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                >
                  <option value="">Select...</option>
                  {DAYS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-slate-500">Time Window</label>
                <select
                  value={timeWindow}
                  onChange={(e) => setTimeWindow(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                >
                  <option value="">Select...</option>
                  {TIME_WINDOWS.map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {frequency === "AS_NEEDED" && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              No recurring day needed — visits for this account are added one at a time via Schedule Exceptions.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase text-slate-500">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>

          {patternChanged ? (
            <div>
              <label className="text-xs font-bold uppercase text-slate-500">Effective Date</label>
              <input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
              />
              <p className="mt-1 text-xs text-slate-500">
                This pattern change takes effect on this date. Visits before it keep the current pattern — this
                schedule row will be closed out and a new one created starting {effectiveDate || "this date"}.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold uppercase text-slate-500">Effective Start</label>
                <input
                  type="date"
                  value={effectiveStart}
                  onChange={(e) => setEffectiveStart(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-slate-500">Effective End</label>
                <input
                  type="date"
                  value={effectiveEnd}
                  onChange={(e) => setEffectiveEnd(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                />
              </div>
            </div>
          )}

          <p className="text-xs text-slate-500">
            Submitted by {target.submittedBy || "—"} on {target.submittedDate || "—"}
            {target.lastEditedBy ? ` · last edited by ${target.lastEditedBy} on ${target.lastEditedDate}` : ""}
          </p>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
