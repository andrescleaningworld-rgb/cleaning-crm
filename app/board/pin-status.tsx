"use client";

// A pin's status, inside its big card on /board (migration 062,
// lib/pg/pin-status.ts): four big buttons and an optional short note. Any
// status resets the 2-business-day clock and clears "Status needed"; "Done"
// also takes the pin down. Below them: the history (statuses, asks, owner
// notices), newest first.

import { useEffect, useState } from "react";
import { BigButton, Field, friendlyDate, showToast } from "@/app/ui";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { PIN_STATUSES, STATUS_NOTE_MAX, pinStatusLabel, statusLine, type Paper, type PinStatusEvent, type PinStatusKey } from "@/lib/board";
import styles from "./board.module.css";

function eventText(event: PinStatusEvent): string {
  if (event.event === "ask") return event.by ? `Status asked of ${event.by}` : "Status asked (no one to text)";
  if (event.event === "owner") return event.by ? `${event.by} told: still no status` : "Owner told: still no status";
  return `${pinStatusLabel(event.status) || event.status}${event.by ? ` · ${event.by}` : ""}${event.note ? `: ${event.note}` : ""}`;
}

export default function PinStatusBox({ paper, canFinish, onSaved }: { paper: Paper; canFinish: boolean; onSaved: (takenDown: boolean) => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<PinStatusKey | "">("");
  const [history, setHistory] = useState<PinStatusEvent[] | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchWithTimeout(`/api/board?view=status&kind=${encodeURIComponent(paper.kind)}&itemId=${encodeURIComponent(paper.itemId)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { success?: boolean; history?: PinStatusEvent[]; error?: string };
        if (!response.ok || body.success !== true) throw new Error(body.error || "The history did not load.");
        if (alive) {
          setHistory(body.history ?? []);
          setHistoryError("");
        }
      })
      .catch((error: unknown) => {
        if (alive) setHistoryError(error instanceof Error ? error.message : "The history did not load.");
      });
    return () => {
      alive = false;
    };
  }, [paper.kind, paper.itemId, reload]);

  async function save(status: PinStatusKey) {
    setBusy(status);
    try {
      const response = await fetchWithTimeout("/api/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", kind: paper.kind, itemId: paper.itemId, status, note: note.trim() }),
      });
      const body = (await response.json().catch(() => ({}))) as { success?: boolean; takenDown?: boolean; error?: string };
      if (!response.ok || body.success !== true) throw new Error(body.error || "That did not save. Try again.");
      showToast(body.takenDown ? "Done ✓ It is in the Done tray." : `${pinStatusLabel(status)} ✓`);
      setNote("");
      setReload((n) => n + 1);
      onSaved(body.takenDown === true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "That did not save. Try again.", "bad");
    } finally {
      setBusy("");
    }
  }

  // An extra job has its own Done ✓ above this box (canFinish false). An in-house one has no sub to wait on.
  const choices = PIN_STATUSES.filter((entry) => (entry.key !== "done" || canFinish) && (entry.key !== "waiting_sub" || !paper.inHouse));
  return (
    <section className="ui-stack" data-pin-status>
      <p className="ui-strong" style={{ margin: 0 }}>
        {paper.statusNeeded ? <span className={styles.statusTagInline}>Status needed</span> : null}
        {paper.status ? `Status: ${statusLine(paper.status)}` : "No status yet."}
      </p>
      {paper.status?.note ? <p className="ui-muted" style={{ margin: 0 }}>“{paper.status.note}”</p> : null}
      <div className={styles.statusButtons}>
        {choices.map((entry) => (
          <BigButton key={entry.key} kind={entry.key === "done" ? "main" : "second"} busy={busy === entry.key} disabled={busy !== ""} onClick={() => void save(entry.key)} data-pin-status-choice={entry.key}>
            {entry.label}
          </BigButton>
        ))}
      </div>
      <Field label="Note" optional value={note} maxLength={STATUS_NOTE_MAX} onChange={(event) => setNote(event.target.value)} placeholder="A few words (optional)" />

      <details>
        <summary className="ui-link">Status history</summary>
        {historyError ? (
          <p className="ui-field-error">
            {historyError}{" "}
            <button type="button" className="ui-link" onClick={() => setReload((n) => n + 1)}>
              Try again
            </button>
          </p>
        ) : history === null ? (
          <p className="ui-muted">Loading…</p>
        ) : history.length === 0 ? (
          <p className="ui-muted">Nothing yet.</p>
        ) : (
          <ul className="ui-list-plain">
            {history.map((event, index) => (
              <li key={`${event.at}-${index}`}>
                <span className="ui-muted">{friendlyDate(event.at)}</span> {eventText(event)}
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}
