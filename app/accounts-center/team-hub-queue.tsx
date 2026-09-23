"use client";

// Phase 6 (docs/team-hub-spec.md): staff queue — open Team Hub problems and
// supply orders across EVERY account, not just one (the Phase 4 admin UI on
// each account's own Team Hub tab is scoped to that one account). Reuses
// the existing per-issue/per-order admin actions
// (/api/admin/team-hub/issues, /api/admin/team-hub/supply-orders) — those
// already work by id regardless of which site/account the row belongs to.
import Link from "next/link";
import { useEffect, useState } from "react";
import TranslatedText from "../components/TranslatedText";

type QueueIssue = {
  id: number;
  accountId: string;
  siteLabel: string;
  crewName: string;
  category: string;
  note: string;
  noteEnglish: string | null;
  noteLanguage: string | null;
  runId: number | null;
  workerFirstName: string | null;
  createdAt: string;
  photos: string[];
};

type QueueOrder = {
  id: number;
  accountId: string;
  siteLabel: string;
  crewName: string;
  status: "new" | "ordered" | "delivered" | "cancelled";
  note: string;
  noteEnglish: string | null;
  noteLanguage: string | null;
  workerFirstName: string | null;
  createdAt: string;
  lines: { itemName: string; unit: string; qty: number }[];
};

const ORDER_STATUS_LABEL: Record<QueueOrder["status"], string> = { new: "Sent", ordered: "Ordered", delivered: "Delivered", cancelled: "Cancelled" };

export default function TeamHubStaffQueue() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [issues, setIssues] = useState<QueueIssue[]>([]);
  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [accountNames, setAccountNames] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/team-hub/queue", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to load the Team Hub queue.");
      setIssues(data.issues ?? []);
      setOrders(data.orders ?? []);
      setAccountNames(data.accountNamesById ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the Team Hub queue.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function resolveIssue(id: number) {
    try {
      const res = await fetch("/api/admin/team-hub/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setStatus", id, status: "resolved" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve problem.");
    }
  }

  async function advanceOrder(id: number, status: QueueOrder["status"]) {
    try {
      const res = await fetch("/api/admin/team-hub/supply-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setStatus", id, status }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update order.");
    }
  }

  if (loading) return <p className="p-6 text-sm text-gray-500">Loading Team Hub queue...</p>;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900">Open Problems ({issues.length})</h2>
        <div className="mt-3 space-y-3">
          {issues.map((issue) => (
            <div key={issue.id} className="rounded-lg border border-gray-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/accounts/${issue.accountId}?tab=team-hub`} className="font-bold text-blue-700 hover:underline">
                    {accountNames[issue.accountId] ?? issue.accountId}
                  </Link>
                  <p className="text-sm text-gray-500">
                    {issue.siteLabel} · {issue.crewName} · {issue.category}
                    {issue.runId ? " · during a checklist run" : ""}
                  </p>
                  {issue.note && (
                    <p className="mt-1 text-sm text-gray-700">
                      <TranslatedText original={issue.note} english={issue.noteEnglish} language={issue.noteLanguage} />
                    </p>
                  )}
                  {issue.photos.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {issue.photos.map((url) => (
                        // eslint-disable-next-line @next/next/no-img-element -- external Blob URLs, same pattern as the per-account Orders & Problems view
                        <img key={url} src={url} alt="Problem photo" className="h-16 w-16 rounded object-cover" />
                      ))}
                    </div>
                  )}
                  <p className="mt-1 text-xs text-gray-400">{new Date(issue.createdAt).toLocaleString()}{issue.workerFirstName ? ` · reported by ${issue.workerFirstName}` : ""}</p>
                </div>
                <button type="button" onClick={() => resolveIssue(issue.id)} className="shrink-0 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800">
                  Resolve
                </button>
              </div>
            </div>
          ))}
          {issues.length === 0 && <p className="text-sm text-gray-500">No open problems.</p>}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900">Open Supply Orders ({orders.length})</h2>
        <div className="mt-3 space-y-3">
          {orders.map((order) => (
            <div key={order.id} className="rounded-lg border border-gray-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/accounts/${order.accountId}?tab=team-hub`} className="font-bold text-blue-700 hover:underline">
                    {accountNames[order.accountId] ?? order.accountId}
                  </Link>
                  <p className="text-sm text-gray-500">{order.siteLabel} · {order.crewName} · {ORDER_STATUS_LABEL[order.status]}</p>
                  <ul className="mt-1 text-sm text-gray-700">
                    {order.lines.map((line, i) => (
                      <li key={i}>{line.qty} × {line.itemName} ({line.unit})</li>
                    ))}
                  </ul>
                  {order.note && (
                    <p className="mt-1 text-sm italic text-gray-500">
                      &quot;<TranslatedText original={order.note} english={order.noteEnglish} language={order.noteLanguage} />&quot;
                    </p>
                  )}
                  <p className="mt-1 text-xs text-gray-400">{new Date(order.createdAt).toLocaleString()}{order.workerFirstName ? ` · by ${order.workerFirstName}` : ""}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {order.status === "new" && (
                    <button type="button" onClick={() => advanceOrder(order.id, "ordered")} className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800">
                      Mark Ordered
                    </button>
                  )}
                  <button type="button" onClick={() => advanceOrder(order.id, "delivered")} className="rounded-lg bg-green-700 px-3 py-2 text-sm font-semibold text-white hover:bg-green-800">
                    Mark Delivered
                  </button>
                  <button type="button" onClick={() => advanceOrder(order.id, "cancelled")} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ))}
          {orders.length === 0 && <p className="text-sm text-gray-500">No open supply orders.</p>}
        </div>
      </section>
    </div>
  );
}
