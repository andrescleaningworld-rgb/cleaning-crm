// An account's contacts (migration 034): more than one person, each with a
// role, one of them the main contact.
//
// The account's own three fields (accounts.contact_name, phone, email) are
// the truth for the MAIN contact. The customer portal login, Missing emails,
// the work order and every other screen keep reading them, so:
//   - reading: the main contact's name, phone and email come from the
//     account, whatever its own row says. Anything that edits the account's
//     fields (Edit Account, Missing emails, "Customer email") is editing the
//     main contact.
//   - writing: when the main contact is edited here, or another contact is
//     made the main one, the name, phone and email are written to the account
//     through its usual save (updateAccountFieldsDirect), never straight into
//     the columns.
// Nothing can drift apart.
//
// A contact that is removed is only hidden. An account with one contact has
// that contact as its main one, always. The main contact cannot be removed
// while there are others: someone else is made main first.

import { getSql } from "@/lib/db";
import { updateAccountFieldsDirect } from "@/lib/data/accounts";

const clean = (value: unknown) => String(value ?? "").trim();
const looksLikeEmail = (email: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

export const CONTACT_ROLES = ["Main contact", "Billing", "Property/Site manager", "After-hours/Emergency", "Keys/Access"] as const;

export type AccountContact = {
  /** null = the main contact of an account that has no contact row yet (made when it is first saved). */
  id: number | null;
  name: string;
  role: string;
  phone: string;
  email: string;
  notes: string;
  isMain: boolean;
};

export type ContactInput = { name: string; role: string; phone: string; email: string; notes: string };

/** Thrown when a change would alter who can log in to the customer portal and the person has not confirmed it yet. */
export class PortalConfirmNeeded extends Error {
  constructor() {
    super("This changes who can log in to the customer portal.");
  }
}

type Row = { id: number; name: string; role: string; phone: string; email: string; notes: string; is_main: boolean };
type AccountFields = { contact_name: string | null; phone: string | null; email: string | null };

let ready = false;

/** True once this database has the contacts table. Until then the screens show the account's three fields as before. */
export async function accountContactsReady(): Promise<boolean> {
  if (ready) return true;
  const sql = getSql();
  const rows = (await sql`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'account_contacts') AS ok`) as { ok: boolean }[];
  ready = rows[0]?.ok === true;
  return ready;
}

async function accountFields(accountId: string): Promise<AccountFields | null> {
  const sql = getSql();
  const rows = (await sql`SELECT contact_name, phone, email FROM accounts WHERE btrim(id) = ${accountId} LIMIT 1`) as AccountFields[];
  return rows[0] ?? null;
}

async function rowsOf(accountId: string): Promise<Row[]> {
  const sql = getSql();
  return (await sql`
    SELECT id, name, role, phone, email, notes, is_main FROM account_contacts
    WHERE account_id = ${accountId} AND removed_at IS NULL
    ORDER BY is_main DESC, id
  `) as Row[];
}

/** Can a customer log in to the portal for this account today? (The same test the portal login makes.) */
export async function portalIsOn(accountId: string): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    SELECT EXISTS (SELECT 1 FROM portal_access p WHERE p.account_ref = ${accountId} AND upper(btrim(p.portal_access)) = 'YES') AS ok
  `) as { ok: boolean }[];
  return rows[0]?.ok === true;
}

/** The account's contacts, the main one first. Null when there is no such account. */
export async function listContacts(accountId: string): Promise<AccountContact[] | null> {
  const id = clean(accountId);
  const [account, rows] = await Promise.all([accountFields(id), rowsOf(id)]);
  if (!account) return null;
  const mainFields = { name: clean(account.contact_name), phone: clean(account.phone), email: clean(account.email) };
  const hasFields = Boolean(mainFields.name || mainFields.phone || mainFields.email);
  const mainRow = rows.find((row) => row.is_main);
  const others = rows.filter((row) => !row.is_main).map((row) => ({ id: row.id, name: clean(row.name), role: clean(row.role), phone: clean(row.phone), email: clean(row.email), notes: clean(row.notes), isMain: false }));

  // The main contact is what the account itself says.
  if (mainRow) return [{ id: mainRow.id, ...mainFields, role: clean(mainRow.role), notes: clean(mainRow.notes), isMain: true }, ...others];
  // No main row yet (an account made after the migration, or its contact typed on Edit Account since): the account's fields are it.
  if (hasFields) return [{ id: null, ...mainFields, role: "Main contact", notes: "", isMain: true }, ...others];
  // No contact on the account at all: with exactly one other person, that one is the main contact.
  if (others.length === 1) return [{ ...others[0], isMain: true }];
  return others;
}

function readInput(input: ContactInput): ContactInput {
  const name = clean(input.name).slice(0, 120);
  const phone = clean(input.phone).slice(0, 60);
  const email = clean(input.email).toLowerCase().slice(0, 200);
  if (!name && !phone && !email) throw new Error("Write a name, a phone or an email.");
  if (email && !looksLikeEmail(email)) throw new Error("That does not look like an email. Check for a missing @ or a space.");
  return { name, role: clean(input.role).slice(0, 60), phone, email, notes: clean(input.notes).slice(0, 1000) };
}

/** Writes the main contact into the account's own three fields, through the account's usual save. */
async function mirrorToAccount(accountId: string, contact: { name: string; phone: string; email: string }): Promise<void> {
  await updateAccountFieldsDirect(accountId, { contactName: contact.name, phone: contact.phone, email: contact.email });
}

/** Makes sure the account's main contact has a row of its own (from the account's fields), and returns the live rows. */
async function withMainRow(accountId: string, by: string): Promise<Row[]> {
  const [account, rows] = await Promise.all([accountFields(accountId), rowsOf(accountId)]);
  if (!account) throw new Error("That account was not found.");
  const name = clean(account.contact_name);
  const phone = clean(account.phone);
  const email = clean(account.email);
  const sql = getSql();
  const main = rows.find((row) => row.is_main);
  if (main) {
    // Its own copy follows the account, so a copy is never stale when it stops being the main one.
    if (clean(main.name) !== name || clean(main.phone) !== phone || clean(main.email) !== email) {
      await sql`UPDATE account_contacts SET name = ${name}, phone = ${phone}, email = ${email} WHERE id = ${main.id}`;
    }
    return rowsOf(accountId);
  }
  if (name || phone || email) {
    await sql`INSERT INTO account_contacts (account_id, name, role, phone, email, is_main, created_by, updated_by) VALUES (${accountId}, ${name}, 'Main contact', ${phone}, ${email}, true, ${by}, ${by})`;
    return rowsOf(accountId);
  }
  // The account has no contact of its own: with one person on file, that one becomes main and goes on the account.
  if (rows.length === 1) {
    await sql`UPDATE account_contacts SET is_main = true WHERE id = ${rows[0].id}`;
    await mirrorToAccount(accountId, { name: clean(rows[0].name), phone: clean(rows[0].phone), email: clean(rows[0].email) });
    return rowsOf(accountId);
  }
  return rows;
}

/** Which contact is meant: a row's id, or "main" for the main contact (the screen may not know its id yet). */
export type ContactRef = number | "main";

const pick = (rows: Row[], ref: ContactRef) => (ref === "main" ? rows.find((row) => row.is_main) : rows.find((row) => row.id === ref));

/**
 * Adds a contact (null) or changes one. `confirmPortal` must be true to
 * change the main contact's email on an account with portal access.
 */
export async function saveContact(accountId: string, contactId: ContactRef | null, input: ContactInput, by: string, confirmPortal: boolean): Promise<void> {
  const id = clean(accountId);
  const next = readInput(input);
  const rows = await withMainRow(id, by);
  const sql = getSql();

  // "The main contact" of an account that has nobody yet is simply its first contact.
  if (contactId === null || (contactId === "main" && !pick(rows, "main"))) {
    // The first person on an account is its main contact.
    const first = rows.length === 0;
    await sql`
      INSERT INTO account_contacts (account_id, name, role, phone, email, notes, is_main, created_by, updated_by)
      VALUES (${id}, ${next.name}, ${next.role || (first ? "Main contact" : "")}, ${next.phone}, ${next.email}, ${next.notes}, ${first}, ${by}, ${by})
    `;
    if (first) await mirrorToAccount(id, next);
    return;
  }

  const row = pick(rows, contactId);
  if (!row) throw new Error("That contact was not found. Close this and open it again.");
  if (row.is_main && clean(row.email).toLowerCase() !== next.email && !confirmPortal && (await portalIsOn(id))) throw new PortalConfirmNeeded();
  await sql`
    UPDATE account_contacts SET name = ${next.name}, role = ${next.role}, phone = ${next.phone}, email = ${next.email}, notes = ${next.notes}, updated_by = ${by}, updated_at = now()
    WHERE id = ${row.id}
  `;
  if (row.is_main) await mirrorToAccount(id, next);
}

/** Makes another contact the main one. `confirmPortal` must be true on an account with portal access. */
export async function makeMainContact(accountId: string, contactId: number, by: string, confirmPortal: boolean): Promise<void> {
  const id = clean(accountId);
  const rows = await withMainRow(id, by);
  const row = rows.find((entry) => entry.id === contactId);
  if (!row) throw new Error("That contact was not found. Close this and open it again.");
  if (row.is_main) return;
  if (!confirmPortal && (await portalIsOn(id))) throw new PortalConfirmNeeded();
  const sql = getSql();
  // One after the other in one transaction: the database allows only one main contact at a time.
  await sql.transaction([
    sql`UPDATE account_contacts SET is_main = false, updated_by = ${by}, updated_at = now() WHERE account_id = ${id} AND is_main AND removed_at IS NULL`,
    sql`UPDATE account_contacts SET is_main = true, updated_by = ${by}, updated_at = now() WHERE id = ${contactId}`,
  ]);
  await mirrorToAccount(id, { name: clean(row.name), phone: clean(row.phone), email: clean(row.email).toLowerCase() });
}

/**
 * Removes (hides) a contact. The main contact can only be removed when it is
 * the only one; the account's own contact fields are then emptied.
 */
export async function removeContact(accountId: string, contactId: ContactRef, by: string, confirmPortal: boolean): Promise<void> {
  const id = clean(accountId);
  const rows = await withMainRow(id, by);
  const row = pick(rows, contactId);
  if (!row) throw new Error("That contact was not found. Close this and open it again.");
  if (row.is_main && rows.length > 1) throw new Error("This is the main contact. Make someone else the main contact first.");
  if (row.is_main && clean(row.email) && !confirmPortal && (await portalIsOn(id))) throw new PortalConfirmNeeded();
  const sql = getSql();
  await sql`UPDATE account_contacts SET removed_at = now(), removed_by = ${by}, is_main = false WHERE id = ${row.id}`;
  if (row.is_main) await mirrorToAccount(id, { name: "", phone: "", email: "" });
}
