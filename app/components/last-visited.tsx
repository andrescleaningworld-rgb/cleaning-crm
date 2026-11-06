"use client";

// The "Last visited" filter: days since an account's last manager visit (the
// Visits log, the same data as Reports -> Last Visit by Account). Shared by
// the Accounts list and the Map so both behave the same. "Over N days" means
// N days or more and leaves out accounts never visited: those have their own
// option.

import { useEffect, useState } from "react";
import { SelectField } from "@/app/ui";

export type LastVisitedFilter = "any" | "30" | "60" | "90" | "180" | "never";

export const LAST_VISITED_OPTIONS: { value: LastVisitedFilter; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "30", label: "Over 30 days" },
  { value: "60", label: "Over 60 days" },
  { value: "90", label: "Over 90 days" },
  { value: "180", label: "Over 180 days" },
  { value: "never", label: "Never visited" },
];

/** Today's date in Eastern time, as YYYY-MM-DD (the visit dates are plain dates). */
export function easternTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Whole days from a YYYY-MM-DD date to today; null when there is no date. */
export function daysSince(isoDate: string | null | undefined, today: string): number | null {
  if (!isoDate) return null;
  const from = Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

/** "Oct 3, 2026 (30 days ago)", or "Never visited". */
export function lastVisitText(isoDate: string | null | undefined, today: string): string {
  const days = daysSince(isoDate, today);
  if (!isoDate || days === null) return "Never visited";
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  const shown = new Date(year, month - 1, day).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  const ago = days === 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
  return `${shown} (${ago})`;
}

/**
 * Does an account pass the filter? `lastVisits` is null until the dates
 * load: then nothing passes (rather than a wrong list), unless the filter is "any".
 */
export function matchesLastVisited(
  filter: LastVisitedFilter,
  lastVisits: Record<string, string> | null,
  accountId: string,
  today: string
): boolean {
  if (filter === "any") return true;
  if (!lastVisits) return false;
  const days = daysSince(lastVisits[accountId], today);
  if (filter === "never") return days === null;
  return days !== null && days >= Number(filter);
}

/** Each account's last visit date by account ID (GET /api/visits?last=1, managers and the owner). null until loaded. */
export function useLastVisits(): { lastVisits: Record<string, string> | null; failed: boolean } {
  const [lastVisits, setLastVisits] = useState<Record<string, string> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/visits?last=1", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { success?: boolean; lastVisits?: Record<string, string> }) => {
        if (!alive) return;
        if (data.success && data.lastVisits) setLastVisits(data.lastVisits);
        else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);
  return { lastVisits, failed };
}

/** The "Last visited" dropdown, with its loading / failed hint. */
export function LastVisitedField({
  value,
  onChange,
  loaded,
  failed,
}: {
  value: LastVisitedFilter;
  onChange: (value: LastVisitedFilter) => void;
  loaded: boolean;
  failed: boolean;
}) {
  return (
    <SelectField
      label="Last visited"
      hint={failed ? "Couldn't load the visit dates. Refresh the page to try again." : loaded ? "Days since the last manager visit." : "Loading visit dates..."}
      value={value}
      onChange={(e) => onChange(e.target.value as LastVisitedFilter)}
    >
      {LAST_VISITED_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </SelectField>
  );
}
