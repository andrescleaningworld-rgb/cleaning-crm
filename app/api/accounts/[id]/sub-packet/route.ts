// The Sub Packet for one account (lib/subPacket.ts, lib/pg/sub-packet.ts).
// Staff only (proxy.ts default gate, plus a logged-in check here).
//
// GET  ?lang=en|es|pt              the preview: to, subject, the email as it will look, problems,
//                                  and the packet link in that language (lib/subPacketLink.ts)
// POST { lang, to }                sends it with the PDF; written to the Email log and the account's History
// POST { lang, method }            text / copy / qr: the link was shared that way; written to the History
//
// Only the sub's own pay is in it: never the revenue, the margin or the internal Notes.

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { logActivity } from "@/lib/activityLog";
import { sendHtmlEmail } from "@/lib/email";
import { renderSubPacketPdf } from "@/lib/pdf/sub-packet";
import { loadSubPacketInfo, subPacketData, subPacketProblems } from "@/lib/pg/sub-packet";
import { isSubPacketLang, subPacketHtml, subPacketPdfFilename, subPacketSubject, subPacketText, type SubPacketLang } from "@/lib/subPacket";
import { subKeyOf, subPacketLinkUrl, subPacketToken } from "@/lib/subPacketLink";
import { PACKET_SHARE_LABEL, isPacketShareMethod } from "@/lib/subPacketShare";

type RouteContext = { params: Promise<{ id: string }> };

const noStore = { headers: { "Cache-Control": "no-store" } };
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status, ...noStore });
const langOf = (value: unknown): SubPacketLang => (isSubPacketLang(value) ? value : "en");

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    if (!(await getAdminIdentity(request))) return refuse("Log in first.", 401);
    const id = decodeURIComponent((await context.params).id);
    const info = await loadSubPacketInfo(id);
    if (!info) return refuse("That account was not found.", 404);
    const lang = langOf(request.nextUrl.searchParams.get("lang"));
    const data = subPacketData(info, lang, request.nextUrl.origin);
    return NextResponse.json(
      {
        success: true,
        preview: {
          to: info.subEmail,
          subName: info.subName,
          subject: subPacketSubject(data),
          html: subPacketHtml(data),
          lang,
          problems: subPacketProblems(info, info.subEmail),
          // No link before the account has a sub (the link is made for that sub).
          link: info.subName ? subPacketLinkUrl(request.nextUrl.origin, subPacketToken(info.accountId, subKeyOf(info), lang)) : "",
        },
      },
      noStore
    );
  } catch (error) {
    console.error("[sub-packet GET]", error instanceof Error ? error.message : error);
    return refuse("The sub packet did not load.", 500);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Log in first.", 401);
    const by = identity.name || "Someone";
    const id = decodeURIComponent((await context.params).id);
    const body = (await request.json().catch(() => ({}))) as { lang?: unknown; to?: unknown; method?: unknown };
    const info = await loadSubPacketInfo(id);
    if (!info) return refuse("That account was not found.", 404);

    // Text / Copy link / QR: the link went out from the manager's own phone; only the History line is written here.
    if (isPacketShareMethod(body.method) && body.method !== "email") {
      if (!info.subName) return refuse("This account has no subcontractor yet. Pick one on Edit Account first.");
      const lang = langOf(body.lang);
      await logActivity({
        actorAccountId: identity.accountId ?? null,
        actorRole: identity.role ?? "manager",
        actorName: by,
        action: "update",
        entityType: "account",
        entityId: info.accountId,
        detail: `Sub packet shared by ${PACKET_SHARE_LABEL[body.method]} (${info.subName}, ${lang.toUpperCase()})`,
      });
      return NextResponse.json({ success: true }, noStore);
    }
    const to = String(body.to ?? info.subEmail).trim();
    const problems = subPacketProblems(info, to);
    if (problems.length) return refuse(problems.join(" "));

    const data = subPacketData(info, langOf(body.lang), request.nextUrl.origin);
    const pdf = await renderSubPacketPdf(data);
    const sent = await sendHtmlEmail({
      to: [to],
      fromName: "Cleaning World",
      subject: subPacketSubject(data),
      text: subPacketText(data),
      html: subPacketHtml(data),
      attachments: [{ filename: subPacketPdfFilename(data), content: pdf, contentType: "application/pdf" }],
      log: { type: "Sub packet", accountId: info.accountId, accountName: info.accountName, subId: info.subId, subName: info.subName, sentBy: by },
    });
    if (!sent) return refuse("Email is not set up on this server, so nothing was sent.", 503);

    // The email is out: the History line never turns it into a failure.
    await logActivity({
      actorAccountId: identity.accountId ?? null,
      actorRole: identity.role ?? "manager",
      actorName: by,
      action: "update",
      entityType: "account",
      entityId: info.accountId,
      detail: `Sub packet sent by email to: ${to} (${info.subName}, ${data.lang.toUpperCase()})`,
    }).catch((error) => console.error("[sub-packet] history:", error instanceof Error ? error.message : error));

    return NextResponse.json({ success: true, sentTo: to }, noStore);
  } catch (error) {
    console.error("[sub-packet POST]", error instanceof Error ? error.message : error);
    return refuse(error instanceof Error ? error.message : "The sub packet was not sent. Try again.", 500);
  }
}
