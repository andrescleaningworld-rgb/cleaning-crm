// The sub's share of an account's monthly revenue and what we keep, as shown
// next to Subcontractor Pay in staff / office views:
//   Subcontractor Pay: $660 (67%)
//   We keep: $320 (33%)
// STAFF ONLY. Never use this on anything a sub or customer sees (sub portal,
// Team Leader PDF, Crew Link, customer portal).

/** "67%": `part` as a whole-number percent of `revenue`; "—" when revenue is 0 or missing. */
export function shareOfRevenue(part: number, revenue: number): string {
  if (!Number.isFinite(revenue) || revenue <= 0 || !Number.isFinite(part)) return "—";
  return `${Math.round((part / revenue) * 100)}%`;
}

export function payShare(revenue: number, subPay: number): { subPercent: string; keep: number; keepPercent: string } {
  const safeRevenue = Number.isFinite(revenue) ? revenue : 0;
  const safeSubPay = Number.isFinite(subPay) ? subPay : 0;
  const keep = safeRevenue - safeSubPay;
  return { subPercent: shareOfRevenue(safeSubPay, safeRevenue), keep, keepPercent: shareOfRevenue(keep, safeRevenue) };
}
