// Matching CRM accounts that have no email to Markate customers, for
// "Find emails in Markate" (Accounts Center → Missing emails). Plain TS: the
// browser runs it over the whole Markate customer list it downloaded for the
// run (app/accounts-center/markate-emails.tsx), and the server uses the same
// name / street rules (lib/pg/markate-emails.ts).
//
// The order an account is matched in:
//   1. phone    the account's phone = a Markate customer's phone (last 10 digits)
//   2. address  same house number + street, and the same zip when both have one
//   3. name     same name, ignoring case, punctuation and LLC / Inc / & … ("to confirm")
// "sure" (ticked to start with): one email, and matched by phone, or by
// address and name together. Everything else is for a look first.

/** A Markate customer, cut down to what matching needs (so the whole list fits in the browser). */
export type SlimCustomer = { id: string; name: string; names: string[]; address: string; street: string; zip: string; phones: string[]; emails: string[] };

/** An account with no customer email. */
export type MissingAccountRow = { accountId: string; accountName: string; address: string; city: string; zip: string; phone: string; contactName: string; manager: string };

export type MatchWhy = "phone" | "address" | "name";

export type EmailMatch = {
  accountId: string;
  accountName: string;
  accountAddress: string;
  accountPhone: string;
  email: string;
  markateName: string;
  markateAddress: string;
  why: MatchWhy;
  /** Also matched on these, after the first. */
  alsoBy: MatchWhy[];
  sure: boolean;
  note: string;
};

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value)).trim();
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

export function zipOf(...values: string[]): string {
  for (const value of values) {
    const zip = /\b(\d{5})(?:-\d{4})?\b/.exec(value)?.[1];
    if (zip) return zip;
  }
  return "";
}

/** Every phone number in a text, as its last 10 digits ("(201) 487-1313 / 201-555-0100" → two). */
export function phoneKeys(value: string): string[] {
  const keys: string[] = [];
  for (const part of value.split(/[,;/|]|\bor\b|\bext\b|\bx\b/i)) {
    const digits = part.replace(/\D/g, "");
    if (digits.length >= 10) {
      const key = digits.slice(-10);
      if (!keys.includes(key)) keys.push(key);
    }
  }
  return keys;
}

/** A Markate customer (as the API sends it) cut down for matching. */
export function slimCustomer(c: Record<string, unknown>): SlimCustomer {
  const person = [text(c.first_name), text(c.last_name)].filter(Boolean).join(" ");
  const names = [text(c.company), text(c.display_name), person].map(nameKey).filter((key, index, all) => key && all.indexOf(key) === index);
  const emails: string[] = [];
  for (const [key, value] of Object.entries(c)) {
    if (!/email/i.test(key) || /notify/i.test(key)) continue;
    for (const part of text(value).split(/[,;\s]+/)) {
      const email = part.trim().toLowerCase();
      if (EMAIL_RE.test(email) && !emails.includes(email)) emails.push(email);
    }
  }
  return {
    id: text(c.id),
    name: text(c.company) || text(c.display_name) || person,
    names,
    address: [text(c.address), text(c.address_secondary), text(c.city), text(c.state), text(c.zip)].filter(Boolean).join(", "),
    street: streetKey(text(c.address)),
    zip: zipOf(text(c.zip), text(c.address)),
    phones: [...phoneKeys(text(c.phone)), ...phoneKeys(text(c.phone_secondary))].filter((key, index, all) => all.indexOf(key) === index),
    emails,
  };
}

function addTo(map: Map<string, SlimCustomer[]>, key: string, c: SlimCustomer) {
  if (!key) return;
  const list = map.get(key);
  if (list) list.push(c);
  else map.set(key, [c]);
}

/** Every account matched against the whole customer list. `missing` = the accounts with no match that has an email. */
export function matchAccounts(accounts: MissingAccountRow[], customers: SlimCustomer[]): { matches: EmailMatch[]; missing: MissingAccountRow[] } {
  // Looked up by key, not one by one: 49,000 customers × 160 accounts stays fast.
  const byPhone = new Map<string, SlimCustomer[]>();
  const byStreet = new Map<string, SlimCustomer[]>();
  const byName = new Map<string, SlimCustomer[]>();
  for (const c of customers) {
    if (c.emails.length === 0) continue;
    for (const phone of c.phones) addTo(byPhone, phone, c);
    addTo(byStreet, c.street, c);
    for (const name of c.names) addTo(byName, name, c);
  }

  const matches: EmailMatch[] = [];
  const missing: MissingAccountRow[] = [];
  for (const account of accounts) {
    const phones = phoneKeys(account.phone);
    const street = streetKey(account.address);
    const zip = zipOf(account.zip, account.address);
    const name = nameKey(account.accountName);

    const unique = (list: SlimCustomer[]) => list.filter((c, index) => list.indexOf(c) === index);
    const samePhone = unique(phones.flatMap((p) => byPhone.get(p) ?? []));
    const sameStreet = street ? (byStreet.get(street) ?? []).filter((c) => !zip || !c.zip || c.zip === zip) : [];
    const sameName = name ? (byName.get(name) ?? []) : [];

    const why: MatchWhy | null = samePhone.length ? "phone" : sameStreet.length ? "address" : sameName.length ? "name" : null;
    if (!why) {
      missing.push(account);
      continue;
    }
    const pool = why === "phone" ? samePhone : why === "address" ? sameStreet : sameName;
    // Prefer the customer that also matches on the other things.
    const score = (c: SlimCustomer) => (samePhone.includes(c) ? 4 : 0) + (sameStreet.includes(c) ? 2 : 0) + (sameName.includes(c) ? 1 : 0);
    const ranked = [...pool].sort((a, b) => score(b) - score(a));
    const best = ranked[0];
    const emails = ranked.flatMap((c) => c.emails).filter((email, index, all) => all.indexOf(email) === index);
    const alsoBy = (["address", "name"] as MatchWhy[]).filter((other) => other !== why && (other === "address" ? sameStreet.includes(best) : sameName.includes(best)));

    const notes: string[] = [];
    if (why === "name" && !alsoBy.length) notes.push("Name only: confirm it is the same customer");
    if (why === "address" && !alsoBy.includes("name")) notes.push("Same address, different name: check it is the same customer");
    if (emails.length > 1) notes.push(`Markate has ${emails.length} emails here: ${emails.slice(0, 4).join(", ")}${emails.length > 4 ? "…" : ""}`);
    if (pool.length > 1) notes.push(`${pool.length} Markate customers match`);

    matches.push({
      accountId: account.accountId,
      accountName: account.accountName,
      accountAddress: [account.address, account.city].filter(Boolean).join(", "),
      accountPhone: account.phone,
      email: best.emails[0],
      markateName: best.name,
      markateAddress: best.address,
      why,
      alsoBy,
      sure: emails.length === 1 && (why === "phone" || (why === "address" && alsoBy.includes("name"))),
      note: notes.join(". "),
    });
  }
  return { matches, missing };
}
