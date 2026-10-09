"use client";

// Toast: the green "Saved ✓" message. A tiny module-level store, so any
// component can call showToast() without a provider. <Screen> renders the
// one <ToastRegion />; the region is an aria-live area, so the message is
// read out as well as shown.
//
// undoable() is the 5-second "Undo" for things that are hard to take back
// (cancel an account, delete, close a problem): the toast shows an Undo
// button, and the real save only starts when the 5 seconds are up.

import { useSyncExternalStore } from "react";

type ToastAction = { label: string; onAction: () => void };
type ToastState = { id: number; message: string; kind: "good" | "bad" | "wait"; action?: ToastAction } | null;

const TOAST_MS = 3000;
export const UNDO_MS = 5000;

let current: ToastState = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function put(state: ToastState, ms: number) {
  if (timer) clearTimeout(timer);
  current = state;
  emit();
  timer = setTimeout(() => {
    current = null;
    timer = null;
    emit();
  }, ms);
}

/** Shows a message for 3 seconds. A new toast replaces the one on screen. */
export function showToast(message: string, kind: "good" | "bad" = "good") {
  // A plain message must not hide a waiting Undo: finish that save first.
  flushUndo();
  put({ id: nextId++, message, kind }, TOAST_MS);
}

/* ---------- Undo ---------- */

type Pending = { run: () => void | Promise<void>; timer: ReturnType<typeof setTimeout> };
let pending: Pending | null = null;

/** Starts a waiting save right now (used when another one begins, or the page is being left). */
export function flushUndo() {
  if (!pending) return;
  const { run, timer: wait } = pending;
  clearTimeout(wait);
  pending = null;
  void run();
}

if (typeof window !== "undefined") {
  // Leaving or hiding the page must not lose the save that was waiting.
  window.addEventListener("pagehide", flushUndo);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushUndo();
  });
}

/**
 * Shows `message` with an Undo button for 5 seconds, then calls `run`.
 * Undo within the 5 seconds means `run` is never called and `onUndo` is.
 */
export function undoable({
  message,
  run,
  onUndo,
  undoLabel = "Undo",
  undoneMessage = "Undone. Nothing was changed.",
}: {
  message: string;
  run: () => void | Promise<void>;
  onUndo?: () => void;
  undoLabel?: string;
  undoneMessage?: string;
}) {
  flushUndo();
  const wait = setTimeout(() => {
    if (pending?.timer !== wait) return;
    pending = null;
    void run();
  }, UNDO_MS);
  pending = { run, timer: wait };
  put(
    {
      id: nextId++,
      message,
      kind: "wait",
      action: {
        label: undoLabel,
        onAction: () => {
          if (pending?.timer !== wait) return;
          clearTimeout(wait);
          pending = null;
          onUndo?.();
          put({ id: nextId++, message: undoneMessage, kind: "good" }, TOAST_MS);
        },
      },
    },
    UNDO_MS
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => current;
const getServerSnapshot = () => null;

export function ToastRegion() {
  const toast = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return (
    <div className="ui-toast-region" role="status" aria-live="polite" aria-atomic="true">
      {toast ? (
        <div key={toast.id} className={`ui-toast ${toast.kind === "bad" ? "ui-toast-bad" : toast.kind === "wait" ? "ui-toast-wait" : ""}`.trim()}>
          {toast.kind === "wait" ? null : (
            <svg
              className="ui-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={toast.kind === "bad" ? "M6 6l12 12M18 6L6 18" : "M5 12.5l4.5 4.5L19 7.5"} />
            </svg>
          )}
          <span>{toast.message}</span>
          {toast.action ? (
            <button type="button" className="ui-toast-action" onClick={toast.action.onAction}>
              {toast.action.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
