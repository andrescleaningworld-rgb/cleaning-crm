"use client";

import { FormEvent, useState } from "react";
import { AutocompleteField, useCustomerSearch } from "./autocomplete";

export type ScheduleException = {
  sheetRow: number;
  exceptionId: string;
  accountId: string;
  originalDate: string;
  type: string;
  newDate: string;
  newTimeWindow: string;
  reason: string;
  createdBy: string;
  createdDate: string;
};

const TIME_WINDOWS = ["", "Morning", "Midday", "Afternoon", "Evening"];

type Props = {
  target: "new" | ScheduleException;
  adminName: string;
  // Resolved display name for target.accountId when editing an existing
  // exception (the modal has no way to look this up itself).
  accountName?: string;
  onClose: () => void;
  onSaved: () => void;
};

export default function ExceptionModal({ target, adminName, accountName, onClose, onSaved }: Props) {
  const isNew = target === "new";

  const customer = useCustomerSearch();
  const [originalDate, setOriginalDate] = useState(isNew ? "" : target.originalDate);
  const [type, setType] = useState(isNew ? "Skip" : target.type || "Skip");
  const [newDate, setNewDate] = useState(isNew ? "" : target.newDate);
  const [newTimeWindow, setNewTimeWindow] = useState(isNew ? "" : target.newTimeWindow);
  const [reason, setReason] = useState(isNew ? "" : target.reason);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const accountId = isNew ? customer.selected?.id ?? "" : target.accountId;
    if (!accountId || !originalDate || !reason.trim()) {
      setError("Customer, original date, and reason are required.");
      return;
    }
    if (type === "Reschedule" && !newDate) {
      setError("Pick a new date for a reschedule.");
      return;
    }
    if (isNew && !adminName.trim()) {
      setError("Enter your name above before saving.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      if (isNew) {
        const res = await fetch("/api/admin/schedule-exceptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId,
            originalDate,
            type,
            newDate: type === "Reschedule" ? newDate : "",
            newTimeWindow: type === "Reschedule" ? newTimeWindow : "",
            reason: reason.trim(),
            createdBy: adminName.trim(),
          }),
        });
        const data = (await res.json()) as { success?: boolean; error?: string };
        if (!res.ok || !data.success) {
          setError(data.error ?? "Failed to create exception.");
          return;
        }
      } else {
        const res = await fetch("/api/admin/schedule-exceptions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sheetRow: target.sheetRow,
            fields: {
              originalDate,
              type,
              newDate: type === "Reschedule" ? newDate : "",
              newTimeWindow: type === "Reschedule" ? newTimeWindow : "",
              reason: reason.trim(),
            },
          }),
        });
        const data = (await res.json()) as { success?: boolean; error?: string };
        if (!res.ok || !data.success) {
          setError(data.error ?? "Failed to update exception.");
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
          {isNew ? "New Schedule Exception" : `Edit Exception ${target.exceptionId}`}
        </h2>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {isNew ? (
              <AutocompleteField
                label="Customer"
                placeholder="Search customer name..."
                query={customer.query}
                onQueryChange={customer.setQuery}
                options={customer.options}
                loading={customer.loading}
                selected={customer.selected}
                onSelect={customer.select}
                onClear={customer.clear}
                className="sm:w-full"
              />
            ) : (
              <div>
                <label className="text-xs font-bold uppercase text-slate-500">Customer</label>
                <p className="mt-1 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600">
                  {accountName || target.accountId}
                </p>
              </div>
            )}
            <div>
              <label className="text-xs font-bold uppercase text-slate-500">Original Date</label>
              <input
                type="date"
                value={originalDate}
                onChange={(e) => setOriginalDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase text-slate-500">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
            >
              <option value="Skip">Skip this date</option>
              <option value="Reschedule">Reschedule this date</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {type === "Reschedule" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold uppercase text-slate-500">New Date</label>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-slate-500">New Time Window</label>
                <select
                  value={newTimeWindow}
                  onChange={(e) => setNewTimeWindow(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                >
                  {TIME_WINDOWS.map((w) => (
                    <option key={w} value={w}>{w || "Unspecified"}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-bold uppercase text-slate-500">Reason</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
              required
            />
          </div>

          {!isNew && (
            <p className="text-xs text-slate-500">
              Created by {target.createdBy || "—"} on {target.createdDate || "—"}
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
