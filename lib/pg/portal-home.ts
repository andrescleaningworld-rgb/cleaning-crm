// What the customer portal's home screen shows for one account: who to
// call, the next cleanings, past visits and the customer's own requests.
// Postgres only. Unlike the staff lists, these reads include test accounts.
//
// Never returned to a customer: revenue, sub pay, margins, key and alarm
// notes, staff notes, the subcontractor's name, a visit's condition score
// or its notes.

import { getSql } from "@/lib/db";
import { addDays, officeDay } from "@/lib/cleanings";
import { accountStartDays, cancelledLastDays } from "@/lib/pg/accounts";
import { generateScheduleDates, isScheduleEffectivelyActive, toISO, todayISO } from "@/lib/scheduleRecurrence";
import { getFeatureSetting } from "@/lib/pg/feature-settings";
import { PORTAL_COMPLAINT_REPORTED_BY } from "@/lib/pg/customer-portal";

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
  managerEmail: string;
  isTest: boolean;
};

export async function getPortalHomeAccount(accountId: string): Promise<PortalHomeAccount | null> {
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT a.id, a.account_name, a.address, a.city, a.zip, a.service_type, a.frequency, a.cleaning_days, a.status, a.manager_raw, a.is_test,
            COALESCE(m.name, '') AS manager_name, COALESCE(m.phone, '') AS manager_phone, COALESCE(m.email, '') AS manager_email
     FROM accounts a
     LEFT JOIN LATERAL (
       SELECT name, phone, email FROM managers
       WHERE (a.manager_id IS NOT NULL AND managers.id = a.manager_id)
          OR (a.manager_id IS NULL AND btrim(a.manager_raw) <> '' AND lower(btrim(managers.name)) = lower(btrim(a.manager_raw)))
       ORDER BY managers.id LIMIT 1
     ) m ON true
     WHERE a.id = $1::text AND (to_jsonb(a)->>'deleted_at') IS NULL`,
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
    managerEmail: text(r.manager_email),
    isTest: r.is_test === true,
  };
}

// ─── The schedule as dates ───────────────────────────────────────────────────

/**
 * The monthly price of one account, for that account's own customer: "$1,560.00",
 * or "" when no price is on file. It reads the account's price field and
 * nothing else: never what the sub is paid, the margin, or any other number.
 */
export async function getMonthlyPrice(accountId: string): Promise<string> {
  const rows = (await getSql().query(`SELECT monthly_revenue::text AS price, monthly_revenue_raw FROM accounts WHERE id = $1::text`, [accountId])) as { price: string | null; monthly_revenue_raw: string }[];
  const row = rows[0];
  if (!row) return "";
  const typed = text(row.monthly_revenue_raw).replace(/[$,\s]/g, "");
  const amount = row.price !== null ? Number(row.price) : typed !== "" ? Number(typed) : NaN;
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

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
  // A cancelled account has no cleanings after its final cleaning date (none from today on when it has no such date).
  const cancelled = (await cancelledLastDays()).get(accountId.trim());
  const lastDay = cancelled === undefined ? "" : cancelled || addDays(officeDay(), -1);
  // None before the account's Start Date.
  const firstDay = (await accountStartDays()).get(accountId.trim()) ?? "";
  return [...byDate.values()]
    .filter((cleaning) => (!lastDay || cleaning.date <= lastDay) && (!firstDay || cleaning.date >= firstDay))
    .sort((a, b) => a.date.localeCompare(b.date));
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
  /** A problem followed on the complaint itself ("Customer complaint updates" on): its number, and Received → Working on it → Fixed. */
  complaintNumber?: string;
  /** The same problem's 4-step tracker (complaintTrack). Only with complaintNumber. */
  track?: ComplaintTrack;
};

/**
 * A portal complaint's tracker: 0 Received, 1 Seen by your manager, 2 Team on
 * it, 3 Fixed. `at` = when each step was reached (ISO), "" when we do not know.
 */
export type ComplaintTrack = { step: 0 | 1 | 2 | 3; at: [string, string, string, string] };

/** What one complaint's tracker is worked out from: the complaint row, its pin, and its history. */
export type ComplaintTrackFacts = {
  status: string;
  createdAt: string;
  firstResponseAt: string | null;
  /** The pin's current board status (lib/board.ts), "" = no pin or none. */
  pinStatus: string;
  /** Earliest "Waiting on team" given on its pin (board_status_log), "". */
  pinTeamAt: string;
  /** From the activity log: when the status went to In Progress / Resolved by Sub (earliest), and when staff closed or resolved it (latest). */
  teamAt: string;
  fixedAt: string;
};

const isFixedStatus = (s: string) => /^(closed|resolved)/.test(s) && !s.startsWith("resolved by sub");
const isTeamStatus = (s: string) => s.startsWith("in progress") || s.startsWith("resolved by sub");

/**
 * Received → Seen by your manager → Team on it → Fixed. Steps only move
 * forward: a step reached once (in the history) stays reached, even when the
 * pin's status changes later. The one exception: a Fixed complaint that is
 * reopened (status no longer Closed / Resolved) drops back to Team on it.
 * Earlier steps count as done when a later one is.
 */
export function complaintTrack(f: ComplaintTrackFacts): ComplaintTrack {
  const s = f.status.trim().toLowerCase();
  const seen = Boolean(f.firstResponseAt) || (s !== "" && s !== "open" && s !== "new");
  // Fixed once and reopened (status no longer Closed / Resolved): back to "Team on it", the one step that can go back.
  const reopened = Boolean(f.fixedAt) && !isFixedStatus(s);
  const team = reopened || isTeamStatus(s) || f.pinStatus === "waiting_sub" || Boolean(f.pinTeamAt) || Boolean(f.teamAt);
  const fixed = isFixedStatus(s);
  const step = fixed ? 3 : team ? 2 : seen ? 1 : 0;
  const earliest = (...values: string[]) => values.filter(Boolean).sort()[0] ?? "";
  return { step, at: [f.createdAt, f.firstResponseAt ?? "", earliest(f.pinTeamAt, f.teamAt), f.fixedAt] };
}

const isoOf = (value: string | Date | null | undefined) => {
  if (!value) return "";
  const day = value instanceof Date ? value : new Date(value);
  return Number.isNaN(day.getTime()) ? "" : day.toISOString();
};

/**
 * The pin and history facts for these complaints, by complaints.id. Each read
 * stands alone: one that fails (a table not there yet) just gives no facts.
 */
async function complaintTrackHistory(rows: { id: number; complaint_id: string; legacy_key: string; sheet_row: number }[]) {
  const sql = getSql();
  const keysOf = (r: (typeof rows)[number]) => [r.complaint_id, r.legacy_key, String(r.sheet_row)].filter(Boolean);
  const allKeys = [...new Set(rows.flatMap(keysOf))];
  const quiet = <T>(read: Promise<T>, fallback: T, what: string) =>
    read.catch((error) => {
      console.error(`[portal tracker] ${what} did not load:`, error instanceof Error ? error.message : error);
      return fallback;
    });

  const [pins, pinLog, log] = await Promise.all([
    // A complaint's own pin: kind "complaint", item_id = its COMP number (or legacy key).
    quiet(
      sql.query(
        `SELECT item_id, to_jsonb(handoff_items)->>'board_status' AS board_status FROM handoff_items WHERE kind = 'complaint' AND item_id = ANY($1::text[])`,
        [allKeys]
      ) as unknown as Promise<{ item_id: string; board_status: string | null }[]>,
      [],
      "pins"
    ),
    quiet(
      sql.query(
        `SELECT item_id, min(at) AS at FROM board_status_log
         WHERE kind = 'complaint' AND event = 'status' AND status = 'waiting_sub' AND item_id = ANY($1::text[])
         GROUP BY item_id`,
        [allKeys]
      ) as unknown as Promise<{ item_id: string; at: string | Date }[]>,
      [],
      "pin history"
    ),
    // Staff edits ("Complaint edited: Status: Open → In Progress; …") and closes (no detail).
    quiet(
      sql.query(
        `SELECT entity_id, action, detail, created_at FROM activity_log
         WHERE entity_type = 'complaint' AND entity_id = ANY($1::text[]) AND action = 'update'`,
        [allKeys]
      ) as unknown as Promise<{ entity_id: string; action: string; detail: string | null; created_at: string | Date }[]>,
      [],
      "history"
    ),
  ]);

  const facts = new Map<number, Pick<ComplaintTrackFacts, "pinStatus" | "pinTeamAt" | "teamAt" | "fixedAt">>();
  for (const r of rows) {
    const keys = new Set(keysOf(r));
    const pinStatus = text(pins.find((p) => keys.has(p.item_id))?.board_status);
    const pinTeamAt = pinLog.filter((p) => keys.has(p.item_id)).map((p) => isoOf(p.at)).filter(Boolean).sort()[0] ?? "";
    let teamAt = "";
    let fixedAt = "";
    for (const entry of log.filter((e) => keys.has(e.entity_id))) {
      const at = isoOf(entry.created_at);
      if (!at) continue;
      const detail = text(entry.detail);
      if (detail === "") {
        // "Close complaint" (staff): logged with no detail.
        if (at > fixedAt) fixedAt = at;
        continue;
      }
      const to = /\bStatus: [^;]*? → ([^;]*)/i.exec(detail)?.[1]?.trim().toLowerCase() ?? "";
      if (isTeamStatus(to) && (!teamAt || at < teamAt)) teamAt = at;
      if (isFixedStatus(to) && at > fixedAt) fixedAt = at;
    }
    facts.set(r.id, { pinStatus, pinTeamAt, teamAt, fixedAt });
  }
  return facts;
}

/** A customer's complaint in three plain steps: nobody answered yet → received; answered or being worked → working; staff closed / resolved → done. */
export function complaintPlainState(status: string, firstResponseAt: string | null): PortalRequestState {
  const s = status.trim().toLowerCase();
  // "Resolved by Sub" still waits for the office to check it.
  if (/^(closed|resolved)/.test(s) && !s.startsWith("resolved by sub")) return "done";
  if (firstResponseAt || (s !== "" && s !== "open" && s !== "new")) return "working";
  return "received";
}

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
  )) as { id: number; tab: string; submitted_date_raw: string; field_1: string; field_2: string; status: string; created_at?: string | Date }[];
  const requests = rows.map((r) => ({
    key: String(r.id),
    kind: KIND_OF_TAB[r.tab] ?? "service",
    date: text(r.submitted_date_raw),
    // Date changes read "from → to"; the others show what was picked.
    summary: r.tab === "portal-date-changes" ? `${text(r.field_1)} → ${text(r.field_2)}` : text(r.field_1),
    state: plainState(r.status),
  }));

  // "Customer complaint updates" on (Settings): each problem is followed on
  // the complaint itself, so the customer sees what staff and the sub do.
  // Off: as before. Never fails the page.
  try {
    if (!(await getFeatureSetting("customerComplaintLoop")).on) return requests;
    const complaints = (await sql.query(
      `SELECT id, btrim(complaint_id) AS complaint_id, legacy_key, sheet_row, complaint_date::text AS day, complaint_date_raw, issue, status,
              to_jsonb(complaints)->>'first_response_at' AS first_response_at, created_at
       FROM complaints
       WHERE account_ref = $1::text AND reported_by = $2 AND lower(btrim(status)) NOT LIKE 'merged%'
       ORDER BY created_at DESC LIMIT 50`,
      [accountId, PORTAL_COMPLAINT_REPORTED_BY]
    )) as { id: number; complaint_id: string; legacy_key: string; sheet_row: number; day: string | null; complaint_date_raw: string; issue: string; status: string; first_response_at: string | null; created_at: string | Date }[];
    if (complaints.length === 0) return requests;
    const history = await complaintTrackHistory(complaints);
    // A portal request row of a problem that is now a complaint (same day) shows once: as the complaint.
    const days = new Set(complaints.map((c) => c.day ?? ""));
    const requestDay = (mdy: string) => {
      const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(mdy.trim());
      return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : "";
    };
    const others = requests.filter((r) => !(r.kind === "problem" && days.has(requestDay(r.date))));
    const problems: PortalMyRequest[] = complaints.map((c) => {
      const track = complaintTrack({
        status: c.status,
        createdAt: isoOf(c.created_at),
        firstResponseAt: isoOf(c.first_response_at) || null,
        pinStatus: "",
        pinTeamAt: "",
        teamAt: "",
        fixedAt: "",
        ...history.get(c.id),
      });
      return {
        key: `complaint-${c.complaint_id || c.sheet_row}`,
        kind: "problem",
        date: c.day ? `${Number(c.day.slice(5, 7))}/${Number(c.day.slice(8, 10))}/${c.day.slice(0, 4)}` : text(c.complaint_date_raw),
        // What they wrote (no kind in front, no later additions, no staff text).
        summary: c.issue.split(/\n\n(?:Added by the customer|Merged from complaint)/)[0].replace(/^(Missed Cleaning|Quality Issue|Staff Conduct|Damaged Property|Communication Issue|Other):\s*/i, "").trim().slice(0, 140),
        // The 3-word state follows the tracker, so it never moves back either.
        state: track.step === 3 ? "done" : track.step === 0 ? "received" : "working",
        complaintNumber: c.complaint_id || String(c.sheet_row),
        track,
      };
    });
    const when = (r: PortalMyRequest) => {
      const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(r.date);
      return m ? Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2])) : 0;
    };
    return [...problems, ...others].sort((a, b) => when(b) - when(a));
  } catch (error) {
    console.error("[portal requests] complaints did not load:", error instanceof Error ? error.message : error);
    return requests;
  }
}
