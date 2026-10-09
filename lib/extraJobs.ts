// Extra Jobs: the shared words and rules for /extra-jobs. Plain TS with no
// server imports, so client components can use it directly. The database
// side is lib/pg/extra-jobs.ts.

export const EXTRA_JOBS_RULE = "Extra jobs not in the app don't get paid.";

/** The commission on an extra job: a one-time sale, 10% (lib/salesCommission.ts calls this "OneTime"). */
export const EXTRA_JOB_COMMISSION_PERCENT = 10;

export type ExtraJobSource = "call" | "text" | "email" | "portal";

export const SOURCES: { value: ExtraJobSource; label: string }[] = [
  { value: "call", label: "Call" },
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "portal", label: "Portal" },
];

export const SOURCE_LABEL: Record<ExtraJobSource, string> = { call: "Call", text: "Text", email: "Email", portal: "Portal" };

export type ExtraJobStatus = "setup" | "done";

export const STATUS_LABEL: Record<ExtraJobStatus, string> = { setup: "Set up", done: "Ready to invoice" };

export type ExtraJobPhoto = { id: string; url: string; fileName: string; uploadedBy: string; uploadedAt: string };

export type ExtraJob = {
  id: string;
  jobNumber: string;
  accountId: string;
  accountName: string;
  source: ExtraJobSource;
  description: string;
  /** YYYY-MM-DD */
  jobDate: string;
  customerPrice: number;
  subId: string;
  subName: string;
  subPay: number;
  soldBy: string;
  manager: string;
  status: ExtraJobStatus;
  saleId: string;
  createdBy: string;
  createdAt: string;
  doneBy: string;
  doneAt: string;
  doneNote: string;
  /** False when the email to the office did not go out, so the screen can say so. */
  setupEmailed: boolean;
  doneEmailed: boolean;
  photos: ExtraJobPhoto[];
};

/** What the work order needs from the account. The sub copy prints these; it never prints the price. */
export type ExtraJobAccount = { address: string; city: string; zip: string; keyAccess: string; hasKey: string; alarmCode: string; contactName: string; phone: string };

export type NewExtraJob = {
  accountId: string;
  accountName: string;
  source: ExtraJobSource;
  description: string;
  jobDate: string;
  customerPrice: number;
  subId: string;
  subName: string;
  subPay: number;
  soldBy: string;
};

export type FormChoices = {
  accounts: { id: string; name: string; subId: string; manager: string }[];
  subs: { id: string; name: string }[];
  sellers: string[];
  me: string;
};

export type PayRow = { subId: string; subName: string; jobs: ExtraJob[]; total: number };

export function money(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number.isFinite(value) ? value : 0);
}

/** A YYYY-MM-DD day in plain words, built in local time so it never shows as the day before. */
export function dayLabel(day: string, withWeekday = true): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  return new Date(y, m - 1, d, 12).toLocaleDateString("en-US", { ...(withWeekday ? { weekday: "short" as const } : {}), month: "short", day: "numeric", year: "numeric" });
}

export function isDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** The first and last day of the month a day is in: the default pay period. */
export function monthOf(day: string): { from: string; to: string } {
  const [y, m] = day.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

export function todayDay(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Checks the quick form. Returns what to tell the person, or "" when it is fine. */
export function checkNewExtraJob(job: NewExtraJob): string {
  if (!job.accountName.trim()) return "Pick the account.";
  if (!job.description.trim()) return "Write what the job is.";
  if (!isDay(job.jobDate)) return "Pick the date.";
  if (!Number.isFinite(job.customerPrice) || job.customerPrice <= 0) return "Enter the customer price.";
  if (!job.subName.trim()) return "Pick the sub.";
  if (!Number.isFinite(job.subPay) || job.subPay < 0) return "Enter the sub pay.";
  if (!job.soldBy.trim()) return "Pick who sold it.";
  return "";
}
