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
    <div className="ui-screen">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="ui-screen-title">Activity Log</h1>
        <Link
          href="/settings"
          className="ui-btn ui-btn-second"
        >
          Back to Settings
        </Link>
      </div>

      <div className="ui-card">
        <select
          value={managerFilter}
          onChange={(event) => setManagerFilter(event.target.value)}
          className="ui-input"
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

        <div className="flex flex-wrap items-center gap-2 font-semibold text-slate-500">
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="ui-input"
          />
          <span>to</span>
          <input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className="ui-input"
          />
        </div>
      </div>

      {error ? (
        <p className="ui-field-error">
          {error}
        </p>
      ) : null}

      {loading ? <p className="ui-muted">Loading...</p> : null}

      {!loading && entries.length === 0 ? (
        <p className="ui-muted">No activity found for these filters.</p>
      ) : null}

      <div className="space-y-2">
        {entries.map((entry) => (
          <div key={entry.id} className="ui-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="ui-strong">
                {entry.actorName}{" "}
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-base font-bold uppercase tracking-wide text-slate-500">
                  {entry.actorRole}
                </span>
              </p>
              <p className="ui-muted">{formatTimestamp(entry.createdAt)}</p>
            </div>
            <p className="ui-muted">
              <span className="ui-strong">{entry.action}</span> {entry.entityType}
              {entry.entityId ? ` #${entry.entityId}` : ""}
              {entry.detail ? ` — ${entry.detail}` : ""}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
