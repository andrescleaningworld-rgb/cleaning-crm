"use client";

// What the navy bar at the top of every screen shows. <Screen> reports its
// title and back arrow here and the bar (app/components/CWHeader.tsx) reads
// them, so the page name sits under "Cleaning World" without every page
// having to know about the bar. <Tips> reports that the screen has tips, so
// the bar's "?" can show them again.

import { useSyncExternalStore } from "react";

export type ShellState = {
  title: string;
  backHref: string;
  onBack: (() => void) | null;
  tipsCount: number;
  /** One extra button in the bar, e.g. the sub portal's EN / ES / PT. */
  extra: { label: string; ariaLabel: string; onClick: () => void } | null;
};

const EMPTY: ShellState = { title: "", backHref: "", onBack: null, tipsCount: 0, extra: null };
let state: ShellState = EMPTY;
const listeners = new Set<() => void>();

function set(next: ShellState) {
  state = next;
  for (const listener of listeners) listener();
}

export function setShellScreen(title: string, backHref?: string, onBack?: () => void) {
  set({ ...state, title, backHref: backHref ?? "", onBack: onBack ?? null });
}

/** Only clears when this screen is still the one shown (a newer screen may already have taken over). */
export function clearShellScreen(title: string) {
  if (state.title === title) set({ ...state, title: "", backHref: "", onBack: null });
}

export function setShellExtra(extra: ShellState["extra"]) {
  set({ ...state, extra });
}

export function addShellTips(delta: number) {
  set({ ...state, tipsCount: Math.max(0, state.tipsCount + delta) });
}

/** The bar's "?" fires this; every <Tips> on the screen listens for it. */
export const SHOW_TIPS_EVENT = "cw:show-tips";

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useShell(): ShellState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY
  );
}
