// Green / amber / red for each vehicle maintenance item — one pure function
// shared by the Vehicles pages and the Monday email so they always agree.
// Dates are plain "YYYY-MM-DD" in America/New_York.
//   red   — overdue (by miles or by date)
//   amber — due within 500 mi or 30 days
//   green — later than that
//   gray  — never logged yet, or no schedule set
import { TEAM_HUB_TIMEZONE, getDateStringInTimeZone } from "@/lib/teamHubTimezone";

export const DUE_SOON_MILES = 500;
export const DUE_SOON_DAYS = 30;

export type DueLevel = "red" | "amber" | "green" | "gray";

export type ServiceItemSchedule = {
  name: string;
  intervalMiles: number | null;
  intervalMonths: number | null;
  dueDate: string | null; // date-only items
  lastDoneDate: string | null;
  lastDoneMileage: number | null;
};

export type DueInfo = { level: DueLevel; text: string };

export const DUE_RANK: Record<DueLevel, number> = { red: 3, amber: 2, green: 1, gray: 0 };

export function todayInCompanyTz(now: Date = new Date()): string {
  return getDateStringInTimeZone(now, TEAM_HUB_TIMEZONE);
}

function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function formatShortDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}

const miles = (n: number) => `${n.toLocaleString("en-US")} mi`;
const days = (n: number) => (n === 1 ? "1 day" : `${n} days`);

function levelFor(milesLeft: number | null, daysLeft: number | null): DueLevel {
  if ((milesLeft !== null && milesLeft < 0) || (daysLeft !== null && daysLeft < 0)) return "red";
  if ((milesLeft !== null && milesLeft <= DUE_SOON_MILES) || (daysLeft !== null && daysLeft <= DUE_SOON_DAYS)) return "amber";
  return "green";
}

export function computeDue(item: ServiceItemSchedule, currentMileage: number | null, today: string = todayInCompanyTz()): DueInfo {
  const hasInterval = Boolean(item.intervalMiles || item.intervalMonths);

  // Date-only item (inspection, registration, insurance…).
  if (!hasInterval) {
    if (!item.dueDate) return { level: "gray", text: `${item.name}: no due date set` };
    const left = dayNumber(item.dueDate) - dayNumber(today);
    const level = levelFor(null, left);
    if (left < 0) return { level, text: `${item.name} overdue by ${days(-left)} (was due ${formatShortDate(item.dueDate)})` };
    if (left === 0) return { level, text: `${item.name} due today` };
    return { level, text: `${item.name} due in ${days(left)} (${formatShortDate(item.dueDate)})` };
  }

  // Interval item: by miles and/or months since it was last done.
  let milesLeft: number | null = null;
  if (item.intervalMiles && item.lastDoneMileage !== null && currentMileage !== null) {
    milesLeft = item.lastDoneMileage + item.intervalMiles - currentMileage;
  }
  let daysLeft: number | null = null;
  if (item.intervalMonths && item.lastDoneDate) {
    daysLeft = dayNumber(addMonths(item.lastDoneDate, item.intervalMonths)) - dayNumber(today);
  }
  if (milesLeft === null && daysLeft === null) {
    return { level: "gray", text: `${item.name}: not logged yet` };
  }

  const level = levelFor(milesLeft, daysLeft);
  // Say whichever is closer (as a share of its own "soon" window).
  const milesUrgency = milesLeft === null ? Infinity : milesLeft / DUE_SOON_MILES;
  const daysUrgency = daysLeft === null ? Infinity : daysLeft / DUE_SOON_DAYS;
  if (milesUrgency <= daysUrgency) {
    const left = milesLeft as number;
    return { level, text: left < 0 ? `${item.name} overdue by ${miles(-left)}` : `${item.name} due in ${miles(left)}` };
  }
  const left = daysLeft as number;
  if (left < 0) return { level, text: `${item.name} overdue by ${days(-left)}` };
  if (left === 0) return { level, text: `${item.name} due today` };
  return { level, text: `${item.name} due in ${days(left)}` };
}

export const OIL_CHANGE = "Oil change";

// The one reminder every new vehicle starts with: oil change every 5,000 mi
// or 6 months, whichever comes first. More reminders can be added under
// Edit → "Service reminders".
export const DEFAULT_SERVICE_ITEMS: { name: string; intervalMiles: number | null; intervalMonths: number | null }[] = [
  { name: OIL_CHANGE, intervalMiles: 5000, intervalMonths: 6 },
];

// "Log service" quick-pick types (a custom reminder's name can also be one).
export const SERVICE_TYPES = [OIL_CHANGE, "Tires", "Alignment", "Balancing", "Brakes", "Repair", "Other"] as const;

export function isOilChangeItem(item: { name: string }): boolean {
  return item.name.trim().toLowerCase() === OIL_CHANGE.toLowerCase();
}
