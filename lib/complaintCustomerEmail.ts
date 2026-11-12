// Closing the loop with the customer on a complaint they sent from the portal
// (Reported By "Customer (portal)"). Customer-facing: nothing is sent while
// Settings -> Reminders & check-ins -> "Customer complaint updates" is off
// (feature_settings "customerComplaintLoop", off from the start).
//   - "We got it, we're on it": right after the complaint is saved.
//   - "It's fixed": when staff close / resolve it (not "Resolved by Sub",
//     which still waits for the office), with the after photo when there is one.
//   - "Close & send to customer" (the office's review on the Complaint page)
//     sends "It's fixed" with force: whatever the switch, for any complaint on
//     the account (portal, phone or email), with the note and the photos the
//     office chose. The button is the approval.
// English, then Spanish, in one email (the portal's two languages; the app
// does not know which one a customer reads). Customers never see validity,
// priority, internal notes, sub names or score. Each send is written on the
// complaint (complaint_events 'customer_emailed') and in the Email log.
// Server only.

import { getSql } from "@/lib/db";
import { sendHtmlEmail } from "@/lib/email";
import { signFileLink, FILES_ROUTE } from "@/lib/files";
import { getFeatureSetting } from "@/lib/pg/feature-settings";
import { addComplaintEvent, listComplaintEvents } from "@/lib/pg/complaint-events";
import { afterPhotos } from "@/lib/pg/complaint-fix";
import { PORTAL_COMPLAINT_REPORTED_BY } from "@/lib/pg/customer-portal";
import { WELCOME_COLORS as C, WELCOME_FOOTER, WELCOME_LOGO_URL } from "@/lib/welcomePacket";

const clean = (value: unknown) => String(value ?? "").trim();
const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const FONT = "font-family:Arial,Helvetica,sans-serif;";
const KIND_PREFIX = /^(Missed Cleaning|Quality Issue|Staff Conduct|Damaged Property|Communication Issue|Other):\s*/i;
/** How long the photo link in "It's fixed" works. */
const PHOTO_LINK_DAYS = 30;

export type CustomerEmailKind = "received" | "fixed";

type Words = { subject: string; title: string; lines: (number: string) => string[]; reported: string; photo: string; button: string; note: string };

const WORDS: Record<CustomerEmailKind, { en: Words; es: Words }> = {
  received: {
    en: {
      subject: "We got your message",
      title: "We got it. We're on it.",
      lines: (number) => [`Thank you for telling us. Your complaint number is ${number}.`, "Our team is already on it. We will email you again when it is fixed."],
      reported: "What you told us",
      photo: "",
      button: "See it in your portal",
      note: "",
    },
    es: {
      subject: "Recibimos su mensaje",
      title: "Lo recibimos. Ya estamos en eso.",
      lines: (number) => [`Gracias por avisarnos. Su número de queja es ${number}.`, "Nuestro equipo ya está trabajando en esto. Le escribiremos otra vez cuando esté arreglado."],
      reported: "Lo que nos contó",
      photo: "",
      button: "Verlo en su portal",
      note: "",
    },
  },
  fixed: {
    en: {
      subject: "It's fixed",
      title: "It's fixed.",
      lines: (number) => [`Your complaint ${number} is fixed.`, "Thank you for your patience. If anything is still not right, reply to this email or tell us in your portal."],
      reported: "What you told us",
      photo: "After the fix",
      button: "See it in your portal",
      note: "How we fixed it",
    },
    es: {
      subject: "Está arreglado",
      title: "Está arreglado.",
      lines: (number) => [`Su queja ${number} está arreglada.`, "Gracias por su paciencia. Si algo todavía no está bien, responda a este correo o díganos en su portal."],
      reported: "Lo que nos contó",
      photo: "Después del arreglo",
      button: "Verlo en su portal",
      note: "Cómo lo arreglamos",
    },
  },
};

/** The email itself (also used for the preview). */
export function customerComplaintEmail(input: { kind: CustomerEmailKind; number: string; reported: string; photoUrl?: string; photoUrls?: string[]; note?: string; portalUrl: string }): { subject: string; html: string; text: string } {
  const { en, es } = WORDS[input.kind];
  const subject = `${en.subject} / ${es.subject} – Cleaning World`;
  const P = `margin:0 0 12px;font-size:16px;line-height:1.5;color:${C.text};`;
  const section = (w: Words, lang: "en" | "es") =>
    `<div lang="${lang}" style="padding:4px 0 8px;">` +
    `<p style="margin:0 0 10px;font-size:22px;font-weight:700;color:${C.header};">${esc(w.title)}</p>` +
    w.lines(input.number).map((line) => `<p style="${P}">${esc(line)}</p>`).join("") +
    "</div>";
  const reported = input.reported
    ? `<div style="background:#f8fafc;border:1px solid ${C.border};border-radius:10px;padding:14px;margin:6px 0 16px;">` +
      `<p style="margin:0 0 6px;font-size:13px;font-weight:700;color:${C.muted};">${esc(en.reported)} / ${esc(es.reported)}</p>` +
      `<p style="margin:0;font-size:15px;line-height:1.5;color:${C.text};white-space:pre-wrap;">${esc(input.reported)}</p>` +
      "</div>"
    : "";
  const photoUrls = (input.photoUrls ?? (input.photoUrl ? [input.photoUrl] : [])).filter(Boolean);
  const photo = photoUrls.length
    ? `<p style="margin:0 0 6px;font-size:13px;font-weight:700;color:${C.muted};">${esc(en.photo)} / ${esc(es.photo)}</p>` +
      photoUrls
        .map((url) => `<a href="${esc(url)}"><img src="${esc(url)}" alt="${esc(en.photo)}" width="520" style="width:100%;max-width:520px;height:auto;border-radius:10px;border:1px solid ${C.border};margin:0 0 12px;" /></a>`)
        .join("")
    : "";
  // What was done (the office's words on "Close & send to customer"). Never names the team.
  const note =
    input.note && en.note
      ? `<div style="background:#e3f6ed;border:2px solid #147a52;border-radius:10px;padding:14px;margin:6px 0 16px;">` +
        `<p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#147a52;">${esc(en.note)} / ${esc(es.note)}</p>` +
        `<p style="margin:0;font-size:16px;line-height:1.5;color:${C.text};white-space:pre-wrap;">${esc(input.note)}</p>` +
        "</div>"
      : "";
  const button =
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 10px;"><tr>' +
    `<td bgcolor="${C.bar}" style="background:${C.bar};border-radius:8px;">` +
    `<a href="${esc(input.portalUrl)}" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;">${esc(en.button)} / ${esc(es.button)}</a>` +
    "</td></tr></table>";

  const html =
    '<!DOCTYPE html><html lang="en" style="background:#ffffff;"><head><meta charset="utf-8" />' +
    '<meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="color-scheme" content="light only" />' +
    `<title>${esc(subject)}</title></head>` +
    `<body bgcolor="#ffffff" style="margin:0;padding:0;background:#ffffff;${FONT}color:${C.text};">` +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff"><tr><td align="center" style="padding:16px 10px;">' +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;"><tr><td style="text-align:left;${FONT}color:${C.text};">` +
    `<div style="padding:18px 0;text-align:center;"><img src="${WELCOME_LOGO_URL}" alt="Cleaning World Inc." width="240" style="width:240px;max-width:80%;height:auto;" /></div>` +
    `<div style="background:${C.header};border-bottom:4px solid ${C.accent};padding:16px 20px;"><div style="font-size:21px;font-weight:700;color:#ffffff;">${esc(en.title)} · ${esc(es.title)}</div></div>` +
    `<div style="background:#ffffff;border:1px solid ${C.border};border-top:none;padding:20px;">` +
    section(en, "en") +
    reported +
    note +
    photo +
    button +
    `<div style="border-top:1px solid ${C.border};margin-top:18px;padding-top:14px;">` +
    section(es, "es") +
    "</div></div>" +
    `<div style="border-top:2px solid ${C.accent};color:${C.muted};padding:14px 16px;text-align:center;font-size:12px;line-height:1.7;">${WELCOME_FOOTER.map(esc).join("<br>")}</div>` +
    "</td></tr></table></td></tr></table></body></html>";

  const text = [
    en.title,
    ...en.lines(input.number),
    input.reported ? `\n${en.reported}: ${input.reported}` : "",
    input.note && en.note ? `\n${en.note}: ${input.note}` : "",
    ...photoUrls.map((url) => `\n${en.photo}: ${url}`),
    `\n${input.portalUrl}`,
    "\n----\n",
    es.title,
    ...es.lines(input.number),
  ]
    .filter(Boolean)
    .join("\n");
  return { subject, html, text };
}

type Row = { id: number | string; complaint_id: string; sheet_row: number; account_ref: string | null; account_name: string; issue: string; status: string; reported_by: string; email: string | null };

async function loadRow(rowId: number): Promise<Row | null> {
  const rows = (await getSql().query(
    `SELECT c.id, btrim(c.complaint_id) AS complaint_id, c.sheet_row, c.account_ref, c.account_name, c.issue, c.status, c.reported_by, a.email
     FROM complaints c LEFT JOIN accounts a ON a.id = c.account_ref WHERE c.id = $1`,
    [rowId]
  )) as Row[];
  return rows[0] ?? null;
}

/** What the customer first wrote (no kind in front, no later additions). */
function reportedText(issue: string): string {
  return issue.split(/\n\n(?:Added by the customer|Merged from complaint)/)[0].replace(KIND_PREFIX, "").trim().slice(0, 600);
}

/** force: the office's "Close & send to customer" (any complaint, whatever the switch, even if sent before), with its note and photos. */
export type SendOptions = { force?: boolean; note?: string; photos?: string[] };

async function send(kind: CustomerEmailKind, rowId: number, origin: string, options: SendOptions = {}): Promise<"sent" | "failed" | "skipped"> {
  if (!options.force && !(await getFeatureSetting("customerComplaintLoop")).on) return "skipped";
  const row = await loadRow(rowId);
  if (!row || (!options.force && clean(row.reported_by) !== PORTAL_COMPLAINT_REPORTED_BY)) return "skipped";
  const to = clean(row.email).toLowerCase();
  if (!to) {
    await addComplaintEvent({ complaintId: rowId, kind: "customer_emailed", channel: kind, status: "skipped", detail: "No email on the account." });
    return "skipped";
  }
  // "It's fixed" goes once per complaint.
  if (kind === "fixed" && !options.force) {
    const already = await listComplaintEvents(rowId, ["customer_emailed"]);
    if (already.some((event) => event.channel === "fixed" && event.status === "sent")) return "skipped";
  }

  const base = origin.replace(/\/$/, "");
  const number = row.complaint_id || String(row.sheet_row);
  let photoUrls: string[] = [];
  if (kind === "fixed") {
    const photos = options.photos ?? (await afterPhotos(rowId)).slice(0, 1);
    // A private file: a signed link the customer can open without logging in.
    photoUrls = photos.slice(0, 6).map((photo) => (photo.startsWith(FILES_ROUTE) ? `${base}${signFileLink(photo, PHOTO_LINK_DAYS * 24 * 60)}` : photo));
  }
  const message = customerComplaintEmail({ kind, number, reported: reportedText(row.issue), photoUrls, note: options.note, portalUrl: `${base}/portal/requests` });
  try {
    const sent = await sendHtmlEmail({
      to: [to],
      subject: message.subject,
      text: message.text,
      html: message.html,
      log: { type: kind === "received" ? "Complaint received (customer)" : "Complaint fixed (customer)", accountId: row.account_ref ?? undefined, accountName: row.account_name, sentBy: "System" },
    });
    await addComplaintEvent({ complaintId: rowId, kind: "customer_emailed", channel: kind, status: sent ? "sent" : "failed", detail: sent ? `To ${to}` : `Not sent to ${to}: no email sender is set up.` });
    return sent ? "sent" : "failed";
  } catch (error) {
    await addComplaintEvent({ complaintId: rowId, kind: "customer_emailed", channel: kind, status: "failed", detail: `To ${to}: ${error instanceof Error ? error.message : "Unknown error"}` });
    return "failed";
  }
}

/** "We got it, we're on it" (after a portal complaint is saved). Never throws for a failed send. */
export const sendCustomerReceivedEmail = (rowId: number, origin: string) => send("received", rowId, origin);

/** "It's fixed" (staff closed / resolved it; not "Resolved by Sub", not Merged). Once per complaint. */
export async function sendCustomerFixedEmail(rowId: number, origin: string, options: SendOptions = {}): Promise<"sent" | "failed" | "skipped"> {
  const row = await loadRow(rowId);
  const status = clean(row?.status).toLowerCase();
  if (!row || status.startsWith("resolved by sub") || status.startsWith("merged") || !/^(closed|resolved)/.test(status)) return "skipped";
  return send("fixed", rowId, origin, options);
}
