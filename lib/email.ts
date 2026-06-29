import { Resend } from "resend";

// Requires RESEND_API_KEY in .env.local — silently skips if not set.
// Also requires a verified sending domain in Resend dashboard.
// Set RESEND_FROM to your verified address, e.g. portal@cleaningworldinc.com
// Until domain is verified you can use: onboarding@resend.dev (sends to your Resend account email only)

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
