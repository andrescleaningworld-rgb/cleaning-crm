// "Find emails in Markate" (Accounts Center → Missing emails), the Markate
// side. Read only: nothing is saved here and nothing changes in Markate.
// Server only. The matching rules: lib/markateEmailMatch.ts.
//
//   customerPages()   the whole customer list, a run of pages at a time, for
//                     one status (1 Active, 4 Pending, 3 Inactive), with a
//                     pause between pages. The screen calls it again and again
//                     until every page of every status is in, keeps the list
//                     for the run, and matches every account against it.
//   searchRound()     the backup when the list comes back empty: each account
//                     looked up by name, then by address, in rounds.
// markateReader (lib/pg/markate.ts) keeps every call under Markate's limit.

import { getSql } from "@/lib/db";
import { markateReader } from "@/lib/pg/markate";
import { text, type MarkateCustomer } from "@/lib/markate";
import { matchAccounts, slimCustomer, streetKey, type EmailMatch, type MissingAccountRow, type SlimCustomer } from "@/lib/markateEmailMatch";

/** Markate's customer statuses: Active, Pending, Inactive. */
export const MARKATE_STATUSES = ["1", "4", "3"] as const;
export type MarkateStatus = (typeof MARKATE_STATUSES)[number];

/** A pause between pages, on top of the call limit, so a long download never runs into "Too many requests". */
const PAGE_GAP_MS = 400;
/** One call stops after this long or this many pages, so its answer stays small (Vercel sends at most 4.5 MB back). */
const CALL_MS = 60_000;
const PAGES_PER_CALL = 60;
const ROUND_MS = 200_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const listOf = (reply: Record<string, unknown>) => (Array.isArray(reply.customers) ? reply.customers : Array.isArray(reply.data) ? reply.data : []) as MarkateCustomer[];

export type CustomerPages = {
  status: MarkateStatus;
  customers: SlimCustomer[];
  /** The page to ask for next; null when this status is done. */
  nextPage: number | null;
  totalPages: number;
  totalRows: number;
  /** What Markate answered to the first page (keys and counts, never customer data). */
  answer: string;
};

/** Pages `fromPage`… of one status, until the time is up or the status is done. */
export async function customerPages(status: MarkateStatus, fromPage: number, size: number): Promise<CustomerPages | { error: string }> {
  const call = await markateReader(CALL_MS + 60_000);
  if (!call) return { error: "Markate is not connected. Connect it in Settings → Markate." };
  const startedAt = Date.now();
  const customers: SlimCustomer[] = [];
  let page = Math.max(1, fromPage);
  let totalPages = 0;
  let totalRows = 0;
  let answer = "";
  for (;;) {
    const reply = await call<Record<string, unknown>>("customers", { status, page: String(page), rows_per_page: String(size), order: "name-asc" });
    const list = listOf(reply);
    const pagination = (reply.pagination ?? {}) as Record<string, unknown>;
    totalPages = Number(pagination.total_pages) || totalPages;
    totalRows = Number(pagination.total_rows) || totalRows;
    if (!answer) answer = `keys: ${Object.keys(reply).join(", ") || "none"}; total_rows ${text(pagination.total_rows)}, total_pages ${text(pagination.total_pages)}`;
    customers.push(...list.map((c) => slimCustomer(c)));
    const done = list.length === 0 || (totalPages > 0 && page >= totalPages);
    if (done) return { status, customers, nextPage: null, totalPages, totalRows, answer };
    page += 1;
    if (Date.now() - startedAt > CALL_MS || page - fromPage >= PAGES_PER_CALL) return { status, customers, nextPage: page, totalPages, totalRows, answer };
    await sleep(PAGE_GAP_MS);
  }
}

/** The ACTIVE accounts with no email (not a test, not deleted): the only ones the Markate lookup fills. Paused, suspended and inactive ones are left out. */
export async function missingAccountRows(): Promise<MissingAccountRow[]> {
  const rows = (await getSql().query(
    `SELECT a.id, a.account_name, a.address, a.city, a.zip, a.phone, a.contact_name, a.manager_raw
     FROM accounts a
     WHERE NOT a.is_test AND a.id IS NOT NULL AND (to_jsonb(a)->>'deleted_at') IS NULL AND btrim(a.email) = '' AND a.status_key = 'active'
     ORDER BY lower(a.account_name), a.id`
  )) as { id: string; account_name: string; address: string; city: string; zip: string; phone: string; contact_name: string; manager_raw: string }[];
  return rows.map((r) => ({
    accountId: r.id,
    accountName: r.account_name.trim(),
    address: r.address.trim(),
    city: r.city.trim(),
    zip: r.zip.trim(),
    phone: r.phone.trim(),
    contactName: r.contact_name.trim(),
    manager: r.manager_raw.trim(),
  }));
}

export type SearchRound = { checked: number; matches: EmailMatch[]; missing: MissingAccountRow[]; next: number | null; total: number };

/** The backup: accounts `start`… looked up one by one (by name, then by address) until the time is up. */
export async function searchRound(start: number): Promise<SearchRound | { error: string }> {
  const call = await markateReader(ROUND_MS + 60_000);
  if (!call) return { error: "Markate is not connected. Connect it in Settings → Markate." };
  const accounts = await missingAccountRows();
  const startedAt = Date.now();
  const matches: EmailMatch[] = [];
  const missing: MissingAccountRow[] = [];
  let index = Math.max(0, start);
  for (; index < accounts.length; index += 1) {
    if (Date.now() - startedAt > ROUND_MS) break;
    const account = accounts[index];
    const found: SlimCustomer[] = [];
    if (account.accountName) {
      found.push(...listOf(await call<Record<string, unknown>>("customers", { display_name: account.accountName, search_type: "fuzzy", rows_per_page: "20", page: "1" })).map((c) => slimCustomer(c)));
    }
    let result = matchAccounts([account], found);
    const street = account.address.split(",")[0]?.trim() ?? "";
    if (result.matches.length === 0 && streetKey(street)) {
      found.push(...listOf(await call<Record<string, unknown>>("customers", { address: street, search_type: "fuzzy", rows_per_page: "20", page: "1" })).map((c) => slimCustomer(c)));
      result = matchAccounts([account], found);
    }
    matches.push(...result.matches);
    missing.push(...result.missing);
  }
  return { checked: index - Math.max(0, start), matches, missing, next: index < accounts.length ? index : null, total: accounts.length };
}
