"use client";

import { useEffect, useMemo, useState } from "react";
import ScheduleModal, { type SubSchedule } from "./schedule-modal";
import ExceptionModal, { type ScheduleException } from "./exception-modal";
import { parseMonthlyOccurrence } from "@/lib/scheduleRecurrence";
import {
  AutocompleteField,
  useAllAccountOptions,
  useCustomerSearch,
  useDebounce,
  type SearchOption,
} from "./autocomplete";

type AdminTab = "schedules" | "exceptions";

type SubcontractorsApiResponse = {
  success?: boolean;
  error?: string;
  subcontractors?: Array<{
    id?: string;
    ID?: string;
    subcontractorId?: string;
    email?: string;
    Email?: string;
    "Email Address"?: string;
    emailAddress?: string;
    companyName?: string;
    CompanyName?: string;
    "Company Name"?: string;
    company?: string;
    contactName?: string;
    ContactName?: string;
    "Contact Name"?: string;
    name?: string;
  }>;
};

// Company name and contact/personal name, tracked separately so Team Leader
// search can match either one (staff often know a sub by first name rather
// than company name), with id resolved the same way as before (SubID in the
// SubSchedules sheet is the subcontractor's email).
type TeamLeaderRecord = { id: string; companyName: string; contactName: string };

function normalizeForMatch(value: string): string {
  return value.trim().toLowerCase();
}

function getStoredAdminName(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("cwAdminName") ?? "";
}

const FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: "Weekly",
  BIWEEKLY: "Every Other Week",
  MONTHLY_1X: "1x per Month",
  MONTHLY_2X: "2x per Month",
  AS_NEEDED: "As Needed",
};

function describeFrequency(schedule: SubSchedule): string {
  return FREQUENCY_LABELS[schedule.frequency] || (schedule.recurring === "Y" ? "Weekly" : "One-time");
}

function describeDayOrOccurrence(schedule: SubSchedule): string {
  if (schedule.frequency === "MONTHLY_1X" || schedule.frequency === "MONTHLY_2X") {
    const occurrence = parseMonthlyOccurrence(schedule.monthlyOccurrence);
    return occurrence ? `${occurrence.position} ${occurrence.weekday}` : "—";
  }
  if (schedule.frequency === "AS_NEEDED") return "—";
  return schedule.dayOfWeek || "—";
}

export default function SubSchedulesPage() {
  const [adminTab, setAdminTab] = useState<AdminTab>("schedules");
  const [adminName, setAdminName] = useState("");

  const [schedules, setSchedules] = useState<SubSchedule[]>([]);
  const [exceptions, setExceptions] = useState<ScheduleException[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Customer autocomplete (resolves to AccountID)
  const customer = useCustomerSearch();

  // Team Leader autocomplete (resolves to SubID) — full subcontractor list is
  // small, so it's loaded once and filtered client-side, same as the
  // subcontractor dropdown already used on the Accounts page.
  const [allTeamLeaders, setAllTeamLeaders] = useState<TeamLeaderRecord[]>([]);
  const [teamLeaderLoadFailed, setTeamLeaderLoadFailed] = useState(false);
  const [teamLeaderLoading, setTeamLeaderLoading] = useState(true);
  const [teamLeaderQuery, setTeamLeaderQuery] = useState("");
  const debouncedTeamLeaderQuery = useDebounce(teamLeaderQuery, 200);
  const [selectedTeamLeader, setSelectedTeamLeader] = useState<SearchOption | null>(null);

  // AccountID -> display name, for the Exceptions table (which otherwise only
  // has raw AccountIDs). Backed by the same shared, cached account list the
  // Customer autocomplete uses, so this doesn't add its own separate fetch.
  const { options: allAccountOptions } = useAllAccountOptions();
  const accountNamesById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const option of allAccountOptions) map[option.id] = option.label;
    return map;
  }, [allAccountOptions]);

  const [scheduleModal, setScheduleModal] = useState<SubSchedule | null>(null);
  const [exceptionModal, setExceptionModal] = useState<"new" | ScheduleException | null>(null);

  useEffect(() => {
    setAdminName(getStoredAdminName());
  }, []);

  const [teamLeaderReloadToken, setTeamLeaderReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setTeamLeaderLoading(true);
    setTeamLeaderLoadFailed(false);
    (async () => {
      try {
        const res = await fetch("/api/subcontractors");
        const data = (await res.json()) as SubcontractorsApiResponse;
        if (cancelled) return;
        if (!res.ok || data.success === false) {
          // Distinguish "the fetch itself failed" (e.g. the Apps Script
          // timeout this page has already hit) from "genuinely no
          // subcontractors" — silently leaving this empty reads as a data
          // bug rather than a transient backend failure.
          setTeamLeaderLoadFailed(true);
          return;
        }
        // SubID in the SubSchedules sheet is the subcontractor's email — the
        // subcontractor portal's own schedule submission (sub-schedule-tab.tsx)
        // writes sub.email as SubID, falling back to id/subcontractorId only
        // if email is missing. Most subcontractor records have no generic
        // id/ID/subcontractorId at all (the Subcontractors admin page has a
        // dedicated "Missing ID" state for this), so matching that priority
        // order here is required for the resolved SubID to ever match real data.
        const options = (data.subcontractors ?? [])
          .map((sub) => ({
            id:
              sub.email || sub.Email || sub["Email Address"] || sub.emailAddress ||
              sub.id || sub.ID || sub.subcontractorId || "",
            companyName: sub.companyName || sub.CompanyName || sub["Company Name"] || sub.company || "",
            contactName: sub.contactName || sub.ContactName || sub["Contact Name"] || sub.name || "",
          }))
          .filter((option) => option.id && (option.companyName || option.contactName));
        setAllTeamLeaders(options);
      } catch {
        if (!cancelled) setTeamLeaderLoadFailed(true);
      } finally {
        if (!cancelled) setTeamLeaderLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamLeaderReloadToken]);

  function handleAdminNameChange(value: string) {
    setAdminName(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("cwAdminName", value);
    }
  }

  function resolveAccountName(accountId: string): string {
    return accountNamesById[accountId] || accountId;
  }

  function formatTeamLeaderLabel(record: TeamLeaderRecord): string {
    return record.contactName && record.companyName
      ? `${record.contactName} — ${record.companyName}`
      : record.contactName || record.companyName;
  }

  // SubID -> "Contact — Company", same format the dropdown uses, so the
  // table and the search field are visually consistent. Keyed by normalized
  // id since SubID matching elsewhere on this page is also normalized
  // (trim + lowercase) to tolerate case/whitespace differences in the sheet.
  const teamLeaderNamesById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const record of allTeamLeaders) {
      map[normalizeForMatch(record.id)] = formatTeamLeaderLabel(record);
    }
    return map;
  }, [allTeamLeaders]);

  function resolveTeamLeaderName(subId: string): string {
    return teamLeaderNamesById[normalizeForMatch(subId)] || subId;
  }

  // Team Leader search — client-side filter of the already-loaded list,
  // matching either the company name or the contact/personal name (staff
  // often know a sub by first name rather than company name). When a record
  // has both, the dropdown shows "Contact — Company" so staff can visually
  // confirm they picked the right person when a first name is ambiguous.
  const teamLeaderOptions = useMemo(() => {
    if (selectedTeamLeader) return [];
    const q = debouncedTeamLeaderQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return allTeamLeaders
      .filter(
        (record) =>
          record.companyName.toLowerCase().includes(q) || record.contactName.toLowerCase().includes(q)
      )
      .slice(0, 8)
      .map((record) => ({ id: record.id, label: formatTeamLeaderLabel(record) }));
  }, [allTeamLeaders, debouncedTeamLeaderQuery, selectedTeamLeader]);

  const hasSearch = !!(customer.selected || selectedTeamLeader);

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

  // Search-first: nothing loads until a customer or Team Leader is selected.
  // Schedules are always fetched once a search is active (even on the
  // Exceptions tab) because a Team-Leader search on exceptions needs to
  // cross-reference which AccountIDs that sub is scheduled for — the
  // ScheduleExceptions tab has no SubID column of its own.
  useEffect(() => {
    if (!hasSearch) {
      setSchedules([]);
      setExceptions([]);
      return;
    }
    loadSchedules();
    if (adminTab === "exceptions") loadExceptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminTab, customer.selected, selectedTeamLeader]);

  const filteredSchedules = useMemo(() => {
    return schedules.filter((s) => {
      const matchesAccount = !customer.selected || s.accountId === customer.selected.id;
      const matchesSub =
        !selectedTeamLeader || normalizeForMatch(s.subId) === normalizeForMatch(selectedTeamLeader.id);
      return matchesAccount && matchesSub;
    });
  }, [schedules, customer.selected, selectedTeamLeader]);

  const accountIdsForTeamLeader = useMemo(() => {
    if (!selectedTeamLeader) return null;
    const targetId = normalizeForMatch(selectedTeamLeader.id);
    return new Set(
      schedules.filter((s) => normalizeForMatch(s.subId) === targetId).map((s) => s.accountId)
    );
  }, [schedules, selectedTeamLeader]);

  const filteredExceptions = useMemo(() => {
    return exceptions.filter((ex) => {
      const matchesAccount = !customer.selected || ex.accountId === customer.selected.id;
      const matchesSub = !accountIdsForTeamLeader || accountIdsForTeamLeader.has(ex.accountId);
      return matchesAccount && matchesSub;
    });
  }, [exceptions, customer.selected, accountIdsForTeamLeader]);

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
    <main className="min-h-screen bg-gray-50 px-4 py-6 text-slate-900 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700 sm:text-sm">
            Cleaning World
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Sub Schedules
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Manage recurring subcontractor schedules and one-off schedule exceptions.
          </p>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
          <label className="text-xs font-bold uppercase text-slate-500">Your Name (for edits)</label>
          <input
            type="text"
            value={adminName}
            onChange={(e) => handleAdminNameChange(e.target.value)}
            placeholder="Enter your name"
            className="mt-1 w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
          />
          <p className="mt-1 text-xs text-slate-500">
            Used when editing an existing schedule or creating a schedule exception. New schedules can
            only be submitted by subcontractors from their own portal.
          </p>
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
              />

              <div>
                <AutocompleteField
                  label="Team Leader"
                  placeholder="Search team leader name..."
                  query={teamLeaderQuery}
                  onQueryChange={(value) => {
                    setTeamLeaderQuery(value);
                    if (selectedTeamLeader) setSelectedTeamLeader(null);
                  }}
                  options={teamLeaderOptions}
                  loading={teamLeaderLoading && !selectedTeamLeader}
                  selected={selectedTeamLeader}
                  onSelect={(option) => {
                    setSelectedTeamLeader(option);
                    setTeamLeaderQuery(option.label);
                  }}
                  onClear={() => {
                    setSelectedTeamLeader(null);
                    setTeamLeaderQuery("");
                  }}
                />
                {teamLeaderLoadFailed && (
                  <p className="mt-1 text-xs font-semibold text-red-600">
                    Couldn&apos;t load Team Leaders — the backend may be slow right now.{" "}
                    <button
                      type="button"
                      onClick={() => setTeamLeaderReloadToken((n) => n + 1)}
                      className="underline hover:text-red-800"
                    >
                      Retry
                    </button>
                  </p>
                )}
              </div>
            </div>

            {adminTab === "exceptions" && (
              <button
                type="button"
                onClick={() => setExceptionModal("new")}
                className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
              >
                + New Exception
              </button>
            )}
          </div>

          <div className="mt-5 overflow-x-auto">
            {!hasSearch ? (
              <p className="text-sm text-slate-600">
                Search by customer name or Team Leader name above to see results.
              </p>
            ) : loading ? (
              <p className="text-sm text-slate-600">Loading...</p>
            ) : adminTab === "schedules" ? (
              filteredSchedules.length === 0 ? (
                <p className="text-sm text-slate-600">No sub schedules found.</p>
              ) : (
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-slate-700">
                      <th className="px-4 py-3 font-semibold">Customer</th>
                      <th className="px-4 py-3 font-semibold">Team Leader</th>
                      <th className="px-4 py-3 font-semibold">Day / Occurrence</th>
                      <th className="px-4 py-3 font-semibold">Window</th>
                      <th className="px-4 py-3 font-semibold">Frequency</th>
                      <th className="px-4 py-3 font-semibold">Effective</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Submitted</th>
                      <th className="px-4 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSchedules.map((s) => (
                      <tr key={s.sheetRow} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-3">{resolveAccountName(s.accountId)}</td>
                        <td className="px-4 py-3">{resolveTeamLeaderName(s.subId)}</td>
                        <td className="px-4 py-3">{describeDayOrOccurrence(s)}</td>
                        <td className="px-4 py-3">{s.timeWindow || "—"}</td>
                        <td className="px-4 py-3">{describeFrequency(s)}</td>
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
                        <td className="px-4 py-3">
                          <div className="text-xs font-semibold text-slate-700">{s.submittedBy || "—"}</div>
                          {s.submittedDate && (
                            <div className="text-[11px] text-slate-400">{s.submittedDate}</div>
                          )}
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
                    <th className="px-4 py-3 font-semibold">Customer</th>
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
                      <td className="px-4 py-3">{resolveAccountName(ex.accountId)}</td>
                      <td className="px-4 py-3">{ex.originalDate}</td>
                      <td className="px-4 py-3">{ex.type}</td>
                      <td className="px-4 py-3">{ex.newDate || "—"}</td>
                      <td className="px-4 py-3">{ex.newTimeWindow || "—"}</td>
                      <td className="px-4 py-3">{ex.reason}</td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-semibold text-slate-700">{ex.createdBy || "—"}</div>
                        {ex.createdDate && (
                          <div className="text-[11px] text-slate-400">{ex.createdDate}</div>
                        )}
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
          accountName={exceptionModal !== "new" ? resolveAccountName(exceptionModal.accountId) : undefined}
          onClose={() => setExceptionModal(null)}
          onSaved={loadExceptions}
        />
      ) : null}
    </main>
  );
}
