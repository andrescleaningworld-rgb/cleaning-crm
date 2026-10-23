"use client";

// One small card on the account page for the reminder features:
//   the "At risk" flag with its reason and the numbers behind it
//     (app/api/account-risk)
//   the price review: when the price last changed, "Time to review price",
//     Snooze 3 / 6 months with a reason, set the date (app/api/price-review).
//     Dates only: no money shows here.
// Staff only (the account page is). Nothing shows for an account that is not active.

import { useCallback, useEffect, useState } from "react";
import { BigButton, Card, Field, TextAreaField, showToast } from "@/app/ui";
import { RiskPill, RiskReason } from "@/app/components/account-risk";
import type { RiskFlag, RiskSignals } from "@/lib/accountRisk";
import { SNOOZE_MONTHS, agoText, type PriceReview, type SnoozeMonths } from "@/lib/priceReview";
import { easternToday, niceDay } from "@/lib/subInsurance";

type Flag = RiskFlag & { signals: RiskSignals };

function RiskPart({ accountId }: { accountId: string }) {
  const [flag, setFlag] = useState<Flag | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/account-risk?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { success?: boolean; flag?: Flag | null }) => alive && setFlag(data.success ? (data.flag ?? null) : null))
      .catch(() => alive && setFlag(null));
    return () => {
      alive = false;
    };
  }, [accountId]);
  if (!flag) return null;
  const s = flag.signals;
  return (
    <div className="ui-stack">
      <div className="ui-actions-row">
        <RiskPill flag={flag} />
        {flag.level === "green" ? <span className="ui-muted">Nothing to worry about.</span> : null}
      </div>
      <RiskReason flag={flag} />
      <p className="ui-muted">
        {s.complaints30} complaint{s.complaints30 === 1 ? "" : "s"} in 30 days ·{" "}
        {s.daysSinceVisit === null ? "no visit date" : s.noVisitYet ? `no visit yet (${s.daysSinceVisit} days)` : `last visit ${s.daysSinceVisit} days ago`} ·{" "}
        {s.subScore === null ? "no sub score" : `sub score ${s.subScore.toFixed(1)}`}
        {s.thumbsDown60 > 0 ? ` · ${s.thumbsDown60} 👎` : ""}
      </p>
    </div>
  );
}

type Review = PriceReview & { canSave: boolean };

const SOURCE_WORDS: Record<PriceReview["source"], string> = {
  history: "from History",
  manager: "set by a manager",
  start: "the start date: no change on record",
  none: "",
};

function PricePart({ accountId }: { accountId: string }) {
  const [review, setReview] = useState<Review | null>(null);
  const [mode, setMode] = useState<"" | "date" | SnoozeMonths>("");
  const [day, setDay] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const read = useCallback(
    () =>
      fetch(`/api/price-review?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" })
        .then((response) => response.json())
        .then((data: { success?: boolean; review?: Review | null }) => (data.success ? (data.review ?? null) : null))
        .catch(() => null),
    [accountId]
  );

  useEffect(() => {
    let alive = true;
    void read().then((next) => alive && setReview(next));
    return () => {
      alive = false;
    };
  }, [read]);

  if (!review) return null;
  const today = easternToday();

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/price-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId, ...body }) });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; review?: Review | null };
      if (!data.success) throw new Error(data.error || "That did not save. Try again.");
      setReview(data.review ?? null);
      setMode("");
      setReason("");
      showToast("Saved ✓");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ui-stack" style={{ borderTop: "1px solid #dbeafe", paddingTop: 12 }}>
      <p className="ui-strong">💲 Price review</p>
      {review.lastChangeOn ? (
        <p className="ui-card-text">
          Last price change: {niceDay(review.lastChangeOn)} · {agoText(review.lastChangeOn, today)}
          {SOURCE_WORDS[review.source] ? <span className="ui-muted"> ({SOURCE_WORDS[review.source]})</span> : null}
        </p>
      ) : (
        <p className="ui-card-text">We do not know when the price last changed.</p>
      )}
      {review.due ? <p className="ui-acct-wrong">Time to review price</p> : null}
      {review.snoozedUntil ? (
        <p className="ui-muted">
          Snoozed until {niceDay(review.snoozedUntil)}: {review.snoozeReason}
        </p>
      ) : null}
      {!review.due && review.dueOn && !review.snoozedUntil ? <p className="ui-muted">Next review: {niceDay(review.dueOn)}</p> : null}

      {!review.canSave ? (
        <p className="ui-muted">Snooze and setting the date work once the update for them (migration 058) is installed.</p>
      ) : mode === "date" ? (
        <div className="ui-stack">
          <Field label="The price last changed on" type="date" value={day} onChange={(event) => setDay(event.target.value)} />
          <div className="ui-actions-row">
            <BigButton busy={busy} busyLabel="Saving…" disabled={!day} onClick={() => void send({ action: "setDate", day })}>
              Save
            </BigButton>
            <BigButton kind="second" onClick={() => setMode("")} disabled={busy}>
              Cancel
            </BigButton>
          </div>
        </div>
      ) : mode ? (
        <div className="ui-stack">
          <TextAreaField label={`Why snooze ${mode} months? It goes in History.`} rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
          <div className="ui-actions-row">
            <BigButton busy={busy} busyLabel="Saving…" disabled={!reason.trim()} onClick={() => void send({ action: "snooze", months: mode, reason })}>
              Snooze {mode} months
            </BigButton>
            <BigButton kind="second" onClick={() => setMode("")} disabled={busy}>
              Cancel
            </BigButton>
          </div>
        </div>
      ) : (
        <div className="ui-actions-row">
          {review.due
            ? SNOOZE_MONTHS.map((months) => (
                <BigButton key={months} kind="second" onClick={() => setMode(months)}>
                  Snooze {months} months
                </BigButton>
              ))
            : null}
          <BigButton kind="second" onClick={() => setMode("date")}>
            Set the date
          </BigButton>
        </div>
      )}
      {error ? <p className="ui-field-error">{error}</p> : null}
    </div>
  );
}

export default function AccountSignals({ accountId, active }: { accountId: string; active: boolean }) {
  if (!accountId || !active) return null;
  return (
    <Card title="How this account is doing">
      <div className="ui-stack">
        <RiskPart accountId={accountId} />
        <PricePart accountId={accountId} />
      </div>
    </Card>
  );
}
