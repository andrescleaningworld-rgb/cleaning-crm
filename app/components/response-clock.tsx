"use client";

// The complaint response clock as a small pill: "Waiting 1 h 20 min" in
// green, yellow or red (business hours, lib/responseClock.ts), or "Answered
// in 35 min" once someone answered. Nothing for a closed complaint that was
// never timed. The yellow / red hours come from Settings (feature_settings
// "complaintClock"), read once per page; the start numbers until then (and
// on screens without a staff login, like the TV).

import { useEffect, useState } from "react";
import { DEFAULT_FEATURE_SETTINGS, type ComplaintClockSetting } from "@/lib/featureSettings";
import { clockState, complaintIsOpen, type ClockLevel } from "@/lib/responseClock";

let cached: ComplaintClockSetting | null = null;
let loading: Promise<ComplaintClockSetting> | null = null;

function loadSetting(): Promise<ComplaintClockSetting> {
  if (cached) return Promise.resolve(cached);
  loading ??= fetch("/api/feature-settings", { cache: "no-store" })
    .then((response) => response.json())
    .then((data: { settings?: { complaintClock?: ComplaintClockSetting } }) => {
      cached = data.settings?.complaintClock ?? DEFAULT_FEATURE_SETTINGS.complaintClock;
      return cached;
    })
    .catch(() => DEFAULT_FEATURE_SETTINGS.complaintClock);
  return loading;
}

/** The yellow / red hours, and "now" ticking once a minute so the pills move. */
export function useClockSetting(): { setting: ComplaintClockSetting; now: Date } {
  const [setting, setSetting] = useState<ComplaintClockSetting>(cached ?? DEFAULT_FEATURE_SETTINGS.complaintClock);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let alive = true;
    void loadSetting().then((value) => {
      if (alive) setSetting(value);
    });
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);
  return { setting, now };
}

const LOOK: Record<ClockLevel, { color: string; background: string; icon: string }> = {
  green: { color: "var(--ui-good)", background: "var(--ui-good-soft)", icon: "⏱️" },
  yellow: { color: "var(--ui-warn)", background: "var(--ui-warn-soft)", icon: "⏱️" },
  red: { color: "var(--ui-bad)", background: "var(--ui-bad-soft)", icon: "⏰" },
  answered: { color: "var(--ui-off)", background: "var(--ui-off-soft)", icon: "✓" },
};

export function ResponseClock({
  createdAt,
  answeredAt,
  status,
  hideAnswered = false,
}: {
  createdAt?: string;
  /** "" = still waiting; "none" = no clock for this complaint (before migration 076). */
  answeredAt?: string;
  status?: string;
  /** Lists: show nothing once it was answered. */
  hideAnswered?: boolean;
}) {
  const { setting, now } = useClockSetting();
  if (!createdAt || answeredAt === undefined || answeredAt === "none") return null;
  const state = clockState({ createdAt, answeredAt, open: complaintIsOpen(status), setting, now });
  if (!state || (hideAnswered && state.level === "answered")) return null;
  const look = LOOK[state.level];
  return (
    <span className="ui-pill" style={{ color: look.color, background: look.background, fontWeight: 700 }} title="Business hours: Mon–Fri, 8 am – 5 pm">
      <span aria-hidden="true">{look.icon}</span>
      {state.label}
    </span>
  );
}
