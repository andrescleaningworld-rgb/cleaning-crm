import { Resend } from "resend";
import nodemailer, { type Transporter } from "nodemailer";

// Requires RESEND_API_KEY in .env.local — silently skips if not set.
// Also requires a verified sending domain in Resend dashboard.
// Set RESEND_FROM to your verified address, e.g. portal@cleaningworldinc.com
// Until domain is verified you can use: onboarding@resend.dev (sends to your Resend account email only)

// Shared attachment shape between the Resend and Gmail/nodemailer transports
// below — both accept a Buffer `content` directly, so callers (e.g.
// /api/documents/send) don't need to know which provider is active.
export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

async function sendViaResend(
  to: string[],
  subject: string,
  lines: string[],
  attachments?: EmailAttachment[]
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM ?? "onboarding@resend.dev";

  // The Resend SDK resolves (doesn't throw) on an API-level rejection —
  // e.g. the sandbox `onboarding@resend.dev` sender 403s on any recipient
  // other than the account owner's own address. Callers' try/catch around
  // this can't see that unless we surface it here.
  const result = await resend.emails.send({
    from,
    to,
    subject,
    text: lines.join("\n"),
    ...(attachments?.length ? { attachments } : {}),
  });

  if (result.error) {
    throw new Error(`Resend rejected the send: ${result.error.message}`);
  }

  return true;
}

// Stopgap transport while cleaningworldinc.com is unverified in Resend
// (verification is blocked on DNS access, owned by the web person). Gmail
// SMTP via an app password sends real mail today; swap EMAIL_PROVIDER back
// to "resend" once the domain is verified — no code changes needed.
// Requires GMAIL_USER (the sending Gmail address) and GMAIL_APP_PASSWORD
// (a 16-char app password, NOT the account password — generate one at
// myaccount.google.com/apppasswords) in .env.local / Vercel env vars.
let gmailTransporter: Transporter | null = null;

function getGmailTransporter(): Transporter | null {
  const user = process.env.GMAIL_USER;
  // Google displays app passwords with spaces every 4 chars for
  // readability; strip them so it works whether or not they're pasted in.
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!user || !pass) return null;

  if (!gmailTransporter) {
    gmailTransporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
    });
  }

  return gmailTransporter;
}

async function sendViaGmail(
  to: string[],
  subject: string,
  lines: string[],
  attachments?: EmailAttachment[]
): Promise<boolean> {
  const transporter = getGmailTransporter();
  if (!transporter) return false;

  // sendMail() rejects (throws) on an SMTP-level failure, unlike Resend's
  // SDK above — callers' existing try/catch already sees that correctly.
  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: to.join(", "),
    subject,
    text: lines.join("\n"),
    ...(attachments?.length ? { attachments } : {}),
  });

  return true;
}

// EMAIL_PROVIDER selects the transport for sendInternalNotification and
// sendSubcontractorNotification below — defaults to "gmail" (the current
// stopgap) when unset, so no env var needs to be added anywhere to use it.
// Set EMAIL_PROVIDER=resend to switch back once the domain is verified.
// sendPortalNotification is unaffected — it calls Resend directly.
function sendPlainTextEmail(
  to: string[],
  subject: string,
  lines: string[],
  attachments?: EmailAttachment[]
): Promise<boolean> {
  const provider = (process.env.EMAIL_PROVIDER || "gmail").trim().toLowerCase();
  return provider === "resend"
    ? sendViaResend(to, subject, lines, attachments)
    : sendViaGmail(to, subject, lines, attachments);
}

// Fixed-recipient internal ops notification — same two addresses the old
// Apps Script addComplaint's sendInternalNotificationEmail used
// (INTERNAL_NOTIFICATION_EMAIL), fired unconditionally on every new
// complaint. Returns false (not thrown) when the active provider's
// credentials aren't configured (see EMAIL_PROVIDER above).
export async function sendInternalNotification(subject: string, lines: string[]): Promise<boolean> {
  return sendPlainTextEmail(
    ["info@cleaningworldinc.com", "crm@cleaningworldinc.com"],
    subject,
    lines
  );
}

// Subcontractor-facing notification — replaces the old Apps Script
// addComplaint's sendComplaintNotificationToSubcontractor. Caller is
// responsible for resolving `to` (see findSubcontractorEmailByName in
// app/api/subcontractors/route.ts) and for the same gating the old
// function had (only send when there's an assigned subcontractor).
export async function sendSubcontractorNotification(
  to: string,
  subject: string,
  lines: string[],
  attachments?: EmailAttachment[]
): Promise<boolean> {
  return sendPlainTextEmail([to], subject, lines, attachments);
}

export async function sendPortalNotification({
  subject,
  accountName,
  accountId,
  lines,
}: {
  subject: string;
  accountName: string;
  accountId: string;
  lines: string[];
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM ?? "onboarding@resend.dev";

  const body = [
    `New portal submission from: ${accountName} (${accountId})`,
    "",
    ...lines,
    "",
    "— Cleaning World Customer Portal",
  ].join("\n");

  await resend.emails.send({
    from,
    to: ["info@cleaningworldinc.com", "crm@cleaningworldinc.com"],
    subject: `[Portal] ${subject} — ${accountName}`,
    text: body,
  });
}
