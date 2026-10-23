// The customer monthly check-in: the database side (migration 059). Server
// only. Words and the email: lib/customerCheckin.ts. Link: lib/checkinLink.ts.
//
// runMonthlyCheckins()  the daily job (app/api/cron/daily-reminders). With
//                       Settings -> Reminders & check-ins -> check-in ON, from
//                       the 25th of the month: each active account with an
//                       email (its own, else its main contact's), not opted
//                       out, gets one email that month. A row is saved before
//                       the send and removed if the send fails, so it goes
//                       again the next day. Up to CHECKIN_DAILY_LIMIT a day.
// answerCheckin()       👍 / 👎 from the link. 👎 puts a paper in the
//                       account manager's square ("checkin:<id>"); changing
//                       to 👍 takes it down. Written to the account's History.
// thumbsDownByAccount() 👎 per account in the last 60 days, for "At risk".

import { getSql } from "@/lib/db";
import { logActivity } from "@/lib/activityLog";
import { sendHtmlEmail } from "@/lib/email";
import { accountLive } from "@/lib/pg/account-live";
import { getFeatureSetting } from "@/lib/pg/feature-settings";
import { managerSquareFinder, pinOnce, takeDownPapers, updatePaperNotes } from "@/lib/pg/auto-pins";
import { checkinToken, checkinUrl } from "@/lib/checkinLink";
import { CHECKIN_DAILY_LIMIT, CHECKIN_SEND_FROM_DAY, CHECKIN_TEST_EMAIL, checkinEmail, type CheckinAnswer, type CheckinResult } from "@/lib/customerCheckin";

let readyCache = false;

export async function checkinReady(): Promise<boolean> {
  if (readyCache) return true;
  try {
    const rows = (await getSql()`SELECT to_regclass('public.customer_checkins') IS NOT NULL AND to_regclass('public.customer_checkin_optouts') IS NOT NULL AS ok`) as { ok: boolean }[];
    readyCache = rows[0]?.ok === true;
  } catch {
    readyCache = false;
  }
  return readyCache;
}

const EMAIL_RE = /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/;
const easternParts = () => {
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  return { month: day.slice(0, 7), dayOfMonth: Number(day.slice(8, 10)) };
};

function links(origin: string, id: number) {
  const token = checkinToken(id);
  return { upUrl: checkinUrl(origin, token, "up"), downUrl: checkinUrl(origin, token, "down"), stopUrl: checkinUrl(origin, token, "stop") };
}

async function contactsTableReady(): Promise<boolean> {
  const rows = (await getSql()`SELECT to_regclass('public.account_contacts') IS NOT NULL AS ok`) as { ok: boolean }[];
  return rows[0]?.ok === true;
}

/** Who gets this month's check-in: active, with an email, not opted out, not sent yet this month. */
async function recipients(month: string, limit: number): Promise<{ id: string; account_name: string; email: string }[]> {
  const contacts = await contactsTableReady();
  const rows = (await getSql().query(
    `SELECT a.id, a.account_name,
            COALESCE(NULLIF(btrim(a.email), ''), ${contacts ? `(SELECT btrim(c.email) FROM account_contacts c WHERE c.account_id = a.id AND c.is_main AND btrim(c.email) <> '' LIMIT 1)` : "NULL"}, '') AS email
     FROM accounts a
     WHERE a.id IS NOT NULL AND a.status_key = 'active' AND NOT a.is_test AND ${accountLive("a")}
       AND NOT EXISTS (SELECT 1 FROM customer_checkin_optouts o WHERE o.account_id = a.id)
       AND NOT EXISTS (SELECT 1 FROM customer_checkins k WHERE k.account_id = a.id AND k.month = $1)
     ORDER BY a.account_name`,
    [month]
  )) as { id: string; account_name: string; email: string }[];
  // Several addresses typed in one field: the first one.
  return rows
    .map((row) => ({ ...row, email: row.email.split(/[,;\s]+/).find((part) => EMAIL_RE.test(part)) ?? "" }))
    .filter((row) => row.email)
    .slice(0, limit);
}

export async function runMonthlyCheckins(origin: string): Promise<{ sent: number; failed: number; skipped: string }> {
  if (!(await checkinReady())) return { sent: 0, failed: 0, skipped: "migration 059 not applied" };
  if (!(await getFeatureSetting("checkin")).on) return { sent: 0, failed: 0, skipped: "switched off" };
  const { month, dayOfMonth } = easternParts();
  if (dayOfMonth < CHECKIN_SEND_FROM_DAY) return { sent: 0, failed: 0, skipped: `sends from the ${CHECKIN_SEND_FROM_DAY}th` };
  const sql = getSql();
  let sent = 0;
  let failed = 0;
  for (const account of await recipients(month, CHECKIN_DAILY_LIMIT)) {
    const rows = (await sql`
      INSERT INTO customer_checkins (account_id, month, channel, sent_to) VALUES (${account.id}, ${month}, 'email', ${account.email})
      ON CONFLICT (account_id, month) DO NOTHING RETURNING id
    `) as { id: string }[];
    const id = Number(rows[0]?.id);
    if (!id) continue;
    let ok = false;
    try {
      ok = await sendHtmlEmail({
        to: [account.email],
        fromName: "Cleaning World",
        ...checkinEmail({ accountName: account.account_name, ...links(origin, id) }),
        log: { type: "Customer check-in", accountId: account.id, accountName: account.account_name, sentBy: "System" },
      });
    } catch (error) {
      console.error("[checkin] send:", error instanceof Error ? error.message : error);
    }
    if (ok) sent += 1;
    else {
      failed += 1;
      await sql`DELETE FROM customer_checkins WHERE id = ${id}`;
    }
  }
  return { sent, failed, skipped: "" };
}

/** "Send me a test": the real email, to crm@, with links that save nothing. */
export async function sendTestCheckin(origin: string, by: string): Promise<boolean> {
  return sendHtmlEmail({
    to: [CHECKIN_TEST_EMAIL],
    fromName: "Cleaning World",
    ...checkinEmail({ accountName: "Test Account", test: true, ...links(origin, 0) }),
    log: { type: "Customer check-in (test)", sentBy: by },
  });
}

type CheckinRow = { id: string; account_id: string; account_name: string; manager: string; answer: string; comment: string; month: string };

async function checkinRow(id: number): Promise<CheckinRow | null> {
  const rows = (await getSql()`
    SELECT k.id::text, k.account_id, k.answer, k.comment, k.month, COALESCE(a.account_name, '') AS account_name,
           COALESCE(NULLIF(btrim(m.name), ''), a.manager_raw, '') AS manager
    FROM customer_checkins k
    LEFT JOIN accounts a ON a.id = k.account_id
    LEFT JOIN managers m ON m.id = a.manager_id
    WHERE k.id = ${id}
  `) as CheckinRow[];
  return rows[0] ?? null;
}

async function history(accountId: string, detail: string): Promise<void> {
  await logActivity({ actorAccountId: null, actorRole: "manager", actorName: "Customer", action: "update", entityType: "account", entityId: accountId, detail });
}

/** 👍 / 👎 from the link. false when the check-in is not found. */
export async function answerCheckin(id: number, answer: CheckinAnswer): Promise<boolean> {
  if (!(await checkinReady())) return false;
  const row = await checkinRow(id);
  if (!row) return false;
  if (row.answer === answer) return true;
  await getSql()`UPDATE customer_checkins SET answer = ${answer}, answered_at = now() WHERE id = ${id}`;
  const paperId = `checkin:${id}`;
  if (answer === "down") {
    const squareOf = await managerSquareFinder();
    await pinOnce({
      itemId: paperId,
      title: row.account_name || "Customer check-in",
      label: "Customer 👎",
      notes: row.comment ? `"${row.comment}"` : "The customer was not happy this month.",
      href: `/accounts/${encodeURIComponent(row.account_id)}`,
      square: squareOf(row.manager),
      accountId: row.account_id,
      accountName: row.account_name,
    });
  } else {
    await takeDownPapers(paperId, "Customer changed it to 👍");
  }
  await history(row.account_id, `Monthly check-in (${row.month}): the customer answered ${answer === "up" ? "👍 Good" : "👎 Not good"}.`);
  return true;
}

/** The optional "What went wrong?" after a 👎. */
export async function commentCheckin(id: number, comment: string): Promise<boolean> {
  if (!(await checkinReady())) return false;
  const text = comment.trim().slice(0, 1000);
  const row = await checkinRow(id);
  if (!row || !text) return Boolean(row);
  await getSql()`UPDATE customer_checkins SET comment = ${text} WHERE id = ${id}`;
  await updatePaperNotes(`checkin:${id}`, `"${text}"`);
  await history(row.account_id, `Monthly check-in (${row.month}): "What went wrong?" ${text}`);
  return true;
}

/** "Stop these emails": this account never gets one again. */
export async function optOutCheckin(id: number): Promise<boolean> {
  if (!(await checkinReady())) return false;
  const row = await checkinRow(id);
  if (!row) return false;
  const sentTo = ((await getSql()`SELECT sent_to FROM customer_checkins WHERE id = ${id}`) as { sent_to: string }[])[0]?.sent_to ?? "";
  await getSql()`INSERT INTO customer_checkin_optouts (account_id, email) VALUES (${row.account_id}, ${sentTo}) ON CONFLICT DO NOTHING`;
  await history(row.account_id, "The customer stopped the monthly check-in emails.");
  return true;
}

/** 👎 per account in the last 60 days ("At risk"). Empty before migration 059. */
export async function thumbsDownByAccount(): Promise<Map<string, number>> {
  if (!(await checkinReady())) return new Map();
  const rows = (await getSql()`
    SELECT account_id, count(*)::int AS n FROM customer_checkins
    WHERE answer = 'down' AND answered_at >= now() - interval '60 days' GROUP BY account_id
  `) as { account_id: string; n: number }[];
  return new Map(rows.map((row) => [row.account_id, row.n]));
}

/** The account page: the last 6 check-ins, and whether the customer stopped them. */
export async function accountCheckins(accountId: string): Promise<{ ready: boolean; on: boolean; optedOut: boolean; results: CheckinResult[] }> {
  const on = (await getFeatureSetting("checkin")).on;
  if (!(await checkinReady())) return { ready: false, on, optedOut: false, results: [] };
  const [rows, out] = await Promise.all([
    getSql()`SELECT month, sent_at, answer, comment FROM customer_checkins WHERE account_id = ${accountId} ORDER BY month DESC LIMIT 6` as unknown as Promise<
      { month: string; sent_at: string | Date; answer: "" | CheckinAnswer; comment: string }[]
    >,
    getSql()`SELECT 1 FROM customer_checkin_optouts WHERE account_id = ${accountId}` as unknown as Promise<unknown[]>,
  ]);
  return { ready: true, on, optedOut: out.length > 0, results: rows.map((row) => ({ month: row.month, sentAt: new Date(row.sent_at).toISOString(), answer: row.answer, comment: row.comment })) };
}
