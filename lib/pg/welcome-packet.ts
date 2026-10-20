// What the customer Welcome Packet needs from Postgres: the account (name,
// address, contact, email), its assigned manager (the Managers list: name,
// phone, email) and its supplies setting. Postgres only. The template itself
// is lib/welcomePacket.ts.
import { getSql } from "@/lib/db";
import { supplyControlReady } from "@/lib/pg/supply-control";
import type { WelcomePacketData, WelcomeSupplyMode } from "@/lib/welcomePacket";

export type WelcomePacketInfo = {
  accountId: string;
  accountName: string;
  address: string;
  contactName: string;
  customerEmail: string;
  managerName: string;
  managerPhone: string;
  managerEmail: string;
  supplyMode: WelcomeSupplyMode;
  /** Portal access is ON for this account (Portal access YES/NO on the account page). */
  portalAccessOn: boolean;
};

/** Where the packet's portal button goes: the first-time "Set your password" page. */
export const WELCOME_PORTAL_PATH = "/portal/forgot?first=1";

type Row = {
  id: string;
  account_name: string;
  address: string;
  city: string;
  zip: string;
  contact_name: string;
  email: string;
  manager_raw: string;
  manager_name: string | null;
  manager_phone: string | null;
  manager_email: string | null;
};

/** The account and its manager, or null when there is no account with this id. */
export async function loadWelcomePacketInfo(accountId: string): Promise<WelcomePacketInfo | null> {
  const id = accountId.trim();
  if (!id) return null;
  const sql = getSql();
  // The manager is the one linked by manager_id; an account from Sheets that
  // only has the name typed is matched by that name (ignoring case and spaces).
  const rows = (await sql`
    SELECT a.id, a.account_name, a.address, a.city, a.zip, a.contact_name, a.email, a.manager_raw,
           m.name AS manager_name, m.phone AS manager_phone, m.email AS manager_email
    FROM accounts a
    LEFT JOIN LATERAL (
      SELECT name, phone, email FROM managers
      WHERE id = a.manager_id
         OR (a.manager_id IS NULL AND a.manager_raw <> '' AND lower(btrim(name)) = lower(btrim(a.manager_raw)))
      ORDER BY (id = a.manager_id) DESC NULLS LAST, row_no
      LIMIT 1
    ) m ON true
    WHERE a.id = ${id}
    LIMIT 1
  `) as Row[];
  const row = rows[0];
  if (!row) return null;

  const street = row.address.trim();
  // The full address is usually in one field; add the city / zip only when they are not already in it.
  const extra = [row.city, row.zip].map((part) => part.trim()).filter((part) => part && !street.toLowerCase().includes(part.toLowerCase()));

  return {
    accountId: row.id,
    accountName: row.account_name.trim(),
    address: [street, ...extra].filter(Boolean).join(", "),
    contactName: row.contact_name.trim(),
    customerEmail: row.email.trim(),
    managerName: (row.manager_name ?? row.manager_raw).trim(),
    managerPhone: (row.manager_phone ?? "").trim(),
    managerEmail: (row.manager_email ?? "").trim(),
    supplyMode: await supplyModeOf(row.id),
    portalAccessOn: await portalAccessOn(row.id),
  };
}

// Same test the portal login uses (lib/pg/portal-auth.ts accountsForEmail).
async function portalAccessOn(accountId: string): Promise<boolean> {
  try {
    const rows = (await getSql()`
      SELECT 1 FROM portal_access WHERE account_ref = ${accountId} AND upper(btrim(portal_access)) = 'YES' LIMIT 1
    `) as unknown[];
    return rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * When the packet was last sent, from the account's History (the line the
 * send route writes: "Welcome packet sent to: …"). null: never sent.
 */
export async function lastWelcomePacketSentAt(accountId: string): Promise<string | null> {
  const rows = (await getSql()`
    SELECT created_at FROM activity_log
    WHERE entity_type = 'account' AND entity_id = ${accountId} AND detail LIKE 'Welcome packet sent to:%'
    ORDER BY created_at DESC
    LIMIT 1
  `) as { created_at: Date | string }[];
  const at = rows[0]?.created_at;
  if (!at) return null;
  return at instanceof Date ? at.toISOString() : String(at);
}

// supply_account_modes (migration 027): no row means included. 'customer'
// ("Provided by customer") is the third choice added on
// feature/supplies-by-customer; it is read here already so the packet is
// right as soon as that is merged.
async function supplyModeOf(accountId: string): Promise<WelcomeSupplyMode> {
  if (!(await supplyControlReady().catch(() => false))) return "included";
  const rows = (await getSql()`SELECT mode FROM supply_account_modes WHERE account_id = ${accountId}`) as { mode: string }[];
  const mode = rows[0]?.mode;
  return mode === "billed" || mode === "customer" ? mode : "included";
}

/** What about the manager blocks a send, in plain words. "": nothing. */
export function managerProblem(info: WelcomePacketInfo): string {
  if (!info.managerName) return "This account has no manager. Pick its manager on the account first.";
  if (!info.managerPhone) return `${info.managerName} has no phone number on the Managers list (Settings → Managers). Add it there, then send.`;
  return "";
}

/** What about the To address blocks a send. "": nothing. */
export function emailProblem(to: string): string {
  if (!to.trim()) return "This account has no customer email. Type it in the To box, or save it on the account (Customer email).";
  if (!isEmail(to)) return `"${to.trim()}" is not an email address.`;
  return "";
}

/** Everything that blocks a send. Empty: ready to send. */
export function welcomePacketProblems(info: WelcomePacketInfo, to: string): string[] {
  return [managerProblem(info), emailProblem(to)].filter(Boolean);
}

export function isEmail(value: string): boolean {
  return /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(value.trim());
}

/** "October 16, 2026" in New York time: the date on the signature line. */
export function packetDate(now = new Date()): string {
  return now.toLocaleDateString("en-US", { timeZone: "America/New_York", year: "numeric", month: "long", day: "numeric" });
}

/**
 * `origin` is the app's address (from the request). `to` is the address the
 * packet goes to; the portal line shows the account's saved email, because
 * that is the one the portal accepts, and `to` only when none is saved.
 */
export function packetData(info: WelcomePacketInfo, options: { origin: string; to?: string; now?: Date }): WelcomePacketData {
  const now = options.now ?? new Date();
  return {
    portalUrl: `${options.origin}${WELCOME_PORTAL_PATH}`,
    portalEmail: info.customerEmail || (options.to ?? "").trim(),
    accountName: info.accountName,
    address: info.address,
    contactName: info.contactName,
    managerName: info.managerName,
    managerPhone: info.managerPhone,
    sentDate: packetDate(now),
    supplyMode: info.supplyMode,
  };
}
