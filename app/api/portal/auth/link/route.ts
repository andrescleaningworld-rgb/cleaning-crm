import { NextRequest, NextResponse } from "next/server";
import { newPortalOn } from "@/lib/portalSession";
import { cleanEmail, createPasswordLink } from "@/lib/pg/portal-auth";
import { isNonProduction, passwordLinkEmail, passwordLinkUrl } from "@/lib/portalAuth";
import { sendCustomerEmail } from "@/lib/email";

// POST { email, kind: "set" | "reset" }: emails a "Set your password" link.
//
// The answer is the same whether or not the email belongs to a customer, so
// nobody can use this to find out who is one.
//
// Outside production, and only for an email whose accounts are all test
// accounts, the link is also returned so it can be shown on screen (emails
// are dry-run there). A real customer's link is never returned.
export async function POST(request: NextRequest) {
  if (!newPortalOn()) return NextResponse.json({ error: "Not available." }, { status: 404 });

  let body: { email?: unknown; kind?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const email = cleanEmail(body.email);
  const kind = body.kind === "reset" ? "reset" : "set";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "email" }, { status: 400 });
  }

  try {
    const link = await createPasswordLink(email, kind, "customer");
    let devLink: string | undefined;
    if (link) {
      const url = passwordLinkUrl(new URL(request.url).origin, link.token);
      const mail = passwordLinkEmail(kind, url);
      await sendCustomerEmail(link.email, mail.subject, mail.lines).catch(() => false);
      if (link.testOnly && isNonProduction()) devLink = url;
    }
    return NextResponse.json({ success: true, ...(devLink ? { devLink } : {}) });
  } catch (err) {
    console.error("[portal/auth/link]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
