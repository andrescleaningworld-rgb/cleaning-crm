"use client";

// The sub score alert on the staff screens: a red warning on the Accounts
// Center nav item (CWHeader) and a card at the top of Accounts Center. Tap
// it: who dropped below 6 and why, with "Got it" to clear each one.
// The rules are in lib/pg/sub-score-alerts.ts.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BigButton, Sheet, showToast } from "@/app/ui";

export type SubScoreAlert = {
  id: number;
  subcontractorId: string;
  subName: string;
  score: number;
  reasons: string[];
  baseline: boolean;
  emailed: boolean;
  createdAt: string;
};

const REFRESH_MS = 5 * 60_000;
/** Told to every copy of the list on the page when one of them changes it. */
const CHANGED_EVENT = "cw:sub-score-alerts";

/** The open alerts, asked for again every few minutes. `enabled` false (not staff) asks for nothing. */
export function useSubScoreAlerts(enabled: boolean) {
  const [alerts, setAlerts] = useState<SubScoreAlert[]>([]);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/sub-score-alerts", { cache: "no-store" });
      const data = (await response.json()) as { success?: boolean; alerts?: SubScoreAlert[] };
      if (response.ok && data.success === true) setAlerts(data.alerts ?? []);
    } catch {
      // Keep what is showing.
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // The list is set only after the answer arrives, never during the effect itself.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    const changed = (event: Event) => setAlerts((event as CustomEvent<SubScoreAlert[]>).detail ?? []);
    window.addEventListener(CHANGED_EVENT, changed);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(CHANGED_EVENT, changed);
    };
  }, [enabled, load]);

  return enabled ? alerts : [];
}

const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Who dropped below 6 and why, with "Got it" on each. */
export function SubScoreAlertsSheet({ open, alerts, onClose }: { open: boolean; alerts: SubScoreAlert[]; onClose: () => void }) {
  const [busy, setBusy] = useState(0);

  async function gotIt(alert: SubScoreAlert) {
    setBusy(alert.id);
    try {
      const response = await fetch("/api/sub-score-alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "acknowledge", id: alert.id }) });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; alerts?: SubScoreAlert[] };
      if (!response.ok || data.success !== true) throw new Error(data.error || "That did not save. Try again.");
      window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: data.alerts ?? [] }));
      showToast("Got it. The alert is cleared.");
      if ((data.alerts ?? []).length === 0) onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "That did not save. Try again.", "bad");
    } finally {
      setBusy(0);
    }
  }

  return (
    <Sheet open={open} title="Sub scores below 6" text="A score under 6 out of 10 needs a call. Tap Got it once you have dealt with it." onClose={onClose} closeLabel="Close" busy={busy !== 0}>
      {alerts.length === 0 ? <p className="ui-muted">No alerts. Every sub is at 6 or above.</p> : null}
      {alerts.map((alert) => (
        <article key={alert.id} className="ui-card ui-score-alert">
          <h3 className="ui-score-alert-name">
            {alert.subName} <span className="ui-score-alert-score">{alert.score} / 10</span>
          </h3>
          <p className="ui-muted">
            {alert.baseline ? `Already below 6 when alerts were turned on (${when(alert.createdAt)}). No email was sent to the sub.` : `Dropped below 6 on ${when(alert.createdAt)}. ${alert.emailed ? "The sub got an email." : "No email went to the sub (no email on file, or it failed)."}`}
          </p>
          <p className="ui-strong">Why</p>
          <ul className="ui-score-alert-why">
            {alert.reasons.map((reason, index) => (
              <li key={index}>{reason}</li>
            ))}
          </ul>
          <div className="ui-actions-row">
            <BigButton busy={busy === alert.id} busyLabel="Saving…" disabled={busy !== 0} onClick={() => void gotIt(alert)}>
              Got it
            </BigButton>
            <Link className="ui-btn ui-btn-second" href={`/subcontractors/${encodeURIComponent(alert.subcontractorId)}`} onClick={onClose}>
              Open the sub
            </Link>
          </div>
        </article>
      ))}
    </Sheet>
  );
}

/** The card at the top of Accounts Center. Nothing shows when there are no alerts. */
export function SubScoreAlertsCard() {
  const alerts = useSubScoreAlerts(true);
  const [open, setOpen] = useState(false);
  if (alerts.length === 0) return null;
  return (
    <>
      <button type="button" className="ui-score-alert-card" onClick={() => setOpen(true)}>
        <span className="ui-score-alert-icon" aria-hidden="true">
          !
        </span>
        <span>
          <strong>
            {alerts.length === 1 ? `${alerts[0].subName} is below 6` : `${alerts.length} subs are below 6`}
          </strong>
          <br />
          Tap to see who and why.
        </span>
      </button>
      <SubScoreAlertsSheet open={open} alerts={alerts} onClose={() => setOpen(false)} />
    </>
  );
}
