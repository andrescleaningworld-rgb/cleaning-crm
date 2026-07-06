"use client";

import { useEffect, useMemo, useState } from "react";
import ScheduleModal, { type SubSchedule } from "./schedule-modal";
import ExceptionModal, { type ScheduleException } from "./exception-modal";

type AdminTab = "schedules" | "exceptions";

function getStoredAdminName(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("cwAdminName") ?? "";
}

export default function SubSchedulesPage() {
  const [adminTab, setAdminTab] = useState<AdminTab>("schedules");
  const [adminName, setAdminName] = useState("");

  const [schedules, setSchedules] = useState<SubSchedule[]>([]);
  const [exceptions, setExceptions] = useState<ScheduleException[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [filterAccountId, setFilterAccountId] = useState("");
  const [filterSubId, setFilterSubId] = useState("");

  const [scheduleModal, setScheduleModal] = useState<"new" | SubSchedule | null>(null);
  const [exceptionModal, setExceptionModal] = useState<"new" | ScheduleException | null>(null);

  useEffect(() => {
    setAdminName(getStoredAdminName());
  }, []);

  function handleAdminNameChange(value: string) {
    setAdminName(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("cwAdminName", value);
    }
  }

  async function loadSchedules() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/sub-schedules");
      const data = (await res.json()) as { schedules?: SubSchedule[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to load schedules.");
        return;
      }
      setSchedules(data.schedules ?? []);
    } catch {
      setError("Network error loading schedules.");
    } finally {
      setLoading(false);
    }
  }

  async function loadExceptions() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/schedule-exceptions");
      const data = (await res.json()) as { exceptions?: ScheduleException[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to load exceptions.");
        return;
      }
      setExceptions(data.exceptions ?? []);
    } catch {
      setError("Network error loading exceptions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (adminTab === "schedules") loadSchedules();
    else loadExceptions();
  }, [adminTab]);

  const filteredSchedules = useMemo(() => {
    const accountQuery = filterAccountId.trim().toLowerCase();
    const subQuery = filterSubId.trim().toLowerCase();
    return schedules.filter((s) => {
      const matchesAccount = !accountQuery || s.accountId.toLowerCase().includes(accountQuery);
      const matchesSub = !subQuery || s.subId.toLowerCase().includes(subQuery);
      return matchesAccount && matchesSub;
    });
  }, [schedules, filterAccountId, filterSubId]);

  const filteredExceptions = useMemo(() => {
    const accountQuery = filterAccountId.trim().toLowerCase();
    return exceptions.filter((ex) => !accountQuery || ex.accountId.toLowerCase().includes(accountQuery));
  }, [exceptions, filterAccountId]);

  async function toggleScheduleStatus(schedule: SubSchedule) {
    if (!adminName.trim()) {
      setError("Enter your name above before making changes.");
      return;
    }
    const nextStatus = schedule.status.trim().toLowerCase() === "active" ? "Inactive" : "Active";
    try {
      const res = await fetch("/api/admin/sub-schedules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetRow: schedule.sheetRow,
          lastEditedBy: adminName.trim(),
          fields: { status: nextStatus },
        }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        setError(data.error ?? "Failed to update status.");
        return;
      }
      loadSchedules();
    } catch {
      setError("Network error. Please try again.");
    }
  }

  async function deleteException(exception: ScheduleException) {
    if (!window.confirm(`Delete exception ${exception.exceptionId}?`)) return;
    try {
      const res = await fetch("/api/admin/schedule-exceptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetRow: exception.sheetRow }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        setError(data.error ?? "Failed to delete exception.");
        return;
      }
      loadExceptions();
    } catch {
      setError("Network error. Please try again.");
    }
  }

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-6 text-slate-900 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Sub Schedules</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage recurring subcontractor schedules and one-off schedule exceptions.
          </p>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
          <label className="text-xs font-bold uppercase text-slate-500">Your Name (for edit tracking)</label>
          <input
            type="text"
            value={adminName}
            onChange={(e) => handleAdminNameChange(e.target.value)}
            placeholder="Enter your name"
            className="mt-1 w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
          />
        </div>

        <div className="flex gap-2">
          {([
            { id: "schedules" as const, label: "Sub Schedules" },
            { id: "exceptions" as const, label: "Schedule Exceptions" },
          ]).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setAdminTab(id)}
              className={`rounded-full px-5 py-2 text-sm font-black transition ${
                adminTab === id ? "bg-blue-700 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        <div className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row">
              <div>
                <label className="text-xs font-bold uppercase text-slate-500">Filter by AccountID</label>
                <input
                  type="text"
                  value={filterAccountId}
                  onChange={(e) => setFilterAccountId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 sm:w-56"
                />
              </div>
              {adminTab === "schedules" && (
                <div>
                  <label className="text-xs font-bold uppercase text-slate-500">Filter by SubID</label>
                  <input
                    type="text"
                    value={filterSubId}
                    onChange={(e) => setFilterSubId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 sm:w-56"
                  />
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => (adminTab === "schedules" ? setScheduleModal("new") : setExceptionModal("new"))}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
            >
              {adminTab === "schedules" ? "+ New Schedule" : "+ New Exception"}
            </button>
          </div>

          <div className="mt-5 overflow-x-auto">
            {loading ? (
              <p className="text-sm text-slate-600">Loading...</p>
            ) : adminTab === "schedules" ? (
              filteredSchedules.length === 0 ? (
                <p className="text-sm text-slate-600">No sub schedules found.</p>
              ) : (
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-slate-700">
                      <th className="px-4 py-3 font-semibold">AccountID</th>
                      <th className="px-4 py-3 font-semibold">SubID</th>
                      <th className="px-4 py-3 font-semibold">Day</th>
                      <th className="px-4 py-3 font-semibold">Window</th>
                      <th className="px-4 py-3 font-semibold">Recurring</th>
                      <th className="px-4 py-3 font-semibold">Effective</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Submitted</th>
                      <th className="px-4 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSchedules.map((s) => (
                      <tr key={s.sheetRow} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-3">{s.accountId}</td>
                        <td className="px-4 py-3">{s.subId}</td>
                        <td className="px-4 py-3">{s.dayOfWeek}</td>
                        <td className="px-4 py-3">{s.timeWindow}</td>
                        <td className="px-4 py-3">{s.recurring === "Y" ? "Weekly" : "One-time"}</td>
                        <td className="px-4 py-3">
                          {s.effectiveStart || "—"}
                          {s.effectiveEnd ? ` to ${s.effectiveEnd}` : ""}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              s.status.trim().toLowerCase() === "active"
                                ? "bg-green-100 text-green-800"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {s.status || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {s.submittedBy || "—"}
                          {s.submittedDate ? ` · ${s.submittedDate}` : ""}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={() => setScheduleModal(s)}
                              className="text-xs font-semibold text-blue-700 hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleScheduleStatus(s)}
                              className={`text-xs font-semibold hover:underline ${
                                s.status.trim().toLowerCase() === "active" ? "text-red-600" : "text-green-700"
                              }`}
                            >
                              {s.status.trim().toLowerCase() === "active" ? "Deactivate" : "Reactivate"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : filteredExceptions.length === 0 ? (
              <p className="text-sm text-slate-600">No schedule exceptions found.</p>
            ) : (
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-slate-700">
                    <th className="px-4 py-3 font-semibold">AccountID</th>
                    <th className="px-4 py-3 font-semibold">Original Date</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">New Date</th>
                    <th className="px-4 py-3 font-semibold">New Window</th>
                    <th className="px-4 py-3 font-semibold">Reason</th>
                    <th className="px-4 py-3 font-semibold">Created</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExceptions.map((ex) => (
                    <tr key={ex.sheetRow} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-3">{ex.accountId}</td>
                      <td className="px-4 py-3">{ex.originalDate}</td>
                      <td className="px-4 py-3">{ex.type}</td>
                      <td className="px-4 py-3">{ex.newDate || "—"}</td>
                      <td className="px-4 py-3">{ex.newTimeWindow || "—"}</td>
                      <td className="px-4 py-3">{ex.reason}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {ex.createdBy || "—"}
                        {ex.createdDate ? ` · ${ex.createdDate}` : ""}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => setExceptionModal(ex)}
                            className="text-xs font-semibold text-blue-700 hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteException(ex)}
                            className="text-xs font-semibold text-red-600 hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {scheduleModal ? (
        <ScheduleModal
          target={scheduleModal}
          adminName={adminName}
          onClose={() => setScheduleModal(null)}
          onSaved={loadSchedules}
        />
      ) : null}

      {exceptionModal ? (
        <ExceptionModal
          target={exceptionModal}
          adminName={adminName}
          onClose={() => setExceptionModal(null)}
          onSaved={loadExceptions}
        />
      ) : null}
    </main>
  );
}
