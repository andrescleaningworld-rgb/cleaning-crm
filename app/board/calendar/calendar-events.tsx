"use client";

// The other days on the Cleaning calendar: birthdays and work anniversaries
// (from Settings -> Staff), holidays, office closed and company events (added
// here by hand). The words and kinds are in lib/officeEvents.ts.

import { useCallback, useEffect, useRef, useState } from "react";
import { BigButton, ErrorBox, Field, SelectField, Sheet, showToast } from "@/app/ui";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { EVENT_ICON, EVENT_LABEL, HAND_KINDS, eventLine, type OfficeEvent } from "@/lib/officeEvents";
import styles from "./calendar.module.css";

/** The days between two days, and whether this database has them yet. */
export function useOfficeEvents(from: string, to: string) {
  const [events, setEvents] = useState<OfficeEvent[]>([]);
  const [on, setOn] = useState(false);
  // Only the newest request may change the list (an older, slower one is cancelled).
  const latest = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    latest.current?.abort();
    const request = new AbortController();
    latest.current = request;
    try {
      const response = await fetchWithTimeout(`/api/board/events?from=${from}&to=${to}`, { cache: "no-store", signal: request.signal });
      const body = (await response.json()) as { success?: boolean; on?: boolean; events?: OfficeEvent[] };
      if (latest.current !== request || !response.ok || body.success !== true) return;
      setOn(body.on === true);
      setEvents(body.events ?? []);
    } catch {
      // The cleanings still show without them.
    }
  }, [from, to]);

  useEffect(() => {
    // The list is set only after the answer arrives, never during the effect itself.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => () => latest.current?.abort(), []);

  return { events, on, reload: load };
}

/** The day's events as small labels. Tapping one that was added by hand offers to take it off. */
export function EventChips({ events, onPick }: { events: OfficeEvent[]; onPick?: (event: OfficeEvent) => void }) {
  if (events.length === 0) return null;
  return (
    <ul className={styles.events}>
      {events.map((event) => (
        <li key={event.id}>
          {event.byHand && onPick ? (
            <button type="button" className={`${styles.event} ${styles[`event-${event.kind}`] ?? ""}`} onClick={() => onPick(event)} aria-label={`${EVENT_LABEL[event.kind]}: ${event.title}. Tap to take it off.`}>
              <span aria-hidden="true">{EVENT_ICON[event.kind]}</span> {eventLine(event)}
            </button>
          ) : (
            <span className={`${styles.event} ${styles[`event-${event.kind}`] ?? ""}`}>
              <span aria-hidden="true">{EVENT_ICON[event.kind]}</span> {eventLine(event)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

async function post(body: Record<string, unknown>): Promise<void> {
  const response = await fetchWithTimeout("/api/board/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
  if (!response.ok || data.success !== true) throw new Error(data.error || "That did not save. Try again.");
}

/** "Add to calendar": a holiday, an office-closed day or a company event. */
export function AddEventSheet({ open, day, onClose, onSaved }: { open: boolean; day: string; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<string>("holiday");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(day);
  const [yearly, setYearly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Each time it opens: the day the calendar is on, and empty boxes.
  useEffect(() => {
    if (!open) return;
    setKind("holiday");
    setTitle("");
    setDate(day);
    setYearly(false);
    setError("");
  }, [open, day]);

  async function save() {
    if (!title.trim()) return setError("Type what it is.");
    if (!date) return setError("Pick the date.");
    setBusy(true);
    setError("");
    try {
      await post({ action: "add", kind, title, day: date, yearly });
      showToast("Added to the calendar.");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      title="Add to calendar"
      text="Birthdays and work anniversaries come from Settings, Staff. Add everything else here."
      onClose={onClose}
      busy={busy}
      actions={
        <BigButton busy={busy} busyLabel="Saving…" onClick={() => void save()}>
          Add to calendar
        </BigButton>
      }
    >
      <SelectField label="What is it?" value={kind} onChange={(event) => setKind(event.target.value)} disabled={busy}>
        {HAND_KINDS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectField>
      <Field label="Name" placeholder="Thanksgiving / Company picnic" value={title} onChange={(event) => setTitle(event.target.value)} disabled={busy} maxLength={120} />
      <Field label="Date" type="date" value={date} onChange={(event) => setDate(event.target.value)} disabled={busy} />
      <label className="ui-check">
        <input type="checkbox" checked={yearly} onChange={(event) => setYearly(event.target.checked)} disabled={busy} />
        <span>Every year on this date</span>
      </label>
      {error ? <ErrorBox title="It was not added." text={error} /> : null}
    </Sheet>
  );
}

/** One hand-added day: take it off the calendar? */
export function RemoveEventSheet({ event, onClose, onRemoved }: { event: OfficeEvent | null; onClose: () => void; onRemoved: () => void }) {
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!event) return;
    setBusy(true);
    try {
      await post({ action: "remove", id: event.id });
      showToast("Taken off the calendar.");
      onRemoved();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "That did not save. Try again.", "bad");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={event !== null}
      title={event ? eventLine(event) : ""}
      text={event ? `${EVENT_LABEL[event.kind]}${event.yearly ? ", every year" : ""}.` : ""}
      onClose={onClose}
      closeLabel="Keep it"
      busy={busy}
      actions={
        <BigButton kind="danger" busy={busy} busyLabel="Taking it off…" onClick={() => void remove()}>
          {event?.yearly ? "Take it off, every year" : "Take it off the calendar"}
        </BigButton>
      }
    />
  );
}
