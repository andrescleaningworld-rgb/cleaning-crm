import { filesJson } from "@/lib/files";
import { NextRequest } from "next/server";
import { cleanEmail, createPasswordLink } from "@/lib/pg/portal-auth";
import { isNonProduction, passwordLinkEmail, passwordLinkUrl } from "@/lib/portalAuth";
import { sendCustomerEmail } from "@/lib/email";
import { checkRateLimit } from "@/lib/siteLinkRateLimit";

// POST { email, kind: "set" | "reset" }: emails a "Set your password" link.
//
// The answer is the same whether or not the email belongs to a customer, so
// nobody can use this to find out who is one.
//
// Outside production, and only for an email whose accounts are all test
// accounts, the link is also returned so it can be shown on screen (emails
// are dry-run there). A real customer's link is never returned.
//
// Limits, so nobody can flood a customer's inbox: 3 links an hour for one
// email, 20 an hour from one network address. Over a limit the answer is the
// same "on its way" (nothing tells which emails are customers), but no email
// goes out.
const LINKS_PER_EMAIL_PER_HOUR = 3;
const LINKS_PER_ADDRESS_PER_HOUR = 20;
const HOUR = 60 * 60;

export async function POST(request: NextRequest) {
  let body: { email?: unknown; kind?: unknown };
  try {
    body = await request.json();
  } catch {
    return filesJson({ error: "Invalid request." }, { status: 400 });
  }
  const email = cleanEmail(body.email);
  const kind = body.kind === "reset" ? "reset" : "set";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return filesJson({ error: "email" }, { status: 400 });
  }

  const address = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const allowed =
    (await checkRateLimit(`portal-link-address:${address}`, LINKS_PER_ADDRESS_PER_HOUR, HOUR)) && (await checkRateLimit(`portal-link-email:${email}`, LINKS_PER_EMAIL_PER_HOUR, HOUR));
  if (!allowed) {
    console.warn("[portal/auth/link] over the hourly limit: no email sent");
    return filesJson({ success: true });
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
    return filesJson({ success: true, ...(devLink ? { devLink } : {}) });
  } catch (err) {
    console.error("[portal/auth/link]", err instanceof Error ? err.message : err);
    return filesJson({ error: "server" }, { status: 500 });
  }
}
