"use client";

import { useEffect, useMemo, useState } from "react";

type ActivityLogEntry = {
  timestamp?: string;
  subcontractorEmail?: string;
  subcontractorName?: string;
  actionType?: string;
  details?: string;
};

type ActivityLogApiResponse = {
  success?: boolean;
  error?: string;
  logs?: ActivityLogEntry[];
  data?: ActivityLogEntry[];
};

type SubcontractorRow = {
  subcontractorName?: string;
  companyName?: string;
  contactName?: string;
  name?: string;
  email?: string;
};

type SubcontractorsApiResponse = {
  success?: boolean;
  error?: string;
  subcontractors?: SubcontractorRow[];
  subs?: SubcontractorRow[];
  data?: SubcontractorRow[];
};

type ActionCategory =
  | "All"
  | "Login"
  | "Viewed Tab"
  | "Reported Issue"
  | "Ordered Supplies"
  | "Transfer Proposal Response"
  | "Other";

const ACTION_CATEGORY_OPTIONS: { value: ActionCategory; label: string }[] = [
  { value: "All", label: "Action: All" },
  { value: "Login", label: "Action: Login" },
  { value: "Viewed Tab", label: "Action: Viewed [Tab]" },
  { value: "Reported Issue", label: "Action: Reported Issue" },
  { value: "Ordered Supplies", label: "Action: Ordered Supplies" },
  { value: "Transfer Proposal Response", label: "Action: Transfer Proposal Response" },
  { value: "Other", label: "Action: Other" },
];

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

// Groups the free-text Action Type values actually written by the portal
// logging into the categories this filter offers. "Transfer Proposal
// Response" has no writer yet (that logging lives in Apps Script, not this
// app) but is included here so the filter is ready once it's added.
function getActionCategory(actionType: unknown): ActionCategory {
  const value = clean(actionType);

  if (value === "Login") return "Login";
  if (value.startsWith("Viewed ")) return "Viewed Tab";
  if (/transfer proposal/i.test(value)) return "Transfer Proposal Response";
  if (/issue/i.test(value)) return "Reported Issue";
  if (/supply|supplies/i.test(value)) return "Ordered Supplies";

  return "Other";
}

function formatDateTime(value: unknown): string {
  const text = clean(value);
  if (!text) return "-";

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getDateTimeValue(value: unknown): number {
  const text = clean(value);
  if (!text) return 0;

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function toIsoDate(value: unknown): string {
  const text = clean(value);
  if (!text) return "";

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

// Matches subcontractor-portal/page.tsx's own getSubcontractorDisplayName —
// the function that produced the "Subcontractor Name" string actually
// written into each log row — so filter options match logged values exactly.
function getSubcontractorDisplayName(subcontractor: SubcontractorRow): string {
  return (
    clean(subcontractor.subcontractorName) ||
    clean(subcontractor.companyName) ||
    clean(subcontractor.contactName) ||
    clean(subcontractor.name) ||
    "Subcontractor"
  );
}

function getLoadedLogs(data: ActivityLogApiResponse | ActivityLogEntry[]) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.logs)) return data.logs;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

function getLoadedSubcontractors(
  data: SubcontractorsApiResponse | SubcontractorRow[]
) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.subcontractors)) return data.subcontractors;
  if (Array.isArray(data.subs)) return data.subs;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

export default function ActivityLogPage() {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [subcontractorNames, setSubcontractorNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [subcontractorFilter, setSubcontractorFilter] = useState("All");
  const [actionFilter, setActionFilter] = useState<ActionCategory>("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    async function loadLogs() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch("/api/activity-log", { cache: "no-store" });
        const text = await response.text();

        let data: ActivityLogApiResponse | ActivityLogEntry[];
        try {
          data = JSON.parse(text) as ActivityLogApiResponse | ActivityLogEntry[];
        } catch {
          throw new Error("Activity log API did not return valid JSON.");
        }

        if (!response.ok || (!Array.isArray(data) && data.success === false)) {
          throw new Error(
            !Array.isArray(data) && data.error
              ? data.error
              : "Failed to load activity log."
          );
        }

        setLogs(getLoadedLogs(data));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Unknown error loading activity log."
        );
        setLogs([]);
      } finally {
        setLoading(false);
      }
    }

    async function loadSubcontractors() {
      try {
        const response = await fetch("/api/subcontractors", { cache: "no-store" });
        const data = (await response.json()) as
          | SubcontractorsApiResponse
          | SubcontractorRow[];

        const names = getLoadedSubcontractors(data)
          .map(getSubcontractorDisplayName)
          .filter(Boolean);

        setSubcontractorNames(
          Array.from(new Set(names)).sort((a, b) => a.localeCompare(b))
        );
      } catch {
        setSubcontractorNames([]);
      }
    }

    void loadLogs();
    void loadSubcontractors();
  }, []);

  const filteredLogs = useMemo(() => {
    return logs
      .filter((entry) => {
        if (
          subcontractorFilter !== "All" &&
          clean(entry.subcontractorName).toLowerCase() !==
            subcontractorFilter.toLowerCase()
        ) {
          return false;
        }

        if (
          actionFilter !== "All" &&
          getActionCategory(entry.actionType) !== actionFilter
        ) {
          return false;
        }

        const entryDate = toIsoDate(entry.timestamp);

        if (dateFrom && entryDate && entryDate < dateFrom) return false;
        if (dateTo && entryDate && entryDate > dateTo) return false;

        return true;
      })
      .sort((a, b) => getDateTimeValue(b.timestamp) - getDateTimeValue(a.timestamp));
  }, [logs, subcontractorFilter, actionFilter, dateFrom, dateTo]);

  function clearFilters() {
    setSubcontractorFilter("All");
    setActionFilter("All");
    setDateFrom("");
    setDateTo("");
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 text-gray-900 md:p-6">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
            Cleaning World
          </p>
          <h1 className="mt-2 text-3xl font-bold">Activity Log</h1>
          <p className="mt-2 text-gray-500">
            Subcontractor portal logins, tab views, and submissions — most recent first.
          </p>
        </div>
      </div>

      {error ? (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-5 font-bold text-red-700">
          {error}
        </div>
      ) : null}

      <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <select
            value={subcontractorFilter}
            onChange={(e) => setSubcontractorFilter(e.target.value)}
            className="rounded-xl border border-gray-300 px-4 py-3 text-sm"
          >
            <option value="All">Subcontractor: All</option>
            {subcontractorNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value as ActionCategory)}
            className="rounded-xl border border-gray-300 px-4 py-3 text-sm"
          >
            {ACTION_CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={clearFilters}
            className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            Clear Filters
          </button>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-600">
            From
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-600">
            To
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:p-5">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-bold">Activity</h2>
            <p className="mt-1 text-sm text-gray-500">
              Every login, tab view, and submission recorded from the subcontractor portal.
            </p>
          </div>
          <span className="font-bold text-gray-500">
            {filteredLogs.length} of {logs.length}
          </span>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center font-bold text-slate-500">
            Loading activity log...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <p className="font-bold text-slate-700">No activity found.</p>
          </div>
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {filteredLogs.map((entry, index) => (
                <div
                  key={`${entry.timestamp || "entry"}-${index}`}
                  className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-bold">
                      {clean(entry.subcontractorName) || "Unknown"}
                    </p>
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
                      {clean(entry.actionType) || "-"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-bold uppercase tracking-wide text-gray-500">
                    {formatDateTime(entry.timestamp)}
                  </p>
                  {clean(entry.details) ? (
                    <p className="mt-2 text-sm text-gray-600">{clean(entry.details)}</p>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="p-3">Timestamp</th>
                    <th className="p-3">Subcontractor Name</th>
                    <th className="p-3">Action Type</th>
                    <th className="p-3">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((entry, index) => (
                    <tr
                      key={`${entry.timestamp || "entry"}-${index}`}
                      className="border-b last:border-b-0 hover:bg-blue-50"
                    >
                      <td className="whitespace-nowrap p-3">
                        {formatDateTime(entry.timestamp)}
                      </td>
                      <td className="p-3 font-semibold">
                        {clean(entry.subcontractorName) || "Unknown"}
                      </td>
                      <td className="p-3">
                        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
                          {clean(entry.actionType) || "-"}
                        </span>
                      </td>
                      <td className="p-3 text-gray-600">
                        {clean(entry.details) || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
