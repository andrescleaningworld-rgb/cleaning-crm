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
//
// Every amount saved (total, recurring_total) is before tax (lib/markate.ts,
// estimateTotal / linePreTax). raw.cwPreTax = true marks a row saved that way;
// migration 055 fixed the ones brought in before.

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
 * The import starts here. Markate sends no accepted date, so "accepted from
 * Oct 22, 2026 on" works like this: the first check sets aside every estimate
 * already in the Accepted list that was issued before this day (the baseline);
 * after that, anything new in the Accepted list was accepted since then.
 */
const IMPORT_START_DAY = "2026-10-22";
/** The row that says the baseline is done (a marker; never shown, no paper, no email). */
const BASELINE_ID = "baseline-before-2026-10-22";
const BASELINE_WHY = "Accepted before Oct 22, 2026 (import start)";
/** Markate allows 120 calls a minute. A run keeps under 100 a minute and waits when it gets there. */
const CALLS_PER_MINUTE = 100;
/** "Too many requests" anyway: wait (Markate's Retry-After, else a minute) and try the same call again, up to this many times. */
const RATE_LIMIT_RETRIES = 3;
/** A run stops before the function's 5-minute limit; the next run goes on (what is saved stays saved). */
const RUN_BUDGET_MS = 240_000;
const PAGE_SIZE = 50;
/** The baseline reads the whole Accepted list, up to this many pages (the time limit stops it sooner; the next run goes on). */
const BASELINE_MAX_PAGES = 1000;
/** After the baseline: newest accepted first, until a page has nothing new, never more than this many pages. */
const MAX_NEW_PAGES = 20;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class OutOfTime extends Error {}

/** One estimate a check looked at, and what it decided: shown after Check now (read only). */
export type SeenEstimate = {
  number: string;
  /** Markate's status letter and its words: "A Accepted". */
  status: string;
  /** "Commercial", "Residential", or "Not looked up". */
  customerType: string;
  items: string[];
  outcome: "brought in" | "left out" | "already in the CRM";
  /** Left out only: the short reason the counts are grouped by ("residential", "no recurring item", ...). */
  kind: string;
  why: string;
};

/** One Markate estimate looked up by its id (Check now troubleshooting): its raw status and date fields. */
export type EstimateLookup = {
  id: string;
  found: boolean;
  error: string;
  number: string;
  /** "key: value" for every status, date, accepted and work order field Markate sent. */
  fields: string[];
  /** The Eastern day the check reads from its dates (YYYY-MM-DD), "" when none. */
  day: string;
  countsAsAccepted: boolean;
  /** Which of the check's lists it was in (none = []). */
  inLists: string[];
  /** What the CRM already did with it ("" = nothing yet). */
  inCrm: string;
};

export type CheckResult = {
  checked: number;
  added: number;
  finished: boolean;
  error: string;
  /** Kept for the page; "" now (there is no date window any more). */
  since: string;
  /** One line about the Accepted list: its size, the pages read, and page 1's first and last estimate. */
  notes: string[];
  seen: SeenEstimate[];
  /** How many were left out, by reason ("residential": 8, ...). */
  leftOut: Record<string, number>;
  lookup: EstimateLookup | null;
};

/** At most this many left-out estimates are listed under "Show details". */
const MAX_LEFT_OUT_SHOWN = 100;

/**
 * A Markate date as an Eastern calendar day (YYYY-MM-DD). A date with no time
 * zone ("2026-10-22", "2026-10-22 00:00:00"), or one at exactly midnight
 * ("2026-10-22T00:00:00+00:00", a date with no real time), is that day as
 * written, not UTC midnight; a real time with a zone is turned into the
 * Eastern day. "" when none.
 */
function markateDay(value: unknown): string {
  const raw = text(value);
  const day = /^(\d{4}-\d{2}-\d{2})/.exec(raw)?.[1];
  if (!day) return "";
  const rest = raw.slice(10);
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(rest) || /^[ T]00:00(:00)?/.test(rest)) return day;
  const time = Date.parse(raw.replace(" ", "T"));
  return Number.isFinite(time) ? easternDay(time) : day;
}

/** The day the estimate is from: its accepted date if Markate ever sends one, else the day it was issued, else added. */
function estimateDay(estimate: MarkateEstimate): string {
  const raw = estimate as Record<string, unknown>;
  return markateDay(raw.date_accepted) || markateDay(raw.datetime_accepted) || markateDay(raw.date_issued) || markateDay(raw.datetime_added);
}

/** YYYY-MM-DD in the office's time zone (Eastern), "" when unknown. */
function easternDay(time: number): string {
  return Number.isFinite(time) ? new Date(time).toLocaleDateString("en-CA", { timeZone: "America/New_York" }) : "";
}

/** "EST-050378 (issued 2026-10-22, added …)": an estimate and the dates Markate sent with it. */
function describe(estimate: MarkateEstimate | undefined): string {
  if (!estimate) return "none";
  const raw = estimate as Record<string, unknown>;
  const dates = [
    ["accepted", raw.date_accepted ?? raw.datetime_accepted],
    ["issued", raw.date_issued],
    ["added", raw.datetime_added],
    ["updated", raw.datetime_updated],
  ]
    .filter(([, value]) => text(value))
    .map(([label, value]) => `${label} ${text(value).replace("T", " ").slice(0, 16)}`);
  return `${text(raw.custom_number) || `id ${text(raw.id)}`}${dates.length ? ` (${dates.join(", ")})` : ""}`;
}

/** The fields worth seeing on one estimate when it does not come in: status, dates, accepted, work order. */
function lookupFields(estimate: MarkateEstimate): string[] {
  return Object.entries(estimate as Record<string, unknown>)
    .filter(([key]) => /status|date|time|accept|work_?order|convert/i.test(key))
    .map(([key, value]) => `${key}: ${value === null ? "null" : typeof value === "object" ? JSON.stringify(value).slice(0, 120) : text(value).slice(0, 120)}`);
}

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

/**
 * The cron (every 30 minutes) and "Check now". Reads Markate's Accepted list,
 * newest accepted first. The first check sets aside the ones accepted before
 * Oct 22, 2026 (the baseline); every check after that stops at the first page
 * with nothing new. Each new one is decided on: brought in (commercial, with a
 * recurring line item: waiting, pinned in "New accepted"), or left out. Both are
 * remembered, so nothing is looked at twice. Then the emails to crm@ that are
 * still to go are sent (new ones, and any that failed before).
 */
export async function checkForEstimates(options: { lookupId?: string } = {}): Promise<CheckResult> {
  const result = await importEstimates(options.lookupId?.trim() ?? "");
  await sendEstimateEmails();
  return result;
}

type KnownRow = { markate_estimate_id: string; outcome: string; outcome_by: string };

async function importEstimates(lookupId: string): Promise<CheckResult> {
  const result: CheckResult = { checked: 0, added: 0, finished: false, error: "", since: "", notes: [], seen: [], leftOut: {}, lookup: null };
  const row = await connectionRow();
  if (!row) return { ...result, error: "Markate is not connected." };
  const startedAt = new Date();
  const today = easternDay(startedAt.getTime());
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
    const knownOf = async (ids: string[]): Promise<Map<string, KnownRow>> => {
      if (ids.length === 0) return new Map();
      const rows = (await sql`SELECT markate_estimate_id, outcome, outcome_by FROM markate_estimates WHERE markate_estimate_id = ANY(${ids})`) as KnownRow[];
      return new Map(rows.map((known) => [known.markate_estimate_id, known]));
    };

    // Brought in and already in the CRM are always listed; left out ones are counted by reason, and listed up to a limit.
    let leftOutShown = 0;
    const see = (estimate: MarkateEstimate, customerType: string, outcome: SeenEstimate["outcome"], why: string, kind = "") => {
      if (outcome === "left out") {
        result.leftOut[kind] = (result.leftOut[kind] ?? 0) + 1;
        if (leftOutShown >= MAX_LEFT_OUT_SHOWN) return;
        leftOutShown += 1;
      }
      result.seen.push({ number: text(estimate.custom_number) || `id ${text(estimate.id)}`, status: statusLabel(estimate), customerType, items: itemNames(estimate), outcome, kind, why });
    };

    /** A left out one is remembered as skipped (no paper, no email), so it is not looked at again. */
    const rememberLeftOut = async (estimate: MarkateEstimate, customer: MarkateCustomer | null | undefined, kind: string) => {
      const customerName = (customer && (text(customer.company) || text(customer.display_name))) || text(estimate.customer?.name);
      await sql`
        INSERT INTO markate_estimates (markate_estimate_id, estimate_number, customer_id, customer_name, customer, total, status, estimate_date, url_public, raw, outcome, outcome_by, outcome_at)
        VALUES (${text(estimate.id)}, ${text(estimate.custom_number)}, ${text(estimate.customer_id) || text(estimate.customer?.id)}, ${customerName}, ${JSON.stringify(customer ?? {})}::jsonb,
                ${estimateTotal(estimate)}, ${text(estimate.status)}, ${markateDay((estimate as Record<string, unknown>).date_accepted) || today}, ${text(estimate.url_public)},
                ${JSON.stringify(estimate)}::jsonb, 'skipped', ${`Left out: ${kind}`}, now())
        ON CONFLICT (markate_estimate_id) DO NOTHING
      `;
    };

    /** Decides on one estimate the CRM has not seen: brought in, or left out (remembered). */
    const decide = async (listed: MarkateEstimate) => {
      const id = text(listed.id);
      result.checked += 1;
      if (!wasAccepted(listed)) {
        // Only the lookup can get here (the list is the Accepted one). Not remembered: it may still be accepted.
        see(listed, "Not looked up", "left out", `Not accepted (status ${statusLabel(listed)}).`, "not accepted");
        return;
      }
      const customerId = text(listed.customer_id) || text(listed.customer?.id);
      if (!customerId) {
        see(listed, "Not found", "left out", "The estimate has no customer.", "no customer");
        await rememberLeftOut(listed, null, "no customer");
        return;
      }
      if (!customers.has(customerId)) {
        const got = await call<{ customer?: MarkateCustomer }>(`customers/${encodeURIComponent(customerId)}`);
        customers.set(customerId, got.customer ?? null);
      }
      const customer = customers.get(customerId);
      if (!customer || !isCommercial(customer)) {
        const kind = customer ? "residential" : "customer not found";
        see(listed, customerTypeLabel(customer), "left out", customer ? "The customer is not Commercial." : "The customer was not found in Markate.", kind);
        await rememberLeftOut(listed, customer, kind);
        return;
      }

      let estimate = listed;
      if (!Array.isArray(estimate.items) || estimate.items.length === 0) {
        const got = await call<{ estimate?: MarkateEstimate }>(`estimates/${encodeURIComponent(id)}`);
        estimate = got.estimate ?? listed;
      }
      const match = recurringMatch(Array.isArray(estimate.items) ? estimate.items : [], names);
      if (!match) {
        see(estimate, customerTypeLabel(customer), "left out", "No recurring item (no name on the list, no \"per Month\").", "no recurring item");
        await rememberLeftOut(estimate, customer, "no recurring item");
        return;
      }

      // Markate sends no accepted date: the day the CRM found it (Eastern) stands in for it.
      const acceptedDay = markateDay((estimate as Record<string, unknown>).date_accepted) || today;
      const customerName = text(customer.company) || text(customer.display_name) || text(estimate.customer?.name);
      const inserted = (await sql`
        INSERT INTO markate_estimates (markate_estimate_id, estimate_number, customer_id, customer_name, customer, total, recurring_total, status, estimate_date, url_public, matched_item, matched_why, raw)
        VALUES (${id}, ${text(estimate.custom_number)}, ${customerId}, ${customerName}, ${JSON.stringify(customer)}::jsonb, ${estimateTotal(estimate)}, ${match.recurringTotal},
                ${text(estimate.status) || "A"}, ${acceptedDay},
                ${text(estimate.url_public)}, ${match.item}, ${match.why}, ${JSON.stringify({ ...estimate, cwEmail: { state: "pending", tries: 0 }, cwPreTax: true })}::jsonb)
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
    };

    /** A known one that is a real import (waiting or started) is listed as already in the CRM; the rest are only counted. */
    let alreadyDecided = 0;
    const seeKnown = (estimate: MarkateEstimate, known: KnownRow) => {
      alreadyDecided += 1;
      if (known.outcome !== "skipped") see(estimate, "Not looked up", "already in the CRM", known.outcome === "started" ? "The account was started from it." : "Waiting in From Markate.");
    };

    const getPage = async (page: number) => {
      const reply = await call<Record<string, unknown>>("estimates", { status: "A", order: "date-accepted-desc", page: String(page), rows_per_page: String(PAGE_SIZE) });
      return { reply, ...listIn(reply, "estimates") };
    };
    const baselineDone = (await knownOf([BASELINE_ID])).size > 0;
    const inList = new Set<string>();

    // The Accepted list, newest accepted first (checked on Oct 22: EST-050378 was first).
    const first = await getPage(1);
    const pagination = (first.reply.pagination ?? {}) as { total_pages?: unknown; total_rows?: unknown };
    const totalPages = Number(pagination.total_pages) || 0;
    let read = 0;
    let setAside = 0;
    let reachedEnd = false;

    for (let page = 1; page <= (baselineDone ? MAX_NEW_PAGES : BASELINE_MAX_PAGES); page += 1) {
      const { rows } = page === 1 ? first : await getPage(page);
      read += 1;
      if (rows.length === 0) {
        reachedEnd = true;
        break;
      }
      for (const listed of rows) inList.add(text(listed.id));
      const known = await knownOf(rows.map((listed) => text(listed.id)).filter(Boolean));
      const fresh = rows.filter((listed) => text(listed.id) && !known.has(text(listed.id)));
      for (const listed of rows) {
        const was = known.get(text(listed.id));
        if (was) seeKnown(listed, was);
      }

      if (!baselineDone) {
        // The baseline: the ones issued before Oct 22 are set aside in one go (no paper, no email).
        const old = fresh.filter((listed) => (estimateDay(listed) || "0000-00-00") < IMPORT_START_DAY);
        if (old.length > 0) {
          const records = old.map((listed) => ({
            id: text(listed.id),
            number: text(listed.custom_number),
            customer_id: text(listed.customer_id) || text(listed.customer?.id),
            customer_name: text(listed.customer?.name),
            total: estimateTotal(listed),
            status: text(listed.status),
            day: estimateDay(listed),
            url: text(listed.url_public),
            raw: listed,
          }));
          await sql.query(
            `INSERT INTO markate_estimates (markate_estimate_id, estimate_number, customer_id, customer_name, total, status, estimate_date, url_public, raw, outcome, outcome_by, outcome_at)
             SELECT x.id, x.number, x.customer_id, x.customer_name, x.total, x.status, x.day, x.url, x.raw, 'skipped', $2, now()
             FROM jsonb_to_recordset($1::jsonb) AS x(id text, number text, customer_id text, customer_name text, total numeric, status text, day text, url text, raw jsonb)
             ON CONFLICT (markate_estimate_id) DO NOTHING`,
            [JSON.stringify(records), BASELINE_WHY]
          );
          setAside += old.length;
        }
        for (const listed of fresh.filter((candidate) => !old.includes(candidate))) await decide(listed);
        if (totalPages > 0 && page >= totalPages) {
          reachedEnd = true;
          break;
        }
      } else {
        // After the baseline: stop at the first page with nothing new.
        if (fresh.length === 0) break;
        for (const listed of fresh) await decide(listed);
        if (totalPages > 0 && page >= totalPages) break;
      }
    }

    if (!baselineDone && reachedEnd) {
      await sql`
        INSERT INTO markate_estimates (markate_estimate_id, estimate_number, estimate_date, outcome, outcome_by, outcome_at)
        VALUES (${BASELINE_ID}, 'Baseline', ${today}, 'skipped', 'Baseline done: the Accepted list was read whole and the ones before Oct 22, 2026 set aside', now())
        ON CONFLICT (markate_estimate_id) DO NOTHING
      `;
    }

    result.notes.push(
      first.foundUnder
        ? `Accepted list, newest accepted first: ${text(pagination.total_rows) || "?"} in all, ${totalPages || "?"} pages of up to ${PAGE_SIZE}. ` +
            (baselineDone
              ? `Read ${read} page${read === 1 ? "" : "s"}, up to the first page with nothing new. ${alreadyDecided} already decided before.`
              : `First run: read ${read} page${read === 1 ? "" : "s"} and set aside ${setAside} issued before Oct 22, 2026 (no paper, no email).${reachedEnd ? " The baseline is done." : " The next check goes on with the rest."}`) +
            ` Page 1 starts with ${describe(first.rows[0])} and ends with ${describe(first.rows[first.rows.length - 1])}.`
        : `Accepted list: no list in Markate's reply (it had: ${Object.keys(first.reply).join(", ") || "nothing"}).`
    );

    // Troubleshooting: one estimate looked up by its Markate id. One the CRM has not
    // seen that counts as accepted is decided on like the others.
    if (lookupId) {
      const lookup: EstimateLookup = { id: lookupId, found: false, error: "", number: "", fields: [], day: "", countsAsAccepted: false, inLists: inList.has(lookupId) ? ["Accepted list (pages read)"] : [], inCrm: "" };
      try {
        const got = await call<Record<string, unknown>>(`estimates/${encodeURIComponent(lookupId)}`);
        const estimate = (got.estimate ?? null) as MarkateEstimate | null;
        if (estimate) {
          const known = (await knownOf([lookupId])).get(lookupId);
          Object.assign(lookup, {
            found: true,
            number: text(estimate.custom_number),
            fields: lookupFields(estimate),
            day: estimateDay(estimate),
            countsAsAccepted: wasAccepted(estimate),
            inCrm: known ? `${known.outcome}${known.outcome_by ? ` (${known.outcome_by})` : ""}` : "",
          });
          if (!known && wasAccepted(estimate)) await decide(estimate);
        } else {
          lookup.error = `Markate's reply had no estimate (it had: ${Object.keys(got).join(", ") || "nothing"}).`;
        }
      } catch (error) {
        if (error instanceof OutOfTime) throw error;
        lookup.error = error instanceof Error ? error.message : "The lookup did not work.";
      }
      result.lookup = lookup;
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
