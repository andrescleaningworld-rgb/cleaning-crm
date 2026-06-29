"use client";

import { useState } from "react";
import type { PortalSubmission } from "@/lib/googleSheets";

const TAB_LABELS: Record<string, string> = {
  "portal-complaints": "Complaint",
  "portal-service-requests": "Service Request",
  "portal-date-changes": "Date Change",
  "portal-billing-requests": "Billing",
};

const STATUS_OPTIONS = ["New", "In Progress", "Resolved", "Closed"];

const STATUS_COLORS: Record<string, string> = {
  New: "bg-yellow-100 text-yellow-800",
  "In Progress": "bg-blue-100 text-blue-800",
  Resolved: "bg-green-100 text-green-800",
  Closed: "bg-gray-100 text-gray-500",
};

const TYPE_FILTERS = [
  { label: "All", value: "all" },
  { label: "Complaints", value: "portal-complaints" },
  { label: "Service Requests", value: "portal-service-requests" },
  { label: "Date Changes", value: "portal-date-changes" },
  { label: "Billing", value: "portal-billing-requests" },
];

const STATUS_FILTERS = ["All", "New", "In Progress", "Resolved", "Closed"];

export default function SubmissionsView({ initial }: { initial: PortalSubmission[] }) {
  const [items, setItems] = useState<PortalSubmission[]>(initial);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ key: string; status: string; notes: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = items.filter((s) => {
    if (typeFilter !== "all" && s.tab !== typeFilter) return false;
    if (statusFilter !== "All" && s.status !== statusFilter) return false;
    if (search && !s.accountName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const newCount = items.filter((s) => s.status === "New").length;

  function key(s: PortalSubmission) {
    return `${s.tab}-${s.sheetRow}`;
  }

  function toggleExpand(s: PortalSubmission) {
    const k = key(s);
    if (expanded === k) {
      setExpanded(null);
      setEditing(null);
    } else {
      setExpanded(k);
      setEditing({ key: k, status: s.status, notes: s.notes });
    }
  }

  async function save(s: PortalSubmission) {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch("/api/staff/portal-submissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tab: s.tab, sheetRow: s.sheetRow, status: editing.status, notes: editing.notes }),
      });
      if (!res.ok) throw new Error("Failed");
      setItems((prev) =>
        prev.map((item) =>
          key(item) === key(s)
            ? { ...item, status: editing.status, notes: editing.notes }
            : item
        )
      );
      setExpanded(null);
      setEditing(null);
    } catch {
      alert("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Total Requests</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{items.length}</p>
        </div>
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 shadow-sm">
          <p className="text-xs text-yellow-700">New / Unread</p>
          <p className="mt-1 text-2xl font-bold text-yellow-800">{newCount}</p>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
          <p className="text-xs text-blue-700">In Progress</p>
          <p className="mt-1 text-2xl font-bold text-blue-800">{items.filter((s) => s.status === "In Progress").length}</p>
        </div>
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 shadow-sm">
          <p className="text-xs text-green-700">Resolved</p>
          <p className="mt-1 text-2xl font-bold text-green-800">{items.filter((s) => s.status === "Resolved").length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by account…"
            className="w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
          <div className="flex flex-wrap gap-2">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setTypeFilter(f.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  typeFilter === f.value
                    ? "bg-blue-700 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  statusFilter === s
                    ? "bg-gray-800 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
            No submissions match your filters.
          </div>
        )}

        {filtered.map((s) => {
          const k = key(s);
          const isOpen = expanded === k;
          return (
            <div key={k} className="rounded-xl border border-gray-200 bg-white shadow-sm">
              {/* Row header */}
              <button
                onClick={() => toggleExpand(s)}
                className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left hover:bg-gray-50"
              >
                <div className="flex flex-1 flex-wrap items-center gap-3">
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
                    {TAB_LABELS[s.tab]}
                  </span>
                  <span className="font-semibold text-gray-900">{s.accountName}</span>
                  <span className="text-xs text-gray-400">{s.date}</span>
                  {Object.entries(s.fields).slice(0, 1).map(([, v]) => (
                    v ? <span key={v} className="text-sm text-gray-500 truncate max-w-xs">{v}</span> : null
                  ))}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_COLORS[s.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {s.status}
                  </span>
                  <span className="text-gray-400">{isOpen ? "▲" : "▼"}</span>
                </div>
              </button>

              {/* Expanded detail */}
              {isOpen && editing?.key === k && (
                <div className="border-t border-gray-100 px-5 py-4 space-y-4">
                  {/* Fields */}
                  <div className="grid gap-3 md:grid-cols-2">
                    {Object.entries(s.fields).map(([label, value]) => (
                      value ? (
                        <div key={label}>
                          <p className="text-xs font-semibold text-gray-500">{label}</p>
                          {label === "Photos" ? (
                            <div className="mt-1 flex flex-wrap gap-2">
                              {value.split(",").map((url) => url.trim()).filter(Boolean).map((url) => (
                                <a key={url} href={url} target="_blank" rel="noopener noreferrer"
                                  className="text-xs text-blue-600 underline">
                                  View Photo
                                </a>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-0.5 text-sm text-gray-800">{value}</p>
                          )}
                        </div>
                      ) : null
                    ))}
                  </div>

                  {/* Status + Notes */}
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-500">Status</label>
                      <select
                        value={editing.status}
                        onChange={(e) => setEditing({ ...editing, status: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-600"
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-500">Staff Notes</label>
                      <input
                        type="text"
                        value={editing.notes}
                        onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                        placeholder="Add a note…"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => save(s)}
                      disabled={saving}
                      className="rounded-lg bg-blue-700 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button
                      onClick={() => { setExpanded(null); setEditing(null); }}
                      className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
