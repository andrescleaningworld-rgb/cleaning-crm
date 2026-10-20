"use client";

// Suggested subs for a new account: Coverage's "Who's free?" answer
// (/api/availability, lib/availability.ts nearbyAvailable) for one spot on
// the map. Subs within 10 mi (else the 5 closest), with miles to their
// nearest active account and whether the days have room. Fails silently: no
// list. Used by Add Account (to read only) and by step 2 of the New Account
// flow (tap one to pick it).

import { useEffect, useState } from "react";
import { StatusPill, type StatusKind } from "@/app/ui";
import { formatMiles } from "@/app/lib/distance";
import { CLOSEST_FALLBACK, NEARBY_MILES, ROOM_WORDS, roomOf, WEEK_ORDER, weekdaysIn, type Room, type SubAvailability } from "@/lib/availability";
import { formatClock, toClock } from "@/lib/schedule-time";
import { formatMinutes } from "@/lib/time-on-site";

// Threshold for the "Below target score" badge: the score value below which
// lib/googleSheets.ts's getSubcontractorPerformanceMap stops labeling a sub
// "Good" and starts labeling them "Needs Attention" (see the scoreStatus
// if-chain there, mirrored in app/subcontractors/[id]/page.tsx's score
// legend: "8-8.9 Good, 7-7.9 Needs Attention"). Reused as-is rather than
// inventing a new "at risk" number.
const AT_RISK_SCORE_THRESHOLD = 8;

// The days typed in "Cleaning days" (Mon–Fri when none can be read).
const DEFAULT_WEEKDAYS = WEEK_ORDER.slice(0, 5);
const ROOM_PILL: Record<Room, StatusKind> = { room: "done", tight: "waiting", unknown: "off", busy: "needs-you" };

type Found = { days: string[]; start: number; minutes: number; results: SubAvailability[]; within: boolean };

/** The weekdays the check uses for this "Cleaning days" text. */
export function suggestionDays(cleaningDays: string): string[] {
  const typed = weekdaysIn(cleaningDays);
  return typed.length > 0 ? typed : DEFAULT_WEEKDAYS;
}

export default function SubSuggestions({
  lat,
  lng,
  cleaningDays,
  start,
  minutes,
  scoreBySubId,
  selectedId,
  onSelect,
  hint = "Pick the sub yourself above.",
}: {
  lat: number | null;
  lng: number | null;
  cleaningDays: string;
  /** Minutes after midnight, as the Time − / + buttons hold it. */
  start: number;
  minutes: number;
  scoreBySubId?: Map<string, number>;
  /** With onSelect each sub is a button; the picked one is marked. */
  selectedId?: string;
  onSelect?: (result: SubAvailability) => void;
  hint?: string;
}) {
  const [found, setFound] = useState<Found | null>(null);
  const hasSpot = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng);

  useEffect(() => {
    if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const days = suggestionDays(cleaningDays);
    let alive = true;
    // A short wait so typing in "Cleaning days" or tapping − / + does not ask every time.
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "check", days, start: toClock(start), minutes, point: { lat, lng } }),
        });
        const data = (await response.json().catch(() => ({}))) as { success?: boolean; results?: SubAvailability[]; within?: boolean | null };
        if (!alive) return;
        setFound(data.success && data.results ? { days, start, minutes, results: data.results, within: data.within !== false } : null);
      } catch {
        if (alive) setFound(null);
      }
    }, 500);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [lat, lng, cleaningDays, start, minutes]);

  // No map spot (an address that was typed, not picked): no list, whatever was found before.
  if (!hasSpot || !found || found.results.length === 0) return null;

  return (
    <div>
      <p className="ui-muted">
        Suggested subs — {found.within ? `within ${NEARBY_MILES} mi` : `none within ${NEARBY_MILES} mi, the ${CLOSEST_FALLBACK} closest`} · room checked{" "}
        {found.days.map((day) => day.slice(0, 3)).join(", ")} at {formatClock(found.start)} for {formatMinutes(found.minutes)}, next 4 weeks. {hint}
      </p>
      <ul className="ui-list-plain" style={{ marginTop: 6, gap: 6 }}>
        {found.results.map((result) => {
          const room = roomOf(result);
          const score = scoreBySubId?.get(result.subId);
          const showContact = result.contactName !== "" && result.contactName.toLowerCase() !== result.name.toLowerCase();
          const line = (
            <>
              <span>
                <strong>{result.name}</strong>
                {showContact ? <span className="ui-muted"> ({result.contactName})</span> : null}
                <span className="ui-muted">
                  {" "}
                  — {formatMiles(result.distanceMiles)}
                  {score !== undefined ? `, score ${score}` : ""}
                </span>
              </span>
              <StatusPill kind={ROOM_PILL[room]}>{ROOM_WORDS[room]}</StatusPill>
              {score !== undefined && score < AT_RISK_SCORE_THRESHOLD ? <StatusPill kind="waiting">Below target score</StatusPill> : null}
            </>
          );
          return (
            <li key={result.subId} className="ui-actions-row">
              {onSelect ? (
                <button
                  type="button"
                  className={`ui-btn ${selectedId === result.subId ? "ui-btn-main" : "ui-btn-second"}`}
                  aria-pressed={selectedId === result.subId}
                  onClick={() => onSelect(result)}
                  style={{ justifyContent: "flex-start", flexWrap: "wrap", gap: 8, textAlign: "left" }}
                >
                  {selectedId === result.subId ? "✓ " : ""}
                  {line}
                </button>
              ) : (
                line
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
