"use client";

// Suggested subs for a new account: Coverage's "Who's free?" answer
// (/api/availability, lib/availability.ts nearbyAvailable) for one spot on
// the map. Subs within 10 mi (else the 5 closest), with miles to their
// nearest active account and whether the days have room. Fails silently: no
// list. Used by Add / Edit Account and by step 2 of the New Account flow
// (tap one to pick it).
//
// Add / Edit Account pass `plan`, the Cleaning schedule section just above:
// the check then uses its days, the first day's time and its time on site,
// and asks again (half a second after the last change) whenever the address
// or the schedule changes. With no schedule yet it lists the closest subs
// only, with "Add the schedule above to check who's free." and no
// Has room / Tight / Busy. Order: has room, Tight, (no schedule info), Busy;
// closest first in each.

import { useEffect, useState } from "react";
import { StatusPill, type StatusKind } from "@/app/ui";
import { formatMiles } from "@/app/lib/distance";
import { CLOSEST_FALLBACK, NEARBY_MILES, ROOM_WORDS, roomOf, WEEK_ORDER, weekdaysIn, type Room, type SubAvailability } from "@/lib/availability";
import { DEFAULT_START_TIME, formatClock, toClock } from "@/lib/schedule-time";
import { DEFAULT_MINUTES_ON_SITE, formatMinutes } from "@/lib/time-on-site";
import { planIsEmpty, planSlots, timeFor, type SchedulePlan } from "@/lib/schedule-plan";
import { accountFieldsFromPlan } from "@/lib/plan-account-fields";
import { InsuranceBadge, useInsuranceMap } from "./sub-insurance";

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

// Has room, Tight, No schedule info, Busy.
const ROOM_ORDER: Record<Room, number> = { room: 0, tight: 1, unknown: 2, busy: 3 };

type Found = { days: string[]; start: number; minutes: number; results: SubAvailability[]; within: boolean };

/** The weekdays the check uses for this "Cleaning days" text. */
export function suggestionDays(cleaningDays: string): string[] {
  const typed = weekdaysIn(cleaningDays);
  return typed.length > 0 ? typed : DEFAULT_WEEKDAYS;
}

/**
 * What the Cleaning schedule says for the check: its weekdays, the first
 * day's start, and its time on site (the usual length when "Not sure").
 * null = no schedule yet (no days picked).
 */
export function checkFromPlan(plan: SchedulePlan): { days: string[]; start: number; minutes: number } | null {
  if (planIsEmpty(plan)) return null;
  const days = weekdaysIn(accountFieldsFromPlan(plan)?.cleaningDays ?? "");
  if (days.length === 0) return null;
  const first = planSlots(plan)[0];
  const time = first ? timeFor(plan, first.key) : plan.all;
  return { days, start: time.start, minutes: time.minutes ?? DEFAULT_MINUTES_ON_SITE };
}

export default function SubSuggestions({
  lat,
  lng,
  plan,
  cleaningDays = "",
  start: startGiven = DEFAULT_START_TIME,
  minutes: minutesGiven = DEFAULT_MINUTES_ON_SITE,
  scoreBySubId,
  selectedId,
  onSelect,
  hint = "Pick the sub yourself above.",
  excludeAccountId = "",
}: {
  lat: number | null;
  lng: number | null;
  /** Add / Edit Account: the Cleaning schedule above (days, time, time on site come from it; empty = closest subs only). */
  plan?: SchedulePlan;
  /** Without `plan`: the "Cleaning days" text, the start (minutes after midnight) and the length. */
  cleaningDays?: string;
  start?: number;
  minutes?: number;
  scoreBySubId?: Map<string, number>;
  /** With onSelect each sub is a button; the picked one is marked. */
  selectedId?: string;
  onSelect?: (result: SubAvailability) => void;
  hint?: string;
  /** The account being edited: never shown as its own sub's nearest account. */
  excludeAccountId?: string;
}) {
  const [found, setFound] = useState<Found | null>(null);
  // A red "Insurance expired" next to a sub whose insurance ran out.
  const insuranceMap = useInsuranceMap();
  const hasSpot = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng);
  // From the schedule above when the form gives it; else what was passed in.
  const check = plan ? checkFromPlan(plan) : null;
  const scheduled = plan ? check !== null : true;
  const checkDays = (check?.days ?? suggestionDays(cleaningDays)).join(",");
  const start = check?.start ?? startGiven;
  const minutes = check?.minutes ?? minutesGiven;

  useEffect(() => {
    if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const days = checkDays.split(",");
    let alive = true;
    // A short wait so typing in "Cleaning days" or tapping − / + does not ask every time.
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "check", days, start: toClock(start), minutes, point: { lat, lng }, accountId: excludeAccountId }),
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
  }, [lat, lng, checkDays, start, minutes, excludeAccountId]);

  // No map spot (an address that was typed, not picked): no list, whatever was found before.
  if (!hasSpot || !found || found.results.length === 0) return null;

  const miles = (result: SubAvailability) => result.distanceMiles ?? Infinity;
  // Has room, Tight, Busy (closest first in each); no schedule yet: closest first only.
  const results = [...found.results].sort((a, b) => (scheduled ? ROOM_ORDER[roomOf(a)] - ROOM_ORDER[roomOf(b)] : 0) || miles(a) - miles(b) || a.name.localeCompare(b.name));
  const where = found.within ? `within ${NEARBY_MILES} mi` : `the ${CLOSEST_FALLBACK} closest (none within ${NEARBY_MILES} mi)`;

  return (
    <div>
      {plan ? (
        <>
          <p className="ui-label" style={{ margin: 0 }}>
            Suggested subs
          </p>
          <p className="ui-muted" style={{ margin: 0 }}>
            {scheduled ? `Best matches for ${found.days.map((day) => day.slice(0, 3)).join(", ")} · ${formatClock(found.start)} · ${where}` : `Closest subs · ${where}`}
          </p>
          {!scheduled ? (
            <p className="ui-hint" style={{ margin: 0 }}>
              Add the schedule above to check who&apos;s free.
            </p>
          ) : null}
        </>
      ) : (
        <p className="ui-muted">
          Suggested subs — {found.within ? `within ${NEARBY_MILES} mi` : `none within ${NEARBY_MILES} mi, the ${CLOSEST_FALLBACK} closest`} · room checked{" "}
          {found.days.map((day) => day.slice(0, 3)).join(", ")} at {formatClock(found.start)} for {formatMinutes(found.minutes)}, next 4 weeks. {hint}
        </p>
      )}
      <ul className="ui-list-plain" style={{ marginTop: 6, gap: 6 }}>
        {results.map((result) => {
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
                  {result.nearestAccountName && result.distanceMiles !== null ? ` from ${result.nearestAccountName}` : ""}
                  {score !== undefined ? `, score ${score}` : ""}
                </span>
              </span>
              {scheduled ? <StatusPill kind={ROOM_PILL[room]}>{ROOM_WORDS[room]}</StatusPill> : null}
              {score !== undefined && score < AT_RISK_SCORE_THRESHOLD ? <StatusPill kind="waiting">Below target score</StatusPill> : null}
              <InsuranceBadge map={insuranceMap} sub={{ subId: result.subId, name: result.name, contactName: result.contactName }} />
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
