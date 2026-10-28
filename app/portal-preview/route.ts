// A shared, read-only preview of one account's customer portal
// (lib/portalPreviewLink.ts). Public: opened with no login (proxy.ts
// PUBLIC_PATHS); the signed link is checked here.
//
//   GET ?t=<link>   good link: logs the opening, keeps the link in the
//                   cw_portal_share cookie, opens the portal home (read only,
//                   with the preview bar). Otherwise a plain "this link does
//                   not work" page.

import { NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/lib/activityLog";
import { LINK_OPENED, PREVIEW_LINK_ENTITY, activePreviewLink } from "@/lib/portalPreviewLink";
import { PORTAL_SHARE_COOKIE } from "@/lib/portalPreviewCookie";
import { previewAccount } from "@/lib/portalPreview";

function notWorking(): NextResponse {
  const html =
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Preview link</title></head>' +
    '<body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:#f8fafc;color:#1f2937;">' +
    '<div style="max-width:520px;margin:15vh auto;padding:24px;background:#ffffff;border-radius:16px;box-shadow:0 2px 12px rgba(0,0,0,0.08);text-align:center;">' +
    '<h1 style="font-size:22px;margin:0 0 10px;">This preview link does not work</h1>' +
    '<p style="font-size:16px;line-height:1.5;margin:0;">It has expired (links work for 7 days) or it was turned off. Ask Cleaning World for a new one.</p>' +
    "</div></body></html>";
  return new NextResponse(html, { status: 410, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  try {
    const token = String(request.nextUrl.searchParams.get("t") ?? "").trim();
    const link = token ? await activePreviewLink(token) : null;
    const found = link ? await previewAccount(link.accountId) : null;
    if (!link || !found) return notWorking();

    await logActivity({
      actorAccountId: null,
      actorRole: "guest",
      actorName: "Someone with the preview link",
      action: "view",
      entityType: PREVIEW_LINK_ENTITY,
      entityId: found.account.accountId,
      detail: LINK_OPENED,
    }).catch((error) => console.error("[portal-preview link] log:", error instanceof Error ? error.message : error));

    const response = NextResponse.redirect(new URL("/portal", request.url));
    response.cookies.set(PORTAL_SHARE_COOKIE, encodeURIComponent(token), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: Math.max(60, Math.floor((link.endsAt - Date.now()) / 1000)),
    });
    return response;
  } catch (error) {
    console.error("[portal-preview link]", error instanceof Error ? error.message : error);
    return notWorking();
  }
}
