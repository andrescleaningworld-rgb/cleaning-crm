"use client";

// Phase 6 (docs/team-hub-spec.md): Sub Center's read-only list of open
// Team Hub problems/orders for a sub's own accounts. Deliberately
// read-only — no status-change actions here; that stays on the staff-only
// Accounts Center Team Hub tab and each account's own Team Hub tab.
import { useEffect, useState } from "react";
import TranslatedText from "../components/TranslatedText";

type SubWithOpenItems = { subId: string; name: string };

type QueueIssue = {
  id: number;
  accountId: string;
  siteLabel: string;
  crewName: string;
  category: string;
  note: string;
  noteEnglish: string | null;
  noteLanguage: string | null;
  createdAt: string;
};
type QueueOrder = { id: number; accountId: string; siteLabel: string; crewName: string; status: string; createdAt: string; lines: { itemName: string; unit: string; qty: number }[] };

function SubOpenItems({ subId, accountNames }: { subId: string; accountNames: Record<string, string> }) {
  const [loading, setLoading] = useState(true);
  const [issues, setIssues] = useState<QueueIssue[]>([]);
  const [orders, setOrders] = useState<QueueOrder[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/team-hub/queue?subId=${encodeURIComponent(subId)}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setIssues(data.issues ?? []);
        setOrders(data.orders ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [subId]);

  if (loading) return <p className="p-3 text-sm text-gray-500">Loading...</p>;

  return (
    <div className="space-y-2 border-t border-gray-100 p-3">
      {issues.map((issue) => (
        <div key={`issue-${issue.id}`} className="text-sm text-gray-700">
          <span className="font-semibold">{accountNames[issue.accountId] ?? issue.accountId}</span> — {issue.siteLabel} · {issue.category}
          {issue.note ? (
            <>
              {": "}
              <TranslatedText original={issue.note} english={issue.noteEnglish} language={issue.noteLanguage} />
            </>
          ) : (
            ""
          )}
        </div>
      ))}
      {orders.map((order) => (
        <div key={`order-${order.id}`} className="text-sm text-gray-700">
          <span className="font-semibold">{accountNames[order.accountId] ?? order.accountId}</span> — {order.siteLabel} · order ({order.lines.length} item{order.lines.length === 1 ? "" : "s"})
        </div>
      ))}
      {issues.length === 0 && orders.length === 0 && <p className="text-sm text-gray-500">Nothing open.</p>}
    </div>
  );
}

export default function SubCenterTeamHub() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [subs, setSubs] = useState<SubWithOpenItems[]>([]);
  const [accountNames, setAccountNames] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/admin/team-hub/subs-with-open-items", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || "Failed to load.");
        if (!cancelled) setSubs(data.subs ?? []);

        // Account names come from the (unscoped) queue response so this
        // page doesn't need its own account-lookup route.
        const queueRes = await fetch("/api/admin/team-hub/queue", { cache: "no-store" });
        const queueData = await queueRes.json();
        if (!cancelled) setAccountNames(queueData.accountNamesById ?? {});
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <p className="p-6 text-sm text-gray-500">Loading...</p>;

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <h2 className="text-xl font-bold text-gray-900">Team Hub — open items by sub</h2>
      <p className="mt-1 text-sm text-gray-600">Read-only. Manage status from Accounts Center → Team Hub or the account&apos;s own Team Hub tab.</p>

      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

      <div className="mt-4 divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white shadow-sm">
        {subs.map((sub) => (
          <div key={sub.subId}>
            <button
              type="button"
              onClick={() => setExpanded((current) => (current === sub.subId ? null : sub.subId))}
              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
            >
              <span className="font-semibold text-gray-900">{sub.name}</span>
              <span className="text-sm text-blue-700">{expanded === sub.subId ? "Hide" : "Show"}</span>
            </button>
            {expanded === sub.subId && <SubOpenItems subId={sub.subId} accountNames={accountNames} />}
          </div>
        ))}
        {subs.length === 0 && <p className="p-6 text-center text-sm text-gray-500">No subs with open Team Hub items.</p>}
      </div>
    </div>
  );
}
