// The "Invite to portal" email to a sub: the same words as the text message
// (lib/subPortalInvite.ts), with the Cleaning World header and a big green
// "Open your portal" button per language. Sent by sendHtmlEmail (lib/email.ts):
// the provider picked by EMAIL_PROVIDER and the dry-run switch, like every
// other email. Server only.

import { sendHtmlEmail } from "@/lib/email";
import { INVITE_LANGUAGES, subInviteText } from "@/lib/subPortalInvite";

// Same logo and sender name as the transfer proposal email (lib/pg/sub-transfers.ts).
const LOGO_URL = "https://cleaning-crm-xi.vercel.app/cw-logo.jpg";
const SENDER_NAME = "Cleaning World App";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

export function subInviteHtml(url: string, email: string, subName: string): string {
  const link = escapeHtml(url);
  const languages = INVITE_LANGUAGES.map(
    (lang, index) =>
      `<div style="${index > 0 ? "border-top:1px solid #e5e7eb;margin-top:22px;padding-top:22px;" : ""}">` +
      `<h2 style="margin:0 0 10px;font-size:20px;color:#003b7a;">${escapeHtml(lang.title)}</h2>` +
      `<p style="margin:0 0 12px;font-size:16px;font-weight:700;color:#0f172a;">${escapeHtml(lang.login(email))}</p>` +
      `<ul style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.7;color:#334155;">${lang.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ul>` +
      `<div style="text-align:center;margin:18px 0;">` +
      `<a href="${link}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:16px 28px;border-radius:14px;font-size:18px;font-weight:900;">${escapeHtml(lang.button)}</a>` +
      `</div>` +
      `<p style="margin:0;font-size:14px;color:#475569;">${escapeHtml(lang.questions)}</p>` +
      `</div>`
  ).join("");

  return (
    '<div style="margin:0;padding:0;background:#eef4fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">' +
    '<div style="max-width:640px;margin:0 auto;padding:24px;">' +
    '<div style="background:linear-gradient(135deg,#003b7a 0%,#005bbb 55%,#00a8e8 100%);border-radius:24px;padding:28px;color:white;">' +
    '<table role="presentation" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="background:white;border-radius:16px;padding:10px;width:130px;height:70px;text-align:center;vertical-align:middle;">' +
    `<img src="${LOGO_URL}" alt="Cleaning World" style="max-width:100%;max-height:100%;" />` +
    "</td>" +
    '<td style="padding-left:16px;">' +
    '<div style="font-size:27px;font-weight:900;line-height:1;">Cleaning World</div>' +
    '<div style="font-size:14px;font-weight:700;margin-top:6px;color:rgba(255,255,255,0.92);">Sub Portal</div>' +
    "</td></tr></table>" +
    "</div>" +
    '<div style="background:white;border-radius:24px;margin-top:18px;padding:28px;border:1px solid #dbeafe;">' +
    (subName ? `<p style="margin:0 0 18px;font-size:16px;">Hi ${escapeHtml(subName)},</p>` : "") +
    languages +
    `<p style="margin:24px 0 0;font-size:12px;color:#64748b;word-break:break-all;">${link}</p>` +
    "</div>" +
    "</div>" +
    "</div>"
  );
}

/** Sends the invite to `email`. False when no email provider is set up here (as sendHtmlEmail). */
export async function sendSubInviteEmail(input: { email: string; url: string; subName: string }): Promise<boolean> {
  return sendHtmlEmail({
    to: [input.email],
    subject: "Your Cleaning World Sub Portal / Tu portal / Seu portal",
    text: subInviteText(input.url, input.email),
    html: subInviteHtml(input.url, input.email, input.subName),
    fromName: SENDER_NAME,
  });
}
