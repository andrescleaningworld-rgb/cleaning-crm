// Staff "View as customer" (Account page): the customer portal exactly as one
// account's customer sees it, read only. Server only.
//
// How it works, and why it is safe:
//   - Staff open /api/admin/portal-preview?accountId=X (staff login only, like
//     every /api/admin path). It writes one line in the staff activity log
//     (entity "portal-preview", so it is not in the customer's History) and
//     sets the cw_portal_preview cookie to that account's ID.
//   - getPortalLogin (lib/portalAuth.ts) asks previewLogin first. The cookie
//     counts ONLY together with a valid staff login: a customer or a sub who
//     sets the cookie by hand gets nothing. No customer session is made, no
//     "last login" changes, nothing is saved for the customer.
//   - Every send to /api/portal (problem, extra service, password, login, log
//     out...) is refused by proxy.ts while the cookie is there, and the
//     screens show "Preview only, nothing is sent" on their buttons.
//   - It works for any account that is not deleted, with or without a portal
//     login or Portal access (it shows what they WOULD see).
//   - A shared preview link (lib/portalPreviewLink.ts) does the same for one
//     account with no login: its cw_portal_share cookie counts only while the
//     link is still good (signed, within 7 days, not turned off). No account
//     switcher, and the rest of the app still needs a staff login.

import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { adminSessionOptions, type AdminIdentitySession } from "@/lib/adminSession";
import { getSql } from "@/lib/db";
import type { PortalAccount } from "@/lib/pg/portal-auth";
import { PORTAL_PREVIEW_COOKIE, PORTAL_SHARE_COOKIE } from "@/lib/portalPreviewCookie";
import { activePreviewLink } from "@/lib/portalPreviewLink";

export { PORTAL_PREVIEW_COOKIE, PORTAL_SHARE_COOKIE };
/** How long a preview lasts without being opened again. */
export const PORTAL_PREVIEW_SECONDS = 4 * 60 * 60;

/** shared: opened from a shared preview link (no login), not by staff. */
export type PortalPreview = { account: PortalAccount; email: string; staffName: string; shared: boolean };

/** The staff member logged in on this browser, or null. Read only. */
export async function staffOnThisBrowser(): Promise<AdminIdentitySession | null> {
  try {
    const session = await getIronSession<AdminIdentitySession>(await cookies(), adminSessionOptions());
    return session.accountId && session.role ? { accountId: session.accountId, role: session.role, staffId: session.staffId, name: session.name } : null;
  } catch {
    return null;
  }
}

/** One account as the portal shows it (any account that is not deleted). */
export async function previewAccount(accountId: string): Promise<{ account: PortalAccount; email: string } | null> {
  const id = accountId.trim();
  if (!id) return null;
  const rows = (await getSql().query(
    `SELECT a.id, a.account_name, a.address, a.city, a.zip, a.is_test, lower(btrim(a.email)) AS email
     FROM accounts a WHERE a.id = $1::text AND (to_jsonb(a)->>'deleted_at') IS NULL LIMIT 1`,
    [id]
  )) as { id: string; account_name: string; address: string; city: string; zip: string; is_test: boolean; email: string | null }[];
  const row = rows[0];
  if (!row) return null;
  return {
    account: {
      accountId: row.id,
      accountName: row.account_name.trim(),
      address: [row.address, row.city, row.zip].map((s) => String(s ?? "").trim()).filter(Boolean).join(", "),
      isTest: row.is_test,
    },
    email: row.email ?? "",
  };
}

/** The account being previewed, or null: no preview (staff with the preview cookie, or a good shared link), or no such account. */
export async function previewLogin(): Promise<PortalPreview | null> {
  const jar = await cookies();
  const accountId = jar.get(PORTAL_PREVIEW_COOKIE)?.value ?? "";
  if (accountId) {
    const staff = await staffOnThisBrowser();
    if (staff) {
      const found = await previewAccount(decodeURIComponent(accountId));
      if (found) return { ...found, staffName: staff.name ?? "", shared: false };
    }
  }
  const shareToken = jar.get(PORTAL_SHARE_COOKIE)?.value ?? "";
  if (shareToken) {
    const link = await activePreviewLink(decodeURIComponent(shareToken)).catch(() => null);
    const found = link ? await previewAccount(link.accountId) : null;
    if (found) return { ...found, staffName: "", shared: true };
  }
  return null;
}
