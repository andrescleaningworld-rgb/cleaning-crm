// Exercises lib/pg/account-contacts.ts (migration 034) against the dev
// branch: listing, adding, editing, making another contact main, removing,
// the mirror to the account's own three fields, and the customer portal
// warning. It works on one practice account, then puts that account's
// contact back exactly as it was and takes its test rows out again.
//   npx tsx scripts/migrate/check-account-contacts.mts
import { loadEnv } from "./lib/env.mjs";
import { assertDevDatabase } from "./lib/guard.mjs";

loadEnv();
process.env.DATABASE_URL = assertDevDatabase(process.env.MIGRATION_DATABASE_URL);
process.env.OUTBOUND_DRY_RUN = "1";
process.env.DATA_SOURCE_ACCOUNTS = "postgres";

const contacts = await import("../../lib/pg/account-contacts");
const { updateAccountFieldsDirect } = await import("../../lib/data/accounts");
const { getSql } = await import("../../lib/db");
const sql = getSql();

let failed = false;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` – ${detail}` : ""}`);
};
const rejects = async (fn: () => Promise<unknown>, kind?: new () => Error) => {
  try {
    await fn();
    return false;
  } catch (error) {
    return kind ? error instanceof kind : true;
  }
};

type Fields = { contact_name: string; phone: string; email: string };
const fieldsOf = async (id: string) => ((await sql`SELECT COALESCE(contact_name, '') AS contact_name, COALESCE(phone, '') AS phone, COALESCE(email, '') AS email FROM accounts WHERE id = ${id}`) as Fields[])[0];
const totals = async () => (await sql`SELECT (SELECT count(*)::int FROM account_contacts WHERE removed_at IS NULL) AS live, (SELECT count(*)::int FROM account_contacts) AS all_rows`)[0] as { live: number; all_rows: number };

check("migration 034 is in this database", await contacts.accountContactsReady());

// An account with a contact and no portal access, and one with portal access.
const plain = (await sql`
  SELECT a.id FROM accounts a
  WHERE a.id IS NOT NULL AND btrim(COALESCE(a.contact_name, '')) <> '' AND btrim(COALESCE(a.phone, '')) <> ''
    AND NOT EXISTS (SELECT 1 FROM portal_access p WHERE p.account_ref = a.id AND upper(btrim(p.portal_access)) = 'YES')
    AND (SELECT count(*) FROM account_contacts c WHERE c.account_id = a.id) = 1
  ORDER BY a.pk LIMIT 1
`) as { id: string }[];
const withPortal = (await sql`
  SELECT a.id FROM accounts a
  WHERE a.id IS NOT NULL AND EXISTS (SELECT 1 FROM portal_access p WHERE p.account_ref = a.id AND upper(btrim(p.portal_access)) = 'YES')
    AND (SELECT count(*) FROM account_contacts c WHERE c.account_id = a.id) = 1
  ORDER BY a.pk LIMIT 1
`) as { id: string }[];

const before = await totals();
const id = plain[0]?.id ?? "";
const original = id ? await fieldsOf(id) : null;
const made: number[] = [];

try {
  if (!id || !original) {
    check("a practice account to test with", false, "none found");
  } else {
    const start = await contacts.listContacts(id);
    check("the account's own contact is its one contact, and it is main", start!.length === 1 && start![0].isMain && start![0].name === original.contact_name.trim() && start![0].phone === original.phone.trim());
    const mainId = start![0].id!;

    // ----- add a second person -----
    await contacts.saveContact(id, null, { name: "ZZ Billing Person", role: "Billing", phone: "201-555-0100", email: "ZZ.Billing@Example.test", notes: "invoices only" }, "check", false);
    let list = (await contacts.listContacts(id))!;
    const second = list.find((entry) => entry.name === "ZZ Billing Person")!;
    made.push(second.id!);
    check("a second contact is added, not main, with its role, lower-case email and notes", list.length === 2 && !second.isMain && second.role === "Billing" && second.email === "zz.billing@example.test" && second.notes === "invoices only");
    check("adding someone leaves the account's own fields alone", JSON.stringify(await fieldsOf(id)) === JSON.stringify(original));
    check("the main contact is listed first", list[0].isMain && list[0].id === mainId);
    check("a contact needs a name, a phone or an email", await rejects(() => contacts.saveContact(id, null, { name: "", role: "", phone: "", email: "", notes: "x" }, "check", false)));
    check("a bad email is refused", await rejects(() => contacts.saveContact(id, null, { name: "X", role: "", phone: "", email: "not-an-email", notes: "" }, "check", false)));

    // ----- the mirror, both ways -----
    await contacts.saveContact(id, "main", { name: "ZZ Main Edited", role: "Property/Site manager", phone: "201-555-0111", email: "", notes: "" }, "check", false);
    let now = await fieldsOf(id);
    check("editing the main contact writes the account's own fields", now.contact_name === "ZZ Main Edited" && now.phone === "201-555-0111");
    list = (await contacts.listContacts(id))!;
    check("the main contact can carry any role", list[0].isMain && list[0].role === "Property/Site manager");
    await updateAccountFieldsDirect(id, { contactName: "ZZ Typed On Edit Account", phone: "201-555-0122" });
    list = (await contacts.listContacts(id))!;
    check("editing the account's fields (as Edit Account does) changes the main contact", list[0].isMain && list[0].name === "ZZ Typed On Edit Account" && list[0].phone === "201-555-0122");

    // ----- another contact becomes main -----
    check("the main contact cannot be removed while there are others", await rejects(() => contacts.removeContact(id, mainId, "check", false)));
    await contacts.makeMainContact(id, second.id!, "check", false);
    now = await fieldsOf(id);
    list = (await contacts.listContacts(id))!;
    check("making someone main puts them on the account", now.contact_name === "ZZ Billing Person" && now.phone === "201-555-0100" && now.email === "zz.billing@example.test");
    check("there is exactly one main contact, and it kept its role", list.filter((entry) => entry.isMain).length === 1 && list[0].id === second.id && list[0].role === "Billing");
    const former = list.find((entry) => entry.id === mainId)!;
    check("the former main contact keeps what it had", !former.isMain && former.name === "ZZ Typed On Edit Account" && former.phone === "201-555-0122");

    // ----- removing -----
    await contacts.removeContact(id, mainId, "check", false);
    list = (await contacts.listContacts(id))!;
    check("a removed contact is gone from the list", list.length === 1 && list[0].id === second.id && list[0].isMain);
    check("a removed contact is hidden, not deleted", ((await sql`SELECT removed_at IS NOT NULL AS hidden FROM account_contacts WHERE id = ${mainId}`) as { hidden: boolean }[])[0].hidden);
    await contacts.removeContact(id, "main", "check", false);
    now = await fieldsOf(id);
    check("removing the only contact empties the account's contact fields", (await contacts.listContacts(id))!.length === 0 && now.contact_name === "" && now.phone === "" && now.email === "");
    await contacts.saveContact(id, null, { name: "ZZ First Again", role: "", phone: "201-555-0133", email: "", notes: "" }, "check", false);
    list = (await contacts.listContacts(id))!;
    made.push(list[0].id!);
    now = await fieldsOf(id);
    check("the first contact of an account is its main one, and goes on the account", list.length === 1 && list[0].isMain && now.contact_name === "ZZ First Again");

    // Put the account back exactly as it was.
    await updateAccountFieldsDirect(id, { contactName: original.contact_name, phone: original.phone, email: original.email });
    await sql`DELETE FROM account_contacts WHERE id = ANY(${made}::bigint[])`;
    await sql`UPDATE account_contacts SET removed_at = NULL, removed_by = '', is_main = true, name = ${original.contact_name.trim()}, phone = ${original.phone.trim()}, email = ${original.email.trim()}, role = 'Main contact', notes = '' WHERE id = ${mainId}`;
    made.length = 0;
    check("the practice account's contact is back as it was", JSON.stringify(await fieldsOf(id)) === JSON.stringify(original) && (await contacts.listContacts(id))!.length === 1);
  }

  // ----- the customer portal warning -----
  const portalId = withPortal[0]?.id ?? "";
  if (!portalId) {
    console.log("SKIP  the portal warning (no practice account with portal access and one contact)");
  } else {
    const portalBefore = await fieldsOf(portalId);
    check("an account with portal access is seen as such", (await contacts.portalIsOn(portalId)) && !(await contacts.portalIsOn(id)));
    const main = (await contacts.listContacts(portalId))![0];
    check(
      "changing the main contact's email asks first",
      await rejects(() => contacts.saveContact(portalId, "main", { name: main.name, role: main.role, phone: main.phone, email: "zz.someone.else@example.test", notes: main.notes }, "check", false), contacts.PortalConfirmNeeded)
    );
    await contacts.saveContact(portalId, "main", { name: main.name, role: main.role, phone: main.phone, email: main.email, notes: "zz note" }, "check", false);
    check("a change that keeps the email does not ask", (await contacts.listContacts(portalId))![0].notes === "zz note");
    await contacts.saveContact(portalId, null, { name: "ZZ Second", role: "Keys/Access", phone: "201-555-0144", email: "", notes: "" }, "check", false);
    const added = (await contacts.listContacts(portalId))!.find((entry) => entry.name === "ZZ Second")!;
    made.push(added.id!);
    check("making someone else main asks first", await rejects(() => contacts.makeMainContact(portalId, added.id!, "check", false), contacts.PortalConfirmNeeded));
    check("nothing changed while it was asking", JSON.stringify(await fieldsOf(portalId)) === JSON.stringify(portalBefore));
    await contacts.saveContact(portalId, "main", { name: main.name, role: main.role, phone: main.phone, email: main.email, notes: main.notes }, "check", false);
    await sql`DELETE FROM account_contacts WHERE id = ANY(${made}::bigint[])`;
    made.length = 0;
    check("the portal account is back as it was", JSON.stringify(await fieldsOf(portalId)) === JSON.stringify(portalBefore));
  }
} finally {
  if (made.length > 0) await sql`DELETE FROM account_contacts WHERE id = ANY(${made}::bigint[])`;
  if (id && original && JSON.stringify(await fieldsOf(id)) !== JSON.stringify(original)) {
    await updateAccountFieldsDirect(id, { contactName: original.contact_name, phone: original.phone, email: original.email });
    console.log("note  the practice account's contact fields were put back after a failed check");
  }
}

const after = await totals();
check("no test rows are left behind", after.live === before.live && after.all_rows === before.all_rows, JSON.stringify(after));
const odd = (await sql`SELECT count(*)::int AS n FROM (SELECT account_id FROM account_contacts WHERE is_main AND removed_at IS NULL GROUP BY 1 HAVING count(*) > 1) x`) as { n: number }[];
check("no account has two main contacts", odd[0].n === 0);

console.log(failed ? "\nSOME CHECKS FAILED" : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
