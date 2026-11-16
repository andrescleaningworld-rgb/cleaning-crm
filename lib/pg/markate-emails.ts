// "Find emails in Markate" (Accounts Center → Missing emails). Read only:
// nothing is saved here and nothing changes in Markate. Server only.
//
// Reads every Markate customer (the customers list, page by page, under the
// call limit: lib/pg/markate.ts markateReader), then for each account with no
// customer email looks for the Markate customer that is the same place:
//   - same name (company / display name vs the account name), and/or
//   - same street address (house number + street) and zip.
// Each match comes back with why it matched; staff tick the right ones and
// save them with the usual Missing emails save (one account at a time).
// "sure" = the name matches and only one email was found: pre-ticked on screen.

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
  markateCustomers: number;
  missingAccounts: number;
  matches: MarkateEmailMatch[];
  notFound: number;
};

const PAGE_SIZE = "100";
const MAX_PAGES = 200;
const BUDGET_MS = 240_000;
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
    if (!/email/i.test(key)) continue;
    for (const part of text(value).split(/[,;\s]+/)) {
      const email = part.trim().toLowerCase();
      if (EMAIL_RE.test(email) && !found.includes(email)) found.push(email);
    }
  }
  return found;
}

const customerName = (c: MarkateCustomer) => text(c.company) || text(c.display_name) || [text(c.first_name), text(c.last_name)].filter(Boolean).join(" ");
const customerAddress = (c: MarkateCustomer) => [text(c.address), text(c.address_secondary), text(c.city), text(c.state), text(c.zip)].filter(Boolean).join(", ");

type MissingRow = { id: string; account_name: string; address: string; city: string; zip: string };

/** The accounts the Missing emails list shows (no email, not cancelled, not a test, not deleted). */
async function missingAccounts(): Promise<MissingRow[]> {
  return (await getSql().query(
    `SELECT a.id, a.account_name, a.address, a.city, a.zip
     FROM accounts a
     WHERE NOT a.is_test AND a.id IS NOT NULL AND (to_jsonb(a)->>'deleted_at') IS NULL AND btrim(a.email) = '' AND a.status_key NOT IN ('cancelled', 'canceled')
     ORDER BY lower(a.account_name)`
  )) as MissingRow[];
}

export async function findMarkateEmails(): Promise<MarkateEmailLookup | { error: string }> {
  const call = await markateReader(BUDGET_MS);
  if (!call) return { error: "Markate is not connected. Connect it in Settings → Markate." };

  // Every Markate customer.
  const customers: MarkateCustomer[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const reply = await call<Record<string, unknown>>("customers", { page: String(page), rows_per_page: PAGE_SIZE });
    const list = (Array.isArray(reply.customers) ? reply.customers : Array.isArray(reply.data) ? reply.data : []) as MarkateCustomer[];
    customers.push(...list);
    const totalPages = Number((reply.pagination as { total_pages?: unknown } | undefined)?.total_pages) || 0;
    if (list.length === 0 || (totalPages > 0 && page >= totalPages)) break;
  }

  const byName = new Map<string, MarkateCustomer[]>();
  const byStreet = new Map<string, MarkateCustomer[]>();
  for (const c of customers) {
    const name = nameKey(customerName(c));
    if (name) byName.set(name, [...(byName.get(name) ?? []), c]);
    const street = streetKey(text(c.address));
    if (street) byStreet.set(street, [...(byStreet.get(street) ?? []), c]);
  }

  // The list may leave the email out: then each matched customer is read once.
  const details = new Map<string, MarkateCustomer>();
  const withEmails = async (c: MarkateCustomer): Promise<string[]> => {
    const listed = emailsOf(c);
    if (listed.length || !text(c.id)) return listed;
    const id = text(c.id);
    if (!details.has(id)) {
      const got = await call<{ customer?: MarkateCustomer }>(`customers/${encodeURIComponent(id)}`).catch(() => ({ customer: undefined }));
      details.set(id, got.customer ?? c);
    }
    return emailsOf(details.get(id)!);
  };

  const accounts = await missingAccounts();
  const matches: MarkateEmailMatch[] = [];
  let notFound = 0;

  for (const account of accounts) {
    const name = nameKey(account.account_name);
    const street = streetKey(account.address);
    const zip = zipOf(account.zip, account.address);
    const sameStreet = (street ? (byStreet.get(street) ?? []) : []).filter((c) => {
      const theirZip = zipOf(text(c.zip), text(c.address));
      return !zip || !theirZip || theirZip === zip;
    });
    const sameName = name ? (byName.get(name) ?? []) : [];
    const both = sameName.filter((c) => sameStreet.includes(c));
    const pool = both.length ? both : sameName.length ? sameName : sameStreet;
    const why: MarkateEmailMatch["why"] = both.length ? "name and address" : sameName.length ? "name" : "address";
    if (pool.length === 0) {
      notFound += 1;
      continue;
    }

    // Every email those customers have, first customer first.
    const found: { email: string; c: MarkateCustomer }[] = [];
    for (const c of pool) for (const email of await withEmails(c)) if (!found.some((f) => f.email === email)) found.push({ email, c });
    if (found.length === 0) {
      notFound += 1;
      continue;
    }

    const first = found[0];
    const notes: string[] = [];
    if (why === "address") notes.push("Same address, different name: check it is the same customer");
    if (found.length > 1) notes.push(`Markate has ${found.length} emails here: ${found.map((f) => f.email).join(", ")}`);
    if (why === "name" && sameName.length > 1) notes.push(`${sameName.length} Markate customers have this name`);
    matches.push({
      accountId: account.id,
      accountName: account.account_name.trim(),
      accountAddress: [account.address, account.city].map((part) => part.trim()).filter(Boolean).join(", "),
      email: first.email,
      markateName: customerName(first.c),
      markateAddress: customerAddress(first.c),
      why,
      sure: found.length === 1 && (why === "name and address" || (why === "name" && sameName.length === 1)),
      note: notes.join(". "),
    });
  }

  return { markateCustomers: customers.length, missingAccounts: accounts.length, matches, notFound };
}
