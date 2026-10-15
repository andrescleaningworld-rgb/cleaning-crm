// The data behind Coverage → "Who's free?" (lib/availability.ts does the
// checking), plus the two settings it uses: each sub's crews and the time
// "Evening" ends.
//
// A schedule row belongs to the sub it names (its SubID email, matched to a
// subcontractor), falling back to the account's own sub. Only active
// accounts count. Every new column (migration 042) is read through to_jsonb,
// so this still runs before the migration is applied: every sub with 1
// crew, every account 1h 30m (est.), every schedule a window, Evening to 11 pm.

import { getSql } from "@/lib/db";
import type { AvailabilitySchedule, AvailabilitySub } from "@/lib/availability";
import { DEFAULT_MINUTES_ON_SITE } from "@/lib/time-on-site";
import { DEFAULT_EVENING_ENDS, parseClock, toClock } from "@/lib/schedule-time";

const MAX_CREWS = 20;

export async function getEveningEnds(): Promise<number> {
  const sql = getSql();
  try {
    const rows = (await sql`SELECT evening_ends_at::text AS ends FROM schedule_settings WHERE id = true`) as { ends: string }[];
    return parseClock(rows[0]?.ends) ?? DEFAULT_EVENING_ENDS;
  } catch (error) {
    if ((error as { code?: string }).code === "42P01") return DEFAULT_EVENING_ENDS;
    throw error;
  }
}

/** Evening may end between 7 pm and midnight (23:59). */
export async function saveEveningEnds(minutes: number, by: string): Promise<number> {
  const value = Math.min(24 * 60 - 1, Math.max(19 * 60, Math.round(minutes)));
  const sql = getSql();
  await sql`
    INSERT INTO schedule_settings (id, evening_ends_at, updated_by, updated_at) VALUES (true, ${toClock(value)}::time, ${by}, now())
    ON CONFLICT (id) DO UPDATE SET evening_ends_at = EXCLUDED.evening_ends_at, updated_by = EXCLUDED.updated_by, updated_at = now()
  `;
  return value;
}

export async function getCrews(subId: string): Promise<number | null> {
  const sql = getSql();
  const rows = (await sql`SELECT to_jsonb(s)->>'crews' AS crews FROM subcontractors s WHERE id = ${subId}`) as { crews: string | null }[];
  // No crews yet (before migration 042): the page leaves Crews out.
  if (!rows[0] || rows[0].crews === null) return null;
  return Number(rows[0].crews) || 1;
}

export async function saveCrews(subId: string, crews: number): Promise<number | null> {
  const value = Math.min(MAX_CREWS, Math.max(1, Math.round(crews)));
  const sql = getSql();
  const rows = (await sql`UPDATE subcontractors SET crews = ${value}, updated_at = now() WHERE id = ${subId} RETURNING crews`) as { crews: number }[];
  return rows[0]?.crews ?? null;
}

type AccountRow = { id: string; account_name: string; sub_id: string | null; latitude: number | null; longitude: number | null; minutes: string | null; source: string | null };
type SubRow = { id: string; name: string; crews: string | null };
type ScheduleRow = {
  account_key: string;
  sub_key: string | null;
  frequency: string;
  day_of_week: string;
  monthly_occurrence: string;
  effective_start: string | null;
  effective_end: string | null;
  status: string;
  time_window: string;
  schedule_type: string | null;
  start_time: string | null;
};

export async function loadAvailabilitySubs(): Promise<AvailabilitySub[]> {
  const sql = getSql();
  const [accounts, subs, schedules] = (await Promise.all([
    sql.query(`
      SELECT a.id, a.account_name, a.subcontractor_id AS sub_id, a.latitude, a.longitude,
        to_jsonb(a)->>'minutes_on_site' AS minutes, to_jsonb(a)->>'minutes_on_site_source' AS source
      FROM accounts a
      WHERE a.id IS NOT NULL AND a.is_test = false AND a.status_key = 'active'`),
    sql.query(`
      SELECT s.id, COALESCE(NULLIF(btrim(s.company_name), ''), NULLIF(btrim(s.contact_name), ''), s.id) AS name, to_jsonb(s)->>'crews' AS crews
      FROM subcontractors s`),
    sql.query(`
      SELECT COALESCE(ss.account_ref, btrim(ss.account_id)) AS account_key,
        COALESCE(
          ss.subcontractor_id,
          (SELECT CASE WHEN count(*) = 1 THEN min(s.id) END FROM subcontractors s
            WHERE btrim(ss.sub_id_raw) <> '' AND lower(btrim(s.email)) = lower(btrim(ss.sub_id_raw))),
          (SELECT a.subcontractor_id FROM accounts a WHERE a.id = COALESCE(ss.account_ref, btrim(ss.account_id)))
        ) AS sub_key,
        ss.frequency, ss.day_of_week, ss.monthly_occurrence,
        to_char(ss.effective_start, 'YYYY-MM-DD') AS effective_start, to_char(ss.effective_end, 'YYYY-MM-DD') AS effective_end,
        ss.status, ss.time_window,
        to_jsonb(ss)->>'schedule_type' AS schedule_type, to_jsonb(ss)->>'start_time' AS start_time
      FROM sub_schedules ss
      WHERE lower(btrim(ss.status)) = 'active' AND (ss.effective_end IS NULL OR ss.effective_end >= current_date)`),
  ])) as [AccountRow[], SubRow[], ScheduleRow[]];

  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const pointOf = (account: AccountRow) =>
    account.latitude !== null && account.longitude !== null ? { lat: Number(account.latitude), lng: Number(account.longitude) } : null;

  const bySub = new Map<string, AvailabilitySub>();
  const subFor = (subId: string) => {
    let entry = bySub.get(subId);
    if (!entry) {
      const row = subs.find((sub) => sub.id === subId);
      if (!row) return null;
      entry = { subId, name: row.name, crews: Math.max(1, Number(row.crews) || 1), schedules: [], unscheduled: 0, accountPoints: [] };
      bySub.set(subId, entry);
    }
    return entry;
  };

  const scheduled = new Set<string>();
  for (const row of schedules) {
    const account = accountById.get(row.account_key);
    if (!account || !row.sub_key) continue;
    const sub = subFor(row.sub_key);
    if (!sub) continue;
    scheduled.add(account.id);
    const schedule: AvailabilitySchedule = {
      accountId: account.id,
      accountName: account.account_name,
      frequency: row.frequency,
      dayOfWeek: row.day_of_week,
      monthlyOccurrence: row.monthly_occurrence,
      effectiveStart: row.effective_start ?? "",
      effectiveEnd: row.effective_end ?? "",
      status: row.status,
      timeWindow: row.time_window,
      scheduleType: row.schedule_type ?? "window",
      startTime: row.start_time ?? "",
      minutesOnSite: Number(account.minutes) || DEFAULT_MINUTES_ON_SITE,
      estimated: (account.source ?? "est") === "est",
      point: pointOf(account),
    };
    sub.schedules.push(schedule);
  }

  for (const account of accounts) {
    if (!account.sub_id) continue;
    const sub = subFor(account.sub_id);
    if (!sub) continue;
    const point = pointOf(account);
    if (point) sub.accountPoints.push(point);
    if (!scheduled.has(account.id)) sub.unscheduled += 1;
  }

  return Array.from(bySub.values());
}
