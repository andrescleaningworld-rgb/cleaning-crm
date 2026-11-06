import { CHEER } from "@/app/ui/words";
import { Resend } from "resend";
import nodemailer, { type Transporter } from "nodemailer";
import { isOutboundDryRun, logDryRun } from "./outbound";
import { BILLING_EMAIL, SERVICE_EMAIL } from "./portalContacts";
import { logEmail, type EmailLogMeta } from "./pg/email-log";

// Every email the CRM sends goes through this file, on one of two providers:
//
//   EMAIL_PROVIDER=gmail (the default while unset)  Gmail SMTP, GMAIL_USER +
//                                                   GMAIL_APP_PASSWORD
//   EMAIL_PROVIDER=resend                           Resend, RESEND_API_KEY +
//                                                   RESEND_FROM ("Cleaning World
//                                                   <crm@cleaningworldinc.com>"),
//                                                   once the domain is verified
//
// The same on both, for every email:
//   - From name "Cleaning World" (SENDER_NAME).
//   - Reply-To crm@cleaningworldinc.com (EMAIL_REPLY_TO overrides it) unless
//     the email sets its own (the welcome packet: the account manager).
//   - A plain-text version and an HTML version. Emails written as lines get
//     a simple HTML copy of the same lines.
//   - A failed send is written to the Email log with the provider's error
//     (with or without the caller's own log details), and to the server log.
//   - OUTBOUND_DRY_RUN: nothing is sent, a line is logged instead.

/** The name every email is sent from. */
export const SENDER_NAME = "Cleaning World";
/** Where answers go when an email does not say. */
export const DEFAULT_REPLY_TO = (process.env.EMAIL_REPLY_TO ?? "").trim() || "crm@cleaningworldinc.com";

// Shared attachment shape between the Resend and Gmail/nodemailer transports
// below — both accept a Buffer `content` directly, so callers (e.g.
// /api/documents/send) don't need to know which provider is active.
export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

type Outgoing = {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
};

function provider(): "resend" | "gmail" {
  return (process.env.EMAIL_PROVIDER || "gmail").trim().toLowerCase() === "resend" ? "resend" : "gmail";
}

/**
 * The Email log (lib/pg/email-log.ts): with `meta`, the send is written to
 * the log as sent or failed, with exactly what was sent. Without it, only a
 * failed send is written (as `kind`, e.g. "Internal notification"), so every
 * failure shows in the log. Logging never changes what the send returns or throws.
 */
async function logged(meta: EmailLogMeta | undefined, base: Outgoing, send: () => Promise<boolean>, kind = "Email"): Promise<boolean> {
  const entry = {
    ...(meta ?? { type: kind, sentBy: "System" }),
    to: base.to,
    cc: base.cc,
    subject: base.subject,
    html: base.html,
    text: base.text,
    attachments: (base.attachments ?? []).map((file) => file.filename),
  };
  try {
    const sent = await send();
    if (meta || !sent) await logEmail({ ...entry, status: sent ? "sent" : "failed", error: sent ? "" : `No email sender is set up here (${provider()}).` });
    return sent;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[email] "${base.subject}" to ${base.to.join(", ")} failed:`, message);
    await logEmail({ ...entry, status: "failed", error: message });
    throw error;
  }
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A plain, readable HTML copy of an email written as lines: blank lines split paragraphs, links can be tapped. */
export function linesToHtml(lines: string[]): string {
  const paragraphs: string[][] = [[]];
  for (const line of lines) {
    if (line.trim() === "") {
      if (paragraphs[paragraphs.length - 1].length > 0) paragraphs.push([]);
    } else {
      paragraphs[paragraphs.length - 1].push(line);
    }
  }
  const linkify = (text: string) => escapeHtml(text).replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}" style="color:#005bbb;">${url}</a>`);
  const body = paragraphs
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => `<p style="margin:0 0 14px;">${paragraph.map(linkify).join("<br>")}</p>`)
    .join("");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body style="margin:0;padding:16px;background:#ffffff;"><div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1f2937;max-width:600px;">${body}</div></body></html>`;
}

/** RESEND_FROM's address, with the sender name: "Cleaning World <crm@cleaningworldinc.com>". */
function resendFrom(): string {
  const raw = (process.env.RESEND_FROM ?? "").trim() || "onboarding@resend.dev";
  const address = /<([^>]+)>/.exec(raw)?.[1]?.trim() || raw;
  return `${SENDER_NAME} <${address}>`;
}

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

/**
 * Sends one email on the active provider. false = no sender is set up here
 * (no key / password); a provider error is thrown with its message.
 */
async function deliver(input: Outgoing): Promise<boolean> {
  const cc = input.cc?.length ? input.cc : undefined;
  const replyTo = input.replyTo?.trim() || DEFAULT_REPLY_TO;
  const attachments = input.attachments?.length ? input.attachments : undefined;
  if (isOutboundDryRun()) {
    logDryRun("email", `to ${input.to.join(", ")}${cc ? ` cc ${cc.join(", ")}` : ""} – "${input.subject}" (reply to ${replyTo}, ${attachments?.length ?? 0} attachments)`);
    return true;
  }

  if (provider() === "resend") {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return false;
    // The Resend SDK resolves (doesn't throw) on an API-level rejection —
    // e.g. an unverified domain. That is turned into an error here, so the
    // Email log and the caller see it, the same as a Gmail SMTP failure.
    const result = await new Resend(apiKey).emails.send({
      from: resendFrom(),
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      replyTo,
      ...(cc ? { cc } : {}),
      ...(attachments ? { attachments } : {}),
    });
    if (result.error) {
      const name = (result.error as { name?: string }).name;
      throw new Error(`Resend rejected the send${name ? ` (${name})` : ""}: ${result.error.message}`);
    }
    return true;
  }

  const transporter = getGmailTransporter();
  if (!transporter) return false;
  // sendMail() rejects (throws) on an SMTP-level failure.
  await transporter.sendMail({
    from: { name: SENDER_NAME, address: process.env.GMAIL_USER ?? "" },
    to: input.to.join(", "),
    subject: input.subject,
    text: input.text,
    html: input.html,
    replyTo,
    ...(cc ? { cc: cc.join(", ") } : {}),
    ...(attachments ? { attachments } : {}),
  });
  return true;
}

// An email written as lines: sent as plain text with an HTML copy of the same
// lines. Emails to staff and subcontractors end with the house rule; emails to
// customers do not.
function sendLinesEmail(kind: string, to: string[], subject: string, bodyLines: string[], attachments?: EmailAttachment[], withMotto = true, log?: EmailLogMeta): Promise<boolean> {
  const lines = withMotto ? [...bodyLines, "", CHEER.emailLine] : bodyLines;
  const outgoing: Outgoing = { to, subject, text: lines.join("\n"), html: linesToHtml(lines), attachments };
  return logged(log, outgoing, () => deliver(outgoing), kind);
}

// Fixed-recipient internal ops notification — same two addresses the old
// Apps Script addComplaint's sendInternalNotificationEmail used
// (INTERNAL_NOTIFICATION_EMAIL), fired unconditionally on every new
// complaint. Returns false (not thrown) when the active provider's
// credentials aren't configured (see EMAIL_PROVIDER above). `attachments`
// is optional and only used by the Equipment Check report email (photos).
export async function sendInternalNotification(subject: string, lines: string[], attachments?: EmailAttachment[]): Promise<boolean> {
  return sendLinesEmail("Internal notification", ["info@cleaningworldinc.com", "crm@cleaningworldinc.com"], subject, lines, attachments);
}

// An email with its own HTML layout and a plain-text twin. Sent exactly as
// written: no line is added. `cc`, `replyTo` and `attachments` are optional
// (the customer welcome packet uses them: a copy to the office, answers go to
// the account manager, the PDF). The From name is always SENDER_NAME;
// `fromName` is kept so older callers still compile, and is not used.
export async function sendHtmlEmail(input: {
  to: string[];
  subject: string;
  text: string;
  html: string;
  /** @deprecated Every email is from SENDER_NAME. */
  fromName?: string;
  cc?: string[];
  replyTo?: string;
  attachments?: EmailAttachment[];
  /** Write it to the Email log (type, account, sub, who sent it). */
  log?: EmailLogMeta;
}): Promise<boolean> {
  const outgoing: Outgoing = { to: input.to, cc: input.cc, subject: input.subject, text: input.text, html: input.html, replyTo: input.replyTo, attachments: input.attachments };
  return logged(input.log, outgoing, () => deliver(outgoing));
}

// One notice to one person on the team (the Account Updates "notify" email).
export async function sendStaffNotification(to: string, subject: string, lines: string[]): Promise<boolean> {
  return sendLinesEmail("Staff notification", [to], subject, lines);
}

// One email to one customer (the portal's "Set your password" link).
export async function sendCustomerEmail(to: string, subject: string, lines: string[], log?: EmailLogMeta): Promise<boolean> {
  return sendLinesEmail("Customer email", [to], subject, lines, undefined, false, log);
}

// Subcontractor-facing notification — replaces the old Apps Script
// addComplaint's sendComplaintNotificationToSubcontractor. Caller is
// responsible for resolving `to` (see findSubcontractorEmailByName in
// app/api/subcontractors/route.ts) and for the same gating the old
// function had (only send when there's an assigned subcontractor).
export async function sendSubcontractorNotification(to: string, subject: string, lines: string[], attachments?: EmailAttachment[], log?: EmailLogMeta): Promise<boolean> {
  return sendLinesEmail("Subcontractor notification", [to], subject, lines, attachments, true, log);
}

export async function sendPortalNotification({
  subject,
  accountName,
  accountId,
  lines,
  to = [BILLING_EMAIL, SERVICE_EMAIL],
}: {
  subject: string;
  accountName: string;
  accountId: string;
  lines: string[];
  /** Who gets it. Problems and extra cleaning requests go to the service address only (lib/portalContacts.ts). */
  to?: string[];
}): Promise<void> {
  // The request is already saved when this runs, so a notice that does not
  // go out must never make the customer's request look failed (they would
  // send it again). It is logged instead (and a failure is in the Email log).
  try {
    const sent = await sendLinesEmail("Portal notification", to, `[Portal] ${subject} — ${accountName}`, [`New portal submission from: ${accountName} (${accountId})`, "", ...lines, "", "— Cleaning World Customer Portal"]);
    if (!sent) console.error(`[portal notice] not sent (no email sender is set up here): "${subject}"`);
  } catch (error) {
    console.error(`[portal notice] not sent: "${subject}":`, error instanceof Error ? error.message : error);
  }
}
