"use client";

// Accounts Center -> New accounts -> "From Markate": accepted commercial
// estimates with a recurring line item, waiting for the office. Start new
// account opens New Accepted Account filled from Markate; Skip takes it off
// the list (and off the Pin Board) for good. Shows nothing when none are
// waiting. Server: GET/POST /api/markate (lib/pg/markate.ts).

import { useCallback, useEffect, useState } from "react";
import { BigButton, ErrorBox, showToast } from "@/app/ui";

type Waiting = { id: string; estimateNumber: string; customerName: string; total: number; date: string; matchedItem: string; matchedWhy: string; urlPublic: string };

/** Tells the Accounts Center tab badge to count again. */
export const MARKATE_CHANGED = "cw:markate-changed";

const dollars = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function dayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** `reloadKey` changes when the New accounts board is pulled to refresh. */
export default function FromMarkate({ reloadKey }: { reloadKey: number }) {
  const [estimates, setEstimates] = useState<Waiting[]>([]);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/markate?list=1", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; estimates?: Waiting[] };
      if (!response.ok || !data.success) throw new Error("failed");
      setEstimates(data.estimates ?? []);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  // A Pin Board paper links here with #markate-<id>: bring that row into view once it is drawn.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash.startsWith("markate-")) document.getElementById(hash)?.scrollIntoView({ block: "center" });
  }, [estimates]);

  async function skip(estimate: Waiting) {
    setBusy(estimate.id);
    try {
      const response = await fetch("/api/markate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "skip", id: estimate.id }) });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || "That did not save. Try again.");
      setEstimates((current) => current.filter((row) => row.id !== estimate.id));
      window.dispatchEvent(new Event(MARKATE_CHANGED));
      showToast(`${estimate.customerName || "The estimate"} skipped.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "That did not save. Try again.", "bad");
      await load();
    } finally {
      setBusy("");
    }
  }

  if (failed) return <ErrorBox title="The Markate estimates did not load." onRetry={() => void load()} />;
  if (estimates.length === 0) return null;

  return (
    <section style={{ marginBottom: 24 }}>
      <h2 className="ui-section-title">From Markate ({estimates.length})</h2>
      <p className="ui-muted">Accepted commercial estimates with a recurring item. Start the account, or skip it.</p>
      <ul className="ui-acct-list">
        {estimates.map((estimate) => (
          <li key={estimate.id} id={`markate-${estimate.id}`} className="ui-acct">
            <span className="ui-acct-name">{estimate.customerName || "No name"}</span>
            <span className="ui-acct-line">
              <span className="ui-strong">{dollars(estimate.total)}</span>
              {estimate.date ? ` · ${dayLabel(estimate.date)}` : ""}
              {estimate.estimateNumber ? ` · ${estimate.estimateNumber}` : ""}
            </span>
            <span className="ui-acct-line">
              Recurring: {estimate.matchedItem}
              {estimate.matchedWhy === "per month" ? " (says per month)" : ""}
            </span>
            {estimate.urlPublic ? (
              <span className="ui-acct-line">
                <a href={estimate.urlPublic} target="_blank" rel="noopener noreferrer">
                  See the estimate
                </a>
              </span>
            ) : null}
            <span className="ui-actions-row" style={{ marginTop: 8 }}>
              <BigButton href={`/accounts/new-accepted?markate=${encodeURIComponent(estimate.id)}`} disabled={busy !== ""}>
                Start new account
              </BigButton>
              <BigButton kind="second" busy={busy === estimate.id} busyLabel="Skipping…" disabled={busy !== ""} onClick={() => void skip(estimate)}>
                Skip
              </BigButton>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
