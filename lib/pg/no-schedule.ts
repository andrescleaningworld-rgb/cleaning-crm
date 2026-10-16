// Active accounts with no Sub Schedule: the red "No schedule" tile in
// Accounts Center and the banner on the account page. Coverage → "Who's
// free?" cannot count these accounts, so the office adds their schedules.
//
// "Has a schedule" is the same rule Coverage uses (lib/pg/availability.ts):
// a row in sub_schedules with status Active that has not ended.

import { getSql } from "@/lib/db";

export type NoScheduleAccount = {
  accountId: string;
  accountName: string;
  subName: string;
  /** The sub's email: Sub Schedules' Add schedule picks the sub by it. */
  subEmail: string;
  cleaningDays: string;
  frequency: string;
};

const LIVE_SCHEDULE = `
  EXISTS (
    SELECT 1 FROM sub_schedules ss
    WHERE COALESCE(ss.account_ref, btrim(ss.account_id)) = a.id
      AND lower(btrim(ss.status)) = 'active'
      AND (ss.effective_end IS NULL OR ss.effective_end >= current_date)
  )`;

const ACTIVE = `a.id IS NOT NULL AND a.is_test = false AND a.status_key = 'active' AND (to_jsonb(a)->>'deleted_at') IS NULL`;

/** Every active account with no schedule, sorted by sub, then account. */
export async function listAccountsWithoutSchedule(): Promise<NoScheduleAccount[]> {
  const sql = getSql();
  const rows = (await sql.query(`
    SELECT a.id, a.account_name, a.cleaning_days, a.frequency,
      COALESCE(NULLIF(btrim(a.subcontractor_raw), ''), NULLIF(btrim(s.company_name), ''), NULLIF(btrim(s.contact_name), ''), '') AS sub_name,
      COALESCE(btrim(s.email), '') AS sub_email
    FROM accounts a
    LEFT JOIN subcontractors s ON s.id = a.subcontractor_id
    WHERE ${ACTIVE} AND NOT ${LIVE_SCHEDULE}
    ORDER BY lower(btrim(a.subcontractor_raw)), lower(a.account_name)
  `)) as { id: string; account_name: string; cleaning_days: string; frequency: string; sub_name: string; sub_email: string }[];
  return rows.map((row) => ({
    accountId: row.id,
    accountName: row.account_name,
    subName: row.sub_name,
    subEmail: row.sub_email,
    cleaningDays: row.cleaning_days,
    frequency: row.frequency,
  }));
}

/** This one account, when it is active and has no schedule; null otherwise. */
export async function accountWithoutSchedule(accountId: string): Promise<NoScheduleAccount | null> {
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT a.id, a.account_name, a.cleaning_days, a.frequency,
       COALESCE(NULLIF(btrim(a.subcontractor_raw), ''), NULLIF(btrim(s.company_name), ''), NULLIF(btrim(s.contact_name), ''), '') AS sub_name,
       COALESCE(btrim(s.email), '') AS sub_email
     FROM accounts a
     LEFT JOIN subcontractors s ON s.id = a.subcontractor_id
     WHERE a.id = btrim($1) AND ${ACTIVE} AND NOT ${LIVE_SCHEDULE}`,
    [accountId]
  )) as { id: string; account_name: string; cleaning_days: string; frequency: string; sub_name: string; sub_email: string }[];
  const row = rows[0];
  return row
    ? { accountId: row.id, accountName: row.account_name, subName: row.sub_name, subEmail: row.sub_email, cleaningDays: row.cleaning_days, frequency: row.frequency }
    : null;
}

/** Sub Schedules with Add schedule open for this account (and its sub, when known). */
export function addScheduleHref(account: Pick<NoScheduleAccount, "accountId" | "subEmail">): string {
  const query = new URLSearchParams({ addSchedule: "1", accountId: account.accountId });
  if (account.subEmail) query.set("subId", account.subEmail);
  return `/sub-schedules?${query}`;
}
