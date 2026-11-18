// Staff only (proxy.ts admin gate, and the logged-in check here): Settings →
// Customer Portal Access → Test accounts (lib/pg/portal-test-accounts.ts).
//
// GET                                   -> { success, accounts }
// POST { action: "create", name, email } -> makes it, emails "Set your password" to that address
// POST { action: "remove", accountId }

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { sendCustomerEmail } from "@/lib/email";
import { passwordLinkEmail, passwordLinkUrl } from "@/lib/portalAuth";
import { createTestAccount, listTestAccounts, removeTestAccount, TestAccountError } from "@/lib/pg/portal-test-accounts";

export async function GET(request: NextRequest) {
  if (!(await getAdminIdentity(request))) return NextResponse.json({ success: false, error: "Log in first." }, { status: 401 });
  try {
    return NextResponse.json({ success: true, accounts: await listTestAccounts() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[admin/portal-test-accounts GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "The test accounts did not load." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const staff = await getAdminIdentity(request);
  if (!staff) return NextResponse.json({ success: false, error: "Log in first." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { action?: unknown; name?: unknown; email?: unknown; accountId?: unknown };
  try {
    if (body.action === "create") {
      const made = await createTestAccount({ name: String(body.name ?? ""), email: String(body.email ?? "") });
      let emailed = false;
      if (made.token) {
        const mail = passwordLinkEmail("set", passwordLinkUrl(new URL(request.url).origin, made.token));
        emailed = await sendCustomerEmail(String(body.email ?? "").trim().toLowerCase(), mail.subject, mail.lines, {
          type: "Customer portal invite",
          accountId: made.accountId,
          accountName: made.accountName,
          sentBy: staff.name || "staff",
        }).catch(() => false);
      }
      return NextResponse.json({ success: true, accountId: made.accountId, accountName: made.accountName, emailed });
    }
    if (body.action === "remove") {
      const removed = await removeTestAccount(String(body.accountId ?? ""), staff.name || "staff");
      if (!removed) return NextResponse.json({ success: false, error: "That is not a test account." }, { status: 404 });
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ success: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    if (error instanceof TestAccountError) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    console.error("[admin/portal-test-accounts POST]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "That did not work. Try again." }, { status: 500 });
  }
}
