// Staff "View as customer" (lib/portalPreview.ts). Staff only: every
// /api/admin path is behind the staff login (proxy.ts), and it is checked
// here too. Customers and subs can never reach it.
//
//   GET ?accountId=X   start (or switch) the preview: a line in the staff
//                      activity log, the preview cookie, then the portal home
//   GET ?exit=1        end it: the cookie goes, back to the account page

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { logActivity } from "@/lib/activityLog";
import { PORTAL_PREVIEW_COOKIE, PORTAL_PREVIEW_SECONDS, previewAccount } from "@/lib/portalPreview";

const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };

export async function GET(request: NextRequest) {
  const staff = await getAdminIdentity(request);
  if (!staff) return NextResponse.redirect(new URL("/login", request.url));
  const params = request.nextUrl.searchParams;

  if (params.get("exit") === "1") {
    const was = request.cookies.get(PORTAL_PREVIEW_COOKIE)?.value ?? "";
    const back = new URL(was ? `/accounts/${encodeURIComponent(decodeURIComponent(was))}` : "/accounts", request.url);
    const response = NextResponse.redirect(back);
    response.cookies.set(PORTAL_PREVIEW_COOKIE, "", { ...cookieOptions, maxAge: 0 });
    return response;
  }

  const accountId = String(params.get("accountId") ?? "").trim();
  const found = accountId ? await previewAccount(accountId).catch(() => null) : null;
  if (!found) return NextResponse.json({ success: false, error: "That account was not found." }, { status: 404 });

  // The staff activity log (Settings -> Activity Log). Its own entity, so the customer's History does not show it.
  await logActivity({
    actorAccountId: staff.accountId ?? null,
    actorRole: staff.role ?? "manager",
    actorName: staff.name || "Someone",
    action: "view",
    entityType: "portal-preview",
    entityId: found.account.accountId,
    detail: `Viewed the customer portal as ${found.account.accountName}`,
  }).catch((error) => console.error("[portal-preview] log:", error instanceof Error ? error.message : error));

  const response = NextResponse.redirect(new URL("/portal", request.url));
  response.cookies.set(PORTAL_PREVIEW_COOKIE, encodeURIComponent(found.account.accountId), { ...cookieOptions, maxAge: PORTAL_PREVIEW_SECONDS });
  return response;
}
