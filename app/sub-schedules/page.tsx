"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ScheduleModal, { type SubSchedule } from "./schedule-modal";
import ExceptionModal, { type ScheduleException } from "./exception-modal";

type AdminTab = "schedules" | "exceptions";

type SearchOption = { id: string; label: string };

type AccountsApiResponse = {
  success?: boolean;
  error?: string;
  accounts?: Array<{ accountId?: string; id?: string; accountName?: string }>;
};

type SubcontractorsApiResponse = {
  success?: boolean;
  error?: string;
  subcontractors?: Array<{
    id?: string;
    ID?: string;
    subcontractorId?: string;
    companyName?: string;
    CompanyName?: string;
    company?: string;
    contactName?: string;
    ContactName?: string;
  }>;
};

const SEARCH_DEBOUNCE_MS = 200;

function getStoredAdminName(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("cwAdminName") ?? "";
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Name-search autocomplete — shared by the Customer and Team Leader fields
// ---------------------------------------------------------------------------

type AutocompleteFieldProps = {
  label: string;
  placeholder: string;
  query: string;
  onQueryChange: (value: string) => void;
  options: SearchOption[];
  loading: boolean;
  selected: SearchOption | null;
  onSelect: (option: SearchOption) => void;
  onClear: () => void;
};

function AutocompleteField({
  label,
  placeholder,
  query,
  onQueryChange,
  options,
  loading,
  selected,
  onSelect,
  onClear,
}: AutocompleteFieldProps) {
  const [focused, setFocused] = useState(false);
  const showDropdown = focused && !selected && query.trim().length >= 2;

  return (
    <div className="relative">
      <label className="text-xs font-bold uppercase text-slate-500">{label}</label>
      {selected ? (
        <div className="mt-1 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900 sm:w-64">
          <span className="truncate">{selected.label}</span>
          <button
            type="button"
            onClick={onClear}
            className="ml-2 shrink-0 text-blue-700 hover:text-blue-900"
            aria-label={`Clear ${label}`}
          >
            ×
          </button>
        </div>
      ) : (
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 sm:w-64"
        />
      )}

      {showDropdown && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg sm:w-64">
          {loading ? (
            <p className="px-3 py-2 text-sm text-slate-500">Searching...</p>
          ) : options.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-500">No matches.</p>
          ) : (
            options.map((option) => (
              <button
                key={option.id}
                type="button"
                onMouseDown={() => onSelect(option)}
                className="block w-full truncate px-3 py-2 text-left text-sm text-slate-800 hover:bg-blue-50"
              >
                {option.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function SubSchedulesPage() {
  const [adminTab, setAdminTab] = useState<AdminTab>("schedules");
  const [adminName, setAdminName] = useState("");

  const [schedules, setSchedules] = useState<SubSchedule[]>([]);
  const [exceptions, setExceptions] = useState<ScheduleException[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Customer autocomplete (resolves to AccountID)
  const [customerQuery, setCustomerQuery] = useState("");
  const debouncedCustomerQuery = useDebounce(customerQuery, SEARCH_DEBOUNCE_MS);
  const [customerOptions, setCustomerOptions] = useState<SearchOption[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<SearchOption | null>(null);

  // Team Leader autocomplete (resolves to SubID) — full subcontractor list is
  // small, so it's loaded once and filtered client-side, same as the
  // subcontractor dropdown already used on the Accounts page.
  const [allTeamLeaders, setAllTeamLeaders] = useState<SearchOption[]>([]);
  const [teamLeaderQuery, setTeamLeaderQuery] = useState("");
  const debouncedTeamLeaderQuery = useDebounce(teamLeaderQuery, SEARCH_DEBOUNCE_MS);
  const [selectedTeamLeader, setSelectedTeamLeader] = useState<SearchOption | null>(null);

  const [scheduleModal, setScheduleModal] = useState<SubSchedule | null>(null);
  const [exceptionModal, setExceptionModal] = useState<"new" | ScheduleException | null>(null);

  const requestIdRef = useRef(0);

  useEffect(() => {
    setAdminName(getStoredAdminName());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/subcontractors");
        const data = (await res.json()) as SubcontractorsApiResponse;
        if (cancelled || !res.ok || data.success === false) return;
        const options = (data.subcontractors ?? [])
          .map((sub) => ({
            id: sub.id || sub.ID || sub.subcontractorId || "",
            label: sub.companyName || sub.CompanyName || sub.company || sub.contactName || sub.ContactName || "",
          }))
          .filter((option) => option.id && option.label);
        setAllTeamLeaders(options);
      } catch {
        // Team Leader autocomplete just won't have suggestions; not fatal.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleAdminNameChange(value: string) {
    setAdminName(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("cwAdminName", value);
    }
  }

  // Customer search — debounced network lookup, gated at 2+ characters.
  useEffect(() => {
    const q = debouncedCustomerQuery.trim();
    if (selectedCustomer) return;
    if (q.length < 2) {
      setCustomerOptions([]);
      setCustomerSearching(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setCustomerSearching(true);
    (async () => {
      try {
        const res = await fetch(`/api/accounts?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const data = (await res.json()) as AccountsApiResponse;
        if (requestId !== requestIdRef.current) return;
        if (!res.ok || data.success === false) {
          setCustomerOptions([]);
          return;
        }
        const options = (data.accounts ?? [])
          .map((account) => ({
            id: account.accountId || account.id || "",
            label: account.accountName || "Unnamed Account",
          }))
          .filter((option) => option.id)
          .slice(0, 8);
        setCustomerOptions(options);
      } catch {
        if (requestId === requestIdRef.current) setCustomerOptions([]);
      } finally {
        if (requestId === requestIdRef.current) setCustomerSearching(false);
      }
    })();
  }, [debouncedCustomerQuery, selectedCustomer]);

  // Team Leader search — client-side filter of the already-loaded list.
  const teamLeaderOptions = useMemo(() => {
    if (selectedTeamLeader) return [];
    const q = debouncedTeamLeaderQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return allTeamLeaders.filter((option) => option.label.toLowerCase().includes(q)).slice(0, 8);
  }, [allTeamLeaders, debouncedTeamLeaderQuery, selectedTeamLeader]);

  const hasSearch = !!(selectedCustomer || selectedTeamLeader);

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
  }, [adminTab, selectedCustomer, selectedTeamLeader]);

  const filteredSchedules = useMemo(() => {
    return schedules.filter((s) => {
      const matchesAccount = !selectedCustomer || s.accountId === selectedCustomer.id;
      const matchesSub = !selectedTeamLeader || s.subId === selectedTeamLeader.id;
      return matchesAccount && matchesSub;
    });
  }, [schedules, selectedCustomer, selectedTeamLeader]);

  const accountIdsForTeamLeader = useMemo(() => {
    if (!selectedTeamLeader) return null;
    return new Set(schedules.filter((s) => s.subId === selectedTeamLeader.id).map((s) => s.accountId));
  }, [schedules, selectedTeamLeader]);

  const filteredExceptions = useMemo(() => {
    return exceptions.filter((ex) => {
      const matchesAccount = !selectedCustomer || ex.accountId === selectedCustomer.id;
      const matchesSub = !accountIdsForTeamLeader || accountIdsForTeamLeader.has(ex.accountId);
      return matchesAccount && matchesSub;
    });
  }, [exceptions, selectedCustomer, accountIdsForTeamLeader]);

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
                query={customerQuery}
                onQueryChange={(value) => {
                  setCustomerQuery(value);
                  if (selectedCustomer) setSelectedCustomer(null);
                }}
                options={customerOptions}
                loading={customerSearching}
                selected={selectedCustomer}
                onSelect={(option) => {
                  setSelectedCustomer(option);
                  setCustomerQuery(option.label);
                }}
                onClear={() => {
                  setSelectedCustomer(null);
                  setCustomerQuery("");
                }}
              />

              <AutocompleteField
                label="Team Leader"
                placeholder="Search team leader name..."
                query={teamLeaderQuery}
                onQueryChange={(value) => {
                  setTeamLeaderQuery(value);
                  if (selectedTeamLeader) setSelectedTeamLeader(null);
                }}
                options={teamLeaderOptions}
                loading={false}
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
