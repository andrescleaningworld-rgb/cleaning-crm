"use client";

// Drafts for the long staff forms, in case someone gets pulled away.
//
// While you type, what you changed is kept in this browser (localStorage).
// Nothing goes to the CRM: the form still saves only when Save is pressed.
// Come back to the form and a note at the top offers "Pick up where you
// left off" or "Start fresh". Typing without answering starts fresh. The
// draft is removed when the form is saved (an edit page that stays open
// starts a new draft from what was saved), and after KEEP_DAYS.
//
// Only what changed is kept, field by field, and put back over the form as
// it loads now. On an edit page that means fields nobody touched keep their
// newest values. Photos and files are never kept.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { showToast, undoWaiting } from "@/app/ui/toast";

const PREFIX = "cw-draft:";
const KEEP_DAYS = 14;
// How long a form may keep filling itself in after it says it is ready.
const SETTLE_MS = 600;
const SAVED_MESSAGE = "Draft saved on this computer. Press Save to add it to the CRM.";
// Typing is kept at once; the pop-up only says so about every 5 minutes of work.
const TELL_EVERY_MS = 5 * 60_000;

type Stored = { savedAt: number; patch: unknown };

const isPlain = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** What changed from `base` to `value`: plain objects field by field, anything else whole. undefined = nothing. */
function changes(base: unknown, value: unknown): unknown {
  if (same(base, value)) return undefined;
  if (isPlain(base) && isPlain(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      const changed = changes(base[key], value[key]);
      if (changed !== undefined) out[key] = changed;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }
  return value;
}

/** The kept changes written over the form as it is now. */
function putBack(current: unknown, patch: unknown): unknown {
  if (isPlain(current) && isPlain(patch)) {
    const out: Record<string, unknown> = { ...current };
    for (const key of Object.keys(patch)) out[key] = putBack(current[key], patch[key]);
    return out;
  }
  return patch;
}

function read(key: string): Stored | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Stored;
    if (typeof stored?.savedAt !== "number" || Date.now() - stored.savedAt > KEEP_DAYS * 86_400_000) {
      window.localStorage.removeItem(PREFIX + key);
      return null;
    }
    return stored;
  } catch {
    return null;
  }
}

function write(key: string, stored: Stored | null) {
  try {
    if (stored) window.localStorage.setItem(PREFIX + key, JSON.stringify(stored));
    else window.localStorage.removeItem(PREFIX + key);
  } catch {
    // Private mode or a full browser: the form works as before, just without a draft.
  }
}

export type FormDraft = {
  /** A draft from an earlier visit, waiting for an answer (hidden once typing starts). */
  waiting: { savedAt: number } | null;
  /** This visit's typing is being kept. */
  kept: boolean;
  restore: () => void;
  discard: () => void;
  /** Call once the form is saved: the draft is removed, and the form as it is next is the new starting point. */
  clear: () => void;
};

/**
 * Keeps a draft of `value` under `key`. `ready` = the form has loaded (an edit
 * page's data, a link's prefill) or, for a form in a sheet, the sheet is
 * open. What the form shows then is the starting point, and only changes
 * from it are kept. `onRestore` gets the form with the draft put back.
 */
export function useFormDraft<T>(key: string, value: T, { ready = true, onRestore }: { ready?: boolean; onRestore: (value: T) => void }): FormDraft {
  // The starting point. Taken a moment after the form is ready: some forms
  // fill themselves in right after loading (a link's account, a Markate
  // estimate), and that is not typing.
  const [base, setBase] = useState<{ key: string; value: unknown } | null>(null);
  const [waiting, setWaiting] = useState<Stored | null>(null);
  // Goes up when the form is saved, so the starting point is taken again.
  const [round, setRound] = useState(0);
  const latest = useRef(value);
  const restoreTo = useRef(onRestore);
  // True once this visit's typing has been written, so going back to the start removes only that.
  const keptThisVisit = useRef(false);
  // When typing on this form started, and when the pop-up last showed (reset after a Save).
  const workStartedAt = useRef<number | null>(null);
  const lastToldAt = useRef<number | null>(null);
  // Compared by content, so a form may pass a new object on every render.
  const json = JSON.stringify(value ?? null);

  useEffect(() => {
    latest.current = value;
    restoreTo.current = onRestore;
  });

  // What changed since the starting point; undefined = nothing.
  const patch = useMemo(() => (ready && base?.key === key ? changes(base.value, JSON.parse(json) as unknown) : undefined), [ready, base, key, json]);

  // Each time the form is ready (a sheet opened again too): the starting point
  // if there is none yet, and any draft from before.
  useEffect(() => {
    if (!ready) {
      // Closing a sheet keeps its draft; opened again, it is offered again.
      keptThisVisit.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      setBase((current) => (current?.key === key ? current : { key, value: JSON.parse(JSON.stringify(latest.current ?? null)) as unknown }));
      setWaiting(read(key));
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [ready, key, round]);

  // Every change is kept straight away, so closing the tab loses nothing.
  // Typing without answering the note replaces the earlier draft.
  useEffect(() => {
    if (patch !== undefined) {
      const now = Date.now();
      write(key, { savedAt: now, patch });
      keptThisVisit.current = true;
      // The pop-up after about 5 minutes of work, then every 5 minutes while typing goes on.
      // Not while an Undo is up: any pop-up would finish that waiting save early.
      workStartedAt.current ??= now;
      if (now - (lastToldAt.current ?? workStartedAt.current) >= TELL_EVERY_MS && !undoWaiting()) {
        lastToldAt.current = now;
        showToast(SAVED_MESSAGE);
      }
    } else if (keptThisVisit.current) {
      // Back to how it started: this visit's draft goes. An earlier one that is still waiting stays.
      keptThisVisit.current = false;
      write(key, null);
    }
  }, [key, patch]);

  const restore = useCallback(() => {
    if (!waiting) return;
    restoreTo.current(putBack(latest.current, waiting.patch) as T);
    setWaiting(null);
  }, [waiting]);

  const discard = useCallback(() => {
    write(key, null);
    setWaiting(null);
  }, [key]);

  const clear = useCallback(() => {
    keptThisVisit.current = false;
    workStartedAt.current = null;
    lastToldAt.current = null;
    write(key, null);
    setBase(null);
    setWaiting(null);
    setRound((value) => value + 1);
  }, [key]);

  return { waiting: waiting && patch === undefined ? { savedAt: waiting.savedAt } : null, kept: patch !== undefined, restore, discard, clear };
}

function when(savedAt: number): string {
  const date = new Date(savedAt);
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return `today at ${time}`;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `yesterday at ${time}`;
  return `${date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} at ${time}`;
}

/** The note at the top of a form: "Pick up where you left off?", or a quiet "Draft kept" line. */
export function DraftNotice({ draft }: { draft: FormDraft }) {
  if (draft.waiting) {
    return (
      <section className="ui-card" role="status" aria-label="Unsaved draft">
        <p className="ui-card-title">You have an unsaved draft from {when(draft.waiting.savedAt)}.</p>
        <p className="ui-muted">Pick up where you left off, or start fresh. Typing in the form also starts fresh.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          <button type="button" className="ui-btn ui-btn-main" onClick={draft.restore}>
            Pick up where I left off
          </button>
          <button type="button" className="ui-btn ui-btn-second" onClick={draft.discard}>
            Start fresh
          </button>
        </div>
      </section>
    );
  }
  if (draft.kept) {
    return (
      <p className="ui-savestatus" aria-live="polite">
        Draft kept on this computer. It is not saved to the CRM until you press Save.
      </p>
    );
  }
  return null;
}
