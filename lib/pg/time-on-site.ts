// Approx. time on site per account (db/migrations/042_time_on_site.sql).
// Read and set by the account page, the quick fill-in screen and the sub
// portal; Coverage reads it to tell whether a sub has the time for a new job.
//
// Before migration 042 is on a database, timeOnSiteReady() is false and the
// screens leave time on site out instead of failing.

import { getSql } from "@/lib/db";
import {
  clampMinutesOnSite,
  SUB_ANSWER_REVIEW_MINUTES,
  toTimeOnSiteSource,
  type TimeOnSite,
} from "@/lib/time-on-site";

let ready: boolean | null = null;

export async function timeOnSiteReady(): Promise<boolean> {
  if (ready === true) return true;
  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'minutes_on_site'
    `) as unknown[];
    ready = rows.length > 0;
  } catch {
    ready = false;
  }
  return ready;
}

type TimeRow = {
  id: string;
  minutes_on_site: number;
  minutes_on_site_source: string;
  minutes_on_site_by: string;
  minutes_on_site_at: string | Date | null;
  sub_minutes_on_site: number | null;
  sub_minutes_on_site_at: string | Date | null;
};

const iso = (value: string | Date | null) => (value ? new Date(value).toISOString() : "");

function toTimeOnSite(row: TimeRow): TimeOnSite {
  return {
    accountId: row.id,
    minutes: row.minutes_on_site,
    source: toTimeOnSiteSource(row.minutes_on_site_source),
    by: row.minutes_on_site_by,
    at: iso(row.minutes_on_site_at),
    subMinutes: row.sub_minutes_on_site,
    subAt: iso(row.sub_minutes_on_site_at),
  };
}

const TIME_COLUMNS = `id, minutes_on_site, minutes_on_site_source, minutes_on_site_by, minutes_on_site_at, sub_minutes_on_site, sub_minutes_on_site_at`;

export async function getTimeOnSite(accountId: string): Promise<TimeOnSite | null> {
  const sql = getSql();
  const rows = (await sql.query(`SELECT ${TIME_COLUMNS} FROM accounts WHERE id = btrim($1) LIMIT 1`, [accountId])) as TimeRow[];
  return rows[0] ? toTimeOnSite(rows[0]) : null;
}

/** Every account's time on site, by Account ID. */
export async function timeOnSiteByAccount(): Promise<Map<string, TimeOnSite>> {
  const sql = getSql();
  const rows = (await sql.query(`SELECT ${TIME_COLUMNS} FROM accounts WHERE id IS NOT NULL AND is_test = false AND (to_jsonb(accounts)->>'deleted_at') IS NULL`)) as TimeRow[];
  return new Map(rows.map((row) => [row.id, toTimeOnSite(row)]));
}

/** The office sets it (account page, quick fill-in). Also clears a sub answer that is waiting. */
export async function setTimeOnSiteByOffice(accountId: string, minutes: number, by: string): Promise<TimeOnSite | null> {
  const sql = getSql();
  const rows = (await sql.query(
    `UPDATE accounts SET minutes_on_site = $2, minutes_on_site_source = 'office', minutes_on_site_by = $3, minutes_on_site_at = now(),
       sub_minutes_on_site = NULL, sub_minutes_on_site_at = NULL, updated_at = now()
     WHERE id = btrim($1)
     RETURNING ${TIME_COLUMNS}`,
    [accountId, clampMinutesOnSite(minutes), by]
  )) as TimeRow[];
  return rows[0] ? toTimeOnSite(rows[0]) : null;
}

/**
 * The sub answers in their portal. It becomes the account's time on site,
 * except when the office already set one and the two are more than 30
 * minutes apart: then the office's figure stays and the sub's answer waits
 * for the office to look at it.
 */
export async function setTimeOnSiteBySub(accountId: string, minutes: number, subName: string): Promise<{ time: TimeOnSite | null; kept: boolean }> {
  const value = clampMinutesOnSite(minutes);
  const sql = getSql();
  const rows = (await sql.query(
    `UPDATE accounts SET
       sub_minutes_on_site    = CASE WHEN keep THEN $2 ELSE NULL END,
       sub_minutes_on_site_at = CASE WHEN keep THEN now() ELSE NULL END,
       minutes_on_site        = CASE WHEN keep THEN minutes_on_site ELSE $2 END,
       minutes_on_site_source = CASE WHEN keep THEN minutes_on_site_source ELSE 'sub' END,
       minutes_on_site_by     = CASE WHEN keep THEN minutes_on_site_by ELSE $3 END,
       minutes_on_site_at     = CASE WHEN keep THEN minutes_on_site_at ELSE now() END,
       updated_at = now()
     FROM (SELECT minutes_on_site_source = 'office' AND abs(minutes_on_site - $2) > $4 AS keep FROM accounts WHERE id = btrim($1)) AS rule
     WHERE accounts.id = btrim($1)
     RETURNING accounts.id, accounts.minutes_on_site, accounts.minutes_on_site_source, accounts.minutes_on_site_by, accounts.minutes_on_site_at,
       accounts.sub_minutes_on_site, accounts.sub_minutes_on_site_at, rule.keep`,
    [accountId, value, subName, SUB_ANSWER_REVIEW_MINUTES]
  )) as (TimeRow & { keep: boolean })[];
  return rows[0] ? { time: toTimeOnSite(rows[0]), kept: rows[0].keep } : { time: null, kept: false };
}

export type TimeOnSiteListItem = TimeOnSite & {
  accountName: string;
  subName: string;
  cleaningDays: string;
  frequency: string;
  /** False when the account has no live row in Sub Schedules (Coverage cannot count it). */
  hasSchedule: boolean;
};

/** Active accounts with their time on site, for the quick fill-in screen. Sorted by sub, then account. */
export async function listTimeOnSite(): Promise<TimeOnSiteListItem[]> {
  const sql = getSql();
  const rows = (await sql.query(`
    SELECT ${TIME_COLUMNS.split(", ").map((column) => `a.${column}`).join(", ")},
      a.account_name, a.cleaning_days, a.frequency,
      COALESCE(NULLIF(btrim(a.subcontractor_raw), ''), NULLIF(btrim(s.company_name), ''), NULLIF(btrim(s.contact_name), ''), '') AS sub_name,
      EXISTS (
        SELECT 1 FROM sub_schedules ss
        WHERE COALESCE(ss.account_ref, btrim(ss.account_id)) = a.id
          AND lower(btrim(ss.status)) = 'active'
          AND (ss.effective_end IS NULL OR ss.effective_end >= current_date)
      ) AS has_schedule
    FROM accounts a
    LEFT JOIN subcontractors s ON s.id = a.subcontractor_id
    WHERE a.id IS NOT NULL AND a.is_test = false AND a.status_key = 'active' AND (to_jsonb(a)->>'deleted_at') IS NULL
    ORDER BY lower(btrim(a.subcontractor_raw)), lower(a.account_name)
  `)) as (TimeRow & { account_name: string; cleaning_days: string; frequency: string; sub_name: string; has_schedule: boolean })[];
  return rows.map((row) => ({
    ...toTimeOnSite(row),
    accountName: row.account_name,
    subName: row.sub_name,
    cleaningDays: row.cleaning_days,
    frequency: row.frequency,
    hasSchedule: row.has_schedule,
  }));
}

/* ---------- the sub's own answer (sub portal) ---------- */

export type SubTimeOnSiteItem = { accountId: string; accountName: string; minutes: number; source: TimeOnSite["source"]; waiting: boolean };

// The sub signed in by email: their subcontractor row, only when exactly one matches.
const SUB_BY_EMAIL = `(SELECT CASE WHEN count(*) = 1 THEN min(id) END FROM subcontractors WHERE btrim($1) <> '' AND lower(btrim(email)) = lower(btrim($1)))`;

/** The active accounts of the sub with this email, for their portal. */
export async function listTimeOnSiteForSub(email: string): Promise<SubTimeOnSiteItem[]> {
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT id, account_name, minutes_on_site, minutes_on_site_source, sub_minutes_on_site
     FROM accounts
     WHERE id IS NOT NULL AND is_test = false AND status_key = 'active' AND (to_jsonb(accounts)->>'deleted_at') IS NULL AND subcontractor_id = ${SUB_BY_EMAIL}
     ORDER BY lower(account_name)`,
    [email]
  )) as { id: string; account_name: string; minutes_on_site: number; minutes_on_site_source: string; sub_minutes_on_site: number | null }[];
  return rows.map((row) => ({
    accountId: row.id,
    accountName: row.account_name,
    // While their answer waits for the office, the sub sees their own answer.
    minutes: row.sub_minutes_on_site ?? row.minutes_on_site,
    source: toTimeOnSiteSource(row.minutes_on_site_source),
    waiting: row.sub_minutes_on_site !== null,
  }));
}

/** True when the account is an active account of the sub with this email. */
export async function subHasAccount(email: string, accountId: string): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT 1 FROM accounts WHERE id = btrim($2) AND is_test = false AND status_key = 'active' AND (to_jsonb(accounts)->>'deleted_at') IS NULL AND subcontractor_id = ${SUB_BY_EMAIL}`,
    [email, accountId]
  )) as unknown[];
  return rows.length > 0;
}
