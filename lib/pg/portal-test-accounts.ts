// Test accounts for the customer portal (Settings → Customer Portal Access →
// Test accounts): an account only staff use, to try the portal on a phone
// exactly as a customer sees it, without touching a real customer.
//
// A test account is a normal account row with is_test = true (migration
// 017). Every staff list, report, map, total and count already leaves those
// out (lib/pg/account-live.ts HIDDEN_ACCOUNT_IDS, NOT is_test), and only the
// customer portal reads them, also while the portal is closed to customers.
// Its email is a staff member's own, never one on a real account (logging in
// with it would open that customer's portal too).
//
// Made: the account (marked test at once), portal access Yes, and a
// "Set your password" email to that address (7 days, like a staff invite).
// Removed: marked deleted (Settings → Deleted accounts can bring it back).

import { getSql } from "@/lib/db";
import { addAccount } from "@/lib/pg/accounts";
import { deleteAccount } from "@/lib/pg/account-delete";
import { enablePortalAccount } from "@/lib/pg/customer-portal";
import { cleanEmail, createPasswordLink, INVITE_LINK_HOURS } from "@/lib/pg/portal-auth";
import { isPlainEmail } from "@/lib/emailAddress";

export type PortalTestAccount = { accountId: string; accountName: string; email: string; hasLogin: boolean; lastLoginAt: string | null };

/** The test accounts that are not removed, newest first. */
export async function listTestAccounts(): Promise<PortalTestAccount[]> {
  const rows = (await getSql().query(
    `SELECT a.id, btrim(a.account_name) AS account_name, lower(btrim(a.email)) AS email, u.email IS NOT NULL AS has_login, u.last_login_at
     FROM accounts a
     LEFT JOIN portal_users u ON u.email = lower(btrim(a.email))
     WHERE a.is_test AND a.id IS NOT NULL AND (to_jsonb(a)->>'deleted_at') IS NULL
     ORDER BY a.pk DESC`
  )) as { id: string; account_name: string; email: string; has_login: boolean; last_login_at: string | Date | null }[];
  return rows.map((row) => ({
    accountId: row.id,
    accountName: row.account_name,
    email: row.email,
    hasLogin: row.has_login,
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
  }));
}

/** A problem with what was typed (shown as is), or a database problem (thrown as an Error). */
export class TestAccountError extends Error {}

/**
 * Makes a test account for `email` and returns its id and the one-time
 * "Set your password" link token (the route emails it).
 */
export async function createTestAccount(input: { name: string; email: string }): Promise<{ accountId: string; accountName: string; token: string | null }> {
  const email = cleanEmail(input.email);
  if (!isPlainEmail(email)) throw new TestAccountError("Type one email address, like you@cleaningworldinc.com.");
  const sql = getSql();
  const onReal = (await sql.query(
    `SELECT 1 FROM accounts WHERE lower(btrim(email)) = $1::text AND NOT is_test AND (to_jsonb(accounts)->>'deleted_at') IS NULL LIMIT 1`,
    [email]
  )) as unknown[];
  if (onReal.length > 0) throw new TestAccountError("That email is on a real customer account. Use your own email, one no customer account has.");

  const accountName = `TEST - ${input.name.trim().slice(0, 60) || "Portal test"}`;
  const { accountId } = await addAccount({ accountName, status: "Active", email });
  try {
    // Hidden from every staff list right away.
    await sql`UPDATE accounts SET is_test = true WHERE id = ${accountId}`;
  } catch (error) {
    // Never leave it showing as a real account.
    await sql`DELETE FROM accounts WHERE id = ${accountId}`.catch(() => undefined);
    throw error;
  }
  await enablePortalAccount(accountName, "", accountId);
  const link = await createPasswordLink(email, "set", "staff: test account", INVITE_LINK_HOURS);
  return { accountId, accountName, token: link?.token ?? null };
}

/** Removes a test account (marked deleted). Only a test account: a real one is never touched here. */
export async function removeTestAccount(accountId: string, by: string): Promise<boolean> {
  const rows = (await getSql().query(`SELECT 1 FROM accounts WHERE id = $1::text AND is_test`, [accountId.trim()])) as unknown[];
  if (rows.length === 0) return false;
  return (await deleteAccount({ accountId, by, reason: "Portal test account removed" })) !== null;
}
