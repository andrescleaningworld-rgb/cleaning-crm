"use client";

// "Check Markate now": runs the Markate import right away (the same check the
// 30-minute cron runs) and shows what it did in a popup: who was added, what
// was skipped and why, and any Markate error in plain words. Managers and the
// owner only; for anyone else it shows nothing. On the Pin Board's New accepted
// square and in Settings -> Markate. Server: app/api/markate/sync-now.

import { useCallback, useEffect, useState } from "react";
import { BigButton, Sheet, friendlyDate, showToast } from "@/app/ui";

type Line = { number: string; customerName: string };
type SkipLine = Line & { reason: string };
type Summary = { added: Line[]; skipped: SkipLine[]; error: string; partial: boolean; lastCheckedAt: string };
type Status = { connected: boolean; checking: boolean; lastCheckedAt: string; lastError: string };

/** "Today at 9:42 AM". */
const whenText = (value: string) => `${friendlyDate(value)} at ${new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
const lineText = (line: Line) => [line.customerName, line.number].filter(Boolean).join(" · ") || "An estimate";

export default function MarkateCheckNow({
  lookupId = "",
  onDone,
  compact = false,
}: {
  /** Settings only: one Markate estimate id to look up as well. */
  lookupId?: string;
  /** After a check that ran: added = how many came in; result = the full check (Settings shows its details). */
  onDone?: (added: number, result: unknown) => void;
  /** Smaller, for inside a Pin Board square. */
  compact?: boolean;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/markate/sync-now", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as Partial<Status> & { success?: boolean; ready?: boolean };
      if (!response.ok || data.success !== true || !data.ready) return setStatus(null);
      setStatus({ connected: data.connected === true, checking: data.checking === true, lastCheckedAt: data.lastCheckedAt ?? "", lastError: data.lastError ?? "" });
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function check() {
    setError("");
    setRunning(true);
    try {
      const response = await fetch("/api/markate/sync-now", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lookupId }) });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; summary?: Summary; result?: unknown };
      if (!response.ok || data.success !== true || !data.summary) {
        const why = data.error || "The Markate check failed. Try again.";
        setError(why);
        showToast(why);
        return;
      }
      setSummary(data.summary);
      onDone?.(data.summary.added.length, data.result);
    } catch {
      setError("Could not reach the app. Check the internet and try again.");
    } finally {
      setRunning(false);
      void loadStatus();
    }
  }

  // Not a manager or the owner, or Markate is not on this database: nothing to show.
  if (!status) return null;

  return (
    // A tap here never counts as a tap on the board square around it (that would open its Add form).
    <div
      onClick={(event) => event.stopPropagation()}
      style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: compact ? "stretch" : "flex-start", margin: compact ? "8px 0" : 0 }}
    >
      <BigButton kind="second" busy={running} busyLabel="Checking Markate…" disabled={running || !status.connected} onClick={() => void check()}>
        Check Markate now
      </BigButton>
      <span className="ui-muted" style={{ fontSize: compact ? 13 : undefined, color: compact ? "#ffffff" : undefined, textShadow: compact ? "0 1px 2px rgba(0,0,0,0.6)" : undefined }}>
        {!status.connected
          ? "Markate is not connected."
          : status.checking && !running
            ? "Checking now…"
            : status.lastCheckedAt
              ? `Last checked: ${whenText(status.lastCheckedAt)}`
              : "Last checked: never"}
      </span>
      {error && !compact ? <span className="ui-field-error">{error}</span> : null}

      <Sheet open={summary !== null} title="Markate checked" onClose={() => setSummary(null)} closeLabel="Close">
        {summary ? (
          <div className="ui-stack">
            {summary.error ? <p className="ui-field-error">{summary.error}</p> : null}
            <p className="ui-card-text ui-strong">
              {summary.added.length === 0 ? "No new accounts added." : `${summary.added.length} new account${summary.added.length === 1 ? "" : "s"} added`}
            </p>
            {summary.added.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {summary.added.map((line, index) => (
                  <li key={`${line.number}-${index}`}>{lineText(line)}</li>
                ))}
              </ul>
            ) : null}
            {summary.partial ? <p className="ui-muted">Markate was slow, so the check stopped partway. What it found is saved; tap Check Markate now again to go on.</p> : null}
            <p className="ui-card-text ui-strong">Skipped:</p>
            {summary.skipped.length === 0 ? (
              <p className="ui-muted">Nothing skipped.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {summary.skipped.map((line, index) => (
                  <li key={`${line.number}-${index}`}>
                    <strong>{lineText(line)}</strong>: {line.reason}
                  </li>
                ))}
              </ul>
            )}
            {summary.lastCheckedAt ? <p className="ui-muted">Checked {whenText(summary.lastCheckedAt)}.</p> : null}
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
