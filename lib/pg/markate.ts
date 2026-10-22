// Markate in the database (migration 054). Server only.
//
//   markate_connection        the one Markate login, tokens encrypted (lib/markate.ts)
//   markate_recurring_items   the line item names that count as recurring
//   markate_estimates         the accepted commercial estimates with a recurring
//                             line item: waiting / started (account_id) / skipped
//
// A waiting estimate also hangs as a paper in the Pin Board's "New accepted"
// square: a note in that box (kind 'note', item_id 'markate-<id>', data.box
// 'account'), pinned with no text to anyone. Start new account or Skip takes
// it down. Taking it down on the board skips the estimate (reconcileBoard).

import { getSql } from "@/lib/db";
import {
  MarkateApiError,
  decryptToken,
  encryptToken,
  estimateTotal,
  isCommercial,
  itemKey,
  markateGet,
  recurringMatch,
  refreshTokens,
  revokeTokens,
  text,
  type MarkateCustomer,
  type MarkateEstimate,
  type MarkateTokens,
} from "@/lib/markate";

let readyCache: boolean | null = null;

/** True once migration 054 is on this database. */
export async function markateReady(): Promise<boolean> {
  if (readyCache) return true;
  const rows = (await getSql()`SELECT to_regclass('public.markate_estimates') IS NOT NULL AS ok`) as { ok: boolean }[];
  readyCache = rows[0]?.ok === true;
  return readyCache;
}

/* ---------- the connection ---------- */

type ConnectionRow = {
  access_token_enc: string;
  refresh_token_enc: string;
  expires_at: string | Date;
  connected_by: string;
  connected_at: string | Date;
  last_checked_at: string | Date | null;
  last_check_error: string;
};

const iso = (value: string | Date | null | undefined) => (value ? new Date(value).toISOString() : "");

export type MarkateStatus = {
  connected: boolean;
  connectedAt: string;
  connectedBy: string;
  /** When the last check ran ("" = never). */
  lastCheckedAt: string;
  /** "" when the last check finished; otherwise why it did not. */
  lastError: string;
  /** How many estimates the last check brought in. */
  lastFound: number;
};

async function connectionRow(): Promise<ConnectionRow | null> {
  const rows = (await getSql()`SELECT * FROM markate_connection WHERE id = 1`) as ConnectionRow[];
  return rows[0] ?? null;
}

export async function markateStatus(): Promise<MarkateStatus> {
  const row = await connectionRow();
  // What the last check found: the estimates saved since it started.
  const found = row?.last_checked_at
    ? (((await getSql()`SELECT count(*)::int AS n FROM markate_estimates WHERE found_at >= ${iso(row.last_checked_at)}`) as { n: number }[])[0]?.n ?? 0)
    : 0;
  return {
    connected: Boolean(row),
    connectedAt: iso(row?.connected_at),
    connectedBy: row?.connected_by ?? "",
    lastCheckedAt: iso(row?.last_checked_at),
    lastError: row?.last_check_error ?? "",
    lastFound: found,
  };
}

export async function saveConnection(tokens: MarkateTokens, by: string): Promise<void> {
  await getSql()`
    INSERT INTO markate_connection (id, access_token_enc, refresh_token_enc, expires_at, markate_user_id, scope, connected_by, connected_at, refreshed_at, last_checked_at, last_check_error)
    VALUES (1, ${encryptToken(tokens.accessToken)}, ${encryptToken(tokens.refreshToken)}, ${tokens.expiresAt.toISOString()}, ${tokens.markateUserId}, ${tokens.scope}, ${by}, now(), NULL, NULL, '')
    ON CONFLICT (id) DO UPDATE SET
      access_token_enc = EXCLUDED.access_token_enc, refresh_token_enc = EXCLUDED.refresh_token_enc, expires_at = EXCLUDED.expires_at,
      markate_user_id = EXCLUDED.markate_user_id, scope = EXCLUDED.scope, connected_by = EXCLUDED.connected_by, connected_at = now(),
      refreshed_at = NULL, last_check_error = ''
  `;
}

/** Disconnect: Markate is told to forget the login (best effort), then it is removed here. */
export async function disconnect(): Promise<void> {
  const row = await connectionRow();
  if (!row) return;
  try {
    await revokeTokens(decryptToken(row.refresh_token_enc));
  } catch (error) {
    console.error("[markate disconnect] revoke:", error instanceof Error ? error.message : "failed");
  }
  await getSql()`DELETE FROM markate_connection WHERE id = 1`;
}

/** A working access token: refreshed when it ends within a day (Markate's last 7 days). null when not connected. */
async function accessToken(): Promise<string | null> {
  const row = await connectionRow();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() - Date.now() > 86_400_000) return decryptToken(row.access_token_enc);
  const tokens = await refreshTokens(decryptToken(row.refresh_token_enc));
  await getSql()`
    UPDATE markate_connection SET access_token_enc = ${encryptToken(tokens.accessToken)}, refresh_token_enc = ${encryptToken(tokens.refreshToken)},
      expires_at = ${tokens.expiresAt.toISOString()}, refreshed_at = now()
    WHERE id = 1
  `;
  return tokens.accessToken;
}

/* ---------- the recurring items list ---------- */

export type RecurringItem = { id: string; name: string; addedBy: string; addedAt: string };

export async function listRecurringItems(): Promise<RecurringItem[]> {
  const rows = (await getSql()`SELECT id::text, name, added_by, added_at FROM markate_recurring_items ORDER BY lower(name)`) as {
    id: string;
    name: string;
    added_by: string;
    added_at: string | Date;
  }[];
  return rows.map((row) => ({ id: row.id, name: row.name, addedBy: row.added_by, addedAt: iso(row.added_at) }));
}

/** false when the name is already on the list (any case). */
export async function addRecurringItem(name: string, by: string): Promise<boolean> {
  const rows = (await getSql()`
    INSERT INTO markate_recurring_items (name, added_by) VALUES (${name.trim().replace(/\s+/g, " ").slice(0, 200)}, ${by})
    ON CONFLICT DO NOTHING RETURNING id
  `) as unknown[];
  return rows.length > 0;
}

export async function removeRecurringItem(id: string): Promise<void> {
  await getSql()`DELETE FROM markate_recurring_items WHERE id = ${id}::bigint`;
}

/* ---------- checking Markate for new estimates ---------- */

/**
 * The import starts here: only estimates accepted on or after Oct 22, 2026
 * (midnight Eastern) come in. There is no catch-up of older estimates.
 */
const IMPORT_START_MS = Date.parse("2026-10-22T04:00:00Z");
const IMPORT_START_DAY = "2026-10-22";
/** Each later run looks back this far before the last good run, so nothing slips through (never before the start). */
const OVERLAP_MS = 2 * 86_400_000;
/** Markate allows 120 calls a minute. A run keeps under 100 a minute and waits when it gets there. */
const CALLS_PER_MINUTE = 100;
/** "Too many requests" anyway: wait (Markate's Retry-After, else a minute) and try the same call again, up to this many times. */
const RATE_LIMIT_RETRIES = 3;
/** A run stops before the function's 5-minute limit; the next run starts again from Oct 22 and skips what it already has. */
const RUN_BUDGET_MS = 240_000;
const PAGE_SIZE = 50;
const MAX_PAGES = 100;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class OutOfTime extends Error {}

export type CheckResult = { checked: number; added: number; finished: boolean; error: string };

/** When the estimate was accepted (or last changed, if Markate does not say). */
function acceptedTime(estimate: MarkateEstimate): number {
  for (const value of [estimate.date_accepted, estimate.datetime_updated, estimate.datetime_added, estimate.date_issued]) {
    const time = Date.parse(text(value).replace(" ", "T"));
    if (Number.isFinite(time)) return time;
  }
  return NaN;
}

/** YYYY-MM-DD in the office's time zone (Eastern), "" when unknown. */
function easternDay(time: number): string {
  return Number.isFinite(time) ? new Date(time).toLocaleDateString("en-CA", { timeZone: "America/New_York" }) : "";
}

/**
 * The cron (every 30 minutes) and "Check now": lists Accepted estimates,
 * newest accepted first, back to the last good run (never before Oct 22,
 * 2026), and saves the ones whose customer is commercial and that have a recurring
 * line item. The rest are not saved. Each saved one is pinned in "New accepted".
 */
export async function checkForEstimates(): Promise<CheckResult> {
  const result: CheckResult = { checked: 0, added: 0, finished: false, error: "" };
  const row = await connectionRow();
  if (!row) return { ...result, error: "Markate is not connected." };
  const startedAt = new Date();
  // From the last run that finished (less the overlap), never before Oct 22, 2026. After a run that
  // did not finish, start again from Oct 22: what is already saved is skipped without asking Markate.
  const lastGood = row.last_checked_at && !row.last_check_error ? new Date(row.last_checked_at).getTime() - OVERLAP_MS : IMPORT_START_MS;
  const cutoff = Math.max(IMPORT_START_MS, lastGood);
  const sql = getSql();
  // Old ones already brought in are skipped and their papers come down, even if nobody opens the list.
  await reconcileBoard();

  try {
    const token = await accessToken();
    if (!token) return { ...result, error: "Markate is not connected." };
    // When each call of this run was made, to keep under Markate's limit.
    const callTimes: number[] = [];
    const call = async <T>(path: string, query?: Record<string, string>): Promise<T> => {
      for (let attempt = 0; ; attempt += 1) {
        while (callTimes.length > 0 && Date.now() - callTimes[0] >= 60_000) callTimes.shift();
        if (callTimes.length >= CALLS_PER_MINUTE) await sleep(60_000 - (Date.now() - callTimes[0]) + 250);
        if (Date.now() - startedAt.getTime() > RUN_BUDGET_MS) throw new OutOfTime();
        callTimes.push(Date.now());
        try {
          return await markateGet<T>(token, path, query);
        } catch (error) {
          if (!(error instanceof MarkateApiError) || error.status !== 429 || attempt >= RATE_LIMIT_RETRIES) throw error;
          await sleep((error.retryAfterSeconds || 60) * 1000);
        }
      }
    };
    const names = new Set((await listRecurringItems()).map((item) => itemKey(item.name)));
    // Each customer is asked for once per run.
    const customers = new Map<string, MarkateCustomer | null>();

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const list = await call<{ estimates?: MarkateEstimate[]; pagination?: { next?: unknown } }>("estimates", {
        status: "A",
        order: "date-accepted-desc",
        page: String(page),
        rows_per_page: String(PAGE_SIZE),
      });
      const estimates = (list.estimates ?? []).filter((estimate) => text(estimate.status).toUpperCase() === "A" || !text(estimate.status));
      const ids = estimates.map((estimate) => text(estimate.id)).filter(Boolean);
      const known = new Set(
        ids.length ? ((await sql`SELECT markate_estimate_id FROM markate_estimates WHERE markate_estimate_id = ANY(${ids})`) as { markate_estimate_id: string }[]).map((r) => r.markate_estimate_id) : []
      );
      let anyRecent = false;

      for (const listed of estimates) {
        const id = text(listed.id);
        const time = acceptedTime(listed);
        if (Number.isFinite(time) && time < cutoff) continue;
        anyRecent = true;
        if (!id || known.has(id)) continue;
        result.checked += 1;

        const customerId = text(listed.customer_id) || text(listed.customer?.id);
        if (!customerId) continue;
        if (!customers.has(customerId)) {
          const got = await call<{ customer?: MarkateCustomer }>(`customers/${encodeURIComponent(customerId)}`);
          customers.set(customerId, got.customer ?? null);
        }
        const customer = customers.get(customerId);
        if (!customer || !isCommercial(customer)) continue;

        let estimate = listed;
        if (!Array.isArray(estimate.items) || estimate.items.length === 0) {
          const got = await call<{ estimate?: MarkateEstimate }>(`estimates/${encodeURIComponent(id)}`);
          estimate = got.estimate ?? listed;
        }
        const match = recurringMatch(Array.isArray(estimate.items) ? estimate.items : [], names);
        if (!match) continue;

        const customerName = text(customer.company) || text(customer.display_name) || text(estimate.customer?.name);
        const inserted = (await sql`
          INSERT INTO markate_estimates (markate_estimate_id, estimate_number, customer_id, customer_name, customer, total, recurring_total, status, estimate_date, url_public, matched_item, matched_why, raw)
          VALUES (${id}, ${text(estimate.custom_number)}, ${customerId}, ${customerName}, ${JSON.stringify(customer)}::jsonb, ${estimateTotal(estimate)}, ${match.recurringTotal},
                  ${text(estimate.status) || "A"}, ${easternDay(acceptedTime(estimate))},
                  ${text(estimate.url_public)}, ${match.item}, ${match.why}, ${JSON.stringify(estimate)}::jsonb)
          ON CONFLICT (markate_estimate_id) DO NOTHING
          RETURNING id::text
        `) as { id: string }[];
        if (inserted[0]) {
          result.added += 1;
          await pinEstimatePaper(inserted[0].id, customerName, estimateTotal(estimate), match.item);
        }
      }
      const next = Number(list.pagination?.next ?? 0);
      if (!anyRecent || !(next > page) || estimates.length === 0) break;
    }

    // last_checked_at is when the last run started, whatever happened; last_check_error is '' when it finished.
    result.finished = true;
    await sql`UPDATE markate_connection SET last_checked_at = ${startedAt.toISOString()}, last_check_error = '' WHERE id = 1`;
  } catch (error) {
    if (error instanceof OutOfTime) {
      // Not shown as an error: what was found so far is saved, and the next check goes on.
      await sql`UPDATE markate_connection SET last_checked_at = ${startedAt.toISOString()}, last_check_error = 'Stopped at the time limit. The next check goes on from there.' WHERE id = 1`;
      return result;
    }
    const message = error instanceof Error ? error.message : "The check did not work.";
    result.error = message.slice(0, 300);
    await sql`UPDATE markate_connection SET last_checked_at = ${startedAt.toISOString()}, last_check_error = ${result.error} WHERE id = 1`;
  }
  return result;
}

/* ---------- the Pin Board paper ---------- */

const paperId = (id: string) => `markate-${id}`;
const dollars = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The paper in "New accepted". No text goes out: that square is not a person's. */
async function pinEstimatePaper(id: string, customerName: string, total: number, matchedItem: string): Promise<void> {
  const data = {
    box: "account",
    label: "Markate estimate",
    recordType: "markate",
    recordId: id,
    href: `/accounts-center?tab=new&markate=${id}#markate-${id}`,
    notes: `${dollars(total)} · ${matchedItem}`,
  };
  await getSql()`
    INSERT INTO handoff_items (kind, item_id, title, account_id, account_name, manager, step, data, created_by, board_pinned_at, board_square)
    VALUES ('note', ${paperId(id)}, ${customerName.slice(0, 300) || "Markate estimate"}, '', ${customerName}, '', 'pinned', ${JSON.stringify(data)}::jsonb, 'Markate', now(), '')
    ON CONFLICT (kind, item_id) DO NOTHING
  `;
}

async function takePaperDown(id: string, why: string): Promise<void> {
  await getSql()`
    UPDATE handoff_items SET board_done_at = now(), board_done_by = ${why}
    WHERE kind = 'note' AND item_id = ${paperId(id)} AND board_pinned_at IS NOT NULL AND board_done_at IS NULL
  `;
}

/**
 * Keeps the list and the board in step:
 *   a waiting estimate accepted before the import start (Oct 22, 2026) is skipped;
 *   a waiting estimate whose paper was taken down on the board is skipped (it never comes back);
 *   a paper put back up for an estimate that is started or skipped comes down again.
 */
async function reconcileBoard(): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE markate_estimates SET outcome = 'skipped', outcome_by = 'Accepted before Oct 22, 2026 (import start)', outcome_at = now()
    WHERE outcome = 'waiting' AND estimate_date <> '' AND estimate_date < ${IMPORT_START_DAY}
  `;
  await sql`
    UPDATE markate_estimates e SET outcome = 'skipped', outcome_by = COALESCE(NULLIF(h.board_done_by, ''), 'Pin Board') || ' (taken off the Pin Board)', outcome_at = h.board_done_at
    FROM handoff_items h
    WHERE e.outcome = 'waiting' AND h.kind = 'note' AND h.item_id = 'markate-' || e.id::text AND h.board_done_at IS NOT NULL
  `;
  await sql`
    UPDATE handoff_items h SET board_done_at = now(), board_done_by = CASE WHEN e.outcome = 'started' THEN 'Account started' ELSE 'Skipped' END
    FROM markate_estimates e
    WHERE e.outcome <> 'waiting' AND h.kind = 'note' AND h.item_id = 'markate-' || e.id::text AND h.board_pinned_at IS NOT NULL AND h.board_done_at IS NULL
  `;
}

/* ---------- the "From Markate" list ---------- */

export type WaitingEstimate = {
  id: string;
  estimateNumber: string;
  customerName: string;
  total: number;
  date: string;
  matchedItem: string;
  matchedWhy: string;
  urlPublic: string;
};

type EstimateRow = {
  id: string;
  estimate_number: string;
  customer_name: string;
  customer: Record<string, unknown> | null;
  total: string;
  recurring_total: string;
  estimate_date: string;
  url_public: string;
  matched_item: string;
  matched_why: string;
  outcome: string;
  found_at: string | Date;
};

export async function listWaiting(): Promise<WaitingEstimate[]> {
  await reconcileBoard();
  const rows = (await getSql()`
    SELECT id::text, estimate_number, customer_name, total::text, estimate_date, url_public, matched_item, matched_why, found_at
    FROM markate_estimates WHERE outcome = 'waiting' ORDER BY found_at DESC, id DESC
  `) as EstimateRow[];
  return rows.map((row) => ({
    id: row.id,
    estimateNumber: row.estimate_number,
    customerName: row.customer_name,
    total: Number(row.total) || 0,
    date: row.estimate_date || iso(row.found_at).slice(0, 10),
    matchedItem: row.matched_item,
    matchedWhy: row.matched_why,
    urlPublic: row.url_public,
  }));
}

export async function waitingCount(): Promise<number> {
  await reconcileBoard();
  const rows = (await getSql()`SELECT count(*)::int AS n FROM markate_estimates WHERE outcome = 'waiting'`) as { n: number }[];
  return rows[0]?.n ?? 0;
}

export type EstimatePrefill = {
  id: string;
  waiting: boolean;
  accountName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  latitude: string;
  longitude: string;
  contactName: string;
  phone: string;
  email: string;
  /** The monthly price: the recurring line items added up. */
  price: string;
  estimateUrl: string;
  estimateName: string;
};

/** What New Accepted Account is filled with. null when there is no such estimate. */
export async function estimatePrefill(id: string): Promise<EstimatePrefill | null> {
  if (!/^\d+$/.test(id)) return null;
  await reconcileBoard();
  const rows = (await getSql()`SELECT id::text, estimate_number, customer_name, customer, recurring_total::text, url_public, outcome FROM markate_estimates WHERE id = ${id}::bigint`) as EstimateRow[];
  const row = rows[0];
  if (!row) return null;
  const c = row.customer ?? {};
  const [latitude = "", longitude = ""] = text(c.latlng).split(",").map((part) => part.trim());
  const street = [text(c.address), text(c.address_secondary)].filter(Boolean).join(", ");
  const price = Number(row.recurring_total) || 0;
  return {
    id: row.id,
    waiting: row.outcome === "waiting",
    accountName: row.customer_name,
    address: street,
    city: text(c.city),
    state: text(c.state),
    zip: text(c.zip),
    latitude,
    longitude,
    contactName: [text(c.first_name), text(c.last_name)].filter(Boolean).join(" "),
    phone: text(c.phone) || text(c.phone_secondary),
    email: text(c.email),
    price: price > 0 ? String(price) : "",
    estimateUrl: row.url_public,
    estimateName: row.estimate_number ? `Markate estimate ${row.estimate_number}` : "Markate estimate",
  };
}

/** "Start new account" was saved: the row is started with its account, and its paper comes down. false when it was not waiting. */
export async function markStarted(id: string, accountId: string, by: string): Promise<boolean> {
  if (!/^\d+$/.test(id)) return false;
  const rows = (await getSql()`
    UPDATE markate_estimates SET outcome = 'started', account_id = ${accountId}, outcome_by = ${by}, outcome_at = now()
    WHERE id = ${id}::bigint AND outcome = 'waiting' RETURNING id
  `) as unknown[];
  if (rows.length === 0) return false;
  await takePaperDown(id, `${by} (account started)`);
  return true;
}

/** "Skip": off the list and off the board, for good. */
export async function skipEstimate(id: string, by: string): Promise<boolean> {
  if (!/^\d+$/.test(id)) return false;
  const rows = (await getSql()`
    UPDATE markate_estimates SET outcome = 'skipped', outcome_by = ${by}, outcome_at = now()
    WHERE id = ${id}::bigint AND outcome = 'waiting' RETURNING id
  `) as unknown[];
  if (rows.length === 0) return false;
  await takePaperDown(id, `${by} (skipped)`);
  return true;
}
