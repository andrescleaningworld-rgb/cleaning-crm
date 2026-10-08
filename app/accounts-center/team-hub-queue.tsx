"use client";

// Phase 6 (docs/team-hub-spec.md): staff queue — open Team Hub problems and
// supply orders across EVERY account, not just one (the Phase 4 admin UI on
// each account's own Team Hub tab is scoped to that one account). Reuses
// the existing per-issue/per-order admin actions
// (/api/admin/team-hub/issues, /api/admin/team-hub/supply-orders) — those
// already work by id regardless of which site/account the row belongs to.
// Crew Link rows (docs/crew-link-spec.md) share this one queue; they're
// tagged "Crew Link" and link to the account page instead of its Team Hub tab.
import Link from "next/link";
import { useEffect, useState } from "react";
import TranslatedText from "../components/TranslatedText";
import { formatCrewDateTime } from "@/lib/crewDateTime";
import { BigButton, Card, ErrorBox, Screen, SkeletonList, StatusPill } from "@/app/ui";

type QueueSource = "team-hub" | "crew-link";

function accountHref(accountId: string, source: QueueSource): string {
  const base = `/accounts/${encodeURIComponent(accountId)}`;
  return source === "crew-link" ? base : `${base}?tab=team-hub`;
}

function sourceLine(row: { source: QueueSource; siteLabel: string; crewName: string }): string {
  return row.source === "crew-link" ? "Crew Link" : `${row.siteLabel} · ${row.crewName}`;
}

type QueueIssue = {
  id: number;
  source: QueueSource;
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
  source: QueueSource;
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
  // Crew Link write-in ("Other supplies not on the list").
  otherItems: string | null;
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

  return (
    <Screen title="Crew Link" subtitle="Open problems and supply orders sent by the crews.">
      {error ? <ErrorBox title="That did not work." text={error} onRetry={() => void load()} /> : null}

      {loading ? (
        <SkeletonList rows={3} />
      ) : (
        <>
          <Card title={`Open Problems (${issues.length})`}>
            <div className="ui-stack">
              {issues.map((issue) => (
                <div key={issue.id} className="ui-stat">
                  <Link href={accountHref(issue.accountId, issue.source)} className="ui-table-rowlink">
                    {accountNames[issue.accountId] ?? issue.accountId}
                  </Link>
                  <p className="ui-muted">
                    {sourceLine(issue)} · {issue.category}
                    {issue.runId ? " · during a checklist run" : ""}
                  </p>
                  {issue.note && (
                    <p style={{ margin: "4px 0 0" }}>
                      <TranslatedText original={issue.note} english={issue.noteEnglish} language={issue.noteLanguage} />
                    </p>
                  )}
                  {issue.photos.length > 0 && (
                    <div className="ui-photos" style={{ marginTop: 8 }}>
                      {issue.photos.map((url) => (
                        // eslint-disable-next-line @next/next/no-img-element -- external Blob URLs, same pattern as the per-account Orders & Problems view
                        <img key={url} src={url} alt="Problem photo" style={{ width: 72, height: 72, borderRadius: 8, objectFit: "cover" }} />
                      ))}
                    </div>
                  )}
                  <p className="ui-muted">
                    {issue.workerFirstName ?? "Unknown"} · {formatCrewDateTime(issue.createdAt)}
                  </p>
                  <div className="ui-actions-row" style={{ marginTop: 8 }}>
                    <BigButton kind="second" onClick={() => void resolveIssue(issue.id)}>
                      Resolve
                    </BigButton>
                  </div>
                </div>
              ))}
              {issues.length === 0 && <p className="ui-muted">No open problems.</p>}
            </div>
          </Card>

          <Card title={`Open Supply Orders (${orders.length})`}>
            <div className="ui-stack">
              {orders.map((order) => (
                <div key={order.id} className="ui-stat">
                  <div className="ui-card-row">
                    <Link href={accountHref(order.accountId, order.source)} className="ui-table-rowlink">
                      {accountNames[order.accountId] ?? order.accountId}
                    </Link>
                    <StatusPill kind="waiting">{ORDER_STATUS_LABEL[order.status]}</StatusPill>
                  </div>
                  <p className="ui-muted">{sourceLine(order)}</p>
                  <ul className="ui-list-plain" style={{ marginTop: 4 }}>
                    {order.lines.map((line, i) => (
                      <li key={i}>
                        {line.qty} × {line.itemName} ({line.unit})
                      </li>
                    ))}
                  </ul>
                  {order.otherItems && (
                    <p style={{ margin: "4px 0 0" }}>
                      <span className="ui-strong">Other supplies:</span> {order.otherItems}
                    </p>
                  )}
                  {order.note && (
                    <p className="ui-muted" style={{ fontStyle: "italic" }}>
                      &quot;<TranslatedText original={order.note} english={order.noteEnglish} language={order.noteLanguage} />&quot;
                    </p>
                  )}
                  <p className="ui-muted">
                    {order.workerFirstName ?? "Unknown"} · {formatCrewDateTime(order.createdAt)}
                  </p>
                  <div className="ui-actions-row" style={{ marginTop: 8 }}>
                    {order.status === "new" && (
                      <BigButton kind="second" onClick={() => void advanceOrder(order.id, "ordered")}>
                        Mark Ordered
                      </BigButton>
                    )}
                    <BigButton kind="second" onClick={() => void advanceOrder(order.id, "delivered")}>
                      Mark Delivered
                    </BigButton>
                    <a href={`/crew-link/print/order/${order.id}`} target="_blank" rel="noopener" className="ui-btn ui-btn-second">
                      Print
                    </a>
                    <BigButton kind="quiet" onClick={() => void advanceOrder(order.id, "cancelled")}>
                      Cancel
                    </BigButton>
                  </div>
                </div>
              ))}
              {orders.length === 0 && <p className="ui-muted">No open supply orders.</p>}
            </div>
          </Card>
        </>
      )}
    </Screen>
  );
}
