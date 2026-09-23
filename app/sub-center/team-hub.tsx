"use client";

// Phase 6 (docs/team-hub-spec.md): Sub Center's read-only list of the Team
// Hub sites each sub's crews work (with open problem/order counts, and the
// open items themselves one tap away). Deliberately
// read-only — no status-change actions here; that stays on the staff-only
// Accounts Center Team Hub tab and each account's own Team Hub tab.
import { useEffect, useState } from "react";
import TranslatedText from "../components/TranslatedText";

type SubSite = {
  siteId: number;
  accountId: string;
  accountName: string;
  siteLabel: string;
  siteActive: boolean;
  crews: { id: number; name: string; crewType: string; active: boolean }[];
  openProblems: number;
  openOrders: number;
};
type SubWithSites = { subId: string; name: string; sites: SubSite[] };

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
  const [subs, setSubs] = useState<SubWithSites[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/admin/team-hub/sub-sites", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || "Failed to load.");
        if (!cancelled) setSubs(data.subs ?? []);
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
      <h2 className="text-xl font-bold text-gray-900">Team Hub — sites by sub</h2>
      <p className="mt-1 text-sm text-gray-600">
        Read-only. Every Team Hub site each sub&apos;s crews work. Manage status from Accounts Center → Team Hub or the account&apos;s own
        Team Hub tab.
      </p>

      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

      <div className="mt-4 space-y-4">
        {subs.map((sub) => {
          const accountNames = Object.fromEntries(sub.sites.map((s) => [s.accountId, s.accountName]));
          const openTotal = sub.sites.reduce((sum, s) => sum + s.openProblems + s.openOrders, 0);
          return (
            <div key={sub.subId} className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="font-semibold text-gray-900">{sub.name}</span>
                <span className="text-sm text-gray-500">
                  {sub.sites.length} site{sub.sites.length === 1 ? "" : "s"}
                </span>
              </div>
              <ul className="divide-y divide-gray-100 border-t border-gray-100">
                {sub.sites.map((site) => (
                  <li key={site.siteId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                    <div>
                      <span className="font-semibold text-gray-900">{site.accountName}</span>
                      {site.siteLabel && site.siteLabel !== site.accountName && <span className="text-gray-500"> · {site.siteLabel}</span>}
                      <p className="text-xs text-gray-500">
                        {site.crews.map((c) => `${c.name}${c.active ? "" : " (inactive)"}`).join(", ")}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                      {!site.siteActive && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">Team Hub off</span>}
                      {site.openProblems > 0 && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-800">
                          {site.openProblems} open problem{site.openProblems === 1 ? "" : "s"}
                        </span>
                      )}
                      {site.openOrders > 0 && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                          {site.openOrders} open order{site.openOrders === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {openTotal > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setExpanded((current) => (current === sub.subId ? null : sub.subId))}
                    className="w-full border-t border-gray-100 px-4 py-2 text-left text-sm font-semibold text-blue-700 hover:bg-gray-50"
                  >
                    {expanded === sub.subId ? "Hide open items" : "Show open items"}
                  </button>
                  {expanded === sub.subId && <SubOpenItems subId={sub.subId} accountNames={accountNames} />}
                </>
              )}
            </div>
          );
        })}
        {subs.length === 0 && <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">No sub crews on Team Hub yet.</p>}
      </div>
    </div>
  );
}
