import { CHEER } from "@/app/ui/words";
import { Resend } from "resend";
import nodemailer, { type Transporter } from "nodemailer";
import { isOutboundDryRun, logDryRun } from "./outbound";
import { BILLING_EMAIL, SERVICE_EMAIL } from "./portalContacts";
import { logEmail, type EmailLogMeta } from "./pg/email-log";

/**
 * The Email log (lib/pg/email-log.ts): with `meta`, the send is written to
 * the log as sent or failed, with exactly what was sent. Without it, the
 * send is as before. Logging never changes what the send returns or throws.
 */
async function logged(
  meta: EmailLogMeta | undefined,
  base: { to: string[]; cc?: string[]; subject: string; html?: string; text?: string; attachments?: EmailAttachment[] },
  send: () => Promise<boolean>
): Promise<boolean> {
  if (!meta) return send();
  const entry = { ...meta, to: base.to, cc: base.cc, subject: base.subject, html: base.html, text: base.text, attachments: (base.attachments ?? []).map((file) => file.filename) };
  try {
    const sent = await send();
    await logEmail({ ...entry, status: sent ? "sent" : "failed", error: sent ? "" : "No email sender is set up here." });
    return sent;
  } catch (error) {
    await logEmail({ ...entry, status: "failed", error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

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
// sendPortalNotification goes the same way as the rest (it used to call
// Resend directly, and so sent nothing where there is no Resend key).
function sendPlainTextEmail(
  to: string[],
  subject: string,
  bodyLines: string[],
  attachments?: EmailAttachment[],
  // Emails to staff and subcontractors end with the house rule. Emails to
  // customers do not.
  withMotto = true
): Promise<boolean> {
  const lines = withMotto ? [...bodyLines, "", CHEER.emailLine] : bodyLines;
  if (isOutboundDryRun()) {
    logDryRun("email", `to ${to.join(", ")} – "${subject}" (${lines.length} lines, ${attachments?.length ?? 0} attachments)`);
    return Promise.resolve(true);
  }

  const provider = (process.env.EMAIL_PROVIDER || "gmail").trim().toLowerCase();
  return provider === "resend"
    ? sendViaResend(to, subject, lines, attachments)
    : sendViaGmail(to, subject, lines, attachments);
}

// Fixed-recipient internal ops notification — same two addresses the old
// Apps Script addComplaint's sendInternalNotificationEmail used
// (INTERNAL_NOTIFICATION_EMAIL), fired unconditionally on every new
// complaint. Returns false (not thrown) when the active provider's
// credentials aren't configured (see EMAIL_PROVIDER above). `attachments`
// is optional and only used by the Equipment Check report email (photos);
// every existing caller passes two arguments and is unaffected.
export async function sendInternalNotification(
  subject: string,
  lines: string[],
  attachments?: EmailAttachment[]
): Promise<boolean> {
  return sendPlainTextEmail(
    ["info@cleaningworldinc.com", "crm@cleaningworldinc.com"],
    subject,
    lines,
    attachments
  );
}

// An email with its own HTML layout and a plain-text twin (the transfer
// proposal to a subcontractor, and the office notice when they answer).
// Sent exactly as written: no line is added. Same provider and the same
// dry-run switch as every other email. `fromName` is the sender's name.
// `cc`, `replyTo` and `attachments` are optional (the customer welcome packet
// uses them: a copy to the office, answers go to the account manager, the PDF).
export async function sendHtmlEmail(input: {
  to: string[];
  subject: string;
  text: string;
  html: string;
  fromName?: string;
  cc?: string[];
  replyTo?: string;
  attachments?: EmailAttachment[];
  /** Write it to the Email log (type, account, sub, who sent it). */
  log?: EmailLogMeta;
}): Promise<boolean> {
  return logged(input.log, input, () => deliverHtmlEmail(input));
}

async function deliverHtmlEmail(input: {
  to: string[];
  subject: string;
  text: string;
  html: string;
  fromName?: string;
  cc?: string[];
  replyTo?: string;
  attachments?: EmailAttachment[];
}): Promise<boolean> {
  const cc = input.cc?.length ? input.cc : undefined;
  const replyTo = input.replyTo || undefined;
  const attachments = input.attachments?.length ? input.attachments : undefined;
  if (isOutboundDryRun()) {
    logDryRun("email", `to ${input.to.join(", ")}${cc ? ` cc ${cc.join(", ")}` : ""} – "${input.subject}" (HTML, ${input.html.length} characters, ${attachments?.length ?? 0} attachments)`);
    return true;
  }
  const provider = (process.env.EMAIL_PROVIDER || "gmail").trim().toLowerCase();
  if (provider === "resend") {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return false;
    const address = process.env.RESEND_FROM ?? "onboarding@resend.dev";
    const result = await new Resend(apiKey).emails.send({
      from: input.fromName && !address.includes("<") ? `${input.fromName} <${address}>` : address,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      ...(cc ? { cc } : {}),
      ...(replyTo ? { replyTo } : {}),
      ...(attachments ? { attachments } : {}),
    });
    if (result.error) throw new Error(`Resend rejected the send: ${result.error.message}`);
    return true;
  }
  const transporter = getGmailTransporter();
  if (!transporter) return false;
  await transporter.sendMail({
    from: input.fromName ? { name: input.fromName, address: process.env.GMAIL_USER ?? "" } : process.env.GMAIL_USER,
    to: input.to.join(", "),
    subject: input.subject,
    text: input.text,
    html: input.html,
    ...(cc ? { cc: cc.join(", ") } : {}),
    ...(replyTo ? { replyTo } : {}),
    ...(attachments ? { attachments } : {}),
  });
  return true;
}

// One notice to one person on the team (the Account Updates "notify" email).
export async function sendStaffNotification(to: string, subject: string, lines: string[]): Promise<boolean> {
  return sendPlainTextEmail([to], subject, lines);
}

// One email to one customer (the portal's "Set your password" link). Plain
// text, through the same provider and the same dry-run switch as the rest.
export async function sendCustomerEmail(to: string, subject: string, lines: string[], log?: EmailLogMeta): Promise<boolean> {
  return logged(log, { to: [to], subject, text: lines.join("\n") }, () => sendPlainTextEmail([to], subject, lines, undefined, false));
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
  attachments?: EmailAttachment[],
  log?: EmailLogMeta
): Promise<boolean> {
  return logged(log, { to: [to], subject, text: [...lines, "", CHEER.emailLine].join("\n"), attachments }, () => sendPlainTextEmail([to], subject, lines, attachments));
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
  // The same sender as every other email the app sends (Gmail unless
  // EMAIL_PROVIDER says otherwise), and the same dry run: there the log line
  // says who it would have gone to, which is how a preview shows where an
  // email goes.
  //
  // The request is already saved when this runs, so a notice that does not
  // go out must never make the customer's request look failed (they would
  // send it again). It is logged instead.
  try {
    const sent = await sendPlainTextEmail(to, `[Portal] ${subject} — ${accountName}`, [`New portal submission from: ${accountName} (${accountId})`, "", ...lines, "", "— Cleaning World Customer Portal"]);
    if (!sent) console.error(`[portal notice] not sent (no email sender is set up here): "${subject}"`);
  } catch (error) {
    console.error(`[portal notice] not sent: "${subject}":`, error instanceof Error ? error.message : error);
  }
}
