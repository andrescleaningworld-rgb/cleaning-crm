// Price increase reminders: the database side (migration 058). Server only.
// The rule is lib/priceReview.ts.
//
// refreshPricePins()  the daily check (app/api/cron/daily-reminders): an
//                     active account 12 months past its last price change,
//                     not snoozed, gets a paper "Time to review price" in its
//                     manager's square. A price change, or a snooze, takes it
//                     down. Paper id: "price:<account id>:<due day>:<snooze end>",
//                     so a snooze that ends puts a new paper up.
// No money is read out or shown: only whether the price changed, and when.

import { getSql } from "@/lib/db";
import { logActivity } from "@/lib/activityLog";
import { accountLive } from "@/lib/pg/account-live";
import { managerSquareFinder, pinOnce, takeDownPapers } from "@/lib/pg/auto-pins";
import { addMonths, historyChangedPrice, reviewOf, type PriceReview, type SnoozeMonths } from "@/lib/priceReview";
import { easternToday } from "@/lib/subInsurance";

let readyCache = false;

export async function priceReviewReady(): Promise<boolean> {
  if (readyCache) return true;
  try {
    const rows = (await getSql()`SELECT to_regclass('public.account_price_reviews') IS NOT NULL AS ok`) as { ok: boolean }[];
    readyCache = rows[0]?.ok === true;
  } catch {
    readyCache = false;
  }
  return readyCache;
}

const easternDay = (value: string | Date) => new Date(value).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

/** The last real "Monthly Revenue" change in each account's History (Eastern day). */
async function historyPriceDays(accountId?: string): Promise<Map<string, string>> {
  const rows = (await getSql().query(
    `SELECT entity_id, detail, created_at FROM activity_log
     WHERE entity_type = 'account' AND detail LIKE '%Monthly Revenue: %' ${accountId ? "AND entity_id = $1" : ""}
     ORDER BY created_at`,
    accountId ? [accountId] : []
  )) as { entity_id: string; detail: string; created_at: string | Date }[];
  const out = new Map<string, string>();
  for (const row of rows) if (historyChangedPrice(row.detail ?? "")) out.set(row.entity_id, easternDay(row.created_at));
  return out;
}

type AccountRow = {
  id: string;
  account_name: string;
  manager: string;
  start_date: string | null;
  last_change_on: string | null;
  snoozed_until: string | null;
  snooze_reason: string | null;
};

async function accountRows(accountId?: string): Promise<AccountRow[]> {
  const ready = await priceReviewReady();
  return (await getSql().query(
    `SELECT a.id, a.account_name, COALESCE(NULLIF(btrim(m.name), ''), a.manager_raw) AS manager, a.start_date::text AS start_date,
            ${ready ? "r.last_change_on::text AS last_change_on, r.snoozed_until::text AS snoozed_until, r.snooze_reason" : "NULL AS last_change_on, NULL AS snoozed_until, NULL AS snooze_reason"}
     FROM accounts a
     LEFT JOIN managers m ON m.id = a.manager_id
     ${ready ? "LEFT JOIN account_price_reviews r ON r.account_id = a.id" : ""}
     WHERE a.id IS NOT NULL AND a.status_key = 'active' AND NOT a.is_test AND COALESCE(a.monthly_revenue, 0) > 0 AND ${accountLive("a")}
       ${accountId ? "AND a.id = $1" : ""}`,
    accountId ? [accountId] : []
  )) as AccountRow[];
}

function toReview(row: AccountRow, history: Map<string, string>, today: string): PriceReview {
  return reviewOf(
    {
      accountId: row.id,
      historyOn: history.get(row.id) ?? "",
      managerOn: row.last_change_on ?? "",
      startOn: row.start_date ?? "",
      snoozedUntil: row.snoozed_until ?? "",
      snoozeReason: row.snooze_reason ?? "",
    },
    today
  );
}

/** One account's review; null when it is not an active account with a price. */
export async function accountPriceReview(accountId: string): Promise<(PriceReview & { canSave: boolean }) | null> {
  const [row] = await accountRows(accountId);
  if (!row) return null;
  return { ...toReview(row, await historyPriceDays(accountId), easternToday()), canSave: await priceReviewReady() };
}

async function history(accountId: string, by: string, actorAccountId: string | null, detail: string): Promise<void> {
  await logActivity({ actorAccountId, actorRole: "manager", actorName: by, action: "update", entityType: "account", entityId: accountId, detail });
}

/** "The price last changed on…" (for changes before the CRM had History). */
export async function setLastPriceChange(accountId: string, day: string, by: string, actorAccountId: string | null): Promise<void> {
  if (!(await priceReviewReady())) throw new Error("This works once migration 058 is applied.");
  await getSql()`
    INSERT INTO account_price_reviews (account_id, last_change_on, set_by, set_at) VALUES (${accountId}, ${day}::date, ${by}, now())
    ON CONFLICT (account_id) DO UPDATE SET last_change_on = EXCLUDED.last_change_on, set_by = EXCLUDED.set_by, set_at = now()
  `;
  await history(accountId, by, actorAccountId, `Price review: the price last changed on ${day}.`);
  await syncPaper(accountId);
}

export async function snoozePriceReview(accountId: string, months: SnoozeMonths, reason: string, by: string, actorAccountId: string | null): Promise<string> {
  if (!(await priceReviewReady())) throw new Error("This works once migration 058 is applied.");
  const until = addMonths(easternToday(), months);
  await getSql()`
    INSERT INTO account_price_reviews (account_id, snoozed_until, snooze_reason, snoozed_by, snoozed_at) VALUES (${accountId}, ${until}::date, ${reason}, ${by}, now())
    ON CONFLICT (account_id) DO UPDATE SET snoozed_until = EXCLUDED.snoozed_until, snooze_reason = EXCLUDED.snooze_reason, snoozed_by = EXCLUDED.snoozed_by, snoozed_at = now()
  `;
  await history(accountId, by, actorAccountId, `Price review snoozed ${months} months, until ${until}: ${reason}`);
  await takeDownPapers(`price:${accountId}:`, `${by} (snoozed ${months} months)`);
  return until;
}

/** One account's paper follows its review now (after a date was set). */
async function syncPaper(accountId: string): Promise<void> {
  const [row] = await accountRows(accountId);
  if (!row) return;
  const review = toReview(row, await historyPriceDays(accountId), easternToday());
  if (!review.due) await takeDownPapers(`price:${accountId}:`, "Price review not due");
}

export async function refreshPricePins(): Promise<{ due: number; pinned: number; cleared: number }> {
  const result = { due: 0, pinned: 0, cleared: 0 };
  if (!(await priceReviewReady())) return result;
  const today = easternToday();
  const [rows, historyDays, squareOf] = await Promise.all([accountRows(), historyPriceDays(), managerSquareFinder()]);
  for (const row of rows) {
    const review = toReview(row, historyDays, today);
    if (!review.due) {
      result.cleared += await takeDownPapers(`price:${row.id}:`, review.snoozedUntil ? "Snoozed" : "Price changed");
      continue;
    }
    result.due += 1;
    const up = await pinOnce({
      itemId: `price:${row.id}:${review.dueOn}:${row.snoozed_until ?? ""}`,
      title: row.account_name || "Account",
      label: "Price review",
      notes: `Time to review price. Last change: ${review.lastChangeOn}${review.source === "start" ? " (the start)" : ""}.`,
      href: `/accounts/${encodeURIComponent(row.id)}`,
      square: squareOf(row.manager ?? ""),
      accountId: row.id,
      accountName: row.account_name,
    });
    if (up) result.pinned += 1;
  }
  return result;
}
