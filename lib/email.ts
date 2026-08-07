import { Resend } from "resend";

// Requires RESEND_API_KEY in .env.local — silently skips if not set.
// Also requires a verified sending domain in Resend dashboard.
// Set RESEND_FROM to your verified address, e.g. portal@cleaningworldinc.com
// Until domain is verified you can use: onboarding@resend.dev (sends to your Resend account email only)

async function sendPlainTextEmail(to: string[], subject: string, lines: string[]): Promise<boolean> {
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
  });

  if (result.error) {
    throw new Error(`Resend rejected the send: ${result.error.message}`);
  }

  return true;
}

// Fixed-recipient internal ops notification — same two addresses the old
// Apps Script addComplaint's sendInternalNotificationEmail used
// (INTERNAL_NOTIFICATION_EMAIL), fired unconditionally on every new
// complaint. Returns false (not thrown) when RESEND_API_KEY is unset, same
// fault-isolation contract as sendPortalNotification below.
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
  lines: string[]
): Promise<boolean> {
  return sendPlainTextEmail([to], subject, lines);
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
