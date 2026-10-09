import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { getSql } from "@/lib/db";
import { sendCustomerEmail } from "@/lib/email";
import { createPasswordLink, isPortalOpen } from "@/lib/pg/portal-auth";
import { isNonProduction, passwordLinkEmail, passwordLinkUrl } from "@/lib/portalAuth";
import { newPortalOn } from "@/lib/portalSession";

// POST { accountId }: staff send a customer the "Set your password" email
// from the account page. Staff only (proxy.ts).
//
// Refused while "Portal open to customers" is OFF, so no real customer can
// be invited by accident. A test account can always be invited; outside
// production its link is returned so it can be shown instead of emailed.
export async function POST(request: NextRequest) {
  if (!newPortalOn()) {
    return NextResponse.json({ success: false, error: "The new customer portal is not running here yet." }, { status: 409 });
  }

  let body: { accountId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }
  const accountId = String(body.accountId ?? "").trim();
  if (!accountId) return NextResponse.json({ success: false, error: "Account is required." }, { status: 400 });

  try {
    const sql = getSql();
    const rows = (await sql.query(`SELECT btrim(email) AS email, is_test, status_key FROM accounts WHERE id = $1::text`, [accountId])) as {
      email: string;
      is_test: boolean;
      status_key: string;
    }[];
    const account = rows[0];
    if (!account) return NextResponse.json({ success: false, error: "Account not found." }, { status: 404 });

    if (!account.is_test && !(await isPortalOpen())) {
      return NextResponse.json(
        { success: false, error: "The portal is not open to customers yet. Turn on \"Portal open to customers\" in Settings → Customer Portal Access first." },
        { status: 409 }
      );
    }
    if (!account.email) {
      return NextResponse.json({ success: false, error: "This account has no email. Add one to the account first." }, { status: 400 });
    }

    const actor = await getAdminIdentity(request);
    const link = await createPasswordLink(account.email, "set", actor?.name || "staff");
    if (!link) {
      return NextResponse.json(
        { success: false, error: "This account cannot use the portal yet. Check that it is not cancelled and that Portal access is ON." },
        { status: 400 }
      );
    }

    const url = passwordLinkUrl(new URL(request.url).origin, link.token);
    const mail = passwordLinkEmail("set", url);
    const sent = await sendCustomerEmail(link.email, mail.subject, mail.lines).catch(() => false);
    return NextResponse.json({
      success: true,
      message: sent ? "Invite sent." : "The invite could not be emailed.",
      ...(link.testOnly && isNonProduction() ? { devLink: url } : {}),
    });
  } catch (err) {
    console.error("[admin/portal-invite]", err instanceof Error ? err.message : err);
    return NextResponse.json({ success: false, error: "Failed to send the invite." }, { status: 500 });
  }
}
