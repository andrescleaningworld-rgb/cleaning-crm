// Commission-type math for the Sales & Commissions sheet, shared between
// app/api/sales/route.ts (server-side validation) and app/sales/page.tsx
// (client-side validation + the Pay Period Total view) — kept dependency-free
// (no googleapis) so it's safe to import from a "use client" file.
//
// Convention (confirmed with Andres): Commission % = 4 means Recurring,
// Commission % = 10 means OneTime. Any other % is tracked but excluded from
// the commission totals, since the spec only defines pay-period behavior for
// those two types.
//
// A "pay period" here is a calendar month — the spec's "prorated for partial
// first/last months" only makes sense under a monthly period, so recurring
// commissions are prorated by the fraction of each calendar month covered by
// RecurringStartDate..RecurringEndDate (inclusive). One-time commission
// counts in the month the service is done (an extra job's job date).
// commissionForRange is the one place this is worked out: Pay Period Total
// (one month), Commission Due and the by-salesperson table (the picked
// quarter / year to date), and /reports (its date range).

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

/** Commission earned in a date range, split by type (the Sales page's Commission Due and per-salesperson table, /reports). */
export type CommissionSplit = { oneTime: number; recurring: number; total: number };

/** A day from "YYYY-MM-DD" (or any date text), at local midnight; null when it is not a date. */
function toDay(value: string | undefined): Date | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const date = /^\d{4}-\d{2}-\d{2}/.test(text) ? parseISO(text.slice(0, 10)) : new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Whole days from a to b, both counted (DST-safe). */
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;

/**
 * The Pay Period math over any range (YYYY-MM-DD, "" = open on that side):
 *   - One-time (10%): the whole commission, when the service date (an extra
 *     job's job date; else the sale date) is in the range.
 *   - Recurring (4%): 4% of the monthly amount for every month from its start
 *     date to its end date that falls in the range, prorated by the days of
 *     each month covered (a partial first / last month, or a range that ends
 *     mid-month such as Year to date).
 *   - Any other % (old sales) and a recurring sale without both dates: nothing,
 *     as in Pay Period Total.
 * Over one whole month this is exactly computePayPeriodTotals.
 */
export function commissionForRange(sales: CommissionSaleLike[], from: string, to: string): CommissionSplit {
  const rangeFrom = toDay(from);
  const rangeTo = toDay(to);
  const split: CommissionSplit = { oneTime: 0, recurring: 0, total: 0 };
  for (const sale of sales) {
    const type = getCommissionType(sale.commissionPercent);
    const commission = (Number.isFinite(sale.amountSold) ? sale.amountSold : 0) * (sale.commissionPercent / 100);
    if (type === "OneTime") {
      const day = toDay(sale.serviceDate || sale.saleDate);
      if (!day || (rangeFrom && day < rangeFrom) || (rangeTo && day > rangeTo)) continue;
      split.oneTime += commission;
    } else if (type === "Recurring") {
      const start = toDay(sale.recurringStartDate);
      const end = toDay(sale.recurringEndDate);
      if (!start || !end) continue;
      const lo = rangeFrom && rangeFrom > start ? rangeFrom : start;
      const hi = rangeTo && rangeTo < end ? rangeTo : end;
      // Month by month: the days of that month inside both the sale's range and the picked range.
      for (let month = new Date(lo.getFullYear(), lo.getMonth(), 1); month <= hi; month = new Date(month.getFullYear(), month.getMonth() + 1, 1)) {
        const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);
        const overlapStart = lo > month ? lo : month;
        const overlapEnd = hi < monthEnd ? hi : monthEnd;
        if (overlapEnd < overlapStart) continue;
        split.recurring += commission * (daysBetween(overlapStart, overlapEnd) / daysInMonth(month.getFullYear(), month.getMonth() + 1));
      }
    }
  }
  split.oneTime = Math.round(split.oneTime * 100) / 100;
  split.recurring = Math.round(split.recurring * 100) / 100;
  split.total = Math.round((split.oneTime + split.recurring) * 100) / 100;
  return split;
}

const QUARTER_DAYS: Record<string, [string, string]> = {
  Q1: ["01-01", "03-31"],
  Q2: ["04-01", "06-30"],
  Q3: ["07-01", "09-30"],
  Q4: ["10-01", "12-31"],
};

/**
 * The Sales page's Year + Quarter as a range of days (YYYY-MM-DD; "" = open):
 * a quarter, Year to date (Jan 1 to today's date), the whole year, or every
 * date when no year is picked.
 */
export function periodRange(year: string, quarter: string): [string, string] {
  if (!/^\d{4}$/.test(year)) return ["", ""];
  if (quarter === YEAR_TO_DATE) {
    const end = todayMonthDay();
    // Feb 29 in a year that has none: Feb 28.
    const leap = new Date(Number(year), 1, 29).getMonth() === 1;
    return [`${year}-01-01`, `${year}-${end === "02-29" && !leap ? "02-28" : end}`];
  }
  const [from, to] = QUARTER_DAYS[quarter] ?? ["01-01", "12-31"];
  return [`${year}-${from}`, `${year}-${to}`];
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
  /** When the service is done: an extra job's job date. Left out or "" = the sale date. One-time commission counts in this month. */
  serviceDate?: string;
  recurringStartDate: string;
  recurringEndDate: string;
};

/** Each Sold-By person's sales, in first-seen order ("N/A" when blank). */
export function groupBySeller<T extends { soldBy: string }>(sales: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const sale of sales) {
    const key = sale.soldBy || "N/A";
    groups.set(key, [...(groups.get(key) ?? []), sale]);
  }
  return groups;
}

export type PayPeriodTotal = {
  soldBy: string;
  oneTimeTotal: number;
  recurringTotal: number;
  total: number;
};

// Per Sold-By person, one calendar month: commissionForRange over that month
// (one-time in the month the service is done, recurring prorated).
export function computePayPeriodTotals(
  sales: CommissionSaleLike[],
  year: number,
  month: number
): PayPeriodTotal[] {
  const mm = String(month).padStart(2, "0");
  const from = `${year}-${mm}-01`;
  const to = `${year}-${mm}-${String(daysInMonth(year, month)).padStart(2, "0")}`;
  return Array.from(groupBySeller(sales))
    .map(([soldBy, personSales]) => {
      const split = commissionForRange(personSales, from, to);
      return { soldBy, oneTimeTotal: split.oneTime, recurringTotal: split.recurring, total: split.total };
    })
    .filter((row) => row.total !== 0)
    .sort((a, b) => b.total - a.total);
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
