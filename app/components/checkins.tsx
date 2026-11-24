"use client";

// Customer check-ins, the shared staff pieces (app/api/customer-checkin):
//   CheckinSendSheet   before any send: the email as the customer will see
//                      it, how many go out today / wait in the queue, and
//                      every account skipped with the reason. Then Send.
//   CheckinEmailSheet  "View email": the saved copy of what was sent. Shown
//                      in a sandboxed frame: its buttons do nothing here, so
//                      nobody answers for the customer by mistake.
//   CheckinAnswer      😀 Great / 😐 OK / 😟 Needs attention (the first answer:
//                      final), every note with its time, the best way to
//                      reach them, photos, and (history) CheckinHistory:
//                      every tap and note, with the time.
//   CheckinProgress    Sent → 👁 Viewed → ✅ / ⚠️ Responded, the time on hover.
// Used by the account page (app/accounts/[id]/checkins.tsx) and the
// Check-ins page (app/check-ins).

import Image from "next/image";
import { useEffect, useState } from "react";
import { BigButton, ErrorBox, Sheet, StatusPill, showToast, type StatusKind } from "@/app/ui";
import {
  CHECKIN_DAILY_LIMIT,
  CHECKIN_STATUS_TEXT,
  CHECKIN_VIEWED_NOTE,
  ratingOf,
  ratingText,
  type CheckinBatchKind,
  type CheckinEvent,
  type CheckinRow,
  type CheckinSkip,
  type CheckinStatus,
} from "@/lib/customerCheckin";

type Preview = {
  willSend: { accountId: string; accountName: string; email: string }[];
  skipped: CheckinSkip[];
  todayLeft: number;
  alreadyQueued: number;
  sample: { accountName: string; to: string; subject: string; html: string } | null;
};

type SendResult = { batchId: number; queued: number; sent: number; failed: number; skipped: number; stillQueued: number };

export function checkinStatusKind(status: CheckinStatus): StatusKind {
  if (status === "sent") return "done";
  if (status === "queued") return "waiting";
  if (status === "failed") return "needs-you";
  return "off";
}

/** "Nov 16, 2026, 2:05 PM" in New York. */
export function whenText(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** The reasons, counted: "Open complaint: 3 · No valid email: 2". */
function reasonCounts(skipped: CheckinSkip[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const skip of skipped) {
    const key = skip.reason.startsWith("Check-in in the last") ? "Check-in in the last 30 days" : skip.reason;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export function CheckinSendSheet({
  open,
  accountIds,
  kind,
  listId,
  listName,
  onClose,
  onSent,
}: {
  open: boolean;
  accountIds: string[];
  kind: CheckinBatchKind;
  listId?: number | null;
  listName?: string;
  onClose: () => void;
  onSent: (result: SendResult) => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [showSkipped, setShowSkipped] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void (async () => {
      setPreview(null);
      setError("");
      setShowSkipped(false);
      try {
        const response = await fetch("/api/customer-checkin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "preview", accountIds }),
        });
        const data = (await response.json()) as { success?: boolean; error?: string } & Preview;
        if (!alive) return;
        if (!response.ok || !data.success) setError(data.error || "The preview did not load.");
        else setPreview(data);
      } catch {
        if (alive) setError("The preview did not load.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, accountIds]);

  async function send() {
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/customer-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", accountIds, kind, listId: listId ?? null, listName: listName ?? "" }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string } & SendResult;
      if (!response.ok || !data.success) {
        setError(data.error || "Nothing was sent.");
        return;
      }
      const waiting = data.queued - data.sent - data.failed;
      showToast(
        [`Sent ${data.sent}`, waiting > 0 ? `${waiting} queued for the next days` : "", data.failed ? `${data.failed} failed` : "", data.skipped ? `${data.skipped} skipped` : ""]
          .filter(Boolean)
          .join(" · "),
        data.failed ? "bad" : undefined
      );
      onSent(data);
    } catch {
      setError("Nothing was sent. Check the connection and try again.");
    } finally {
      setSending(false);
    }
  }

  const count = preview?.willSend.length ?? 0;
  // What is already queued goes first.
  const today = preview ? Math.max(0, Math.min(count, preview.todayLeft - preview.alreadyQueued)) : 0;
  const later = count - today;

  return (
    <Sheet
      open={open}
      title="Send check-in"
      onClose={onClose}
      busy={sending}
      actions={
        <BigButton busy={sending} busyLabel="Sending…" disabled={!preview || count === 0} onClick={() => void send()}>
          {count === 1 ? "Send 1 check-in" : `Send ${count} check-ins`}
        </BigButton>
      }
    >
      {error ? <ErrorBox title="Not sent" text={error} /> : null}
      {!preview && !error ? <p className="ui-muted">Getting the preview…</p> : null}
      {preview ? (
        <div className="ui-stack">
          <p className="ui-strong" role="status">
            {count} will get it{preview.skipped.length ? ` · ${preview.skipped.length} skipped` : ""}
          </p>
          {count > 0 ? (
            <p className="ui-muted">
              {later > 0
                ? `${today} go out now. ${later} wait in the queue and go by themselves over the next days (${CHECKIN_DAILY_LIMIT} a day).`
                : count === 1
                  ? "It goes out now."
                  : "They all go out now."}
              {preview.alreadyQueued > 0 ? ` ${preview.alreadyQueued} from an earlier send are still waiting and go first.` : ""}
            </p>
          ) : null}
          {preview.skipped.length ? (
            <div className="ui-stack">
              <ul className="ui-card-text" style={{ margin: 0, paddingLeft: 18 }}>
                {reasonCounts(preview.skipped).map(([reason, n]) => (
                  <li key={reason}>
                    {reason}: {n}
                  </li>
                ))}
              </ul>
              <div>
                <BigButton kind="quiet" onClick={() => setShowSkipped((v) => !v)}>
                  {showSkipped ? "Hide skipped accounts" : "Show skipped accounts"}
                </BigButton>
              </div>
              {showSkipped ? (
                <ul className="ui-card-text" style={{ margin: 0, paddingLeft: 18, maxHeight: 220, overflow: "auto" }}>
                  {preview.skipped.map((skip) => (
                    <li key={skip.accountId}>
                      <span className="ui-strong">{skip.accountName}</span> — {skip.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {preview.sample ? (
            <>
              <p className="ui-muted">
                Preview for {preview.sample.accountName} (to {preview.sample.to}). Subject: {preview.sample.subject}
              </p>
              <iframe
                title="Check-in email preview"
                srcDoc={preview.sample.html}
                sandbox=""
                style={{ width: "100%", height: 460, border: "1px solid #cbd5e1", borderRadius: 12, background: "#ffffff" }}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}

export function CheckinEmailSheet({ checkinId, onClose }: { checkinId: number | null; onClose: () => void }) {
  const [copy, setCopy] = useState<{ subject: string; html: string; sentTo: string; sentAt: string } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!checkinId) return;
    let alive = true;
    void (async () => {
      setCopy(null);
      setError("");
      try {
        const response = await fetch(`/api/customer-checkin?copy=${checkinId}`, { cache: "no-store" });
        const data = (await response.json()) as { success?: boolean; error?: string; subject: string; html: string; sentTo: string; sentAt: string };
        if (!alive) return;
        if (!response.ok || !data.success) setError(data.error || "The email did not load.");
        else setCopy(data);
      } catch {
        if (alive) setError("The email did not load.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [checkinId]);
  return (
    <Sheet open={checkinId !== null} title="Check-in email" onClose={onClose}>
      {error ? <ErrorBox title="Not shown" text={error} /> : null}
      {copy ? (
        <div className="ui-stack">
          <p className="ui-muted">
            Sent to {copy.sentTo} · {whenText(copy.sentAt)}
            <br />
            Subject: {copy.subject}
          </p>
          <p className="ui-muted">This is exactly what the customer got. The buttons do nothing here.</p>
          <iframe title="Check-in email that was sent" srcDoc={copy.html} sandbox="" style={{ width: "100%", height: 480, border: "1px solid #cbd5e1", borderRadius: 12, background: "#ffffff" }} />
        </div>
      ) : !error ? (
        <p className="ui-muted">Loading…</p>
      ) : null}
    </Sheet>
  );
}

const RATING_KIND: Record<string, StatusKind> = { great: "done", ok: "waiting", attention: "needs-you" };

/** One line of a check-in's history, in plain words. */
function eventText(event: CheckinEvent, saved: string): string {
  const tapped = event.rating ? ratingText(event.rating) : "";
  if (event.kind === "answer") return `Answered ${tapped} (saved: the first answer is final)`;
  if (event.kind === "repeat") return event.rating === ratingOf(saved) ? `Tapped ${tapped} again (no change)` : `Tapped ${tapped}: not saved, the answer stays ${ratingText(saved)}`;
  if (event.kind === "stop") return "Stopped these emails";
  if (event.kind === "ignored") return `${tapped ? `Tapped ${tapped}` : "A tap"}: ignored (${event.note})`;
  if (event.kind === "earlier") return event.note;
  if (event.kind === "staff") return `Staff: ${event.note}`;
  const parts = [event.note ? "Sent a note" : "", event.photos ? `${event.photos} photo${event.photos === 1 ? "" : "s"}` : "", event.reach ? `best way to reach: ${event.reach}` : ""].filter(Boolean);
  return parts.join(" · ") || "Sent the feedback box";
}

/**
 * Every tap and note on one check-in, oldest first (migration 093). Taps the
 * browser marked as a bot or an email scanner say so.
 */
export function CheckinHistory({ row }: { row: Pick<CheckinRow, "answer" | "events"> }) {
  const events = row.events ?? [];
  if (events.length === 0) return null;
  return (
    <details open={events.length <= 6}>
      <summary className="ui-muted" style={{ cursor: "pointer" }}>
        History ({events.length})
      </summary>
      <ul className="ui-card-text" style={{ margin: "4px 0 0", paddingLeft: 18 }}>
        {events.map((event, index) => (
          <li key={`${event.at}-${index}`}>
            <span className="ui-muted">{whenText(event.at)}</span> — {eventText(event, row.answer)}
            {event.scanner ? <span className="ui-muted"> · scanner, not a person</span> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** The answer as a pill, then every note (with its time when kept), and the photos. history = the list of every tap too. */
export function CheckinAnswer({
  row,
  compact = false,
  history = false,
}: {
  row: Pick<CheckinRow, "answer" | "answeredAt" | "comment" | "photos"> & { reach?: string; events?: CheckinEvent[] };
  compact?: boolean;
  history?: boolean;
}) {
  const rating = ratingOf(row.answer);
  const notes = (row.events ?? []).filter((event) => event.kind === "note" && event.note);
  if (!rating) {
    return (
      <div className="ui-stack" style={{ gap: 4 }}>
        <span className="ui-muted">No answer yet</span>
        {history ? <CheckinHistory row={row} /> : null}
      </div>
    );
  }
  return (
    <div className="ui-stack" style={{ gap: 4 }}>
      <div>
        <StatusPill kind={RATING_KIND[rating]}>{ratingText(row.answer)}</StatusPill>
        {!compact && row.answeredAt ? <span className="ui-muted"> {whenText(row.answeredAt)}</span> : null}
      </div>
      {/* Notes kept with their time (093); older ones are only on the row, a blank line between. */}
      {notes.length ? (
        <ul className="ui-card-text" style={{ margin: 0, paddingLeft: 18 }} aria-label="Customer notes">
          {notes.map((event, index) => (
            <li key={`${event.at}-${index}`} style={{ whiteSpace: "pre-wrap" }}>
              <span className="ui-muted">{whenText(event.at)}:</span> &quot;{event.note}&quot;
            </li>
          ))}
        </ul>
      ) : row.comment ? (
        <p className="ui-card-text" style={{ whiteSpace: "pre-wrap" }}>
          &quot;{row.comment}&quot;
        </p>
      ) : null}
      {row.reach ? <p className="ui-card-text">Best way to reach them: {row.reach}</p> : null}
      {row.photos.length ? (
        <div className="ui-actions-row">
          {row.photos.map((url, index) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="ui-photo" aria-label={`Open photo ${index + 1} full size`}>
              <Image src={url} alt={`Customer photo ${index + 1}`} width={72} height={72} unoptimized style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8 }} />
            </a>
          ))}
        </div>
      ) : null}
      {history ? <CheckinHistory row={row} /> : null}
    </div>
  );
}

export function CheckinStatusPill({ status }: { status: CheckinStatus }) {
  return <StatusPill kind={checkinStatusKind(status)}>{CHECKIN_STATUS_TEXT[status]}</StatusPill>;
}

/**
 * Where a sent check-in is: Sent → 👁 Viewed → ✅ Responded (⚠️ when the
 * answer is Needs attention). Each step shows its time on hover. Viewed is
 * approximate (CHECKIN_VIEWED_NOTE).
 */
export function CheckinProgress({ row }: { row: Pick<CheckinRow, "status" | "sentAt" | "openedAt" | "openCount" | "answer" | "answeredAt"> }) {
  if (row.status !== "sent") return <CheckinStatusPill status={row.status} />;
  const rating = ratingOf(row.answer);
  const viewed = Boolean(row.openedAt) || Boolean(rating);
  const steps: { key: string; text: string; title: string; on: boolean }[] = [
    { key: "sent", text: "Sent", title: `Sent ${whenText(row.sentAt)}`, on: true },
    {
      key: "viewed",
      text: "👁 Viewed",
      title: row.openedAt
        ? `First opened ${whenText(row.openedAt)}${row.openCount > 1 ? ` · opened ${row.openCount} times` : ""}. ${CHECKIN_VIEWED_NOTE}`
        : viewed
          ? `Opened (answered ${whenText(row.answeredAt)}). ${CHECKIN_VIEWED_NOTE}`
          : `Not opened yet. ${CHECKIN_VIEWED_NOTE}`,
      on: viewed,
    },
    {
      key: "responded",
      text: rating === "attention" ? "⚠️ Responded" : "✅ Responded",
      title: rating ? `${ratingText(row.answer)} · ${whenText(row.answeredAt)}` : "No answer yet",
      on: Boolean(rating),
    },
  ];
  return (
    <span className="ui-actions-row" style={{ gap: 4, alignItems: "center" }} aria-label={steps.filter((s) => s.on).map((s) => s.title).join(". ")}>
      {steps.map((step, index) => (
        <span key={step.key} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {index > 0 ? <span className="ui-muted" aria-hidden="true">→</span> : null}
          <span
            title={step.title}
            className={step.on ? "ui-strong" : "ui-muted"}
            style={{ opacity: step.on ? 1 : 0.45, whiteSpace: "nowrap", cursor: "help" }}
          >
            {step.text}
          </span>
        </span>
      ))}
    </span>
  );
}
