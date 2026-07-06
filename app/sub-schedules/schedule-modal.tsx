"use client";

import { FormEvent, useState } from "react";

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
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TIME_WINDOWS = ["Morning", "Midday", "Afternoon", "Evening"];

type Props = {
  target: "new" | SubSchedule;
  adminName: string;
  onClose: () => void;
  onSaved: () => void;
};

export default function ScheduleModal({ target, adminName, onClose, onSaved }: Props) {
  const isNew = target === "new";

  const [accountId, setAccountId] = useState(isNew ? "" : target.accountId);
  const [subId, setSubId] = useState(isNew ? "" : target.subId);
  const [dayOfWeek, setDayOfWeek] = useState(isNew ? DAYS[1] : target.dayOfWeek);
  const [timeWindow, setTimeWindow] = useState(isNew ? TIME_WINDOWS[0] : target.timeWindow);
  const [recurring, setRecurring] = useState(isNew ? "Y" : target.recurring || "Y");
  const [effectiveStart, setEffectiveStart] = useState(isNew ? "" : target.effectiveStart);
  const [effectiveEnd, setEffectiveEnd] = useState(isNew ? "" : target.effectiveEnd);
  const [status, setStatus] = useState(isNew ? "Active" : target.status || "Active");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!adminName.trim()) {
      setError("Enter your name above before saving.");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      if (isNew) {
        if (!accountId.trim() || !subId.trim()) {
          setError("AccountID and SubID are required.");
          setSubmitting(false);
          return;
        }
        const res = await fetch("/api/admin/sub-schedules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId: accountId.trim(),
            subId: subId.trim(),
            dayOfWeek,
            timeWindow,
            recurring,
            effectiveStart,
            effectiveEnd,
            status,
            submittedBy: adminName.trim(),
          }),
        });
        const data = (await res.json()) as { success?: boolean; error?: string };
        if (!res.ok || !data.success) {
          setError(data.error ?? "Failed to create schedule.");
          return;
        }
      } else {
        const res = await fetch("/api/admin/sub-schedules", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sheetRow: target.sheetRow,
            lastEditedBy: adminName.trim(),
            fields: { dayOfWeek, timeWindow, recurring, effectiveStart, effectiveEnd, status },
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
        <h2 className="text-lg font-black text-slate-900">
          {isNew ? "New Sub Schedule" : `Edit Schedule ${target.scheduleId}`}
        </h2>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase text-slate-500">AccountID</label>
              <input
                type="text"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                disabled={!isNew}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 disabled:bg-slate-100"
                required
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-slate-500">SubID</label>
              <input
                type="text"
                value={subId}
                onChange={(e) => setSubId(e.target.value)}
                disabled={!isNew}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 disabled:bg-slate-100"
                required
              />
            </div>
          </div>

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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase text-slate-500">Recurring</label>
              <select
                value={recurring}
                onChange={(e) => setRecurring(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
              >
                <option value="Y">Yes — every week</option>
                <option value="N">No — one-time</option>
              </select>
            </div>
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

          {!isNew && (
            <p className="text-xs text-slate-500">
              Submitted by {target.submittedBy || "—"} on {target.submittedDate || "—"}
              {target.lastEditedBy ? ` · last edited by ${target.lastEditedBy} on ${target.lastEditedDate}` : ""}
            </p>
          )}

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
