// Price increase reminders: the rule, safe in the browser. The database side
// is lib/pg/price-review.ts (migration 058).
//
// The last price change is the latest of:
//   - a save in the account's History that changed "Monthly Revenue" (every
//     save is in History, so this keeps itself up to date from now on)
//   - the date a manager set ("The price last changed on…"), for changes
//     made before the CRM had History
// With neither, the account's start date counts ("since it started").
// 12 months after it, with no snooze, the account is due: a paper "Time to
// review price" in its manager's square. A snooze (3 or 6 months, with a
// reason) is written to History.
//
// No money is shown anywhere here: only dates.

export const REVIEW_AFTER_MONTHS = 12;
export const SNOOZE_MONTHS = [3, 6] as const;
export type SnoozeMonths = (typeof SNOOZE_MONTHS)[number];

export type PriceReview = {
  accountId: string;
  /** YYYY-MM-DD, "" when nothing is known. */
  lastChangeOn: string;
  /** Where that date came from. */
  source: "history" | "manager" | "start" | "none";
  /** YYYY-MM-DD: when the review is due. "" without a date. */
  dueOn: string;
  due: boolean;
  /** YYYY-MM-DD, "" when not snoozed. */
  snoozedUntil: string;
  snoozeReason: string;
};

/** YYYY-MM-DD plus whole months (the last day of the month when it is shorter). */
export function addMonths(day: string, months: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

export function reviewOf(input: { accountId: string; historyOn: string; managerOn: string; startOn: string; snoozedUntil: string; snoozeReason: string }, today: string): PriceReview {
  const best = [input.historyOn, input.managerOn].filter(Boolean).sort().pop() ?? "";
  const lastChangeOn = best || input.startOn;
  const source: PriceReview["source"] = best ? (best === input.historyOn ? "history" : "manager") : input.startOn ? "start" : "none";
  const dueOn = lastChangeOn ? addMonths(lastChangeOn, REVIEW_AFTER_MONTHS) : "";
  const snoozed = input.snoozedUntil !== "" && input.snoozedUntil > today;
  return {
    accountId: input.accountId,
    lastChangeOn,
    source,
    dueOn,
    due: dueOn !== "" && dueOn <= today && !snoozed,
    snoozedUntil: snoozed ? input.snoozedUntil : "",
    snoozeReason: snoozed ? input.snoozeReason : "",
  };
}

/** "1 year 3 months ago", "5 months ago", "this month". */
export function agoText(day: string, today: string): string {
  const [y1, m1] = day.split("-").map(Number);
  const [y2, m2] = today.split("-").map(Number);
  const months = (y2 - y1) * 12 + (m2 - m1);
  if (months <= 0) return "this month";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [years ? `${years} year${years === 1 ? "" : "s"}` : "", rest ? `${rest} month${rest === 1 ? "" : "s"}` : ""].filter(Boolean);
  return `${parts.join(" ")} ago`;
}

/** The number in a History value ("$1,200" → 1200); null when there is none. */
export function moneyIn(value: string): number | null {
  const text = value.replace(/[^0-9.-]/g, "");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** A History entry's "Monthly Revenue: old → new" line: true when the number really changed (not only how it was written). */
export function historyChangedPrice(detail: string): boolean {
  const line = detail.split("\n").find((entry) => entry.startsWith("Monthly Revenue: "));
  if (!line) return false;
  const [before, after] = line.slice("Monthly Revenue: ".length).split(" → ");
  if (after === undefined) return false;
  const a = moneyIn(before);
  const b = moneyIn(after);
  return b !== null && b > 0 && a !== b;
}
