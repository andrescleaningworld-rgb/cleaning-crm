// "At risk" accounts: the database side. Server only. The rule is
// lib/accountRisk.ts; the numbers are Settings -> Reminders & check-ins.
//
// accountRiskFlags()   every active account's flag, worked out now from
//                      complaints, visits, the sub's score and (once the
//                      check-in is in) 👎 answers. Kept for 5 minutes.
// refreshRiskPins()    the daily check (app/api/cron/daily-reminders): an
//                      account that turned red gets ONE paper in its
//                      manager's square ("risk:<account id>:<day>"); when it
//                      is no longer red the paper comes down. Needs
//                      migration 057 (account_risk_flags), else does nothing.

import { getSql } from "@/lib/db";
import { accountLive } from "@/lib/pg/account-live";
import { getSubcontractorPerformanceMap } from "@/lib/data/subs";
import { buildSubcontractorPerformanceKey } from "@/lib/subAccountMatching";
import { getFeatureSetting } from "@/lib/pg/feature-settings";
import { managerSquareFinder, pinOnce, takeDownPapers } from "@/lib/pg/auto-pins";
import { riskOf, type RiskFlag, type RiskSignals } from "@/lib/accountRisk";
import { easternToday } from "@/lib/subInsurance";
import { thumbsDownByAccount } from "@/lib/pg/customer-checkin";

export type AccountRisk = RiskFlag & { accountId: string; accountName: string; manager: string; signals: RiskSignals };

type Row = {
  id: string;
  account_name: string;
  manager: string;
  start_date: string | null;
  company_name: string | null;
  contact_name: string | null;
  complaints30: number;
  last_visit: string | null;
};


const CACHE_MS = 5 * 60_000;
let cache: { at: number; flags: Map<string, AccountRisk> } | null = null;

export function forgetRiskCache(): void {
  cache = null;
}

export async function accountRiskFlags(): Promise<Map<string, AccountRisk>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.flags;
  const sql = getSql();
  const [rows, scores, thumbs, thresholds] = await Promise.all([
    sql.query(
      `SELECT a.id, a.account_name, COALESCE(NULLIF(btrim(m.name), ''), a.manager_raw) AS manager, a.start_date::text AS start_date,
              s.company_name, s.contact_name,
              (SELECT count(*)::int FROM complaints c
                WHERE c.account_ref = a.id AND c.complaint_date >= (now() AT TIME ZONE 'America/New_York')::date - 30
                  AND lower(btrim(c.complaint_validity)) NOT IN ('no', 'not valid', 'invalid', 'notvalid')) AS complaints30,
              (SELECT max(v.visit_date)::text FROM visits v WHERE v.account_ref = a.id) AS last_visit
       FROM accounts a
       LEFT JOIN managers m ON m.id = a.manager_id
       LEFT JOIN subcontractors s ON s.id = a.subcontractor_id
       WHERE a.id IS NOT NULL AND a.status_key = 'active' AND NOT a.is_test AND ${accountLive("a")}`
    ) as unknown as Promise<Row[]>,
    getSubcontractorPerformanceMap().catch(() => new Map()),
    thumbsDownByAccount().catch(() => new Map<string, number>()),
    getFeatureSetting("atRisk"),
  ]);
  const today = easternToday();
  const days = (from: string) => Math.max(0, Math.round((Date.parse(today) - Date.parse(from.slice(0, 10))) / 86_400_000));

  const flags = new Map<string, AccountRisk>();
  for (const row of rows) {
    const visit = row.last_visit ?? "";
    const start = row.start_date ?? "";
    // A start date still in the future: nothing is late yet.
    const since = visit || (start && start <= today ? start : "");
    const perf = row.company_name !== null || row.contact_name !== null ? scores.get(buildSubcontractorPerformanceKey(row.company_name, row.contact_name)) : undefined;
    const signals: RiskSignals = {
      complaints30: Number(row.complaints30) || 0,
      daysSinceVisit: since ? days(since) : null,
      noVisitYet: !visit && Boolean(since),
      subScore: perf && Number.isFinite(perf.score) && perf.accountsAssigned > 0 ? perf.score : null,
      thumbsDown60: thumbs.get(row.id) ?? 0,
    };
    flags.set(row.id, { accountId: row.id, accountName: row.account_name, manager: row.manager ?? "", signals, ...riskOf(signals, thresholds) });
  }
  cache = { at: Date.now(), flags };
  return flags;
}

async function riskTableReady(): Promise<boolean> {
  const rows = (await getSql()`SELECT to_regclass('public.account_risk_flags') IS NOT NULL AS ok`) as { ok: boolean }[];
  return rows[0]?.ok === true;
}

export async function refreshRiskPins(): Promise<{ red: number; pinned: number; cleared: number }> {
  const result = { red: 0, pinned: 0, cleared: 0 };
  if (!(await riskTableReady())) return result;
  const sql = getSql();
  forgetRiskCache();
  const flags = await accountRiskFlags();
  const before = (await sql`SELECT account_id, level FROM account_risk_flags`) as { account_id: string; level: string }[];
  const wasRed = new Set(before.filter((row) => row.level === "red").map((row) => row.account_id));
  const squareOf = await managerSquareFinder();
  const today = easternToday();

  for (const flag of flags.values()) {
    const red = flag.level === "red";
    if (red) result.red += 1;
    if (red && !wasRed.has(flag.accountId)) {
      const up = await pinOnce({
        itemId: `risk:${flag.accountId}:${today}`,
        title: flag.accountName || "Account",
        label: "At risk",
        notes: flag.reason,
        href: `/accounts/${encodeURIComponent(flag.accountId)}`,
        square: squareOf(flag.manager),
        accountId: flag.accountId,
        accountName: flag.accountName,
      });
      if (up) result.pinned += 1;
    }
    if (!red && wasRed.has(flag.accountId)) result.cleared += await takeDownPapers(`risk:${flag.accountId}:`, "No longer at risk");
    await sql`
      INSERT INTO account_risk_flags (account_id, level, reason, red_since, updated_at)
      VALUES (${flag.accountId}, ${flag.level}, ${flag.reason}, ${red ? new Date().toISOString() : null}, now())
      ON CONFLICT (account_id) DO UPDATE SET level = EXCLUDED.level, reason = EXCLUDED.reason, updated_at = now(),
        red_since = CASE WHEN EXCLUDED.level = 'red' THEN COALESCE(account_risk_flags.red_since, now()) ELSE NULL END
    `;
  }

  // Accounts that are no longer active: forgotten, and their paper comes down.
  for (const row of before) {
    if (flags.has(row.account_id)) continue;
    if (row.level === "red") result.cleared += await takeDownPapers(`risk:${row.account_id}:`, "No longer active");
    await sql`DELETE FROM account_risk_flags WHERE account_id = ${row.account_id}`;
  }
  return result;
}
