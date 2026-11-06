// "Please set the schedule for these accounts": subs confirm the real
// schedule of their Active accounts that have no Cleaning schedule (picker)
// yet. Nothing old is converted: the old Frequency / Cleaning days / Cleaning
// time only show as a grey hint.
//
//   listScheduleAskForSub(email)  the box at the top of the sub portal
//   subAccount(email, accountId)  a sub may only save their own accounts
//   scheduleAskProgress()         Sub Center → Schedules to set
//
// "No schedule" is the same rule as the red No schedule tile
// (lib/pg/no-schedule.ts). Accounts with no sub, or on the "Cleaning World"
// or "Pending ask Patricia" records, are the office's: no sub will fill them
// in, so they are not asked in any portal and go in a separate staff list.
//
// "Set by the sub" counts the accounts a sub set while they had no schedule:
// POST /api/subcontractor-schedules writes an activity_log entry
// (entity_type SCHEDULE_SET_BY_SUB, actor = the sub's record id).

import { getSql } from "@/lib/db";
import { ACTIVE, LIVE_SCHEDULE, addScheduleHref } from "@/lib/pg/no-schedule";

export const SCHEDULE_SET_BY_SUB = "sub-schedule-set";

/** The sub records whose accounts the office sets (lower case, trimmed company name). */
const OFFICE_RECORDS = ["cleaning world", "pending ask patricia"];
const OFFICE_RECORD_SQL = `lower(btrim(COALESCE(s.company_name, ''))) IN (${OFFICE_RECORDS.map((name) => `'${name}'`).join(", ")})`;

/** The one sub record with this login email (none when two records share it). */
const SUB_BY_EMAIL = `(SELECT CASE WHEN count(*) = 1 THEN min(id) END FROM subcontractors WHERE btrim($1) <> '' AND lower(btrim(email)) = lower(btrim($1)))`;

const SUB_NAME = `COALESCE(NULLIF(btrim(s.company_name), ''), NULLIF(btrim(s.contact_name), ''), NULLIF(btrim(a.subcontractor_raw), ''), '')`;

export type AskAccount = {
  accountId: string;
  accountName: string;
  address: string;
  frequency: string;
  cleaningDays: string;
  cleaningTime: string;
  /** YYYY-MM-DD or "". */
  startDate: string;
};

type AskRow = {
  id: string;
  account_name: string;
  address: string;
  frequency: string;
  cleaning_days: string;
  cleaning_time: string;
  start_date: string;
};

const toAsk = (row: AskRow): AskAccount => ({
  accountId: row.id,
  accountName: row.account_name,
  address: row.address,
  frequency: row.frequency,
  cleaningDays: row.cleaning_days,
  cleaningTime: row.cleaning_time,
  startDate: row.start_date,
});

/** The sub's Active accounts with no schedule (not the office's records). */
export async function listScheduleAskForSub(email: string): Promise<AskAccount[]> {
  const rows = (await getSql().query(
    `SELECT a.id, a.account_name,
       concat_ws(', ', NULLIF(btrim(a.address), ''), NULLIF(btrim(a.city), '')) AS address,
       COALESCE(btrim(a.frequency), '') AS frequency, COALESCE(btrim(a.cleaning_days), '') AS cleaning_days,
       COALESCE(btrim(to_jsonb(a) ->> 'cleaning_time'), '') AS cleaning_time,
       COALESCE(to_char(a.start_date, 'YYYY-MM-DD'), '') AS start_date
     FROM accounts a
     JOIN subcontractors s ON s.id = a.subcontractor_id
     WHERE ${ACTIVE} AND NOT ${LIVE_SCHEDULE} AND a.subcontractor_id = ${SUB_BY_EMAIL} AND NOT ${OFFICE_RECORD_SQL}
     ORDER BY lower(a.account_name)`,
    [email]
  )) as AskRow[];
  return rows.map(toAsk);
}

/**
 * The account, when it belongs to the sub with this email (any status, not
 * deleted): their record id and the account's Start Date. Null otherwise.
 */
export async function subAccount(email: string, accountId: string): Promise<{ subRecordId: string; startDate: string } | null> {
  const rows = (await getSql().query(
    `SELECT a.subcontractor_id AS sub_record_id, COALESCE(to_char(a.start_date, 'YYYY-MM-DD'), '') AS start_date
     FROM accounts a
     WHERE a.id = btrim($2) AND a.is_test = false AND (to_jsonb(a) ->> 'deleted_at') IS NULL AND a.subcontractor_id = ${SUB_BY_EMAIL}
     LIMIT 1`,
    [email, accountId]
  )) as { sub_record_id: string; start_date: string }[];
  return rows[0] ? { subRecordId: rows[0].sub_record_id, startDate: rows[0].start_date } : null;
}

export type AskProgressSub = {
  subRecordId: string;
  subName: string;
  contactName: string;
  /** Accounts still with no schedule. */
  missing: { accountId: string; accountName: string }[];
  /** Accounts the sub set while they had none. */
  setCount: number;
};

export type AskOfficeAccount = { accountId: string; accountName: string; subName: string; addHref: string };

/** Sub Center: per sub, still to set and set by them (most missing first), and the office's own list. */
export async function scheduleAskProgress(): Promise<{ subs: AskProgressSub[]; office: AskOfficeAccount[] }> {
  const sql = getSql();
  const [missingRows, setRows] = await Promise.all([
    sql.query(`
      SELECT a.id, a.account_name, COALESCE(s.id, '') AS sub_record_id, ${SUB_NAME} AS sub_name,
        COALESCE(btrim(s.contact_name), '') AS contact_name, COALESCE(btrim(s.email), '') AS sub_email,
        (s.id IS NULL OR ${OFFICE_RECORD_SQL}) AS office
      FROM accounts a
      LEFT JOIN subcontractors s ON s.id = a.subcontractor_id
      WHERE ${ACTIVE} AND NOT ${LIVE_SCHEDULE}
      ORDER BY lower(a.account_name)
    `) as unknown as Promise<{ id: string; account_name: string; sub_record_id: string; sub_name: string; contact_name: string; sub_email: string; office: boolean }[]>,
    sql.query(
      `SELECT l.actor_account_id AS sub_record_id, count(DISTINCT l.entity_id)::int AS n,
         COALESCE(NULLIF(btrim(s.company_name), ''), NULLIF(btrim(s.contact_name), ''), max(l.actor_name)) AS sub_name,
         COALESCE(btrim(s.contact_name), '') AS contact_name
       FROM activity_log l
       LEFT JOIN subcontractors s ON s.id = l.actor_account_id
       WHERE l.entity_type = $1 AND l.actor_account_id IS NOT NULL
       GROUP BY l.actor_account_id, s.company_name, s.contact_name`,
      [SCHEDULE_SET_BY_SUB]
    ) as unknown as Promise<{ sub_record_id: string; n: number; sub_name: string; contact_name: string }[]>,
  ]);

  const subs = new Map<string, AskProgressSub>();
  const office: AskOfficeAccount[] = [];
  for (const row of missingRows) {
    if (row.office) {
      office.push({ accountId: row.id, accountName: row.account_name, subName: row.sub_name, addHref: addScheduleHref({ accountId: row.id, subEmail: row.sub_email }) });
      continue;
    }
    const sub = subs.get(row.sub_record_id) ?? { subRecordId: row.sub_record_id, subName: row.sub_name, contactName: row.contact_name, missing: [], setCount: 0 };
    sub.missing.push({ accountId: row.id, accountName: row.account_name });
    subs.set(row.sub_record_id, sub);
  }
  for (const row of setRows) {
    const sub = subs.get(row.sub_record_id) ?? { subRecordId: row.sub_record_id, subName: row.sub_name, contactName: row.contact_name, missing: [], setCount: 0 };
    sub.setCount = row.n;
    subs.set(row.sub_record_id, sub);
  }
  const list = [...subs.values()].sort((a, b) => b.missing.length - a.missing.length || a.subName.localeCompare(b.subName));
  office.sort((a, b) => a.subName.localeCompare(b.subName) || a.accountName.localeCompare(b.accountName));
  return { subs: list, office };
}
