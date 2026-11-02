"use client";

// The gold "Ready to start" badge (the rule: isReadyToStart in
// lib/setupWizard.ts). It shows from the moment a new account is ready until
// the account goes live. The same words everywhere; only the size changes:
//   inline  after the account's name on every staff page (AccountLink)
//   pin     on a pin on the board
//   tv      on a pin in TV mode: readable from across the room
//   panel   in the pin's open panel and the setup card
//   banner  at the top of the account page and the wizard's last screen

import { useEffect, useState } from "react";

const SIZES = {
  inline: { fontSize: 12, padding: "1px 8px", border: 1 },
  pin: { fontSize: 14, padding: "3px 10px", border: 2 },
  tv: { fontSize: 26, padding: "6px 16px", border: 3 },
  panel: { fontSize: 18, padding: "6px 14px", border: 2 },
  banner: { fontSize: 22, padding: "8px 18px", border: 3 },
} as const;

/* ---------- which accounts are ready (one list for the whole screen) ---------- */

const READY_TTL_MS = 60_000;
let readyCache: { ids: Set<string>; expiresAt: number } | null = null;
let readyPromise: Promise<Set<string>> | null = null;

/** The accounts that are Ready to start now (GET /api/setup-wizard?ready=1), fetched once a minute at most. */
function loadReadyIds(): Promise<Set<string>> {
  if (readyCache && Date.now() <= readyCache.expiresAt) return Promise.resolve(readyCache.ids);
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    try {
      const response = await fetch("/api/setup-wizard?ready=1", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; ids?: string[] };
      const ids = new Set((response.ok && data.success ? (data.ids ?? []) : []).map((id) => id.trim().toLowerCase()));
      readyCache = { ids, expiresAt: Date.now() + READY_TTL_MS };
      return ids;
    } catch {
      return new Set<string>();
    } finally {
      readyPromise = null;
    }
  })();
  return readyPromise;
}

/** True while this account is Ready to start (and not live yet). "" = never. */
export function useReadyToStart(accountId: string): boolean {
  const key = accountId.trim().toLowerCase();
  const [ready, setReady] = useState({ key: "", on: false });
  useEffect(() => {
    if (!key) return;
    let alive = true;
    void loadReadyIds().then((ids) => {
      if (alive) setReady({ key, on: ids.has(key) });
    });
    return () => {
      alive = false;
    };
  }, [key]);
  return ready.key === key && key !== "" && ready.on;
}

export default function ReadyBadge({ size = "panel" }: { size?: keyof typeof SIZES }) {
  const s = SIZES[size];
  return (
    <span
      // Next to a name in a list: plain text for screen readers, not an announcement each time.
      role={size === "inline" ? undefined : "status"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35em",
        alignSelf: "flex-start",
        verticalAlign: size === "inline" ? "middle" : undefined,
        background: "linear-gradient(180deg, #FFE27A 0%, #F2B705 100%)",
        color: "#3D2B00",
        border: `${s.border}px solid #B07F00`,
        borderRadius: 999,
        fontSize: s.fontSize,
        fontWeight: 900,
        lineHeight: 1.15,
        padding: s.padding,
        whiteSpace: "nowrap",
        boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
      }}
    >
      <span aria-hidden="true">★</span>
      Ready to start
    </span>
  );
}
