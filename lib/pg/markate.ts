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
//
// Each new estimate also gets one email to crm@ (sendEstimateEmails). Whether
// it went is kept on the estimate's own row, in raw.cwEmail:
//   { state: "pending" | "sending" | "sent", tries, claimedAt, sentAt, lastError }
// A failed send stays "pending" and goes again on the next check.

import { getSql } from "@/lib/db";
import { sendHtmlEmail } from "@/lib/email";
import { MARKATE_EMAIL_TO, estimateEmailHtml, estimateEmailSubject, estimateEmailText, type EstimateEmailData } from "@/lib/markateEstimateEmail";
import {
  MARKATE_REDIRECT_URI,
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

/** One estimate a check looked at, and what it decided: shown after Check now (read only, not saved). */
export type SeenEstimate = {
  number: string;
  /** Markate's status letter and its words: "A Accepted". */
  status: string;
  /** "Commercial", "Residential", or "Not looked up". */
  customerType: string;
  items: string[];
  outcome: "brought in" | "left out" | "already in the CRM";
  why: string;
};

export type CheckResult = {
  checked: number;
  added: number;
  finished: boolean;
  error: string;
  /** The day the check looked back to (YYYY-MM-DD, Eastern). */
  since: string;
  /** What Markate sent back for each list asked for: how many, and under which names. */
  notes: string[];
  seen: SeenEstimate[];
};

/** At most this many estimates are listed in the Check now summary. */
const MAX_SEEN = 60;

/** The list in a Markate reply: under "estimates" as documented, else the first list in the reply. */
function listIn(reply: Record<string, unknown>, key: string): { rows: MarkateEstimate[]; foundUnder: string } {
  if (Array.isArray(reply[key])) return { rows: reply[key] as MarkateEstimate[], foundUnder: key };
  for (const [name, value] of Object.entries(reply)) if (Array.isArray(value)) return { rows: value as MarkateEstimate[], foundUnder: name };
  return { rows: [], foundUnder: "" };
}

/**
 * Accepted, also after it was turned into a work order or invoiced: status A
 * or V, status words that say so, an accepted date, or a work order linked.
 */
function wasAccepted(estimate: MarkateEstimate): boolean {
  const raw = estimate as Record<string, unknown>;
  const letter = text(raw.status).toUpperCase();
  if (letter === "A" || letter === "V") return true;
  if (/accept|convert|work\s*order|invoiced/i.test(text(raw.status_text))) return true;
  if (text(raw.date_accepted) || text(raw.datetime_accepted)) return true;
  return Object.entries(raw).some(([key, value]) => /work_?order/i.test(key) && Boolean(value) && text(value) !== "0" && text(value) !== "[]");
}

const statusLabel = (estimate: MarkateEstimate) => {
  const raw = estimate as Record<string, unknown>;
  return [text(raw.status), text(raw.status_text)].filter(Boolean).join(" ") || "no status";
};
const itemNames = (estimate: MarkateEstimate) => (Array.isArray(estimate.items) ? estimate.items.map((item) => text(item.name)).filter(Boolean) : []);
const customerTypeLabel = (customer: MarkateCustomer | null | undefined) =>
  !customer ? "Not found" : text(customer.type_service_text) || (isCommercial(customer) ? "Commercial" : text(customer.type_service) === "1" ? "Residential" : `type ${text(customer.type_service) || "?"}`);

/** When the estimate was accepted (or last changed, if Markate does not say). */
function acceptedTime(estimate: MarkateEstimate): number {
  const raw = estimate as Record<string, unknown>;
  for (const value of [estimate.date_accepted, raw.datetime_accepted, estimate.datetime_updated, estimate.datetime_added, estimate.date_issued]) {
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
 * Then the emails to crm@ that are still to go are sent (new ones, and any
 * that failed before), whatever happened with Markate.
 */
export async function checkForEstimates(): Promise<CheckResult> {
  const result = await importEstimates();
  await sendEstimateEmails();
  return result;
}

async function importEstimates(): Promise<CheckResult> {
  const result: CheckResult = { checked: 0, added: 0, finished: false, error: "", since: "", notes: [], seen: [] };
  const row = await connectionRow();
  if (!row) return { ...result, error: "Markate is not connected." };
  const startedAt = new Date();
  // From the last run that finished (less the overlap), never before Oct 22, 2026. After a run that
  // did not finish, start again from Oct 22: what is already saved is skipped without asking Markate.
  const lastGood = row.last_checked_at && !row.last_check_error ? new Date(row.last_checked_at).getTime() - OVERLAP_MS : IMPORT_START_MS;
  const cutoff = Math.max(IMPORT_START_MS, lastGood);
  result.since = easternDay(cutoff);
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

    // 1. Collect the estimates since the cutoff, from two lists: the Accepted ones (newest
    //    accepted first), and the newest of any status, which also finds one whose status
    //    changed after it was accepted (turned into a work order). Each estimate once.
    const collected = new Map<string, MarkateEstimate>();
    const sources: { label: string; query: Record<string, string> }[] = [
      { label: "Accepted (status A)", query: { status: "A", order: "date-accepted-desc" } },
      { label: "Newest, any status", query: { order: "added-desc" } },
    ];
    for (const source of sources) {
      let count = 0;
      let under = "";
      let replyKeys = "";
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const reply = await call<Record<string, unknown>>("estimates", { ...source.query, page: String(page), rows_per_page: String(PAGE_SIZE) });
        const { rows, foundUnder } = listIn(reply, "estimates");
        under ||= foundUnder;
        replyKeys ||= Object.keys(reply ?? {}).join(", ");
        count += rows.length;
        let anyRecent = false;
        for (const listed of rows) {
          const time = acceptedTime(listed);
          if (Number.isFinite(time) && time < cutoff) continue;
          anyRecent = true;
          const id = text(listed.id);
          if (id && !collected.has(id)) collected.set(id, listed);
        }
        const next = Number((reply.pagination as { next?: unknown } | undefined)?.next ?? 0);
        if (!anyRecent || !(next > page) || rows.length === 0) break;
      }
      result.notes.push(
        `${source.label}: Markate sent ${count} estimate${count === 1 ? "" : "s"}${under ? ` (under "${under}")` : ` (no list in the reply; it had: ${replyKeys || "nothing"})`}.`
      );
    }

    // 2. Decide on each one, newest first, and say why.
    const ids = [...collected.keys()];
    const known = new Set(
      ids.length ? ((await sql`SELECT markate_estimate_id FROM markate_estimates WHERE markate_estimate_id = ANY(${ids})`) as { markate_estimate_id: string }[]).map((r) => r.markate_estimate_id) : []
    );
    const ordered = [...collected.values()].sort((a, b) => (acceptedTime(b) || 0) - (acceptedTime(a) || 0));
    const see = (estimate: MarkateEstimate, customerType: string, outcome: SeenEstimate["outcome"], why: string) => {
      if (result.seen.length < MAX_SEEN) result.seen.push({ number: text(estimate.custom_number) || `id ${text(estimate.id)}`, status: statusLabel(estimate), customerType, items: itemNames(estimate), outcome, why });
    };

    for (const listed of ordered) {
      const id = text(listed.id);
      result.checked += 1;
      if (known.has(id)) {
        see(listed, "Not looked up", "already in the CRM", "Brought in by an earlier check.");
        continue;
      }
      if (!wasAccepted(listed)) {
        see(listed, "Not looked up", "left out", `Not accepted (status ${statusLabel(listed)}).`);
        continue;
      }

      const customerId = text(listed.customer_id) || text(listed.customer?.id);
      if (!customerId) {
        see(listed, "Not found", "left out", "The estimate has no customer.");
        continue;
      }
      if (!customers.has(customerId)) {
        const got = await call<{ customer?: MarkateCustomer }>(`customers/${encodeURIComponent(customerId)}`);
        customers.set(customerId, got.customer ?? null);
      }
      const customer = customers.get(customerId);
      if (!customer || !isCommercial(customer)) {
        see(listed, customerTypeLabel(customer), "left out", customer ? "The customer is not Commercial." : "The customer was not found in Markate.");
        continue;
      }

      let estimate = listed;
      if (!Array.isArray(estimate.items) || estimate.items.length === 0) {
        const got = await call<{ estimate?: MarkateEstimate }>(`estimates/${encodeURIComponent(id)}`);
        estimate = got.estimate ?? listed;
      }
      const match = recurringMatch(Array.isArray(estimate.items) ? estimate.items : [], names);
      if (!match) {
        see(estimate, customerTypeLabel(customer), "left out", "No recurring item (no name on the list, no \"per Month\").");
        continue;
      }

      const customerName = text(customer.company) || text(customer.display_name) || text(estimate.customer?.name);
      const inserted = (await sql`
        INSERT INTO markate_estimates (markate_estimate_id, estimate_number, customer_id, customer_name, customer, total, recurring_total, status, estimate_date, url_public, matched_item, matched_why, raw)
        VALUES (${id}, ${text(estimate.custom_number)}, ${customerId}, ${customerName}, ${JSON.stringify(customer)}::jsonb, ${estimateTotal(estimate)}, ${match.recurringTotal},
                ${text(estimate.status) || "A"}, ${easternDay(acceptedTime(estimate))},
                ${text(estimate.url_public)}, ${match.item}, ${match.why}, ${JSON.stringify({ ...estimate, cwEmail: { state: "pending", tries: 0 } })}::jsonb)
        ON CONFLICT (markate_estimate_id) DO NOTHING
        RETURNING id::text
      `) as { id: string }[];
      if (inserted[0]) {
        result.added += 1;
        await pinEstimatePaper(inserted[0].id, customerName, estimateTotal(estimate), match.item);
        see(estimate, customerTypeLabel(customer), "brought in", `Recurring item: ${match.item}${match.why === "per month" ? " (says per month)" : ""}.`);
      } else {
        see(estimate, customerTypeLabel(customer), "already in the CRM", "Brought in by a check running at the same time.");
      }
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

/* ---------- the email to crm@ ---------- */

/** A send that failed this many times is given up on (each failure is in the Email log). */
const MAX_EMAIL_TRIES = 20;
/** A send that was started but never finished (the function was stopped) can be tried again after this. */
const SENDING_STALE = "10 minutes";
const APP_ORIGIN = new URL(MARKATE_REDIRECT_URI).origin;

type EmailRow = {
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
};

function emailData(row: EmailRow): EstimateEmailData {
  const c = row.customer ?? {};
  const cityLine = [text(c.city), [text(c.state), text(c.zip)].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return {
    customerName: row.customer_name,
    displayName: text(c.display_name),
    company: text(c.company),
    address: [text(c.address), text(c.address_secondary), cityLine].filter(Boolean).join(", "),
    contactName: [text(c.first_name), text(c.last_name)].filter(Boolean).join(" ") || text(c.display_name),
    phone: text(c.phone) || text(c.phone_secondary),
    email: text(c.email),
    monthlyPrice: Number(row.recurring_total) || 0,
    total: Number(row.total) || 0,
    matchedItem: row.matched_item,
    matchedWhy: row.matched_why,
    acceptedDay: row.estimate_date,
    estimateNumber: row.estimate_number,
    crmUrl: `${APP_ORIGIN}/accounts-center?tab=new&markate=${row.id}#markate-${row.id}`,
    markateUrl: row.url_public,
  };
}

/**
 * One email to crm@ for each estimate the import saved: the ones still
 * "pending" (new, or failed before). Never one accepted before Oct 22, 2026.
 * A row is claimed ("sending") before the send, so the cron and Check now
 * running at the same time cannot both send it. Never throws.
 */
async function sendEstimateEmails(): Promise<void> {
  const sql = getSql();
  const due = `
    (raw->'cwEmail'->>'state' = 'pending'
      OR (raw->'cwEmail'->>'state' = 'sending' AND (raw->'cwEmail'->>'claimedAt')::timestamptz < now() - interval '${SENDING_STALE}'))
    AND COALESCE((raw->'cwEmail'->>'tries')::int, 0) < ${MAX_EMAIL_TRIES}
    AND NOT (estimate_date <> '' AND estimate_date < '${IMPORT_START_DAY}')
    AND NOT (outcome = 'skipped' AND outcome_by LIKE 'Accepted before Oct 22, 2026%')`;
  try {
    const rows = (await sql.query(
      `SELECT id::text, estimate_number, customer_name, customer, total::text, recurring_total::text, estimate_date, url_public, matched_item, matched_why
       FROM markate_estimates WHERE ${due} ORDER BY id LIMIT 25`
    )) as EmailRow[];
    for (const row of rows) {
      const claimed = (await sql.query(
        `UPDATE markate_estimates SET raw = jsonb_set(raw, '{cwEmail}', COALESCE(raw->'cwEmail', '{}'::jsonb) || jsonb_build_object('state', 'sending', 'claimedAt', now()))
         WHERE id = $1::bigint AND ${due} RETURNING id`,
        [row.id]
      )) as unknown[];
      if (claimed.length === 0) continue;

      const data = emailData(row);
      let error = "";
      try {
        const sent = await sendHtmlEmail({
          to: [MARKATE_EMAIL_TO],
          subject: estimateEmailSubject(data),
          html: estimateEmailHtml(data),
          text: estimateEmailText(data),
          fromName: "Cleaning World CRM",
          log: { type: "NEW ACCEPTED ACCOUNT", accountName: data.customerName, sentBy: "System" },
        });
        if (!sent) error = "No email sender is set up here.";
      } catch (err) {
        error = err instanceof Error ? err.message : "The email did not send.";
      }

      if (error) {
        console.error(`[markate email] estimate ${row.id} not sent:`, error);
        await sql.query(
          `UPDATE markate_estimates SET raw = jsonb_set(raw, '{cwEmail}', raw->'cwEmail' || jsonb_build_object('state', 'pending', 'tries', COALESCE((raw->'cwEmail'->>'tries')::int, 0) + 1, 'lastError', $2::text))
           WHERE id = $1::bigint`,
          [row.id, error.slice(0, 300)]
        );
      } else {
        await sql.query(
          `UPDATE markate_estimates SET raw = jsonb_set(raw, '{cwEmail}', raw->'cwEmail' || jsonb_build_object('state', 'sent', 'sentAt', now(), 'lastError', ''))
           WHERE id = $1::bigint`,
          [row.id]
        );
      }
    }
  } catch (error) {
    console.error("[markate email]", error instanceof Error ? error.message : error);
  }
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
