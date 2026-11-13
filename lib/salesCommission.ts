// Commission-type math for the Sales & Commissions sheet, shared between
// app/api/sales/route.ts (server-side validation) and app/sales/page.tsx
// (client-side validation + the Pay Period Total view) — kept dependency-free
// (no googleapis) so it's safe to import from a "use client" file.
//
// Convention (confirmed with Andres): Commission % = 4 means Recurring,
// Commission % = 10 means OneTime. Any other % is tracked but excluded from
// the Pay Period Total rollup, since the spec only defines pay-period
// behavior for those two types.
//
// A "pay period" here is a calendar month — the spec's "prorated for partial
// first/last months" only makes sense under a monthly period, so recurring
// commissions are prorated by the fraction of each calendar month covered by
// RecurringStartDate..RecurringEndDate (inclusive).

import { parseISO } from "./dateUtils";

export type CommissionType = "Recurring" | "OneTime" | "Other";

/** The two commission rates: one-time sales and extra jobs 10%, recurring 4%. */
export const ONE_TIME_PERCENT = 10;
export const RECURRING_PERCENT = 4;

/** The choice on the Sales form and the Extra Jobs form ("Other" is no longer offered; old sales may still have it). */
export const COMMISSION_CHOICES: { type: Exclude<CommissionType, "Other">; percent: number; label: string }[] = [
  { type: "OneTime", percent: ONE_TIME_PERCENT, label: "One-time 10%" },
  { type: "Recurring", percent: RECURRING_PERCENT, label: "Recurring 4%" },
];

export function getCommissionType(commissionPercent: number): CommissionType {
  if (commissionPercent === RECURRING_PERCENT) return "Recurring";
  if (commissionPercent === ONE_TIME_PERCENT) return "OneTime";
  return "Other";
}

/** Commission totals split by type (the Sales page's Commission Due and per-salesperson table, /reports). */
export type CommissionSplit = { oneTime: number; recurring: number; other: number; total: number };

/** Adds up each sale's own commission amount by its type. Same math as before, only split. */
export function splitCommission(sales: { commissionPercent: number; commissionAmount: number }[]): CommissionSplit {
  const split: CommissionSplit = { oneTime: 0, recurring: 0, other: 0, total: 0 };
  for (const sale of sales) {
    const amount = Number.isFinite(sale.commissionAmount) ? sale.commissionAmount : 0;
    const type = getCommissionType(sale.commissionPercent);
    if (type === "OneTime") split.oneTime += amount;
    else if (type === "Recurring") split.recurring += amount;
    else split.other += amount;
    split.total += amount;
  }
  return split;
}

export function daysInMonth(year: number, month: number): number {
  // month is 1-based; day 0 of the next month is the last day of `month`.
  return new Date(year, month, 0).getDate();
}

// Shared validation for the "block save if % = 4 and either date is blank,
// or RecurringEndDate < RecurringStartDate" rule. Returns an error message,
// or null if valid. Only enforced for Recurring (% = 4) — OneTime and Other
// sales ignore the range fields entirely.
export function validateRecurringDates(
  commissionPercent: number,
  recurringStartDate: string,
  recurringEndDate: string
): string | null {
  if (getCommissionType(commissionPercent) !== "Recurring") return null;

  if (!recurringStartDate.trim() || !recurringEndDate.trim()) {
    return "Recurring (4%) needs a start date and an end date.";
  }

  const start = parseISO(recurringStartDate);
  const end = parseISO(recurringEndDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Invalid recurring date range.";
  }
  if (end < start) {
    return "Recurring end date must be on or after the start date.";
  }

  return null;
}

export type CommissionSaleLike = {
  soldBy: string;
  amountSold: number;
  commissionPercent: number;
  saleDate: string;
  recurringStartDate: string;
  recurringEndDate: string;
};

// Prorated recurring commission for one sale landing in the given pay-period
// month. Returns 0 if the sale isn't Recurring, has no valid range, or the
// range doesn't overlap that month at all.
export function recurringCommissionForMonth(
  sale: Pick<CommissionSaleLike, "amountSold" | "commissionPercent" | "recurringStartDate" | "recurringEndDate">,
  year: number,
  month: number // 1-12
): number {
  if (getCommissionType(sale.commissionPercent) !== "Recurring") return 0;
  if (!sale.recurringStartDate || !sale.recurringEndDate) return 0;

  const rangeStart = parseISO(sale.recurringStartDate);
  const rangeEnd = parseISO(sale.recurringEndDate);
  if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) return 0;

  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 0); // last day of the period month

  if (rangeEnd < periodStart || rangeStart > periodEnd) return 0;

  const overlapStart = rangeStart > periodStart ? rangeStart : periodStart;
  const overlapEnd = rangeEnd < periodEnd ? rangeEnd : periodEnd;
  // Math.round guards against DST transitions shifting the raw ms diff by
  // an hour, which would otherwise throw off the day count by a fraction.
  const overlapDays = Math.round((overlapEnd.getTime() - overlapStart.getTime()) / 86_400_000) + 1;
  const totalDaysInMonth = daysInMonth(year, month);

  const fullMonthlyCommission = sale.amountSold * (sale.commissionPercent / 100);
  return fullMonthlyCommission * (overlapDays / totalDaysInMonth);
}

// Full (non-prorated) commission for a OneTime sale, counted entirely in the
// pay period containing its Sale Date. Returns 0 for any other commission
// type or a sale date outside the given month.
export function oneTimeCommissionForMonth(
  sale: Pick<CommissionSaleLike, "amountSold" | "commissionPercent" | "saleDate">,
  year: number,
  month: number
): number {
  if (getCommissionType(sale.commissionPercent) !== "OneTime") return 0;
  if (!sale.saleDate) return 0;

  const date = parseISO(sale.saleDate);
  if (Number.isNaN(date.getTime())) return 0;
  if (date.getFullYear() !== year || date.getMonth() + 1 !== month) return 0;

  return sale.amountSold * (sale.commissionPercent / 100);
}

export type PayPeriodTotal = {
  soldBy: string;
  oneTimeTotal: number;
  recurringTotal: number;
  total: number;
};

// Per Sold-By person: one-time commissions landing in this pay period, plus
// recurring commissions whose range covers this pay period (prorated).
export function computePayPeriodTotals(
  sales: CommissionSaleLike[],
  year: number,
  month: number
): PayPeriodTotal[] {
  const totals = new Map<string, PayPeriodTotal>();

  function add(soldBy: string, oneTime: number, recurring: number) {
    if (oneTime === 0 && recurring === 0) return;
    const key = soldBy || "N/A";
    const current = totals.get(key) ?? { soldBy: key, oneTimeTotal: 0, recurringTotal: 0, total: 0 };
    current.oneTimeTotal += oneTime;
    current.recurringTotal += recurring;
    current.total += oneTime + recurring;
    totals.set(key, current);
  }

  for (const sale of sales) {
    add(
      sale.soldBy,
      oneTimeCommissionForMonth(sale, year, month),
      recurringCommissionForMonth(sale, year, month)
    );
  }

  return Array.from(totals.values()).sort((a, b) => b.total - a.total);
}

/** The Sales page's Quarter dropdown value for "Year to date" (Jan 1 to today's date). The Upsells card follows it too. */
export const YEAR_TO_DATE = "YTD";

/** "MM-DD" of today: where "Year to date" ends in any year. */
export function todayMonthDay(): string {
  const now = new Date();
  return `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export function getCurrentPayPeriod(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}
