"use client";

// "Upsells" on the Sales page: the monthly price increases from Price &
// frequency changes (account page; migration 072), before tax. Counted on
// their own: not new accounts, not extra jobs, and not commission sales
// (a commission is still added as a sale, e.g. "Recurring Increase").
// Follows the page's year / quarter (or year to date) by effective date.

import { useEffect, useMemo, useState } from "react";
import AccountLink from "../components/AccountLink";
import { periodRange } from "@/lib/salesCommission";

type Change = {
  id: number;
  accountId: string;
  accountName: string;
  effectiveDate: string;
  oldPrice: number | null;
  newPrice: number | null;
  monthlyDifference: number;
  oldFrequency: string;
  newFrequency: string;
  createdBy: string;
};

/** The page's year / quarter (or year to date) as days, the same range the commission totals use. No year = every date. */
function range(year: string, quarter: string): [string, string] {
  const [from, to] = periodRange(year, quarter);
  return [from || "2000-01-01", to || "2099-12-31"];
}

const money = (value: number | null) => (value === null ? "—" : value.toLocaleString("en-US", { style: "currency", currency: "USD" }));
const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${money(Math.abs(value))}`;

export default function UpsellsCard({ year, quarter, accountId = "" }: { year: string; quarter: string; accountId?: string }) {
  const [from, to] = range(year, quarter);
  const [result, setResult] = useState<{ key: string; ready: boolean; changes: Change[] } | null>(null);
  const key = `${from}|${to}`;

  useEffect(() => {
    let alive = true;
    fetch(`/api/accounts/price-changes?from=${from}&to=${to}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { success?: boolean; ready?: boolean; changes?: Change[] }) => {
        if (alive && data.success) setResult({ key: `${from}|${to}`, ready: data.ready === true, changes: data.changes ?? [] });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [from, to]);

  const changes = useMemo(
    () => (result && result.key === key ? result.changes : []).filter((change) => !accountId || change.accountId === accountId),
    [result, key, accountId]
  );
  // Increases only: a price that went down is listed but not counted as upsell revenue.
  const upsell = changes.reduce((sum, change) => sum + Math.max(0, change.monthlyDifference), 0);
  const loading = !result || result.key !== key;

  return (
    <section className="ui-card print:shadow-none" style={{ marginBottom: 24 }}>
      <div className="mb-4">
        <h2 className="ui-card-title">Upsells (price &amp; frequency changes)</h2>
        <p className="ui-muted print:hidden">
          Monthly price increases on existing accounts, before tax, by effective date. Separate from new accounts, extra jobs and the commission sales above.
        </p>
      </div>
      {loading ? (
        <p className="ui-muted">Loading…</p>
      ) : !result.ready ? (
        <p className="ui-muted">Starts once the database update (migration 072) has run.</p>
      ) : (
        <>
          <div className="ui-stats">
            <div className="ui-stat">
              <p className="ui-stat-label">Upsell revenue</p>
              <p className="ui-stat-value">{signed(upsell)}</p>
              <p className="ui-muted">a month</p>
            </div>
            <div className="ui-stat">
              <p className="ui-stat-label">Changes</p>
              <p className="ui-stat-value">{changes.length}</p>
            </div>
          </div>
          {changes.length === 0 ? (
            <p className="ui-muted">No price &amp; frequency changes in these dates.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="ui-table w-full print:text-xs">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-600">
                    <th className="px-4 py-3 font-semibold">Effective</th>
                    <th className="px-4 py-3 font-semibold">Account</th>
                    <th className="px-4 py-3 font-semibold">Price (before tax)</th>
                    <th className="px-4 py-3 font-semibold">Monthly change</th>
                    <th className="px-4 py-3 font-semibold">Frequency</th>
                    <th className="px-4 py-3 font-semibold">Saved by</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((change) => (
                    <tr key={change.id} className="border-b">
                      <td className="px-4 py-3 text-gray-700">{change.effectiveDate}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">
                        <AccountLink accountId={change.accountId} name={change.accountName} />
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {money(change.oldPrice)} → {money(change.newPrice)}
                      </td>
                      <td className="px-4 py-3 font-bold text-gray-900">{signed(change.monthlyDifference)}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {change.oldFrequency === change.newFrequency ? change.newFrequency || "—" : `${change.oldFrequency || "—"} → ${change.newFrequency || "—"}`}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{change.createdBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
