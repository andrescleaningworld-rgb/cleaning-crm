// The customer portal invitation (Account page -> "Invite to portal",
// app/accounts/[id]/portal-invite-sheet.tsx). Staff only (proxy.ts, and the
// session is checked here). Nothing goes out by itself: staff see the invite
// first, may change its words, then pick how to share it.
//
//   GET  ?accountId=X                                   the account's last invites
//   POST { action: "prepare", accountId }               makes this invite's one-time "set your password"
//                                                       link, and returns it with the names that fill the
//                                                       template (lib/portalInviteEmail.ts) and the email on file
//   POST { action: "email", accountId, url, to, lang, subject, body }
//                                                       sends the invite (with any changed words) to `to`
//   POST { action: "record", accountId, method, lang }  text / copy / qr: the share happened on this device
//
// Every invite is a line in the account's History (activity_log, entity
// "account"): "Portal invite by email to …", "… by text", "… copied",
// "… shown as a QR code". "Invited <date> by <name>" on the account page is
// the latest of them.
//
// Refused while "Portal open to customers" is OFF, so no real customer can
// be invited by accident. A test account can always be invited.

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { listActivityForEntity, logActivity } from "@/lib/activityLog";
import { getSql } from "@/lib/db";
import { sendHtmlEmail } from "@/lib/email";
import { loadWelcomePacketInfo } from "@/lib/pg/welcome-packet";
import { renderPortalInvite, type InviteLang } from "@/lib/portalInviteEmail";
import { INVITE_LINK_HOURS, createPasswordLink, emailForToken, isPortalOpen } from "@/lib/pg/portal-auth";
import { passwordLinkUrl } from "@/lib/portalAuth";
import { newPortalOn } from "@/lib/portalSession";

const clean = (value: unknown) => String(value ?? "").trim();
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/** What the History line says, per way of sharing. */
const HOW: Record<string, string> = { email: "by email", text: "by text", copy: "copied", qr: "shown as a QR code" };
const LINE_START = "Portal invite ";

export type PortalInviteRecord = { at: string; by: string; how: string };

async function recentInvites(accountId: string): Promise<PortalInviteRecord[]> {
  const entries = await listActivityForEntity("account", accountId, 200);
  return entries
    .filter((entry) => (entry.detail ?? "").startsWith(LINE_START))
    .slice(0, 10)
    .map((entry) => ({ at: entry.createdAt, by: entry.actorName, how: (entry.detail ?? "").slice(LINE_START.length) }));
}

/** The account, and whether an invite may be made for it now (the plain-words reason when not). */
async function invitable(accountId: string): Promise<{ email: string } | { error: string; status: number }> {
  if (!newPortalOn()) return { error: "The new customer portal is not running here yet.", status: 409 };
  const rows = (await getSql().query(`SELECT btrim(email) AS email, is_test FROM accounts WHERE id = $1::text`, [accountId])) as { email: string; is_test: boolean }[];
  const account = rows[0];
  if (!account) return { error: "Account not found.", status: 404 };
  if (!account.is_test && !(await isPortalOpen())) {
    return { error: 'The portal is not open to customers yet. Turn on "Portal open to customers" in Settings → Customer Portal Access first.', status: 409 };
  }
  if (!account.email) return { error: "This account has no email. Add one to the account first: the customer logs in with it.", status: 400 };
  return { email: account.email };
}

export async function GET(request: NextRequest) {
  try {
    if (!(await getAdminIdentity(request))) return refuse("Log in first.", 401);
    const accountId = clean(request.nextUrl.searchParams.get("accountId"));
    if (!accountId) return refuse("Account is required.");
    return NextResponse.json({ success: true, invites: await recentInvites(accountId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[admin/portal-invite GET]", err instanceof Error ? err.message : err);
    return refuse("The invites did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getAdminIdentity(request);
    if (!actor) return refuse("Log in first.", 401);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = clean(body.action) || "prepare";
    const accountId = clean(body.accountId);
    if (!accountId) return refuse("Account is required.");
    const lang: InviteLang = body.lang === "es" ? "es" : "en";
    const by = actor.name || "Someone";
    const record = (how: string) =>
      logActivity({
        actorAccountId: actor.accountId ?? null,
        actorRole: actor.role ?? "manager",
        actorName: by,
        action: "update",
        entityType: "account",
        entityId: accountId,
        detail: `${LINE_START}${how}${lang === "es" ? " (Spanish)" : ""}`,
      });

    const check = await invitable(accountId);
    if ("error" in check) return refuse(check.error, check.status);

    if (action === "prepare") {
      // The login is the account's email; the link sets that login's password (works once, for 7 days).
      const link = await createPasswordLink(check.email, "set", by, INVITE_LINK_HOURS);
      if (!link) return refuse("This account cannot use the portal yet. Check that it is not cancelled and that Portal access is ON.");
      const info = await loadWelcomePacketInfo(accountId).catch(() => null);
      return NextResponse.json({
        success: true,
        url: passwordLinkUrl(new URL(request.url).origin, link.token),
        email: check.email,
        fill: {
          customerName: info?.contactName ?? "",
          accountName: info?.accountName ?? "",
          managerName: info?.managerName ?? "",
          managerPhone: info?.managerPhone ?? "",
        },
        testOnly: link.testOnly,
      });
    }

    if (action === "email") {
      const to = clean(body.to).toLowerCase();
      if (!isEmail(to)) return refuse(`"${clean(body.to)}" is not an email address.`);
      // Only a link made for this account's login goes out: never a link typed or changed on the screen.
      const url = clean(body.url);
      const token = /\/portal\/set-password\?token=([^&#\s]+)$/.exec(url)?.[1] ?? "";
      const tokenEmail = token ? await emailForToken(decodeURIComponent(token)) : null;
      if (!tokenEmail || tokenEmail.toLowerCase() !== check.email.toLowerCase()) return refuse("This invite's link has expired or was already used. Close this and open Invite to portal again.", 409);
      const subject = clean(body.subject).slice(0, 200);
      const text = String(body.body ?? "").slice(0, 6000);
      if (!text.trim()) return refuse("The email has no message. Write one, or tap Back to the template.");
      const mail = renderPortalInvite({ subject, body: text, url, lang });
      const info = await loadWelcomePacketInfo(accountId).catch(() => null);
      const sent = await sendHtmlEmail({
        to: [to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        fromName: "Cleaning World",
        log: { type: "Customer portal invite", accountId, accountName: info?.accountName, sentBy: by },
      }).catch(() => false);
      if (!sent) return refuse("The email was not sent: email is not set up on this server, or it failed. Try again.", 503);
      await record(`${HOW.email} to ${to}`);
      return NextResponse.json({ success: true, invites: await recentInvites(accountId) });
    }

    if (action === "record") {
      const method = clean(body.method);
      if (method !== "text" && method !== "copy" && method !== "qr") return refuse("method must be text, copy or qr.");
      await record(HOW[method]);
      return NextResponse.json({ success: true, invites: await recentInvites(accountId) });
    }

    return refuse("Unknown action.");
  } catch (err) {
    console.error("[admin/portal-invite POST]", err instanceof Error ? err.message : err);
    return refuse("That did not work. Try again.", 500);
  }
}
