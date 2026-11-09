// Tell the sub about a complaint: an email (English, Spanish and Portuguese
// in one, like the sub portal invite, with a button to the complaint in the
// sub portal) and a short text with no link (Textbelt refuses links until
// the account is verified; SMS_INCLUDE_LINKS=1 adds the link back).
//
// The sub is the one who has the complaint's account now (accounts.
// subcontractor_id, else the sub whose company or contact name is the
// account's Subcontractor text). Each channel is written to the complaint's
// events (sent / failed / skipped, and why). Never throws for a failed send:
// the complaint is already saved. Server only.

import { getSql } from "@/lib/db";
import { sendHtmlEmail } from "@/lib/email";
import { sendSms, sanitizeSmsText, smsLinksOn } from "@/lib/sms";
import { addComplaintEvent, complaintRowId, listComplaintEvents } from "@/lib/pg/complaint-events";
import { complaintPhotoMap } from "@/lib/pg/complaint-detail";
import { SUB_PORTAL_PATH } from "@/lib/subPortalInvite";

const LOGO_URL = "https://cleaning-crm-xi.vercel.app/cw-logo.jpg";

export type NoticeStatus = "sent" | "failed" | "skipped";
export type SubNoticeResult = { email: NoticeStatus; text: NoticeStatus; subName: string; reasons: string[] };

type Row = {
  id: number | string;
  complaint_id: string;
  sheet_row: number;
  account_ref: string | null;
  account_name: string;
  issue: string;
  notes: string;
  day: string | null;
  sub_id: string | null;
  contact_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
};

const clean = (value: unknown) => String(value ?? "").trim();
const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

function niceDay(day: string | null): string {
  if (!day) return "";
  const date = new Date(`${day.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? day : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** The three languages, in the order of the sub portal invite. */
const WORDS = [
  { title: "New complaint", intro: (account: string, day: string) => `A complaint came in for ${account}${day ? ` on ${day}` : ""}.`, ask: "Please fix it, then mark it resolved in your portal." },
  { title: "Nueva queja", intro: (account: string, day: string) => `Llegó una queja para ${account}${day ? ` el ${day}` : ""}.`, ask: "Por favor corrígelo y márcalo como resuelto en tu portal." },
  { title: "Nova reclamação", intro: (account: string, day: string) => `Chegou uma reclamação para ${account}${day ? ` em ${day}` : ""}.`, ask: "Por favor, corrija e marque como resolvido no seu portal." },
];

export function subComplaintEmail(input: { account: string; day: string; description: string; photos: number; link: string; subName: string }) {
  const { account, day, description, photos, link, subName } = input;
  const subject = `New complaint: ${account} / Nueva queja / Nova reclamação`;
  const photoLine = photos > 0 ? `${photos} photo${photos === 1 ? "" : "s"} / foto${photos === 1 ? "" : "s"}` : "";
  const button = "Open your portal / Abrir tu portal / Abrir o seu portal";

  const text = [
    ...WORDS.map((w) => `${w.title}: ${w.intro(account, day)} ${w.ask}`),
    "",
    `What was reported / Lo que se reportó / O que foi relatado:`,
    description || "-",
    photoLine,
    "",
    link,
  ]
    .filter((line, index, all) => line !== "" || all[index - 1] !== "")
    .join("\n");

  const html =
    '<div style="margin:0;padding:0;background:#eef4fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">' +
    '<div style="max-width:640px;margin:0 auto;padding:24px;">' +
    '<div style="background:linear-gradient(135deg,#003b7a 0%,#005bbb 55%,#00a8e8 100%);border-radius:24px;padding:24px;color:white;">' +
    '<table role="presentation" cellpadding="0" cellspacing="0"><tr>' +
    `<td style="background:white;border-radius:16px;padding:10px;width:110px;height:60px;text-align:center;vertical-align:middle;"><img src="${LOGO_URL}" alt="Cleaning World" style="max-width:100%;max-height:100%;" /></td>` +
    '<td style="padding-left:16px;"><div style="font-size:24px;font-weight:900;line-height:1.1;">New complaint<br/>Nueva queja · Nova reclamação</div></td>' +
    "</tr></table></div>" +
    '<div style="background:white;border-radius:24px;margin-top:18px;padding:24px;border:1px solid #dbeafe;">' +
    (subName ? `<p style="margin:0 0 14px;font-size:16px;">Hi ${escapeHtml(subName)},</p>` : "") +
    `<p style="margin:0 0 4px;font-size:22px;font-weight:900;color:#003b7a;">${escapeHtml(account)}</p>` +
    (day ? `<p style="margin:0 0 16px;font-size:16px;color:#475569;">${escapeHtml(day)}</p>` : "") +
    '<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:16px;padding:16px;margin:0 0 16px;">' +
    '<p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#9a3412;">What was reported / Lo que se reportó / O que foi relatado</p>' +
    `<p style="margin:0;font-size:17px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(description || "-")}</p>` +
    (photoLine ? `<p style="margin:10px 0 0;font-size:15px;font-weight:700;">📷 ${escapeHtml(photoLine)}</p>` : "") +
    "</div>" +
    WORDS.map((w, index) => `<p style="margin:${index === 0 ? "0" : "10px"} 0 0;font-size:16px;line-height:1.5;"><strong>${escapeHtml(w.title)}:</strong> ${escapeHtml(w.ask)}</p>`).join("") +
    `<div style="text-align:center;margin:22px 0 8px;"><a href="${escapeHtml(link)}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:16px 26px;border-radius:14px;font-size:18px;font-weight:900;">${escapeHtml(button)}</a></div>` +
    `<p style="margin:16px 0 0;font-size:12px;color:#64748b;word-break:break-all;">${escapeHtml(link)}</p>` +
    "</div></div></div>";

  return { subject, text, html };
}

/** The text: no link (and plain letters only, so it stays a single short text). */
export function subComplaintText(account: string, link: string): string {
  const name = sanitizeSmsText(account, 60) || "an account";
  const lines = [
    `New complaint for ${name}. Check your sub portal.`,
    `Nueva queja para ${name}. Revisa tu portal.`,
    `Nova reclamacao para ${name}. Veja seu portal.`,
  ];
  if (smsLinksOn()) lines.push(link);
  return sanitizeSmsText(lines.join("\n"), Infinity);
}

/** Sends the email and the text to the account's sub, and writes both to the complaint's events. */
export async function notifySubOfComplaint(input: { key: string; origin: string; by?: string }): Promise<SubNoticeResult> {
  const by = input.by || "System";
  const rowId = await complaintRowId(input.key);
  if (rowId === null) throw new Error("Complaint not found.");

  const rows = (await getSql().query(
    `SELECT c.id, btrim(c.complaint_id) AS complaint_id, c.sheet_row, c.account_ref, c.account_name, c.issue, c.notes, c.complaint_date::text AS day,
            s.id AS sub_id, s.contact_name, s.company_name, s.email, s.phone
     FROM complaints c
     LEFT JOIN accounts a ON a.id = c.account_ref
     -- The account's sub by its ID. Only when the account has no sub ID: the
     -- one sub whose COMPANY name is exactly the account's Subcontractor text,
     -- and only if no other sub has that company name. Never a contact name
     -- (two subs can have a contact with the same first name).
     LEFT JOIN LATERAL (
       SELECT x.id, x.contact_name, x.company_name, x.email, x.phone FROM subcontractors x
       WHERE x.id = a.subcontractor_id
          OR (a.subcontractor_id IS NULL AND btrim(a.subcontractor_raw) <> ''
              AND lower(btrim(x.company_name)) = lower(btrim(a.subcontractor_raw))
              AND (SELECT count(*) FROM subcontractors y WHERE lower(btrim(y.company_name)) = lower(btrim(a.subcontractor_raw))) = 1)
       ORDER BY (x.id = a.subcontractor_id) DESC
       LIMIT 1
     ) s ON true
     WHERE c.id = $1`,
    [rowId]
  )) as Row[];
  const row = rows[0];
  if (!row) throw new Error("Complaint not found.");

  const subName = clean(row.company_name) || clean(row.contact_name);
  const result: SubNoticeResult = { email: "skipped", text: "skipped", subName, reasons: [] };
  const account = clean(row.account_name) || "an account";

  if (!row.sub_id) {
    const reason = "No sub is set on this complaint's account.";
    result.reasons.push(reason);
    await addComplaintEvent({ complaintId: rowId, kind: "sub_notified", channel: "email", status: "skipped", detail: reason, by });
    await addComplaintEvent({ complaintId: rowId, kind: "sub_notified", channel: "text", status: "skipped", detail: reason, by });
    return result;
  }

  const key = clean(row.complaint_id) || String(row.sheet_row);
  const link = `${input.origin.replace(/\/$/, "")}${SUB_PORTAL_PATH}?complaint=${encodeURIComponent(key)}`;
  const photos = await complaintPhotoMap([{ id: key, notes: row.notes }])
    .then((map) => (map.get(key) ?? []).length)
    .catch(() => 0);

  // Email
  const email = clean(row.email);
  if (!email) {
    result.reasons.push("No email on file for the sub.");
    await addComplaintEvent({ complaintId: rowId, kind: "sub_notified", channel: "email", status: "skipped", detail: `No email on file for ${subName || "the sub"}.`, by });
  } else {
    const message = subComplaintEmail({ account, day: niceDay(row.day), description: clean(row.issue), photos, link, subName: clean(row.contact_name) || subName });
    try {
      const sent = await sendHtmlEmail({
        to: [email],
        subject: message.subject,
        text: message.text,
        html: message.html,
        log: { type: "Complaint to sub", accountId: row.account_ref ?? undefined, accountName: account, subId: row.sub_id, subName, sentBy: by },
      });
      result.email = sent ? "sent" : "failed";
      if (!sent) result.reasons.push("No email sender is set up here.");
      await addComplaintEvent({ complaintId: rowId, kind: "sub_notified", channel: "email", status: result.email, detail: sent ? `To ${email}` : `Not sent to ${email}: no email sender is set up.`, by });
    } catch (error) {
      result.email = "failed";
      const why = error instanceof Error ? error.message : "Unknown error";
      result.reasons.push(`Email failed: ${why}`);
      await addComplaintEvent({ complaintId: rowId, kind: "sub_notified", channel: "email", status: "failed", detail: `To ${email}: ${why}`, by });
    }
  }

  // Text
  const phone = clean(row.phone);
  if (!phone) {
    result.reasons.push("No phone on file for the sub.");
    await addComplaintEvent({ complaintId: rowId, kind: "sub_notified", channel: "text", status: "skipped", detail: `No phone on file for ${subName || "the sub"}.`, by });
  } else {
    const last4 = phone.replace(/\D/g, "").slice(-4);
    try {
      const sent = await sendSms(phone, subComplaintText(account, link), "complaints/notify-sub");
      result.text = sent.success ? "sent" : "failed";
      if (!sent.success) result.reasons.push("The text was not sent.");
      await addComplaintEvent({ complaintId: rowId, kind: "sub_notified", channel: "text", status: result.text, detail: `To ***${last4}`, by });
    } catch (error) {
      result.text = "failed";
      result.reasons.push("The text was not sent.");
      await addComplaintEvent({ complaintId: rowId, kind: "sub_notified", channel: "text", status: "failed", detail: `To ***${last4}: ${error instanceof Error ? error.message : "Unknown error"}`, by });
    }
  }

  return result;
}

/** When the sub was last told (a sent email or text), or "" when never. */
export async function lastSubNotified(rowId: number): Promise<string> {
  const events = await listComplaintEvents(rowId, ["sub_notified"]);
  return events.find((event) => event.status === "sent")?.at ?? "";
}
