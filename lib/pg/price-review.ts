// Price increase reminders: the database side (migration 058). Server only.
// The rule is lib/priceReview.ts.
//
// refreshPricePins()  the daily check (app/api/cron/daily-reminders): an
//                     active account 12 months past its last price change,
//                     not snoozed, gets a paper "Time to review price" in its
//                     manager's square. A price change, or a snooze, takes it
//                     down. Paper id: "price:<account id>:<due day>:<snooze end>",
//                     so a snooze that ends puts a new paper up.
//                     No flood on day one: the first run writes down its day
//                     (feature_settings "baselines"). Accounts already overdue
//                     then get no paper; they are in Accounts Center's
//                     "Overdue price reviews". Papers only for accounts that
//                     reach 12 months after that day (or whose snooze ends
//                     after it). At most 5 new papers a square a day.
// No money is read out or shown: only whether the price changed, and when.

import { getSql } from "@/lib/db";
import { logActivity } from "@/lib/activityLog";
import { accountLive } from "@/lib/pg/account-live";
import { managerSquareFinder, pinOnceCapped, takeDownPapers } from "@/lib/pg/auto-pins";
import { featureSettingsReady, getFeatureSetting, saveFeatureSetting } from "@/lib/pg/feature-settings";
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

/** The day the price reminders started (set on their first run). "" before. */
async function startedOn(): Promise<string> {
  return (await getFeatureSetting("baselines")).priceReviewStartedOn;
}

/** A due review gets a paper only when it came due after the reminders started (not the day-one backlog). */
function earnsPaper(review: PriceReview, row: AccountRow, started: string): boolean {
  return review.dueOn >= started || (row.snoozed_until ?? "") >= started;
}

export type DueReview = { dueOn: string; lastChangeOn: string; dayOne: boolean };

/** Every active account due for a price review (Accounts Center -> "Overdue price reviews"). dayOne = already overdue when the reminders started. */
export async function listDuePriceReviews(): Promise<Record<string, DueReview>> {
  const today = easternToday();
  const [rows, historyDays, started] = await Promise.all([accountRows(), historyPriceDays(), startedOn()]);
  const out: Record<string, DueReview> = {};
  for (const row of rows) {
    const review = toReview(row, historyDays, today);
    if (review.due) out[row.id] = { dueOn: review.dueOn, lastChangeOn: review.lastChangeOn, dayOne: !earnsPaper(review, row, started || today) };
  }
  return out;
}

export async function refreshPricePins(): Promise<{ due: number; dayOne: number; pinned: number; capped: number; cleared: number }> {
  const result = { due: 0, dayOne: 0, pinned: 0, capped: 0, cleared: 0 };
  if (!(await priceReviewReady()) || !(await featureSettingsReady())) return result;
  const today = easternToday();
  let started = await startedOn();
  if (!started) {
    started = today;
    await saveFeatureSetting("baselines", { priceReviewStartedOn: today }, "System");
  }
  const [rows, historyDays, squareOf] = await Promise.all([accountRows(), historyPriceDays(), managerSquareFinder()]);
  for (const row of rows) {
    const review = toReview(row, historyDays, today);
    if (!review.due) {
      result.cleared += await takeDownPapers(`price:${row.id}:`, review.snoozedUntil ? "Snoozed" : "Price changed");
      continue;
    }
    result.due += 1;
    if (!earnsPaper(review, row, started)) {
      result.dayOne += 1;
      continue;
    }
    const outcome = await pinOnceCapped({
      itemId: `price:${row.id}:${review.dueOn}:${row.snoozed_until ?? ""}`,
      title: row.account_name || "Account",
      label: "Price review",
      notes: `Time to review price. Last change: ${review.lastChangeOn}${review.source === "start" ? " (the start)" : ""}.`,
      href: `/accounts/${encodeURIComponent(row.id)}`,
      square: squareOf(row.manager ?? ""),
      accountId: row.id,
      accountName: row.account_name,
    });
    if (outcome === "pinned") result.pinned += 1;
    if (outcome === "capped") result.capped += 1;
  }
  return result;
}
