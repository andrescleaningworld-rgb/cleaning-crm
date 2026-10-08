"use client";

// Toast: the green "Saved ✓" message. A tiny module-level store, so any
// component can call showToast() without a provider. <Screen> renders the
// one <ToastRegion />; the region is an aria-live area, so the message is
// read out as well as shown.

import { useSyncExternalStore } from "react";

type ToastState = { id: number; message: string; kind: "good" | "bad" } | null;

const TOAST_MS = 3000;

let current: ToastState = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Shows a message for 3 seconds. A new toast replaces the one on screen. */
export function showToast(message: string, kind: "good" | "bad" = "good") {
  if (timer) clearTimeout(timer);
  current = { id: nextId++, message, kind };
  emit();
  timer = setTimeout(() => {
    current = null;
    timer = null;
    emit();
  }, TOAST_MS);
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
        <div key={toast.id} className={`ui-toast ${toast.kind === "bad" ? "ui-toast-bad" : ""}`.trim()}>
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
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
