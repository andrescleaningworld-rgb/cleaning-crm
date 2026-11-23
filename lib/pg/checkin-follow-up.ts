// What follows a check-in answer of OK or worse. Server only.
//   takeDownOkPinsAfterVisit()  a Visit saved on the account clears its OK papers
//   flagRiskFromCheckins()      2 answers in a row not Great (90 days): At risk
//   checkinRiskHolds()          the accounts with that flag on (lib/pg/account-risk.ts)
//   clearCheckinRisk()          only a person clears it (account page)
// The flag needs migration 091; before it, nothing here fails or flags.

import { getSql } from "@/lib/db";
import { logActivity } from "@/lib/activityLog";
import { CHECKIN_RISK_REASON, twoNotGreat } from "@/lib/accountRisk";

let readyCache = false;

async function holdReady(): Promise<boolean> {
  if (readyCache) return true;
  const rows = (await getSql()`
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'account_risk_flags' AND column_name = 'checkin_risk_cleared_at') AS ok
  `) as { ok: boolean }[];
  readyCache = rows[0]?.ok === true;
  return readyCache;
}

/**
 * A Visit was saved: the account's OK papers come down when the visit is on or
 * after the day of the answer, and not dated in the future.
 */
export async function takeDownOkPinsAfterVisit(accountId: string | null, visitDay: string | null): Promise<number> {
  if (!accountId || !visitDay) return 0;
  const rows = (await getSql()`
    UPDATE handoff_items h SET board_done_at = now(), board_done_by = 'Visit logged'
    FROM customer_checkins k
    WHERE h.kind = 'note' AND h.item_id = 'checkin:' || k.id::text || ':ok'
      AND k.account_id = ${accountId} AND k.answer = 'ok'
      AND h.board_pinned_at IS NOT NULL AND h.board_done_at IS NULL
      AND ${visitDay}::date >= (k.answered_at AT TIME ZONE 'America/New_York')::date
      AND ${visitDay}::date <= (now() AT TIME ZONE 'America/New_York')::date
    RETURNING h.item_id
  `) as unknown[];
  return rows.length;
}

/** Turns the flag on when the last 2 answers (since it was last cleared) were OK or worse, within 90 days. */
export async function flagRiskFromCheckins(accountId: string): Promise<boolean> {
  if (!(await holdReady())) return false;
  const sql = getSql();
  const rows = (await sql`
    SELECT k.answer, k.answered_at >= now() - interval '90 days' AS recent
    FROM customer_checkins k
    LEFT JOIN account_risk_flags f ON f.account_id = k.account_id
    WHERE k.account_id = ${accountId} AND k.status = 'sent' AND k.answer <> ''
      AND (f.checkin_risk_cleared_at IS NULL OR k.answered_at > f.checkin_risk_cleared_at)
    ORDER BY COALESCE(k.sent_at, k.created_at) DESC, k.id DESC
    LIMIT 2
  `) as { answer: string; recent: boolean }[];
  if (!twoNotGreat(rows)) return false;
  // A new row starts green, so the daily check still sees it turn red and puts up its one paper.
  const changed = (await sql`
    INSERT INTO account_risk_flags (account_id, level, reason, checkin_risk_reason, checkin_risk_at)
    VALUES (${accountId}, 'green', '', ${CHECKIN_RISK_REASON}, now())
    ON CONFLICT (account_id) DO UPDATE SET checkin_risk_reason = EXCLUDED.checkin_risk_reason, checkin_risk_at = now()
    WHERE account_risk_flags.checkin_risk_reason = ''
    RETURNING account_id
  `) as unknown[];
  if (changed.length === 0) return false;
  await logActivity({ actorAccountId: null, actorRole: "manager", actorName: "System", action: "update", entityType: "account", entityId: accountId, detail: `At risk: ${CHECKIN_RISK_REASON}` }).catch(() => undefined);
  return true;
}

/** Account id → the saved reason, for every account with the flag on. */
export async function checkinRiskHolds(): Promise<Map<string, string>> {
  if (!(await holdReady())) return new Map();
  const rows = (await getSql()`SELECT account_id, checkin_risk_reason FROM account_risk_flags WHERE checkin_risk_reason <> ''`) as { account_id: string; checkin_risk_reason: string }[];
  return new Map(rows.map((row) => [row.account_id, row.checkin_risk_reason]));
}

/** A person clears the flag. Answers from before now no longer count toward it. */
export async function clearCheckinRisk(accountId: string, by: string): Promise<boolean> {
  if (!(await holdReady())) return false;
  const rows = (await getSql()`
    UPDATE account_risk_flags SET checkin_risk_reason = '', checkin_risk_at = NULL, checkin_risk_cleared_at = now()
    WHERE account_id = ${accountId} AND checkin_risk_reason <> ''
    RETURNING account_id
  `) as unknown[];
  if (rows.length === 0) return false;
  await logActivity({ actorAccountId: null, actorRole: "manager", actorName: by, action: "update", entityType: "account", entityId: accountId, detail: `At risk cleared: ${CHECKIN_RISK_REASON}` }).catch(() => undefined);
  return true;
}
