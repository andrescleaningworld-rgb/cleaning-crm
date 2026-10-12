// Timezone-safe date helpers, shared across every area that handles a plain
// "YYYY-MM-DD" date (no time component). Extracted from lib/scheduleRecurrence.ts,
// where this logic was first written and has been running in production —
// this is a relocation, not a rewrite.
//
// Two footguns these avoid:
//  - `new Date("YYYY-MM-DD")` parses the string as UTC midnight. Reading it
//    back with local getters (.getDate(), .toLocaleDateString(), .getDay())
//    or writing it with .toISOString() shifts the date by one day for any
//    timezone behind UTC (e.g. US Eastern) for the affected span. parseISO/
//    toISO avoid this by never round-tripping through UTC-midnight parsing.
//  - `new Date().toISOString().slice(0, 10)` reads "today" in UTC, which in
//    the evening US Eastern has already rolled to the next calendar day.
//    todayISO() avoids this by reading the wall-clock date directly in
//    America/New_York via Intl.DateTimeFormat.

export function toISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Eastern-time-safe "today" — see the file-level comment above for why this
// isn't new Date().toISOString().slice(0, 10).
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// ─── Values for Postgres DATE / TIMESTAMPTZ columns ──────────────────────────
//
// Postgres refuses "" for a date ("invalid input syntax for type date"), and
// a form sends "" for every date nobody picked. Every write to a date or
// time column goes through one of these two, so a blank or unreadable value
// is stored as NULL instead of failing the save. The text as typed is kept
// next to it in the column's *_raw twin where there is one.

/**
 * YYYY-MM-DD for a DATE column, or null. Reads "YYYY-MM-DD…" and
 * "M/D/YYYY…"; a blank, any other text, or a day that does not exist
 * (2026-02-31) is null.
 */
export function dateOrNull(value: unknown): string | null {
  const text = String(value ?? "").trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/.exec(text);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?!\d)/.exec(text);
    if (!match) return null;
    [y, m, d] = [Number(match[3]), Number(match[1]), Number(match[2])];
  }
  const real = new Date(Date.UTC(y, m - 1, d));
  if (y < 1 || real.getUTCFullYear() !== y || real.getUTCMonth() !== m - 1 || real.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** An ISO moment for a TIMESTAMPTZ column, or null when the value is blank or not a date. */
export function timestampOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value).trim());
  if (!(value instanceof Date) && String(value).trim() === "") return null;
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
