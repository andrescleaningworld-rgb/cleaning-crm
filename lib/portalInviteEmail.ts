// The customer portal invitation (Account page -> "Invite to portal",
// app/accounts/[id]/portal-invite-sheet.tsx and app/api/admin/portal-invite).
// One template, in English and Spanish, with
// the same look as the Welcome Packet email (lib/welcomePacket.ts: white
// page, blue header and button, the Cleaning World logo). The button opens
// the same one-time "set your password" link as before.
//
// Filled from the account and its manager. A value that is missing takes
// its phrase out (no "Hi ," or "call  at "):
//   customerName  "Hi Maria," / "Hi,"
//   accountName   "We're glad to be taking care of X." is left out
//   managerName   "Reach your account manager directly"
//   managerPhone  "...or call Greg at 555-..." becomes "just reply to this email"
// Staff can change the wording of one invite before it goes (the template
// stays the same): the email's subject and message, and the short text. The
// message is plain text: a blank line starts a new paragraph, lines that
// start with "- " are a list, and the line "[Open my portal]" (Spanish
// "[Abrir mi portal]") is where the button goes. The link itself is never
// typed: it is always the one made for this invite.
// Plain TS, no server imports.

import { WELCOME_COLORS, WELCOME_FOOTER, WELCOME_LOGO_URL } from "@/lib/welcomePacket";

export type InviteLang = "en" | "es";

export type PortalInviteData = {
  customerName: string;
  accountName: string;
  managerName: string;
  managerPhone: string;
  /** The one-time "set your password" link. */
  url: string;
  lang: InviteLang;
};

const t = (value: string) => String(value ?? "").trim();

/** The words, per language, already filled in. `null` = that phrase is left out. */
function words(data: PortalInviteData) {
  const customer = t(data.customerName);
  const account = t(data.accountName);
  const manager = t(data.managerName);
  const phone = t(data.managerPhone);
  if (data.lang === "es") {
    return {
      subject: "Su portal de clientes de Cleaning World está listo",
      hello: customer ? `Hola ${customer}:` : "Hola:",
      thanks: `Gracias por elegir a Cleaning World.${account ? ` Nos alegra cuidar de ${account}.` : ""}`,
      intro: "Creamos un portal de clientes privado solo para usted. En él puede:",
      bullets: [
        "Ver fotos de sus limpiezas, enviadas por nuestro equipo",
        "Reportar un problema o pedir un servicio extra en pocos toques",
        "Ver su calendario de limpiezas",
        manager ? `Comunicarse directamente con su gerente de cuenta, ${manager}` : "Comunicarse directamente con su gerente de cuenta",
      ],
      start: "Empezar toma solo un minuto:",
      questions: `Si tiene alguna pregunta, solo responda a este correo${phone ? ` o llame a ${manager || "su gerente de cuenta"} al ${phone}` : ""}. Siempre estamos para ayudarle.`,
      signoff: "Gracias,",
      team: "El equipo de Cleaning World",
      short: `Hola${customer ? ` ${customer}` : ""}, ¡gracias por elegir a Cleaning World! Su portal de clientes privado está listo: vea fotos de sus limpiezas, reporte un problema, pida un servicio extra y comuníquese con ${manager || "su gerente de cuenta"}. Empiece aquí: ${data.url}`,
    };
  }
  return {
    subject: "Your Cleaning World customer portal is ready",
    hello: customer ? `Hi ${customer},` : "Hi,",
    thanks: `Thank you for choosing Cleaning World.${account ? ` We're glad to be taking care of ${account}.` : ""}`,
    intro: "We've set up a private customer portal just for you. In it you can:",
    bullets: [
      "See photos from your cleanings, sent by our crew",
      "Report a problem or ask for an extra service in a few taps",
      "See your cleaning schedule",
      manager ? `Reach your account manager, ${manager}, directly` : "Reach your account manager directly",
    ],
    start: "It only takes a minute to get started:",
    questions: `If you have any questions, just reply to this email${phone ? ` or call ${manager || "your account manager"} at ${phone}` : ""}. We're always happy to help.`,
    signoff: "Thank you,",
    team: "The Cleaning World Team",
    short: `Hi${customer ? ` ${customer}` : ""}, thank you for choosing Cleaning World! Your private customer portal is ready: see photos from your cleanings, report a problem, ask for extra service, and reach ${manager || "your account manager"}. Get started here: ${data.url}`,
  };
}

/** Where the button goes in the message (one line, alone). */
export const BUTTON_LINE: Record<InviteLang, string> = { en: "[Open my portal]", es: "[Abrir mi portal]" };

/** One invite's words, ready to show and to change: the email's subject and message, and the short text. */
export type InviteDraft = { subject: string; body: string; short: string };

/** The template, filled in for this account and language. */
export function portalInviteDraft(data: PortalInviteData): InviteDraft {
  const w = words(data);
  const body = [
    w.hello,
    w.thanks,
    [w.intro, ...w.bullets.map((line) => "- " + line)].join("\n"),
    w.start,
    BUTTON_LINE[data.lang],
    w.questions,
    [w.signoff, w.team].join("\n"),
  ].join("\n\n");
  return { subject: w.subject, body, short: w.short };
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

const C = WELCOME_COLORS;
const FONT = "font-family:Arial,Helvetica,sans-serif;";
const TABLE = 'role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"';
const P = "margin:0 0 14px;font-size:15px;line-height:1.6;color:" + C.text + ";";
const BUTTON_WORDS: Record<InviteLang, { button: string; fine: string }> = {
  en: { button: "Open my portal", fine: "This link works for 7 days, one time. If it has expired, just ask us for a new one." },
  es: { button: "Abrir mi portal", fine: "Este enlace funciona por 7 días, una sola vez. Si ya venció, pídanos uno nuevo." },
};

/** The message's paragraphs: text, a list, or the button. */
type Block = { kind: "text"; lines: string[] } | { kind: "list"; intro: string[]; items: string[] } | { kind: "button" };

const BULLET = /^\s*[-•]\s+/;
const MARKERS = [BUTTON_LINE.en, BUTTON_LINE.es].map((line) => line.toLowerCase());

function blocksOf(body: string): Block[] {
  const out: Block[] = [];
  for (const chunk of body.replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    const lines = chunk.split("\n").map((line) => line.trimEnd()).filter((line) => line.trim() !== "");
    let current: string[] = [];
    const flush = () => {
      if (!current.length) return;
      const first = current.findIndex((line) => BULLET.test(line));
      if (first >= 0 && current.slice(first).every((line) => BULLET.test(line))) out.push({ kind: "list", intro: current.slice(0, first), items: current.slice(first).map((line) => line.replace(BULLET, "")) });
      else out.push({ kind: "text", lines: current });
      current = [];
    };
    // The button line may sit inside a paragraph: split around it.
    for (const line of lines) {
      if (MARKERS.includes(line.trim().toLowerCase())) {
        flush();
        out.push({ kind: "button" });
      } else current.push(line);
    }
    flush();
  }
  // No button line left in the message: the button goes at the end.
  if (!out.some((block) => block.kind === "button")) out.push({ kind: "button" });
  return out;
}

/** The email for one invite: the (maybe changed) subject and message, with the button and this invite's link. */
export function renderPortalInvite(input: { subject: string; body: string; url: string; lang: InviteLang }): { subject: string; html: string; text: string } {
  const subject = input.subject.trim() || (input.lang === "es" ? "Su portal de clientes de Cleaning World está listo" : "Your Cleaning World customer portal is ready");
  const b = BUTTON_WORDS[input.lang];
  const blocks = blocksOf(input.body);
  const lineHtml = (lines: string[]) => lines.map(esc).join("<br>");
  // A table button: Outlook draws it too.
  const button =
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 10px;"><tr>' +
    '<td bgcolor="' + C.bar + '" style="background:' + C.bar + ';border-radius:8px;">' +
    '<a href="' + esc(input.url) + '" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;">' + esc(b.button) + "</a>" +
    "</td></tr></table>" +
    '<p style="margin:0 0 6px;font-size:12px;color:' + C.muted + ';word-break:break-all;"><a href="' + esc(input.url) + '" style="color:' + C.bar + ';text-decoration:underline;">' + esc(input.url) + "</a></p>" +
    '<p style="margin:0 0 18px;font-size:12px;color:' + C.muted + ';">' + esc(b.fine) + "</p>";
  const inner = blocks
    .map((block) => {
      if (block.kind === "button") return button;
      if (block.kind === "list")
        return (
          (block.intro.length ? '<p style="' + P + 'margin-bottom:8px;">' + lineHtml(block.intro) + "</p>" : "") +
          '<ul style="margin:0 0 16px;padding-left:22px;font-size:15px;line-height:1.5;color:' + C.text + ';">' +
          block.items.map((item) => '<li style="margin:0 0 6px;">' + esc(item) + "</li>").join("") +
          "</ul>"
        );
      return '<p style="' + P + '">' + lineHtml(block.lines) + "</p>";
    })
    .join("");

  // Light only, with a white background on every layer (same as the Welcome Packet): stays readable in dark mode.
  const html =
    '<!DOCTYPE html><html lang="' + input.lang + '" style="background:#ffffff;"><head>' +
    '<meta charset="utf-8" />' +
    '<meta name="viewport" content="width=device-width, initial-scale=1" />' +
    '<meta name="color-scheme" content="light only" />' +
    '<meta name="supported-color-schemes" content="light only" />' +
    "<title>" + esc(subject) + "</title>" +
    "<style>:root{color-scheme:light only;supported-color-schemes:light only;}</style>" +
    "</head>" +
    '<body bgcolor="#ffffff" style="margin:0;padding:0;background:#ffffff;' + FONT + "color:" + C.text + ';">' +
    "<table " + TABLE + ' bgcolor="#ffffff" style="background:#ffffff;"><tr><td align="center" style="padding:16px 10px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;"><tr><td style="text-align:left;' + FONT + "color:" + C.text + ';">' +
    '<div style="background:#ffffff;padding:18px 0;text-align:center;">' +
    '<img src="' + WELCOME_LOGO_URL + '" alt="Cleaning World Inc." width="240" style="width:240px;max-width:80%;height:auto;" />' +
    "</div>" +
    '<div style="background:' + C.header + ";border-bottom:4px solid " + C.accent + ';padding:16px 20px;">' +
    '<div style="font-size:21px;font-weight:700;color:#ffffff;">' + esc(subject) + "</div>" +
    "</div>" +
    '<div style="background:#ffffff;border:1px solid ' + C.border + ';border-top:none;padding:20px;">' +
    inner +
    "</div>" +
    '<div style="background:#ffffff;border-top:2px solid ' + C.accent + ";color:" + C.muted + ';padding:14px 16px;text-align:center;font-size:12px;line-height:1.7;">' +
    WELCOME_FOOTER.map(esc).join("<br>") +
    "</div>" +
    "</td></tr></table>" +
    "</td></tr></table>" +
    "</body></html>";

  const text = blocks
    .map((block) => (block.kind === "button" ? input.url + "\n" + b.fine : block.kind === "list" ? [...block.intro, ...block.items.map((item) => "- " + item)].join("\n") : block.lines.join("\n")))
    .join("\n\n");
  return { subject, html, text };
}

/** The invite as the template has it (no changes): subject, the HTML email, and its plain-text twin. */
export function portalInviteEmail(data: PortalInviteData): { subject: string; html: string; text: string } {
  const draft = portalInviteDraft(data);
  return renderPortalInvite({ subject: draft.subject, body: draft.body, url: data.url, lang: data.lang });
}

/** The short version, to copy into a text message. */
export function portalInviteShortText(data: PortalInviteData): string {
  return words(data).short;
}
