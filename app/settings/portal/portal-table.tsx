"use client";

import React, { useState, useCallback } from "react";
import type { MergedPortalAccount } from "@/lib/googleSheets";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="ml-1 rounded px-1.5 py-0.5 text-xs text-blue-600 hover:bg-blue-50"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const color = s === "active" ? "bg-green-100 text-green-800"
    : s === "cancelled" || s === "canceled" ? "bg-red-100 text-red-700"
    : "bg-gray-100 text-gray-600";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{status || "—"}</span>;
}

type EditState = {
  phone: string;
  nextScheduledService: string;
  estimatedMonthlyTotal: string;
};

export default function PortalTable({ initial }: { initial: MergedPortalAccount[] }) {
  const [accounts, setAccounts] = useState<MergedPortalAccount[]>(initial);
  const [search, setSearch] = useState("");
  const [accessFilter, setAccessFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ phone: "", nextScheduledService: "", estimatedMonthlyTotal: "" });
  const [loadingRow, setLoadingRow] = useState<string | null>(null);
  const [error, setError] = useState("");

  const refetch = useCallback(async () => {
    const res = await fetch("/api/admin/portal-accounts");
    if (res.ok) {
      const data = await res.json() as MergedPortalAccount[];
      setAccounts(data);
    }
  }, []);

  const filtered = accounts.filter((a) => {
    if (search && !a.accountName.toLowerCase().includes(search.toLowerCase())) return false;
    if (accessFilter === "enabled" && a.portalAccess !== "YES") return false;
    if (accessFilter === "disabled" && (a.portalAccess !== "NO" || a.portalSheetRow === null)) return false;
    if (statusFilter === "active" && a.accountStatus.toLowerCase() !== "active") return false;
    if (statusFilter === "inactive" && a.accountStatus.toLowerCase() === "active") return false;
    return true;
  });

  const enabledCount = accounts.filter((a) => a.portalAccess === "YES").length;

  function openEdit(a: MergedPortalAccount) {
    if (expandedRow === a.accountName) { setExpandedRow(null); return; }
    setExpandedRow(a.accountName);
    setEditState({
      phone: a.portalPhone || a.mainPhone,
      nextScheduledService: a.nextScheduledService,
      estimatedMonthlyTotal: a.estimatedMonthlyTotal,
    });
    setError("");
  }

  async function handleEnable(a: MergedPortalAccount) {
    setLoadingRow(a.accountName);
    setError("");
    try {
      const res = await fetch("/api/admin/portal-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName: a.accountName, phone: a.mainPhone, accountId: a.mainAccountId }),
      });
      const data = await res.json() as { portalCode?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      await refetch();
      // Auto-open the edit panel after enabling
      const fresh = await fetch("/api/admin/portal-accounts").then((r) => r.json()) as MergedPortalAccount[];
      setAccounts(fresh);
      const updated = fresh.find((x) => x.accountName === a.accountName);
      if (updated) {
        setExpandedRow(a.accountName);
        setEditState({ phone: updated.portalPhone || updated.mainPhone, nextScheduledService: "", estimatedMonthlyTotal: "" });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoadingRow(null);
    }
  }

  async function handleToggleAccess(a: MergedPortalAccount) {
    if (!a.portalSheetRow) return;
    setLoadingRow(a.accountName);
    setError("");
    try {
      const res = await fetch("/api/admin/portal-accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetRow: a.portalSheetRow, action: "toggleAccess", currentAccess: a.portalAccess }),
      });
      const data = await res.json() as { portalAccess?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setAccounts((prev) => prev.map((x) => x.accountName === a.accountName
        ? { ...x, portalAccess: data.portalAccess as "YES" | "NO" } : x));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoadingRow(null);
    }
  }

  async function handleGenerateCode(a: MergedPortalAccount) {
    if (!a.portalSheetRow) return;
    setLoadingRow(a.accountName + "-code");
    setError("");
    try {
      const res = await fetch("/api/admin/portal-accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetRow: a.portalSheetRow, action: "generateCode" }),
      });
      const data = await res.json() as { portalCode?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setAccounts((prev) => prev.map((x) => x.accountName === a.accountName
        ? { ...x, portalCode: data.portalCode ?? "" } : x));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoadingRow(null);
    }
  }

  async function handleSaveFields(a: MergedPortalAccount) {
    if (!a.portalSheetRow) return;
    setLoadingRow(a.accountName + "-save");
    setError("");
    try {
      const res = await fetch("/api/admin/portal-accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetRow: a.portalSheetRow,
          action: "updateFields",
          fields: {
            phone: editState.phone,
            nextScheduledService: editState.nextScheduledService,
            estimatedMonthlyTotal: editState.estimatedMonthlyTotal,
          },
        }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setAccounts((prev) => prev.map((x) => x.accountName === a.accountName
        ? { ...x, portalPhone: editState.phone, nextScheduledService: editState.nextScheduledService, estimatedMonthlyTotal: editState.estimatedMonthlyTotal }
        : x));
      setExpandedRow(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoadingRow(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Total Accounts</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{accounts.length}</p>
        </div>
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 shadow-sm">
          <p className="text-xs text-green-700">Portal Enabled</p>
          <p className="mt-1 text-2xl font-bold text-green-800">{enabledCount}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Not Enabled</p>
          <p className="mt-1 text-2xl font-bold text-gray-400">{accounts.length - enabledCount}</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search accounts…"
            className="w-56 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
          <div className="flex gap-2">
            {(["all", "enabled", "disabled"] as const).map((f) => (
              <button key={f} onClick={() => setAccessFilter(f)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition ${accessFilter === f ? "bg-blue-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {f === "all" ? "All Access" : f === "enabled" ? "Enabled" : "Not Enabled"}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {(["all", "active", "inactive"] as const).map((f) => (
              <button key={f} onClick={() => setStatusFilter(f)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition ${statusFilter === f ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {f === "all" ? "All Status" : f}
              </button>
            ))}
          </div>
          <span className="ml-auto text-xs text-gray-400">{filtered.length} of {accounts.length}</span>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-5 py-3">Account Name</th>
                <th className="px-5 py-3">Service Type</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Portal Code</th>
                <th className="px-5 py-3">Access</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((account, idx) => {
                const key = `${account.accountName}-${idx}`;
                const isExpanded = expandedRow === key;
                const rowLoading = loadingRow === account.accountName;
                const codeLoading = loadingRow === account.accountName + "-code";
                const saveLoading = loadingRow === account.accountName + "-save";
                const hasPortal = account.portalSheetRow !== null;
                const active = account.portalAccess === "YES";

                return (
                  <React.Fragment key={key}>
                    <tr className={`border-b last:border-0 ${isExpanded ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                      <td className="px-5 py-3 font-semibold text-gray-900">{account.accountName}</td>
                      <td className="px-5 py-3 text-gray-600">{account.serviceType || "—"}</td>
                      <td className="px-5 py-3"><StatusBadge status={account.accountStatus} /></td>
                      <td className="px-5 py-3">
                        {account.portalCode ? (
                          <span className="font-mono text-sm text-gray-800">
                            {account.portalCode}
                            <CopyButton text={account.portalCode} />
                          </span>
                        ) : <span className="text-gray-400 italic text-xs">no code</span>}
                      </td>
                      <td className="px-5 py-3">
                        {hasPortal ? (
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-green-500" : "bg-gray-400"}`} />
                            {active ? "Enabled" : "Disabled"}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 italic">not set up</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          {!hasPortal ? (
                            <button onClick={() => handleEnable(account)} disabled={rowLoading}
                              className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
                              {rowLoading ? "…" : "Enable"}
                            </button>
                          ) : (
                            <>
                              <button onClick={() => handleToggleAccess(account)} disabled={rowLoading}
                                className={`text-xs font-semibold hover:underline disabled:opacity-50 ${active ? "text-red-600" : "text-green-700"}`}>
                                {rowLoading ? "…" : active ? "Disable" : "Enable"}
                              </button>
                              <span className="text-gray-200">|</span>
                              <button onClick={() => openEdit(account)}
                                className="text-xs font-semibold text-blue-700 hover:underline">
                                {isExpanded ? "Close" : "Edit"}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Inline edit panel */}
                    {isExpanded && hasPortal && (
                      <tr className="border-b bg-blue-50">
                        <td colSpan={6} className="px-5 py-4">
                          <div className="rounded-xl border border-blue-200 bg-white p-4">
                            <p className="mb-4 text-xs font-bold uppercase tracking-wide text-blue-700">
                              Edit Portal Settings — {account.accountName}
                            </p>
                            <div className="grid gap-4 md:grid-cols-3">
                              <div>
                                <label className="mb-1 block text-xs font-semibold text-gray-500">Phone Number</label>
                                <input type="tel" value={editState.phone}
                                  onChange={(e) => setEditState((s) => ({ ...s, phone: e.target.value }))}
                                  placeholder={account.mainPhone || "(201) 555-1234"}
                                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-600" />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-semibold text-gray-500">Next Scheduled Service</label>
                                <input type="text" value={editState.nextScheduledService}
                                  onChange={(e) => setEditState((s) => ({ ...s, nextScheduledService: e.target.value }))}
                                  placeholder="e.g. 07/01/2026"
                                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-600" />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-semibold text-gray-500">Estimated Monthly Total</label>
                                <input type="text" value={editState.estimatedMonthlyTotal}
                                  onChange={(e) => setEditState((s) => ({ ...s, estimatedMonthlyTotal: e.target.value }))}
                                  placeholder="e.g. 1250.00"
                                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-600" />
                              </div>
                            </div>

                            {/* Portal Code row */}
                            <div className="mt-4 flex flex-wrap items-center gap-4">
                              <div>
                                <p className="text-xs font-semibold text-gray-500 mb-1">Portal Code</p>
                                <span className="font-mono text-sm text-gray-800 bg-gray-100 px-3 py-1.5 rounded-lg">
                                  {account.portalCode || "no code"}
                                </span>
                                {account.portalCode && <CopyButton text={account.portalCode} />}
                              </div>
                              <button onClick={() => handleGenerateCode(account)} disabled={codeLoading}
                                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                                {codeLoading ? "Generating…" : "Generate New Code"}
                              </button>
                              <p className="text-xs text-gray-400">Generating a new code will invalidate the old one.</p>
                            </div>

                            <div className="mt-4 flex gap-3">
                              <button onClick={() => handleSaveFields(account)} disabled={saveLoading}
                                className="rounded-lg bg-blue-700 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
                                {saveLoading ? "Saving…" : "Save Changes"}
                              </button>
                              <button onClick={() => setExpandedRow(null)}
                                className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                                Cancel
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="p-10 text-center text-sm text-gray-500">
              {search ? "No accounts match your search." : "No accounts found."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
