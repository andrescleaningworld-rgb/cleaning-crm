// "Share this preview" (lib/portalPreviewLink.ts). Staff only: every
// /api/admin path is behind the staff login (proxy.ts), and it is checked here.
//
//   GET  ?accountId=X                          links still working, who made the last, last opened
//   POST { action: "make", accountId }         a new 7-day link (a line in the activity log)
//   POST { action: "email", accountId, url, to }  sends that link to `to`
//   POST { action: "off", accountId }          every link of this account stops working now

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { logActivity } from "@/lib/activityLog";
import { sendHtmlEmail } from "@/lib/email";
import { previewAccount } from "@/lib/portalPreview";
import { LINKS_OFF, LINK_MADE, PREVIEW_LINK_ENTITY, activePreviewLink, makePreviewLinkToken, previewLinkStatus, previewLinkUrl } from "@/lib/portalPreviewLink";

const clean = (value: unknown) => String(value ?? "").trim();
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const noStore = { headers: { "Cache-Control": "no-store" } };
const day = (ms: number) => new Date(ms).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" });
const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function GET(request: NextRequest) {
  try {
    if (!(await getAdminIdentity(request))) return refuse("Log in first.", 401);
    const accountId = clean(request.nextUrl.searchParams.get("accountId"));
    if (!accountId) return refuse("Account is required.");
    return NextResponse.json({ success: true, ...(await previewLinkStatus(accountId)) }, noStore);
  } catch (error) {
    console.error("[portal-preview-link GET]", error instanceof Error ? error.message : error);
    return refuse("The preview links did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const staff = await getAdminIdentity(request);
    if (!staff) return refuse("Log in first.", 401);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = clean(body.action);
    const accountId = clean(body.accountId);
    const found = accountId ? await previewAccount(accountId) : null;
    if (!found) return refuse("That account was not found.", 404);
    const by = staff.name || "Someone";
    const log = (detail: string, action: "create" | "update") =>
      logActivity({ actorAccountId: staff.accountId ?? null, actorRole: staff.role ?? "manager", actorName: by, action, entityType: PREVIEW_LINK_ENTITY, entityId: found.account.accountId, detail });

    if (action === "make") {
      const { token, endsAt } = makePreviewLinkToken(found.account.accountId);
      await log(`${LINK_MADE} (works until ${day(endsAt)})`, "create");
      return NextResponse.json({ success: true, url: previewLinkUrl(new URL(request.url).origin, token), endsAt: new Date(endsAt).toISOString() }, noStore);
    }

    if (action === "email") {
      const to = clean(body.to).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return refuse(`"${clean(body.to)}" is not an email address.`);
      const url = clean(body.url);
      const token = new URL(url, request.url).searchParams.get("t") ?? "";
      const link = await activePreviewLink(token);
      if (!link || link.accountId !== found.account.accountId) return refuse("This link has expired or was turned off. Make a new one.", 409);
      const name = found.account.accountName;
      const subject = `Preview of the customer portal: ${name}`;
      const lines = [
        `Here is a private, read-only preview of the Cleaning World customer portal for ${name}, as the customer sees it.`,
        "Nothing can be sent or changed from it.",
        `It works until ${day(link.endsAt)}.`,
      ];
      const html =
        '<!DOCTYPE html><html lang="en"><body style="margin:0;padding:24px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">' +
        lines.map((line) => `<p style="font-size:15px;line-height:1.6;margin:0 0 12px;">${esc(line)}</p>`).join("") +
        `<p style="margin:18px 0;"><a href="${esc(url)}" style="display:inline-block;padding:12px 22px;background:#005bbb;color:#ffffff;font-weight:700;text-decoration:none;border-radius:8px;">Open the preview</a></p>` +
        `<p style="font-size:12px;color:#475569;word-break:break-all;">${esc(url)}</p>` +
        `<p style="font-size:13px;color:#475569;margin-top:18px;">Sent by ${esc(by)} from Cleaning World.</p></body></html>`;
      const sent = await sendHtmlEmail({ to: [to], subject, text: [...lines, "", url, "", `Sent by ${by} from Cleaning World.`].join("\n"), html, fromName: "Cleaning World", log: { type: "Portal preview link", accountId: found.account.accountId, accountName: name, sentBy: by } }).catch(() => false);
      if (!sent) return refuse("The email was not sent: email is not set up on this server, or it failed. Try again.", 503);
      return NextResponse.json({ success: true }, noStore);
    }

    if (action === "off") {
      await log(LINKS_OFF, "update");
      return NextResponse.json({ success: true, ...(await previewLinkStatus(found.account.accountId)) }, noStore);
    }

    return refuse("Unknown action.");
  } catch (error) {
    console.error("[portal-preview-link POST]", error instanceof Error ? error.message : error);
    return refuse("That did not work. Try again.", 500);
  }
}
