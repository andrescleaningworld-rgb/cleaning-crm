// Cancelling an account in the "Change status" sheet: the reasons the office
// picks from, what must be filled in, and the words of the history note.
// Plain TS with no server imports, so the two account screens and the
// server use the same list. The columns are in db/migrations/029.

export const CANCELLATION_REASONS = [
  "Non-payment",
  "Price",
  "Service quality",
  "Business closed or moved",
  "Switched to another company",
  "Other",
] as const;

export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

export function isCancellationReason(value: string): value is CancellationReason {
  return (CANCELLATION_REASONS as readonly string[]).includes(value);
}

export function isCancelledStatus(status: unknown): boolean {
  const key = String(status ?? "").trim().toLowerCase();
  return key === "cancelled" || key === "canceled";
}

/** "10/9/26" from "2026-10-09"; any other text comes back as it is. */
export function shortDay(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  return m ? `${Number(m[2])}/${Number(m[3])}/${m[1].slice(2)}` : day;
}

export type CancellationDetails = { finalCleaningDate: string; reason: string; notes: string };

/** What is still missing before a cancellation can be saved, in words for the person; "" when nothing is. */
export function cancellationProblem({ finalCleaningDate, reason, notes }: CancellationDetails): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(finalCleaningDate.trim())) return "Please pick the final cleaning date.";
  if (!isCancellationReason(reason)) return "Please pick a reason.";
  if (reason === "Other" && !notes.trim()) return "Please add a note to explain the reason.";
  return "";
}

/** "Cancelled — Reason: Non-payment — Final cleaning: 10/9/26 — notes" (the notes only when there are some). */
export function cancellationNote({ finalCleaningDate, reason, notes }: CancellationDetails): string {
  return ["Cancelled", `Reason: ${reason}`, `Final cleaning: ${shortDay(finalCleaningDate)}`, notes.trim()].filter(Boolean).join(" — ");
}
