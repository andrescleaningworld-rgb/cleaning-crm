"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type OrderLine = { itemId: number; itemName: string; unit: string; qty: number };

type QueueEntry = {
  kind: "order" | "issue";
  id: number;
  linkId: number;
  accountId: string;
  accountName: string;
  linkLabel: string;
  status: string;
  note: string;
  createdAt: string;
  // order-only
  lines?: OrderLine[];
  updatedAt?: string;
  // issue-only
  category?: string;
  photos?: string[];
  resolvedAt?: string | null;
};

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "new", label: "Order: New" },
  { value: "ordered", label: "Order: Ordered" },
  { value: "delivered", label: "Order: Delivered" },
  { value: "cancelled", label: "Order: Cancelled" },
  { value: "open", label: "Issue: Open" },
  { value: "resolved", label: "Issue: Resolved" },
];

export default function SiteLinksQueuePage() {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  async function load(status: string) {
    try {
      setLoading(true);
      const url = status ? `/api/admin/site-links/queue?status=${encodeURIComponent(status)}` : "/api/admin/site-links/queue";
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      setEntries(data.entries ?? []);
    } catch {
      setError("Failed to load the queue.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(statusFilter);
  }, [statusFilter]);

  async function updateStatus(entry: QueueEntry, status: string) {
    try {
      const res = await fetch("/api/admin/site-links/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: entry.kind, id: entry.id, status }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed.");
      await load(statusFilter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status.");
    }
  }

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-5 shadow-sm">
          <div>
            <Link href="/site-links" className="text-sm font-semibold text-blue-700 no-underline hover:underline">
              ← Back to Site Links
            </Link>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">Queue</h1>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="min-h-[44px] rounded-lg border border-gray-300 px-3 text-sm"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}

        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : entries.length === 0 ? (
          <div className="rounded-2xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
            Nothing in the queue.
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <QueueCard key={`${entry.kind}-${entry.id}`} entry={entry} onUpdateStatus={updateStatus} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function QueueCard({
  entry,
  onUpdateStatus,
}: {
  entry: QueueEntry;
  onUpdateStatus: (entry: QueueEntry, status: string) => void;
}) {
  const statusOptions = entry.kind === "order" ? ["new", "ordered", "delivered", "cancelled"] : ["open", "resolved"];

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              entry.kind === "order" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"
            }`}
          >
            {entry.kind === "order" ? "Supply Order" : "Issue"}
          </span>
          <h3 className="mt-2 text-base font-bold text-slate-900">{entry.accountName}</h3>
          <p className="text-xs text-slate-500">
            {entry.linkLabel} · {new Date(entry.createdAt).toLocaleString()}
          </p>
        </div>
        <select
          value={entry.status}
          onChange={(e) => onUpdateStatus(entry, e.target.value)}
          className="min-h-[40px] rounded-lg border border-gray-300 px-3 text-sm"
        >
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {entry.kind === "order" && entry.lines && entry.lines.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-slate-700">
          {entry.lines.map((line) => (
            <li key={line.itemId}>
              {line.itemName} × {line.qty} ({line.unit})
            </li>
          ))}
        </ul>
      )}

      {entry.kind === "issue" && entry.category && (
        <p className="mt-2 text-sm font-semibold capitalize text-slate-700">{entry.category}</p>
      )}

      {entry.note && <p className="mt-2 text-sm text-slate-600">{entry.note}</p>}

      {entry.kind === "issue" && entry.photos && entry.photos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {entry.photos.map((url) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element -- remote Blob-hosted photo, not a bundled/optimizable static asset */}
              <img src={url} alt="" className="h-20 w-20 rounded-lg object-cover" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
