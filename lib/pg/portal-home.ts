// What the customer portal's home screen shows for one account: who to
// call, the next cleanings, past visits and the customer's own requests.
// Postgres only. Unlike the staff lists, these reads include test accounts.
//
// Never returned to a customer: revenue, sub pay, margins, key and alarm
// notes, staff notes, the subcontractor's name, a visit's condition score
// or its notes.

import { getSql } from "@/lib/db";
import { generateScheduleDates, isScheduleEffectivelyActive, toISO, todayISO } from "@/lib/scheduleRecurrence";

const text = (value: unknown) => String(value ?? "").trim();

export type PortalHomeAccount = {
  accountId: string;
  accountName: string;
  address: string;
  serviceType: string;
  frequency: string;
  cleaningDays: string;
  status: string;
  managerName: string;
  managerPhone: string;
  isTest: boolean;
};

export async function getPortalHomeAccount(accountId: string): Promise<PortalHomeAccount | null> {
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT a.id, a.account_name, a.address, a.city, a.zip, a.service_type, a.frequency, a.cleaning_days, a.status, a.manager_raw, a.is_test,
            COALESCE(m.name, '') AS manager_name, COALESCE(m.phone, '') AS manager_phone
     FROM accounts a
     LEFT JOIN LATERAL (
       SELECT name, phone FROM managers
       WHERE (a.manager_id IS NOT NULL AND managers.id = a.manager_id)
          OR (a.manager_id IS NULL AND btrim(a.manager_raw) <> '' AND lower(btrim(managers.name)) = lower(btrim(a.manager_raw)))
       ORDER BY managers.id LIMIT 1
     ) m ON true
     WHERE a.id = $1::text`,
    [accountId]
  )) as Record<string, unknown>[];
  const r = rows[0];
  if (!r) return null;
  return {
    accountId: text(r.id),
    accountName: text(r.account_name),
    address: [r.address, r.city, r.zip].map(text).filter(Boolean).join(", "),
    serviceType: text(r.service_type),
    frequency: text(r.frequency),
    cleaningDays: text(r.cleaning_days),
    status: text(r.status),
    managerName: text(r.manager_name) || text(r.manager_raw),
    managerPhone: text(r.manager_phone),
    isTest: r.is_test === true,
  };
}

// ─── The schedule as dates ───────────────────────────────────────────────────

export type PortalCleaning = { date: string; timeWindow: string; moved: boolean };

/**
 * The cleaning days of an account between two days (both included), from
 * its active weekly / every-other-week / monthly pattern, with skipped days
 * taken out and moved days moved. Soonest first.
 */
async function scheduledDays(accountId: string, fromIso: string, toIso: string): Promise<PortalCleaning[]> {
  const sql = getSql();
  const [schedules, exceptions] = (await Promise.all([
    sql.query(
      `SELECT day_of_week, time_window, recurring, frequency, monthly_occurrence, status,
              COALESCE(effective_start::text, '') AS effective_start, COALESCE(effective_end::text, '') AS effective_end
       FROM sub_schedules WHERE account_ref = $1::text OR btrim(account_id) = $1::text`,
      [accountId]
    ),
    sql.query(
      `SELECT type, COALESCE(original_date::text, '') AS original_date, COALESCE(new_date::text, '') AS new_date, new_time_window
       FROM schedule_exceptions WHERE account_ref = $1::text OR btrim(account_id) = $1::text`,
      [accountId]
    ),
  ])) as Record<string, string>[][];

  const start = new Date(`${fromIso}T00:00:00`);
  const end = new Date(`${toIso}T00:00:00`);
  const byDate = new Map<string, PortalCleaning>();
  for (const s of schedules) {
    // A pattern counts for the days it was in force: active, and not ended before the first day asked for.
    if (!isScheduleEffectivelyActive({ status: text(s.status), effectiveEnd: text(s.effective_end) }, fromIso)) continue;
    // Rows saved before the frequency column existed are weekly patterns.
    const frequency = text(s.frequency) || (text(s.recurring).toUpperCase() === "N" ? "AS_NEEDED" : "WEEKLY");
    const dates = generateScheduleDates(
      { frequency, dayOfWeek: text(s.day_of_week), monthlyOccurrence: text(s.monthly_occurrence), effectiveStart: text(s.effective_start), effectiveEnd: text(s.effective_end) },
      start,
      end
    );
    for (const date of dates) if (date >= fromIso && date <= toIso && !byDate.has(date)) byDate.set(date, { date, timeWindow: text(s.time_window), moved: false });
  }
  for (const e of exceptions) {
    const originalDate = text(e.original_date);
    const original = byDate.get(originalDate);
    const newDate = text(e.new_date);
    const isMove = text(e.type).toLowerCase() === "reschedule" && newDate !== "";
    if (original) byDate.delete(originalDate);
    // A day moved into the range counts even when the day it came from is outside it.
    if (isMove && newDate >= fromIso && newDate <= toIso && (original || originalDate < fromIso || originalDate > toIso)) {
      byDate.set(newDate, { date: newDate, timeWindow: text(e.new_time_window) || original?.timeWindow || "", moved: true });
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const isoPlusDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISO(d);
};

// ─── Next cleanings ──────────────────────────────────────────────────────────

/** The next cleanings for an account: today and the 90 days after, at most `limit` days, soonest first. */
export async function getNextCleanings(accountId: string, limit = 6): Promise<PortalCleaning[]> {
  const today = todayISO();
  return (await scheduledDays(accountId, today, isoPlusDays(today, 90))).slice(0, limit);
}

// ─── Past visits ─────────────────────────────────────────────────────────────

export type PortalPastVisit = { date: string; kind: "cleaning" | "check" | "scheduled" };

/**
 * The last 60 days at this location, newest first:
 *   "cleaning"   a cleaning the crew logged
 *   "check"      a quality check by a Cleaning World manager
 *   "scheduled"  a cleaning day on the schedule that has passed and that
 *                nobody logged. It says what was planned, not that it was
 *                confirmed done, and the screen names it that way.
 * A day with a logged cleaning is not also listed as scheduled. Dates only.
 */
export async function getPastVisits(accountId: string, accountName: string, limit = 40): Promise<PortalPastVisit[]> {
  const sql = getSql();
  const today = todayISO();
  const [logged, scheduled] = await Promise.all([
    sql.query(
      `SELECT visit_date::text AS date, 'cleaning' AS kind FROM subcontractor_visits
         WHERE visit_date IS NOT NULL AND visit_date <= CURRENT_DATE AND (account_ref = $1::text OR (account_ref IS NULL AND lower(btrim(account_name)) = lower(btrim($2::text))))
       UNION ALL
       SELECT visit_date::text AS date, 'check' AS kind FROM visits
         WHERE visit_date IS NOT NULL AND visit_date <= CURRENT_DATE AND (account_ref = $1::text OR (account_ref IS NULL AND lower(btrim(account_name)) = lower(btrim($2::text))))`,
      [accountId, accountName]
    ) as unknown as Promise<PortalPastVisit[]>,
    scheduledDays(accountId, isoPlusDays(today, -60), isoPlusDays(today, -1)),
  ]);
  const cleaned = new Set(logged.filter((v) => v.kind === "cleaning").map((v) => v.date));
  const rank = { cleaning: 0, scheduled: 1, check: 2 } as const;
  return [...logged, ...scheduled.filter((s) => !cleaned.has(s.date)).map((s) => ({ date: s.date, kind: "scheduled" as const }))]
    .sort((a, b) => b.date.localeCompare(a.date) || rank[a.kind] - rank[b.kind])
    .slice(0, limit);
}

// ─── My requests ─────────────────────────────────────────────────────────────

export type PortalRequestKind = "problem" | "service" | "date" | "billing";
export type PortalRequestState = "received" | "working" | "done";
export type PortalMyRequest = {
  key: string;
  kind: PortalRequestKind;
  date: string;
  summary: string;
  state: PortalRequestState;
};

const KIND_OF_TAB: Record<string, PortalRequestKind> = {
  "portal-complaints": "problem",
  "portal-service-requests": "service",
  "portal-date-changes": "date",
  "portal-billing-requests": "billing",
};

/** Staff statuses in three plain steps: New → received; In Progress → working; Resolved / Closed → done. */
export function plainState(status: string): PortalRequestState {
  const s = status.trim().toLowerCase();
  if (s === "resolved" || s === "closed" || s === "done" || s === "completed") return "done";
  if (s === "" || s === "new") return "received";
  return "working";
}

/** Everything this account sent from the portal, newest first. Staff notes are not included. */
export async function getMyRequests(accountId: string): Promise<PortalMyRequest[]> {
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT id, tab, submitted_date_raw, field_1, field_2, status FROM portal_requests
     WHERE account_ref = $1::text OR btrim(account_id_raw) = $1::text
     ORDER BY created_at DESC, id DESC LIMIT 50`,
    [accountId]
  )) as { id: number; tab: string; submitted_date_raw: string; field_1: string; field_2: string; status: string }[];
  return rows.map((r) => ({
    key: String(r.id),
    kind: KIND_OF_TAB[r.tab] ?? "service",
    date: text(r.submitted_date_raw),
    // Date changes read "from → to"; the others show what was picked.
    summary: r.tab === "portal-date-changes" ? `${text(r.field_1)} → ${text(r.field_2)}` : text(r.field_1),
    state: plainState(r.status),
  }));
}
