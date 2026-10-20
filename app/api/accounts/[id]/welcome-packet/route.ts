// The customer Welcome Packet for one account (admin only: this path falls
// through to proxy.ts's default admin gate, like the account PDF route).
//
// GET: the preview — who it goes to, and the packet exactly as the email
// will show it, plus anything that blocks the send, and when it was last sent.
// GET ?summary=1: only when it was last sent (the account page's button).
// POST { to }: sends it. The HTML email and a PDF of the same packet
// (lib/welcomePacket.ts + lib/pdf/welcome-packet.tsx), CC the office, replies
// go to the account manager. Then it is written on the account's History and
// ticks "Welcome packet sent to customer" on the Onboarding Checklist.
import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { logActivity } from "@/lib/activityLog";
import { accountsOnPostgres, setOnboardingChecklistItem } from "@/lib/data/accounts";
import { sendHtmlEmail } from "@/lib/email";
import { WELCOME_PACKET_ITEM } from "@/lib/onboardingChecklist";
import { renderWelcomePacketPdf } from "@/lib/pdf/welcome-packet";
import { syncAccountStep } from "@/lib/pg/handoffs";
import { emailProblem, lastWelcomePacketSentAt, loadWelcomePacketInfo, managerProblem, packetData, welcomePacketProblems, type WelcomePacketInfo } from "@/lib/pg/welcome-packet";
import { welcomePacketHtml, welcomePacketText, welcomePdfFilename, welcomeSubject } from "@/lib/welcomePacket";

export const maxDuration = 45;

const OFFICE_CC = "crm@cleaningworldinc.com";

type RouteContext = { params: Promise<{ id: string }> };

/** Answers go to the account manager; to the office when the manager has no email on file. */
function replyToOf(info: WelcomePacketInfo): string {
  return info.managerEmail || OFFICE_CC;
}

async function load(context: RouteContext): Promise<WelcomePacketInfo | NextResponse> {
  if (!accountsOnPostgres()) {
    return NextResponse.json({ success: false, error: "The welcome packet needs the accounts on the new database." }, { status: 400 });
  }
  const { id } = await context.params;
  const info = await loadWelcomePacketInfo(decodeURIComponent(id));
  if (!info) return NextResponse.json({ success: false, error: "Could not find this account." }, { status: 404 });
  return info;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const info = await load(context);
    if (info instanceof NextResponse) return info;
    const lastSentAt = await lastWelcomePacketSentAt(info.accountId);
    if (request.nextUrl.searchParams.get("summary") === "1") {
      return NextResponse.json({ success: true, lastSentAt });
    }
    const data = packetData(info, { origin: request.nextUrl.origin });
    return NextResponse.json({
      lastSentAt,
      portalAccessOn: info.portalAccessOn,
      success: true,
      to: info.customerEmail,
      cc: OFFICE_CC,
      replyTo: replyToOf(info),
      managerName: info.managerName,
      managerHasEmail: Boolean(info.managerEmail),
      subject: welcomeSubject(data),
      managerProblem: managerProblem(info),
      emailProblem: emailProblem(info.customerEmail),
      html: welcomePacketHtml(data),
    });
  } catch (error) {
    console.error("[accounts/[id]/welcome-packet GET]", error);
    return NextResponse.json({ success: false, error: "Could not load the welcome packet." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const info = await load(context);
    if (info instanceof NextResponse) return info;
    const body = (await request.json().catch(() => ({}))) as { to?: unknown };
    const to = String(body.to ?? "").trim();

    const problems = welcomePacketProblems(info, to);
    if (problems.length) return NextResponse.json({ success: false, error: problems.join(" "), problems }, { status: 400 });

    const now = new Date();
    const data = packetData(info, { origin: request.nextUrl.origin, to, now });
    const pdf = await renderWelcomePacketPdf(data);
    const replyTo = replyToOf(info);
    const identity = await getAdminIdentity(request);
    const by = identity?.name || "Someone";

    const sent = await sendHtmlEmail({
      to: [to],
      cc: [OFFICE_CC],
      replyTo,
      fromName: "Cleaning World",
      subject: welcomeSubject(data),
      text: welcomePacketText(data),
      html: welcomePacketHtml(data),
      attachments: [{ filename: welcomePdfFilename(data), content: pdf, contentType: "application/pdf" }],
      log: { type: "Welcome Packet", accountId: info.accountId, accountName: info.accountName, sentBy: by },
    });
    if (!sent) {
      return NextResponse.json({ success: false, error: "Email is not set up on this server, so nothing was sent." }, { status: 503 });
    }

    // The email is out. What follows is bookkeeping and never turns the send into a failure.
    await logActivity({
      actorAccountId: identity?.accountId ?? null,
      actorRole: identity?.role ?? "manager",
      actorName: by,
      action: "update",
      entityType: "account",
      entityId: info.accountId,
      detail: [`Welcome packet sent to: ${to}`, `CC: ${OFFICE_CC}`, `Replies go to: ${replyTo}`].join("\n"),
    });

    let checklistTicked = false;
    try {
      const checklist = await setOnboardingChecklistItem({
        accountId: info.accountId,
        accountName: info.accountName,
        itemKey: WELCOME_PACKET_ITEM,
        checked: true,
        note: `Sent to ${to} on ${data.sentDate} by ${by}`,
      });
      checklistTicked = true;
      // New accounts board: same as a tick by hand (app/api/onboarding-checklist).
      await syncAccountStep(info.accountId, checklist.items, by);
    } catch (err) {
      console.error("[welcome-packet] checklist tick failed:", err instanceof Error ? err.message : err);
    }

    return NextResponse.json({ success: true, sentTo: to, cc: OFFICE_CC, replyTo, sentDate: data.sentDate, sentAt: now.toISOString(), checklistTicked });
  } catch (error) {
    console.error("[accounts/[id]/welcome-packet POST]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? `The packet was not sent: ${error.message}` : "The packet was not sent." },
      { status: 500 }
    );
  }
}
