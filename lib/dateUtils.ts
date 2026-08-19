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
