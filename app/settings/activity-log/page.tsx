"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ManagerOption = { staffId: string; name: string; accountId?: string };

type ActivityLogEntry = {
  id: number;
  actorAccountId: string | null;
  actorRole: "manager" | "owner" | "porter";
  actorName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  detail: string | null;
  createdAt: string;
};

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ActivityLogPage() {
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [managerFilter, setManagerFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/manager-accounts", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { identities?: ManagerOption[] }) => setManagers(data.identities ?? []))
      .catch(() => {
        // non-fatal — the manager filter just stays empty
      });
  }, []);

  useEffect(() => {
    async function loadEntries() {
      const params = new URLSearchParams();
      if (managerFilter) params.set("managerAccountId", managerFilter);
      if (startDate) params.set("start", startDate);
      if (endDate) {
        // "end" is exclusive in the query — bump to the start of the next day
        // so picking a single end date includes that whole day's entries.
        const inclusiveEnd = new Date(`${endDate}T00:00:00`);
        inclusiveEnd.setDate(inclusiveEnd.getDate() + 1);
        params.set("end", inclusiveEnd.toISOString());
      }

      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/admin/audit-log?${params.toString()}`, { cache: "no-store" });
        const data = (await response.json()) as { success?: boolean; entries?: ActivityLogEntry[]; error?: string };
        if (data.success === false) throw new Error(data.error || "Could not load activity log.");
        setEntries(data.entries ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load activity log.");
      } finally {
        setLoading(false);
      }
    }

    loadEntries();
  }, [managerFilter, startDate, endDate]);

  return (
    <div className="mx-auto max-w-4xl space-y-5 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black text-slate-950">Activity Log</h1>
        <Link
          href="/settings"
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          Back to Settings
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <select
          value={managerFilter}
          onChange={(event) => setManagerFilter(event.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500"
        >
          <option value="">All managers</option>
          {managers
            .filter((m) => m.accountId)
            .map((m) => (
              <option key={m.accountId} value={m.accountId}>
                {m.name}
              </option>
            ))}
        </select>

        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold outline-none focus:border-blue-500"
          />
          <span>to</span>
          <input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}

      {loading ? <p className="text-sm text-slate-500">Loading...</p> : null}

      {!loading && entries.length === 0 ? (
        <p className="text-sm text-slate-500">No activity found for these filters.</p>
      ) : null}

      <div className="space-y-2">
        {entries.map((entry) => (
          <div key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-black text-slate-900">
                {entry.actorName}{" "}
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                  {entry.actorRole}
                </span>
              </p>
              <p className="text-xs text-slate-500">{formatTimestamp(entry.createdAt)}</p>
            </div>
            <p className="mt-1 text-sm text-slate-700">
              <span className="font-bold">{entry.action}</span> {entry.entityType}
              {entry.entityId ? ` #${entry.entityId}` : ""}
              {entry.detail ? ` — ${entry.detail}` : ""}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
