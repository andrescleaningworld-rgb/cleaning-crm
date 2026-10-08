import { NextRequest, NextResponse } from "next/server";
import { isPostgres } from "@/lib/dataSource";
import { getSql } from "@/lib/db";
import { updateAccountFieldsDirect } from "@/lib/data/accounts";

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
    const rows = (await sql.query(
      `SELECT a.id, a.account_name, a.status, a.contact_name, a.phone, a.manager_raw,
              EXISTS (SELECT 1 FROM portal_access p WHERE p.account_ref = a.id AND upper(btrim(p.portal_access)) = 'YES') AS portal_access
       FROM accounts a
       WHERE NOT a.is_test AND a.id IS NOT NULL AND btrim(a.email) = '' AND a.status_key NOT IN ('cancelled', 'canceled')
       ORDER BY lower(a.account_name), a.pk`
    )) as { id: string; account_name: string; status: string; contact_name: string; phone: string; manager_raw: string; portal_access: boolean }[];
    const totals = (await sql.query(
      `SELECT count(*)::int AS total FROM accounts WHERE NOT is_test AND id IS NOT NULL AND status_key NOT IN ('cancelled', 'canceled')`
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
  let body: { accountId?: unknown; email?: unknown };
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
    // The same save the account's Edit page uses for this field.
    await updateAccountFieldsDirect(accountId, { email });
    return NextResponse.json({ success: true, email });
  } catch (err) {
    console.error("[admin/account-emails POST]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save the email." }, { status: 500 });
  }
}
