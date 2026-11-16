// "Find emails in Markate" (Accounts Center → Missing emails). Read only:
// nothing is saved here and nothing changes in Markate. Server only.
//
// For each account with no customer email, look for the Markate customer that
// is the same place: same name (company / display name vs the account name)
// and/or same street address (house number + street) and zip.
//
// Two ways to read Markate (lib/pg/markate.ts markateReader keeps under the
// call limit):
//   list    every customer, page by page (GET customers): one pass. Used
//           when the list answers with customers.
//   search  when the list comes back empty (it did on Nov 16 with 100 a
//           page): each account is looked up by name (display_name, fuzzy),
//           then by address. That takes about one call per account, so it
//           runs in rounds: each call does what fits in the time and says
//           where to go on from (`next`); the screen calls again until done.
// Each match comes back with why it matched; staff tick the right ones and
// save them with the usual Missing emails save. "sure" = the name matches and
// there is one email: ticked to start with.

import { getSql } from "@/lib/db";
import { markateReader } from "@/lib/pg/markate";
import { text, type MarkateCustomer } from "@/lib/markate";

export type MarkateEmailMatch = {
  accountId: string;
  accountName: string;
  accountAddress: string;
  email: string;
  markateName: string;
  markateAddress: string;
  why: "name and address" | "name" | "address";
  /** Name matches and Markate has one email for it: ticked to start with. */
  sure: boolean;
  /** Why it is not sure, in plain words ("" when sure). */
  note: string;
};

export type MarkateEmailLookup = {
  mode: "list" | "search";
  /** Customers read from the list (list mode). */
  markateCustomers: number;
  missingAccounts: number;
  /** Accounts looked at in this round. */
  checked: number;
  matches: MarkateEmailMatch[];
  notFound: number;
  /** Where the next round starts (search mode); null when every account was looked at. */
  next: number | null;
  /** What Markate answered to the list, when it had no customers (to find out why). */
  listAnswer: string;
};

const LIST_PAGE_SIZE = "50";
const MAX_PAGES = 400;
/** One round stops starting new lookups after this long (the route allows 300 s). */
const ROUND_MS = 200_000;
const EMAIL_RE = /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/;

/** "Acme Cleaning, LLC" → "acme cleaning" (case, punctuation, LLC / Inc / Corp / The, & = and). */
export function nameKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(llc|l l c|inc|incorporated|corp|corporation|co|company|ltd|the|pc|p c|pllc)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STREET_WORDS: Record<string, string> = {
  street: "st",
  avenue: "ave",
  av: "ave",
  road: "rd",
  drive: "dr",
  boulevard: "blvd",
  place: "pl",
  court: "ct",
  lane: "ln",
  parkway: "pkwy",
  highway: "hwy",
  route: "rt",
  rte: "rt",
  terrace: "ter",
  circle: "cir",
  turnpike: "tpke",
  north: "n",
  south: "s",
  east: "e",
  west: "w",
};

/** "123 Main Street, Suite 4, Hackensack" → "123 main st": the house number and the street, before any unit or town. */
export function streetKey(value: string): string {
  const first = value.split(",")[0] ?? "";
  const words = first
    .toLowerCase()
    .replace(/#.*$/, "")
    .replace(/\b(suite|ste|unit|apt|fl|floor|bldg|building|rm|room)\b.*$/, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => STREET_WORDS[word] ?? word);
  return /^\d/.test(words[0] ?? "") && words.length >= 2 ? words.join(" ") : "";
}

const zipOf = (...values: string[]) => {
  for (const value of values) {
    const zip = /\b(\d{5})(?:-\d{4})?\b/.exec(value)?.[1];
    if (zip) return zip;
  }
  return "";
};

/** Every good email on a Markate customer (email, email_secondary, …), lower case, no repeats. */
function emailsOf(customer: MarkateCustomer): string[] {
  const found: string[] = [];
  for (const [key, value] of Object.entries(customer)) {
    if (!/email/i.test(key) || /notify/i.test(key)) continue;
    for (const part of text(value).split(/[,;\s]+/)) {
      const email = part.trim().toLowerCase();
      if (EMAIL_RE.test(email) && !found.includes(email)) found.push(email);
    }
  }
  return found;
}

const customerName = (c: MarkateCustomer) => text(c.company) || text(c.display_name) || [text(c.first_name), text(c.last_name)].filter(Boolean).join(" ");
const customerAddress = (c: MarkateCustomer) => [text(c.address), text(c.address_secondary), text(c.city), text(c.state), text(c.zip)].filter(Boolean).join(", ");
/** Every name a customer goes by (company, display name, person), as keys. */
const nameKeysOf = (c: MarkateCustomer) =>
  [text(c.company), text(c.display_name), [text(c.first_name), text(c.last_name)].filter(Boolean).join(" ")].map(nameKey).filter(Boolean);

type MissingRow = { id: string; account_name: string; address: string; city: string; zip: string };

/** The accounts the Missing emails list shows (no email, not cancelled, not a test, not deleted). */
async function missingAccounts(): Promise<MissingRow[]> {
  return (await getSql().query(
    `SELECT a.id, a.account_name, a.address, a.city, a.zip
     FROM accounts a
     WHERE NOT a.is_test AND a.id IS NOT NULL AND (to_jsonb(a)->>'deleted_at') IS NULL AND btrim(a.email) = '' AND a.status_key NOT IN ('cancelled', 'canceled')
     ORDER BY lower(a.account_name), a.id`
  )) as MissingRow[];
}

type Call = <T>(path: string, query?: Record<string, string>) => Promise<T>;

const listOf = (reply: Record<string, unknown>) => (Array.isArray(reply.customers) ? reply.customers : Array.isArray(reply.data) ? reply.data : []) as MarkateCustomer[];

/** A short note of what Markate answered (keys and counts, never customer data). */
function answerNote(reply: Record<string, unknown>): string {
  const pagination = reply.pagination as Record<string, unknown> | undefined;
  return `keys: ${Object.keys(reply).join(", ") || "none"}${pagination ? `; total_rows ${text(pagination.total_rows)}, total_pages ${text(pagination.total_pages)}` : ""}`;
}

/** The match for one account among these customers, or null. Reads a customer's details when its email is not in what we have. */
async function matchAccount(account: MissingRow, candidates: MarkateCustomer[], call: Call, details: Map<string, MarkateCustomer>): Promise<MarkateEmailMatch | null> {
  const name = nameKey(account.account_name);
  const street = streetKey(account.address);
  const zip = zipOf(account.zip, account.address);
  const sameName = name ? candidates.filter((c) => nameKeysOf(c).includes(name)) : [];
  const sameStreet = street
    ? candidates.filter((c) => {
        if (streetKey(text(c.address)) !== street) return false;
        const theirZip = zipOf(text(c.zip), text(c.address));
        return !zip || !theirZip || theirZip === zip;
      })
    : [];
  const both = sameName.filter((c) => sameStreet.includes(c));
  const pool = both.length ? both : sameName.length ? sameName : sameStreet;
  if (pool.length === 0) return null;
  const why: MarkateEmailMatch["why"] = both.length ? "name and address" : sameName.length ? "name" : "address";

  const withEmails = async (c: MarkateCustomer): Promise<string[]> => {
    const listed = emailsOf(c);
    const id = text(c.id);
    if (listed.length || !id) return listed;
    if (!details.has(id)) {
      const got = await call<{ customer?: MarkateCustomer }>(`customers/${encodeURIComponent(id)}`).catch(() => ({ customer: undefined }));
      details.set(id, got.customer ?? c);
    }
    return emailsOf(details.get(id)!);
  };

  const found: { email: string; c: MarkateCustomer }[] = [];
  for (const c of pool) for (const email of await withEmails(c)) if (!found.some((f) => f.email === email)) found.push({ email, c });
  if (found.length === 0) return null;

  const first = found[0];
  const notes: string[] = [];
  if (why === "address") notes.push("Same address, different name: check it is the same customer");
  if (found.length > 1) notes.push(`Markate has ${found.length} emails here: ${found.map((f) => f.email).join(", ")}`);
  if (why === "name" && sameName.length > 1) notes.push(`${sameName.length} Markate customers have this name`);
  return {
    accountId: account.id,
    accountName: account.account_name.trim(),
    accountAddress: [account.address, account.city].map((part) => part.trim()).filter(Boolean).join(", "),
    email: first.email,
    markateName: customerName(first.c),
    markateAddress: customerAddress(first.c),
    why,
    sure: found.length === 1 && (why === "name and address" || (why === "name" && sameName.length === 1)),
    note: notes.join(". "),
  };
}

/** `start`: the first account of this round (search mode); 0 starts over and tries the list first. */
export async function findMarkateEmails(start = 0): Promise<MarkateEmailLookup | { error: string }> {
  const call = await markateReader(ROUND_MS + 60_000);
  if (!call) return { error: "Markate is not connected. Connect it in Settings → Markate." };
  const accounts = await missingAccounts();
  const details = new Map<string, MarkateCustomer>();
  const startedAt = Date.now();
  let listAnswer = "";

  // First round: the whole list, if Markate gives it.
  if (start === 0) {
    const first = await call<Record<string, unknown>>("customers", { page: "1", rows_per_page: LIST_PAGE_SIZE });
    const customers = listOf(first);
    if (customers.length > 0) {
      const totalPages = Number((first.pagination as { total_pages?: unknown } | undefined)?.total_pages) || 0;
      for (let page = 2; page <= MAX_PAGES && (totalPages === 0 || page <= totalPages); page += 1) {
        const list = listOf(await call<Record<string, unknown>>("customers", { page: String(page), rows_per_page: LIST_PAGE_SIZE }));
        if (list.length === 0) break;
        customers.push(...list);
      }
      const matches: MarkateEmailMatch[] = [];
      let notFound = 0;
      for (const account of accounts) {
        const match = await matchAccount(account, customers, call, details);
        if (match) matches.push(match);
        else notFound += 1;
      }
      return { mode: "list", markateCustomers: customers.length, missingAccounts: accounts.length, checked: accounts.length, matches, notFound, next: null, listAnswer: "" };
    }
    listAnswer = answerNote(first);
  }

  // Search: each account by its name, then by its street address.
  const matches: MarkateEmailMatch[] = [];
  let notFound = 0;
  let index = Math.max(0, start);
  for (; index < accounts.length; index += 1) {
    if (Date.now() - startedAt > ROUND_MS) break;
    const account = accounts[index];
    const candidates: MarkateCustomer[] = [];
    const add = (list: MarkateCustomer[]) => {
      for (const c of list) if (!candidates.some((have) => text(have.id) && text(have.id) === text(c.id))) candidates.push(c);
    };
    const name = account.account_name.trim();
    if (name) add(listOf(await call<Record<string, unknown>>("customers", { display_name: name, search_type: "fuzzy", rows_per_page: "20", page: "1" })));
    let match = await matchAccount(account, candidates, call, details);
    const street = account.address.split(",")[0]?.trim() ?? "";
    if (!match && streetKey(street)) {
      add(listOf(await call<Record<string, unknown>>("customers", { address: street, search_type: "fuzzy", rows_per_page: "20", page: "1" })));
      match = await matchAccount(account, candidates, call, details);
    }
    if (match) matches.push(match);
    else notFound += 1;
  }
  return {
    mode: "search",
    markateCustomers: 0,
    missingAccounts: accounts.length,
    checked: index - Math.max(0, start),
    matches,
    notFound,
    next: index < accounts.length ? index : null,
    listAnswer,
  };
}
