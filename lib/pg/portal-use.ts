// Customer portal use, for staff (Settings -> Customer Portal Access, the
// "Portal use" column). Server only.
//
//   markPortalSeen   every portal page a logged-in customer opens (app/(customer)/portal/server.ts
//                    requireCustomer): the account's "last seen", written at
//                    most once an hour. Never for a staff "View as customer".
//   portalUseByAccount  each account's portal use:
//     no_email     no email on the account: nobody can log in
//     not_invited  an email, never sent a "Set your password" link
//     invited      a link was sent (by staff, or asked for), no password set yet
//     set_up       a password is set, not seen in the portal since "last seen" began
//     seen         opened the portal: when last, and roughly how many visits
//
// "last seen" needs migration 083 (portal_seen). Before it runs nothing is
// written, and the column says "Set up" (with the last typed-in login, if any).

import { getSql } from "@/lib/db";
import { logCustomerActivity } from "@/lib/activityLog";

export type PortalUseState = "no_email" | "not_invited" | "invited" | "set_up" | "seen";
export type PortalUse = { state: PortalUseState; at: string | null; visits: number };

const iso = (value: string | Date | null) => (value ? new Date(value).toISOString() : null);

let seenTable: boolean | null = null;
async function seenReady(): Promise<boolean> {
  if (seenTable) return true;
  try {
    const rows = (await getSql()`SELECT to_regclass('public.portal_seen') IS NOT NULL AS ok`) as { ok: boolean }[];
    seenTable = rows[0]?.ok === true;
  } catch {
    seenTable = false;
  }
  return seenTable;
}

/**
 * A logged-in customer opened a portal page for this account. At most one
 * write an hour; never fails the page. Each write is also one "Opened the
 * customer portal" line in Activity Log -> Customers.
 */
export async function markPortalSeen(accountId: string, email: string, accountName = ""): Promise<void> {
  if (!accountId || !(await seenReady())) return;
  try {
    const written = (await getSql()`
      INSERT INTO portal_seen (account_id, email) VALUES (${accountId}, ${email})
      ON CONFLICT (account_id) DO UPDATE SET last_seen_at = now(), email = EXCLUDED.email, visits = portal_seen.visits + 1
      WHERE portal_seen.last_seen_at < now() - interval '1 hour'
      RETURNING visits
    `) as { visits: number }[];
    if (written.length > 0) await logCustomerActivity({ accountId, accountName, action: "view", detail: "Opened the customer portal", email });
  } catch (error) {
    console.error("[portal-use] last seen not saved:", error instanceof Error ? error.message : error);
  }
}

/** Every real (not test, not deleted) account's portal use, by account ID. */
export async function portalUseByAccount(): Promise<Record<string, PortalUse>> {
  const withSeen = await seenReady();
  const rows = (await getSql().query(
    `SELECT a.id,
            btrim(coalesce(a.email, '')) <> '' AS has_email,
            u.created_at AS password_at, u.last_login_at,
            (SELECT max(t.created_at) FROM portal_tokens t WHERE t.email = lower(btrim(a.email))) AS invited_at,
            ${withSeen ? "s.last_seen_at, s.visits" : "NULL::timestamptz AS last_seen_at, 0 AS visits"}
     FROM accounts a
     LEFT JOIN portal_users u ON u.email = lower(btrim(a.email))
     ${withSeen ? "LEFT JOIN portal_seen s ON s.account_id = a.id" : ""}
     WHERE a.id IS NOT NULL AND NOT a.is_test AND (to_jsonb(a)->>'deleted_at') IS NULL`
  )) as {
    id: string;
    has_email: boolean;
    password_at: string | Date | null;
    last_login_at: string | Date | null;
    invited_at: string | Date | null;
    last_seen_at: string | Date | null;
    visits: number | null;
  }[];
  const out: Record<string, PortalUse> = {};
  for (const row of rows) {
    let use: PortalUse;
    if (row.last_seen_at) use = { state: "seen", at: iso(row.last_seen_at), visits: Number(row.visits ?? 1) };
    else if (row.password_at) use = { state: "set_up", at: iso(row.last_login_at ?? row.password_at), visits: 0 };
    else if (row.invited_at) use = { state: "invited", at: iso(row.invited_at), visits: 0 };
    else if (row.has_email) use = { state: "not_invited", at: null, visits: 0 };
    else use = { state: "no_email", at: null, visits: 0 };
    out[row.id] = use;
  }
  return out;
}
