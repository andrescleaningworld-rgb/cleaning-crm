"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

// Same GET /api/account-updates source and raw-key shape as
// app/account-updates/page.tsx (Apps Script's getAccountUpdates action) —
// this page is a browsable, filterable view over that SAME log, not a
// second source of truth. Every "Change Status" note and every onboarding
// completion summary lands here.
type RawAccountUpdate = {
  id?: string;
  "Update ID"?: string;
  date?: string;
  "Update Date"?: string;
  accountId?: string;
  "Account ID"?: string;
  accountName?: string;
  "Account Name"?: string;
  Account?: string;
  updateType?: string;
  "Update Type"?: string;
  Type?: string;
  manager?: string;
  Manager?: string;
  "Created By"?: string;
  notes?: string;
  Notes?: string;
  "Update Notes"?: string;
  Description?: string;
  notifyEmail?: string;
  "Notify Email"?: string;
  Email?: string;
};

type LogEntry = {
  id: string;
  dateRaw: string;
  dateDisplay: string;
  accountId: string;
  accountName: string;
  updateType: string;
  manager: string;
  notes: string;
  notifyEmail: string;
};

const INITIAL_VISIBLE_COUNT = 30;
const LOAD_MORE_COUNT = 30;
const NOTES_PREVIEW_LENGTH = 160;

function cleanText(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function formatDate(value: string): string {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function mapRawEntry(raw: RawAccountUpdate, index: number): LogEntry {
  const dateRaw = cleanText(raw["Update Date"] || raw.date);
  return {
    id: cleanText(raw["Update ID"] || raw.id, `update-${index + 1}`),
    dateRaw,
    dateDisplay: formatDate(dateRaw),
    accountId: cleanText(raw["Account ID"] || raw.accountId),
    accountName: cleanText(raw["Account Name"] || raw.accountName || raw.Account, "Unnamed Account"),
    updateType: cleanText(raw["Update Type"] || raw.updateType || raw.Type, "General Update"),
    manager: cleanText(raw.Manager || raw.manager || raw["Created By"], "N/A"),
    notes: cleanText(raw.Notes || raw.notes || raw["Update Notes"] || raw.Description, "N/A"),
    notifyEmail: cleanText(raw["Notify Email"] || raw.notifyEmail || raw.Email),
  };
}

function LogNotes({ notes }: { notes: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = notes.length > NOTES_PREVIEW_LENGTH;
  const shown = expanded || !isLong ? notes : `${notes.slice(0, NOTES_PREVIEW_LENGTH)}…`;

  return (
    <div className="max-w-md whitespace-pre-wrap text-sm text-gray-700">
      {shown}
      {isLong ? (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="ml-1 font-semibold text-blue-700 hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

export default function LogsPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [accountSearch, setAccountSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All Types");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);

  useEffect(() => {
    let cancelled = false;

    async function loadEntries() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/account-updates", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok || data.success === false) {
          throw new Error(data.error || "Could not load the update log.");
        }
        const raw: RawAccountUpdate[] = data.accountUpdates || data.updates || data.data || [];
        if (!cancelled) setEntries(raw.map(mapRawEntry));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load the update log.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadEntries();
    return () => {
      cancelled = true;
    };
  }, []);

  // Source/type filter options come from whatever updateType values are
  // actually present in the data — this log's "type" values are free text
  // written by whichever feature created the entry (Change Status,
  // onboarding completion, the manual "Add Update" form, etc.), not a fixed
  // enum, so the filter list has to be built from the data rather than
  // hardcoded.
  const typeOptions = useMemo(() => {
    const types = new Set<string>();
    for (const entry of entries) types.add(entry.updateType);
    return ["All Types", ...Array.from(types).sort((a, b) => a.localeCompare(b))];
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const query = accountSearch.trim().toLowerCase();
    const startMs = startDate ? new Date(startDate).getTime() : null;
    // End-of-day so a same-day entry (with a time component) isn't
    // excluded by an end date the user picked as "through this day."
    const endMs = endDate ? new Date(`${endDate}T23:59:59`).getTime() : null;

    const filtered = entries.filter((entry) => {
      if (query && !entry.accountName.toLowerCase().includes(query)) return false;
      if (typeFilter !== "All Types" && entry.updateType !== typeFilter) return false;

      if (startMs !== null || endMs !== null) {
        const entryMs = new Date(entry.dateRaw).getTime();
        if (Number.isNaN(entryMs)) return false;
        if (startMs !== null && entryMs < startMs) return false;
        if (endMs !== null && entryMs > endMs) return false;
      }

      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      const aMs = new Date(a.dateRaw).getTime();
      const bMs = new Date(b.dateRaw).getTime();
      return sortOrder === "newest" ? bMs - aMs : aMs - bMs;
    });

    return sorted;
  }, [entries, accountSearch, typeFilter, startDate, endDate, sortOrder]);

  const visibleEntries = filteredEntries.slice(0, visibleCount);

  function clearFilters() {
    setAccountSearch("");
    setTypeFilter("All Types");
    setStartDate("");
    setEndDate("");
    setSortOrder("newest");
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <Link href="/settings" className="text-sm font-semibold text-blue-700 hover:underline">
            ← Back to Settings
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-gray-900">Logs</h1>
          <p className="mt-1 max-w-3xl text-gray-600">
            The account update history log — every &ldquo;Change Status&rdquo; note, onboarding-checklist
            completion summary, and manually added update, browsable across every account
            instead of one account at a time.
          </p>
        </div>

        <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-4">
            <input
              type="text"
              value={accountSearch}
              onChange={(event) => setAccountSearch(event.target.value)}
              placeholder="Filter by account name..."
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
            />

            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
            >
              {typeOptions.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              aria-label="From date"
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
            />

            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              aria-label="To date"
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <select
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value as "newest" | "oldest")}
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </select>

            <button type="button" onClick={clearFilters} className="text-sm font-semibold text-blue-700 hover:underline">
              Clear Filters
            </button>
          </div>
        </section>

        {error ? (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 font-semibold text-red-700">{error}</div>
        ) : null}

        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <p className="p-6 text-sm text-gray-600">Loading log entries...</p>
          ) : filteredEntries.length === 0 ? (
            <p className="p-6 text-sm text-gray-600">No log entries match these filters.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                      <th className="p-3">Date</th>
                      <th className="p-3">Account</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Manager</th>
                      <th className="p-3">Notes</th>
                      <th className="p-3">Notify Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEntries.map((entry) => (
                      <tr key={entry.id} className="border-b align-top last:border-b-0">
                        <td className="whitespace-nowrap p-3 text-gray-600">{entry.dateDisplay}</td>
                        <td className="p-3">
                          {entry.accountId ? (
                            <Link
                              href={`/accounts/${encodeURIComponent(entry.accountId)}`}
                              className="font-semibold text-blue-700 hover:underline"
                            >
                              {entry.accountName}
                            </Link>
                          ) : (
                            <span className="font-semibold text-gray-900">{entry.accountName}</span>
                          )}
                        </td>
                        <td className="p-3">
                          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
                            {entry.updateType}
                          </span>
                        </td>
                        <td className="p-3 text-gray-700">{entry.manager}</td>
                        <td className="p-3">
                          <LogNotes notes={entry.notes} />
                        </td>
                        <td className="p-3 text-gray-500">{entry.notifyEmail || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t p-4 text-sm text-gray-500">
                <span>
                  Showing {visibleEntries.length} of {filteredEntries.length} entries
                  {filteredEntries.length !== entries.length ? ` (${entries.length} total)` : ""}
                </span>
                {visibleCount < filteredEntries.length ? (
                  <button
                    type="button"
                    onClick={() => setVisibleCount((count) => count + LOAD_MORE_COUNT)}
                    className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800"
                  >
                    Load More
                  </button>
                ) : null}
              </div>
            </>
          )}
        </section>

        <p className="mt-4 text-xs text-gray-400">
          Other logs exist in this system (e.g. SMS delivery attempts, subcontractor activity) but
          aren&apos;t browsable here yet — this page covers the account update history log only.
        </p>
      </div>
    </main>
  );
}
