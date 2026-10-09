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
    <div className="max-w-md whitespace-pre-wrap text-gray-700">
      {shown}
      {isLong ? (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="ui-btn ui-btn-quiet"
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
    <main className="ui-screen">
      <div className="ui-screen-body">
        <div className="mb-6">
          <Link href="/settings" className="ui-link">
            ← Back to Settings
          </Link>
          <h1 className="ui-screen-title">Logs</h1>
          <p className="ui-muted">
            The account update history log — every &ldquo;Change Status&rdquo; note, onboarding-checklist
            completion summary, and manually added update, browsable across every account
            instead of one account at a time.
          </p>
        </div>

        <section className="ui-card">
          <div className="grid gap-3 md:grid-cols-4">
            <input
              type="text"
              value={accountSearch}
              onChange={(event) => setAccountSearch(event.target.value)}
              placeholder="Filter by account name..."
              className="ui-input"
            />

            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="ui-input"
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
              className="ui-input"
            />

            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              aria-label="To date"
              className="ui-input"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <select
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value as "newest" | "oldest")}
              className="ui-input"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </select>

            <button type="button" onClick={clearFilters} className="ui-btn ui-btn-quiet">
              Clear Filters
            </button>
          </div>
        </section>

        {error ? (
          <div className="ui-field-error">{error}</div>
        ) : null}

        <section className="ui-card">
          {loading ? (
            <p className="ui-muted">Loading log entries...</p>
          ) : filteredEntries.length === 0 ? (
            <p className="ui-muted">No log entries match these filters.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="ui-table w-full">
                  <thead>
                    <tr className="border-b bg-gray-50 uppercase tracking-wide text-gray-500">
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
                              className="ui-link"
                            >
                              {entry.accountName}
                            </Link>
                          ) : (
                            <span className="ui-strong">{entry.accountName}</span>
                          )}
                        </td>
                        <td className="p-3">
                          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-base font-semibold text-gray-700">
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

              <div className="flex items-center justify-between border-t p-4 text-gray-500">
                <span>
                  Showing {visibleEntries.length} of {filteredEntries.length} entries
                  {filteredEntries.length !== entries.length ? ` (${entries.length} total)` : ""}
                </span>
                {visibleCount < filteredEntries.length ? (
                  <button
                    type="button"
                    onClick={() => setVisibleCount((count) => count + LOAD_MORE_COUNT)}
                    className="ui-btn ui-btn-second"
                  >
                    Load More
                  </button>
                ) : null}
              </div>
            </>
          )}
        </section>

        <p className="ui-muted">
          Other logs exist in this system (e.g. SMS delivery attempts, subcontractor activity) but
          aren&apos;t browsable here yet — this page covers the account update history log only.
        </p>
      </div>
    </main>
  );
}
