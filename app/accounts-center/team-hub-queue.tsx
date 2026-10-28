"use client";

// Phase 6 (docs/team-hub-spec.md): staff queue — open problems the crews
// sent, across EVERY account. Reuses the per-issue admin action
// (/api/admin/team-hub/issues). Crew Link rows (docs/crew-link-spec.md) share
// this one queue; they're tagged "Crew Link" and link to the account page.
// Supply orders are not here: every order is in the one Supply Orders inbox
// (lib/pg/shelves.ts), and this queue links there.
import Link from "next/link";
import { useEffect, useState } from "react";
import TranslatedText from "../components/TranslatedText";
import { formatCrewDateTime } from "@/lib/crewDateTime";
import { BigButton, Card, ErrorBox, Screen, SkeletonList } from "@/app/ui";
import CrewSkips from "./crew-skips";

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

export default function TeamHubStaffQueue() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [issues, setIssues] = useState<QueueIssue[]>([]);
  const [openOrders, setOpenOrders] = useState(0);
  const [accountNames, setAccountNames] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/team-hub/queue", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to load the Team Hub queue.");
      setIssues(data.issues ?? []);
      setOpenOrders(Array.isArray(data.orders) ? data.orders.length : 0);
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

  return (
    <Screen title="Crew Link" subtitle="What the crews could not do, and open problems they sent. Their supply orders are in Supply Orders.">
      <CrewSkips />
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

          <Card title="Supply orders">
            <p className="ui-muted">Every supply order, from crews, subs and managers, is approved and filled in Supply Orders.</p>
            <BigButton href="/supply-orders">{openOrders > 0 ? `Supply Orders (${openOrders} from crews)` : "Supply Orders"}</BigButton>
          </Card>
        </>
      )}
    </Screen>
  );
}
