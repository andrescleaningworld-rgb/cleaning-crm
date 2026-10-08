// Customer portal login: email + password, "Set your password" links,
// lockout, and the "Portal open to customers" setting. Postgres only
// (portal_users, portal_tokens, portal_settings); nothing here reads or
// writes Google Sheets.
//
// Rules, in one place:
//   - Who may log in: an email that is on an account (accounts.email) which
//     is not cancelled and has portal access turned on in Settings → Portal.
//   - While the portal is not open to customers, only test accounts
//     (accounts.is_test) count. Everyone else is treated as "not found".
//   - A link is valid 24 hours and works once. Only its SHA-256 is stored.
//   - Passwords are bcrypt hashes. The password is never stored or logged.
//   - 5 wrong passwords lock that email for 15 minutes.

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { getSql } from "@/lib/db";

export const LINK_HOURS = 24;
export const MAX_TRIES = 5;
export const LOCK_MINUTES = 15;
export const MIN_PASSWORD_LENGTH = 8;

export const cleanEmail = (email: unknown) => String(email ?? "").trim().toLowerCase();
const looksLikeEmail = (email: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
const sha256 = (text: string) => crypto.createHash("sha256").update(text).digest("hex");

// ─── The "Portal open to customers" setting ──────────────────────────────────

export async function isPortalOpen(): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql.query(`SELECT value FROM portal_settings WHERE key = 'open_to_customers'`)) as { value: string }[];
  return rows[0]?.value === "true";
}

export async function setPortalOpen(open: boolean, updatedBy: string): Promise<void> {
  const sql = getSql();
  await sql.query(
    `INSERT INTO portal_settings (key, value, updated_by, updated_at) VALUES ('open_to_customers', $1::text, $2::text, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [open ? "true" : "false", updatedBy]
  );
}

// The one office number every customer sees under "Call or text us". Empty
// until it is typed in Settings → Customer Portal Access.
export async function getOfficePhone(): Promise<string> {
  const sql = getSql();
  const rows = (await sql.query(`SELECT value FROM portal_settings WHERE key = 'office_phone'`)) as { value: string }[];
  return rows[0]?.value?.trim() ?? "";
}

/** Saves the office number. Ten digits (a leading 1 is dropped), stored as (xxx) xxx-xxxx; empty clears it. */
export async function setOfficePhone(phone: string, updatedBy: string): Promise<string> {
  const digits = String(phone ?? "").replace(/\D/g, "").replace(/^1(\d{10})$/, "$1");
  if (digits !== "" && digits.length !== 10) throw new Error("Type a 10-digit phone number.");
  const value = digits ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : "";
  const sql = getSql();
  await sql.query(
    `INSERT INTO portal_settings (key, value, updated_by, updated_at) VALUES ('office_phone', $1::text, $2::text, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [value, updatedBy]
  );
  return value;
}

// ─── Which accounts an email opens ───────────────────────────────────────────

export type PortalAccount = {
  accountId: string;
  accountName: string;
  address: string;
  isTest: boolean;
};

/**
 * The accounts (locations) this email may open right now, in name order.
 * Empty when the email is on no account, or the portal is closed and none
 * of its accounts is a test account.
 */
export async function accountsForEmail(email: string): Promise<PortalAccount[]> {
  const wanted = cleanEmail(email);
  if (!looksLikeEmail(wanted)) return [];
  const open = await isPortalOpen();
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT a.id, a.account_name, a.address, a.city, a.zip, a.is_test
     FROM accounts a
     WHERE a.id IS NOT NULL
       AND lower(btrim(a.email)) = $1::text
       AND a.status_key NOT IN ('cancelled', 'canceled')
       AND (a.is_test OR $2::boolean)
       AND EXISTS (SELECT 1 FROM portal_access p WHERE p.account_ref = a.id AND upper(btrim(p.portal_access)) = 'YES')
     ORDER BY lower(a.account_name), a.pk`,
    [wanted, open]
  )) as { id: string; account_name: string; address: string; city: string; zip: string; is_test: boolean }[];
  return rows.map((r) => ({
    accountId: r.id,
    accountName: r.account_name.trim(),
    address: [r.address, r.city, r.zip].map((s) => String(s ?? "").trim()).filter(Boolean).join(", "),
    isTest: r.is_test,
  }));
}

// ─── "Set your password" / "Forgot password" links ───────────────────────────

/**
 * Makes a link token for an email that may log in. Returns null (and makes
 * nothing) when the email opens no account: callers answer the same way
 * either way, so nobody can find out which emails are customers.
 */
export async function createPasswordLink(
  email: string,
  kind: "set" | "reset",
  createdBy = ""
): Promise<{ token: string; email: string; testOnly: boolean } | null> {
  const wanted = cleanEmail(email);
  const accounts = await accountsForEmail(wanted);
  if (accounts.length === 0) return null;
  const token = crypto.randomBytes(32).toString("base64url");
  const sql = getSql();
  await sql.query(
    `INSERT INTO portal_tokens (email, token_hash, kind, expires_at, created_by)
     VALUES ($1::text, $2::text, $3::text, now() + ($4::int || ' hours')::interval, $5::text)`,
    [wanted, sha256(token), kind, LINK_HOURS, createdBy]
  );
  return { token, email: wanted, testOnly: accounts.every((a) => a.isTest) };
}

/** The email a link belongs to, or null when the link is unknown, used or older than 24 hours. */
export async function emailForToken(token: string): Promise<string | null> {
  if (!token) return null;
  const sql = getSql();
  const rows = (await sql.query(`SELECT email FROM portal_tokens WHERE token_hash = $1::text AND used_at IS NULL AND expires_at > now()`, [
    sha256(token),
  ])) as { email: string }[];
  return rows[0]?.email ?? null;
}

export type SetPasswordResult = { ok: true; email: string } | { ok: false; reason: "link" | "short" };

/** Sets the password from a link. The link stops working, and so does every older link for that email. */
export async function setPasswordWithToken(token: string, password: string): Promise<SetPasswordResult> {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) return { ok: false, reason: "short" };
  const email = await emailForToken(token);
  if (!email) return { ok: false, reason: "link" };
  // The email must still open an account (the portal may have closed, or access been turned off, since the link was made).
  if ((await accountsForEmail(email)).length === 0) return { ok: false, reason: "link" };

  const hash = await bcrypt.hash(password, 10);
  const sql = getSql();
  const claimed = (await sql.query(
    `UPDATE portal_tokens SET used_at = now() WHERE token_hash = $1::text AND used_at IS NULL AND expires_at > now() RETURNING id`,
    [sha256(token)]
  )) as unknown[];
  if (claimed.length === 0) return { ok: false, reason: "link" };
  await sql.query(
    `INSERT INTO portal_users (email, password_hash) VALUES ($1::text, $2::text)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, failed_attempts = 0, locked_until = NULL, updated_at = now()`,
    [email, hash]
  );
  await sql.query(`UPDATE portal_tokens SET used_at = now() WHERE email = $1::text AND used_at IS NULL`, [email]);
  return { ok: true, email };
}

// ─── Login ───────────────────────────────────────────────────────────────────

export type LoginResult =
  | { ok: true; email: string; accounts: PortalAccount[] }
  | { ok: false; reason: "wrong" }
  | { ok: false; reason: "locked"; minutesLeft: number };

// Compared against when the email has no password, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = "$2b$10$jNYNwQ29CpIngLUuRKGY6eKAYZ2LbCI2r5oKoIfJ/DisT9viasHK6";

export async function verifyLogin(emailInput: string, password: string): Promise<LoginResult> {
  const email = cleanEmail(emailInput);
  const sql = getSql();
  const users = (await sql.query(
    `SELECT password_hash, failed_attempts, GREATEST(0, CEIL(EXTRACT(EPOCH FROM (locked_until - now())) / 60))::int AS minutes_left
     FROM portal_users WHERE email = $1::text`,
    [email]
  )) as { password_hash: string; failed_attempts: number; minutes_left: number | null }[];
  const user = users[0];

  if (!user) {
    await bcrypt.compare(String(password ?? ""), DUMMY_HASH).catch(() => false);
    return { ok: false, reason: "wrong" };
  }
  if ((user.minutes_left ?? 0) > 0) return { ok: false, reason: "locked", minutesLeft: user.minutes_left ?? LOCK_MINUTES };

  const matches = await bcrypt.compare(String(password ?? ""), user.password_hash);
  if (!matches) {
    const after = (await sql.query(
      `UPDATE portal_users
          SET failed_attempts = CASE WHEN failed_attempts + 1 >= $2::int THEN 0 ELSE failed_attempts + 1 END,
              locked_until = CASE WHEN failed_attempts + 1 >= $2::int THEN now() + ($3::int || ' minutes')::interval ELSE NULL END,
              updated_at = now()
        WHERE email = $1::text
        RETURNING locked_until IS NOT NULL AS locked`,
      [email, MAX_TRIES, LOCK_MINUTES]
    )) as { locked: boolean }[];
    return after[0]?.locked ? { ok: false, reason: "locked", minutesLeft: LOCK_MINUTES } : { ok: false, reason: "wrong" };
  }

  // Right password, but the email may no longer open anything (portal closed, access turned off, account cancelled).
  const accounts = await accountsForEmail(email);
  if (accounts.length === 0) return { ok: false, reason: "wrong" };
  await sql.query(`UPDATE portal_users SET failed_attempts = 0, locked_until = NULL, last_login_at = now(), updated_at = now() WHERE email = $1::text`, [email]);
  return { ok: true, email, accounts };
}
