import { NextRequest, NextResponse } from "next/server";
import { isPostgres } from "@/lib/dataSource";
import { getSql } from "@/lib/db";
import { updateAccountFieldsDirect } from "@/lib/data/accounts";
import { pickCheckinEmail } from "@/lib/customerCheckin";

// Customer emails, for the new portal's email + password login. Staff only
// (proxy.ts).
//
// GET  → the accounts with no email ("Missing emails" in Accounts Center)
// POST { accountId, email } → saves one account's email
//
// Both work only where accounts are on Postgres. Where accounts are still in
// Google Sheets, an email is typed on the account's Edit page, as always:
// this route never writes to Sheets.

const looksLikeEmail = (email: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

export async function GET() {
  if (!isPostgres("ACCOUNTS")) return NextResponse.json({ available: false, missing: [], counts: { missing: 0, total: 0 } });
  try {
    const sql = getSql();
    // Cancelled accounts are left out: they cannot log in to the portal anyway.
    // Also the accounts whose only email (on the account and its contacts) is
    // a billing robot (invoice capture, accounts payable, no-reply): a
    // check-in skips those as "Billing inbox only", so they need a real one.
    const all = (await sql.query(
      `SELECT a.id, a.account_name, a.status, a.contact_name, a.phone, a.manager_raw, btrim(a.email) AS email,
              EXISTS (SELECT 1 FROM portal_access p WHERE p.account_ref = a.id AND upper(btrim(p.portal_access)) = 'YES') AS portal_access,
              ARRAY(SELECT btrim(c.email) FROM account_contacts c WHERE c.account_id = a.id AND c.removed_at IS NULL AND btrim(c.email) <> '') AS contact_emails
       FROM accounts a
       WHERE NOT a.is_test AND a.id IS NOT NULL AND (to_jsonb(a)->>'deleted_at') IS NULL AND a.status_key NOT IN ('cancelled', 'canceled')
       ORDER BY lower(a.account_name), a.pk`
    )) as { id: string; account_name: string; status: string; contact_name: string; phone: string; manager_raw: string; email: string; portal_access: boolean; contact_emails: string[] | null }[];
    const rows = all
      .map((r) => ({ ...r, billingOnly: r.email !== "" && pickCheckinEmail([r.email, ...(r.contact_emails ?? [])]).billingOnly }))
      .filter((r) => r.email === "" || r.billingOnly);
    const totals = (await sql.query(
      `SELECT count(*)::int AS total FROM accounts WHERE NOT is_test AND id IS NOT NULL AND (to_jsonb(accounts)->>'deleted_at') IS NULL AND status_key NOT IN ('cancelled', 'canceled')`
    )) as { total: number }[];
    return NextResponse.json({
      available: true,
      missing: rows.map((r) => ({
        accountId: r.id,
        accountName: r.account_name.trim(),
        status: r.status.trim(),
        contactName: r.contact_name.trim(),
        phone: r.phone.trim(),
        manager: r.manager_raw.trim(),
        portalAccess: r.portal_access,
        // Only a billing inbox is on file (shown on the card; saving puts the new email on the account instead).
        billingInbox: r.billingOnly ? r.email : "",
      })),
      counts: { missing: rows.length, total: totals[0]?.total ?? 0 },
    });
  } catch (err) {
    console.error("[admin/account-emails GET]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to load the list." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isPostgres("ACCOUNTS")) {
    return NextResponse.json({ error: "Accounts are still in Google Sheets here. Type the email on the account's Edit page." }, { status: 409 });
  }
  // onlyActive: the "Find emails in Markate" save fills Active accounts only (it is refused for any other status).
  let body: { accountId?: unknown; email?: unknown; onlyActive?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const accountId = String(body.accountId ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!accountId) return NextResponse.json({ error: "Account is required." }, { status: 400 });
  if (email !== "" && !looksLikeEmail(email)) return NextResponse.json({ error: "That does not look like an email. Check for a missing @ or a space." }, { status: 400 });

  try {
    if (body.onlyActive === true) {
      const rows = (await getSql()`SELECT status_key FROM accounts WHERE id = ${accountId} LIMIT 1`) as { status_key: string }[];
      if (rows[0]?.status_key !== "active") return NextResponse.json({ error: "This account is not Active, so its email was not filled from Markate." }, { status: 409 });
    }
    // The same save the account's Edit page uses for this field.
    await updateAccountFieldsDirect(accountId, { email });
    return NextResponse.json({ success: true, email });
  } catch (err) {
    console.error("[admin/account-emails POST]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save the email." }, { status: 500 });
  }
}
