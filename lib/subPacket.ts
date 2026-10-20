// The Sub Packet: the new-account packet a subcontractor gets ("Send Sub
// Packet" on the account page). The same light Cleaning World look as the
// customer Welcome Packet (lib/welcomePacket.ts), in English, Spanish or
// Portuguese, with a matching PDF (lib/pdf/sub-packet.tsx). One list of
// sections feeds the email, its plain-text twin and the PDF, so the three
// always say the same. A section with nothing in it is left out.
//
// The sub's own pay only: never our revenue, what we keep, the margin, or
// the account's internal Notes. lib/pg/sub-packet.ts fills the data.
// Plain TS (no server imports).

import { WELCOME_COLORS, WELCOME_LOGO_URL } from "@/lib/welcomePacket";

export type SubPacketLang = "en" | "es" | "pt";
export const SUB_PACKET_LANGS: { lang: SubPacketLang; label: string }[] = [
  { lang: "en", label: "English" },
  { lang: "es", label: "Español" },
  { lang: "pt", label: "Português" },
];

export type SubPacketContact = { name: string; role: string; phone: string; email: string };

export type SubPacketData = {
  lang: SubPacketLang;
  subName: string;
  accountName: string;
  address: string;
  mapUrl: string;
  contacts: SubPacketContact[];
  /** YYYY-MM-DD or "" */
  startDate: string;
  cleaningDays: string;
  frequency: string;
  /** lib/cleaningTime.ts text: "18:00-21:00" or "19:00" */
  cleaningTime: string;
  /** Minutes on site, 0 when unknown. */
  minutesOnSite: number;
  perCleaning: number;
  monthlyPay: number;
  scope: string;
  notesForSub: string;
  access: string;
  crewLinkUrl: string;
  portalUrl: string;
  managerName: string;
  managerPhone: string;
  sentDate: string;
};

type Words = {
  title: string;
  hello: (name: string) => string;
  intro: string;
  account: string;
  accountName: string;
  address: string;
  openMap: string;
  contacts: string;
  start: string;
  startDate: string;
  schedule: string;
  days: string;
  frequency: string;
  time: string;
  onSite: string;
  pay: string;
  perCleaning: string;
  monthly: string;
  scope: string;
  notes: string;
  access: string;
  links: string;
  crewLink: string;
  crewLinkText: string;
  portal: string;
  portalText: string;
  contact: string;
  manager: string;
  office: string;
  between: (from: string, to: string) => string;
  at: (time: string) => string;
  subject: (account: string) => string;
  pdfNote: string;
  locale: string;
  frequencyWords: Record<string, string>;
  dayWords: Record<string, string>;
};

const WORDS: Record<SubPacketLang, Words> = {
  en: {
    title: "New Account Packet",
    hello: (name) => `Hi ${name},`,
    intro: "Here is everything you need for your new account with Cleaning World.",
    account: "The account",
    accountName: "Account",
    address: "Address",
    openMap: "Open in Google Maps",
    contacts: "On-site contact",
    start: "Start",
    startDate: "Start date",
    schedule: "Schedule",
    days: "Cleaning days",
    frequency: "Frequency",
    time: "Cleaning time",
    onSite: "Estimated time on site",
    pay: "Your pay",
    perCleaning: "Price per cleaning",
    monthly: "Monthly pay",
    scope: "Scope of work",
    notes: "Notes for you",
    access: "Keys, alarm and access",
    links: "Your links",
    crewLink: "Crew Link checklist",
    crewLinkText: "Your crew opens this on their phone at the account.",
    portal: "Your sub portal",
    portalText: "Your accounts, schedule and supplies.",
    contact: "Who to call",
    manager: "Your account manager",
    office: "Cleaning World office",
    between: (from, to) => `Between ${from} and ${to}`,
    at: (time) => `At ${time}`,
    subject: (account) => `New account for you: ${account} — Cleaning World`,
    pdfNote: "The same packet is attached as a PDF.",
    locale: "en-US",
    frequencyWords: {},
    dayWords: {},
  },
  es: {
    title: "Paquete de Cuenta Nueva",
    hello: (name) => `Hola ${name}:`,
    intro: "Aquí tiene todo lo que necesita para su nueva cuenta con Cleaning World.",
    account: "La cuenta",
    accountName: "Cuenta",
    address: "Dirección",
    openMap: "Abrir en Google Maps",
    contacts: "Contacto en el sitio",
    start: "Inicio",
    startDate: "Fecha de inicio",
    schedule: "Horario",
    days: "Días de limpieza",
    frequency: "Frecuencia",
    time: "Hora de limpieza",
    onSite: "Tiempo estimado en el sitio",
    pay: "Su pago",
    perCleaning: "Precio por limpieza",
    monthly: "Pago mensual",
    scope: "Trabajo a realizar",
    notes: "Notas para usted",
    access: "Llaves, alarma y acceso",
    links: "Sus enlaces",
    crewLink: "Lista de Crew Link",
    crewLinkText: "Su equipo la abre en el teléfono en la cuenta.",
    portal: "Su portal",
    portalText: "Sus cuentas, horario y suministros.",
    contact: "A quién llamar",
    manager: "Su gerente de cuenta",
    office: "Oficina de Cleaning World",
    between: (from, to) => `Entre ${from} y ${to}`,
    at: (time) => `A las ${time}`,
    subject: (account) => `Cuenta nueva para usted: ${account} — Cleaning World`,
    pdfNote: "El mismo paquete va adjunto en PDF.",
    locale: "es-US",
    frequencyWords: {
      "1x per week": "1 vez por semana",
      "2x per week": "2 veces por semana",
      "3x per week": "3 veces por semana",
      "4x per week": "4 veces por semana",
      "5x per week": "5 veces por semana",
      "6x per week": "6 veces por semana",
      "7x per week": "7 veces por semana",
      "Every other week": "Cada dos semanas",
      "1x per month": "1 vez al mes",
      "2x per month": "2 veces al mes",
    },
    dayWords: { Monday: "Lunes", Tuesday: "Martes", Wednesday: "Miércoles", Thursday: "Jueves", Friday: "Viernes", Saturday: "Sábado", Sunday: "Domingo" },
  },
  pt: {
    title: "Pacote de Conta Nova",
    hello: (name) => `Olá ${name},`,
    intro: "Aqui está tudo o que você precisa para a sua nova conta com a Cleaning World.",
    account: "A conta",
    accountName: "Conta",
    address: "Endereço",
    openMap: "Abrir no Google Maps",
    contacts: "Contato no local",
    start: "Início",
    startDate: "Data de início",
    schedule: "Horário",
    days: "Dias de limpeza",
    frequency: "Frequência",
    time: "Hora da limpeza",
    onSite: "Tempo estimado no local",
    pay: "Seu pagamento",
    perCleaning: "Preço por limpeza",
    monthly: "Pagamento mensal",
    scope: "Trabalho a fazer",
    notes: "Notas para você",
    access: "Chaves, alarme e acesso",
    links: "Seus links",
    crewLink: "Lista do Crew Link",
    crewLinkText: "Sua equipe abre no celular na conta.",
    portal: "Seu portal",
    portalText: "Suas contas, horário e suprimentos.",
    contact: "Para quem ligar",
    manager: "Seu gerente de conta",
    office: "Escritório da Cleaning World",
    between: (from, to) => `Entre ${from} e ${to}`,
    at: (time) => `Às ${time}`,
    subject: (account) => `Conta nova para você: ${account} — Cleaning World`,
    pdfNote: "O mesmo pacote vai anexado em PDF.",
    locale: "pt-BR",
    frequencyWords: {
      "1x per week": "1 vez por semana",
      "2x per week": "2 vezes por semana",
      "3x per week": "3 vezes por semana",
      "4x per week": "4 vezes por semana",
      "5x per week": "5 vezes por semana",
      "6x per week": "6 vezes por semana",
      "7x per week": "7 vezes por semana",
      "Every other week": "A cada duas semanas",
      "1x per month": "1 vez por mês",
      "2x per month": "2 vezes por mês",
    },
    dayWords: { Monday: "Segunda", Tuesday: "Terça", Wednesday: "Quarta", Thursday: "Quinta", Friday: "Sexta", Saturday: "Sábado", Sunday: "Domingo" },
  },
};

export const SUB_PACKET_OFFICE = { phone: "201-487-1313", email: "crm@cleaningworldinc.com" };

export function isSubPacketLang(value: unknown): value is SubPacketLang {
  return value === "en" || value === "es" || value === "pt";
}

/* ---------- the values, in the packet's language ---------- */

const clock = (minutes: number) => {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
};
const parseClock = (text: string) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

function cleaningTimeWords(value: string, w: Words): string {
  const text = value.trim();
  const window = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(text);
  if (window) {
    const from = parseClock(window[1]);
    const to = parseClock(window[2]);
    return from !== null && to !== null ? w.between(clock(from), clock(to)) : "";
  }
  const at = parseClock(text);
  return at !== null ? w.at(clock(at)) : "";
}

function startDateWords(value: string, w: Words): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return value.trim();
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return date.toLocaleDateString(w.locale, { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

const minutesWords = (minutes: number) => (minutes > 0 ? (minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}` : `${minutes}m`) : "");
const money = (value: number, cents: boolean) =>
  value > 0 ? value.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }) : "";

function daysWords(value: string, w: Words): string {
  return Object.entries(w.dayWords).reduce((text, [en, word]) => text.replace(new RegExp(`\\b${en}\\b`, "g"), word), value.trim());
}

/* ---------- the sections: one list for the email, the text and the PDF ---------- */

export type SubPacketRow = { label: string; value: string; href?: string };
export type SubPacketSection =
  | { kind: "rows"; title: string; rows: SubPacketRow[] }
  | { kind: "text"; title: string; text: string }
  | { kind: "links"; title: string; links: { label: string; text: string; url: string }[] };

export function subPacketSections(data: SubPacketData): SubPacketSection[] {
  const w = WORDS[data.lang];
  const sections: SubPacketSection[] = [];
  const keep = (rows: (SubPacketRow | null)[]) => rows.filter((row): row is SubPacketRow => row !== null && row.value.trim() !== "");

  const contacts = data.contacts
    .filter((contact) => contact.name || contact.phone)
    .map((contact) => ({ label: [contact.name, contact.role ? `(${contact.role})` : ""].filter(Boolean).join(" ") || w.contacts, value: [contact.phone, contact.email].filter(Boolean).join(" · ") || "—" }));
  const account = keep([
    { label: w.accountName, value: data.accountName },
    { label: w.address, value: data.address, href: data.address ? data.mapUrl : undefined },
  ]);
  if (account.length || contacts.length) sections.push({ kind: "rows", title: w.account, rows: [...account, ...contacts.map((row, index) => ({ ...row, label: index === 0 ? `${w.contacts}: ${row.label}` : row.label }))] });

  const start = keep([{ label: w.startDate, value: startDateWords(data.startDate, w) }]);
  if (start.length) sections.push({ kind: "rows", title: w.start, rows: start });

  const schedule = keep([
    { label: w.days, value: daysWords(data.cleaningDays, w) },
    { label: w.frequency, value: w.frequencyWords[data.frequency.trim()] ?? data.frequency.trim() },
    { label: w.time, value: cleaningTimeWords(data.cleaningTime, w) },
    { label: w.onSite, value: minutesWords(data.minutesOnSite) },
  ]);
  if (schedule.length) sections.push({ kind: "rows", title: w.schedule, rows: schedule });

  const pay = keep([
    { label: w.perCleaning, value: money(data.perCleaning, true) },
    { label: w.monthly, value: money(data.monthlyPay, false) },
  ]);
  if (pay.length) sections.push({ kind: "rows", title: w.pay, rows: pay });

  if (data.scope.trim()) sections.push({ kind: "text", title: w.scope, text: data.scope.trim() });
  if (data.notesForSub.trim()) sections.push({ kind: "text", title: w.notes, text: data.notesForSub.trim() });
  if (data.access.trim()) sections.push({ kind: "text", title: w.access, text: data.access.trim() });

  const links = [
    data.crewLinkUrl ? { label: w.crewLink, text: w.crewLinkText, url: data.crewLinkUrl } : null,
    data.portalUrl ? { label: w.portal, text: w.portalText, url: data.portalUrl } : null,
  ].filter((link): link is { label: string; text: string; url: string } => link !== null);
  if (links.length) sections.push({ kind: "links", title: w.links, links });

  const contact = keep([
    { label: w.manager, value: [data.managerName, data.managerPhone].filter(Boolean).join(" · ") },
    { label: w.office, value: `${SUB_PACKET_OFFICE.phone} · ${SUB_PACKET_OFFICE.email}` },
  ]);
  sections.push({ kind: "rows", title: w.contact, rows: contact });
  return sections;
}

export function subPacketWords(lang: SubPacketLang) {
  const w = WORDS[lang];
  return { title: w.title, intro: w.intro, hello: w.hello, pdfNote: w.pdfNote, openMap: w.openMap };
}

export function subPacketSubject(data: Pick<SubPacketData, "lang" | "accountName">): string {
  return WORDS[data.lang].subject(data.accountName || "Cleaning World");
}

export function subPacketPdfFilename(data: Pick<SubPacketData, "accountName">): string {
  const name = (data.accountName || "Account").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return `${name} - Cleaning World Sub Packet.pdf`;
}

/* ---------- the email ---------- */

const C = WELCOME_COLORS;
const FONT = "font-family:Arial,Helvetica,sans-serif;";
const TABLE = `role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"`;

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
const lines = (value: string) => esc(value).replace(/\r?\n/g, "<br>");

function bar(title: string): string {
  return `<div style="background:${C.bar};color:#ffffff;font-size:16px;font-weight:700;padding:10px 16px;margin-top:14px;">${esc(title)}</div>`;
}

function sectionHtml(section: SubPacketSection, openMap: string): string {
  if (section.kind === "text") {
    return bar(section.title) + `<div style="border:1px solid ${C.border};border-top:none;padding:12px 16px;font-size:14px;line-height:1.6;color:${C.text};">${lines(section.text)}</div>`;
  }
  if (section.kind === "links") {
    return (
      bar(section.title) +
      section.links
        .map(
          (link) =>
            `<div style="border:1px solid ${C.border};border-top:none;padding:12px 16px;">` +
            `<div style="font-size:14px;font-weight:700;color:${C.label};">${esc(link.label)}</div>` +
            `<div style="font-size:13px;color:${C.muted};margin:2px 0 8px;">${esc(link.text)}</div>` +
            `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${C.bar}" style="background:${C.bar};border-radius:8px;">` +
            `<a href="${esc(link.url)}" style="display:inline-block;padding:10px 18px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">${esc(link.label)}</a>` +
            `</td></tr></table>` +
            `<div style="font-size:12px;color:${C.muted};margin-top:6px;word-break:break-all;">${esc(link.url)}</div>` +
            `</div>`
        )
        .join("")
    );
  }
  return (
    bar(section.title) +
    `<table ${TABLE} style="border-collapse:collapse;border:1px solid ${C.border};border-top:none;">` +
    section.rows
      .map(
        (row) =>
          `<tr>` +
          `<td style="padding:9px 12px;border-bottom:1px solid ${C.border};font-size:13px;font-weight:700;color:${C.label};width:42%;vertical-align:top;">${esc(row.label)}</td>` +
          `<td style="padding:9px 12px;border-bottom:1px solid ${C.border};font-size:13px;color:${C.text};vertical-align:top;">${lines(row.value)}` +
          (row.href ? `<br><a href="${esc(row.href)}" style="color:${C.bar};text-decoration:underline;">${esc(openMap)}</a>` : "") +
          `</td></tr>`
      )
      .join("") +
    `</table>`
  );
}

/** The packet as an email: a whole HTML page that stays light in dark mode (as the Welcome Packet). */
export function subPacketHtml(data: SubPacketData): string {
  const w = WORDS[data.lang];
  const body =
    `<div style="background:#ffffff;padding:18px 0;text-align:center;">` +
    `<img src="${WELCOME_LOGO_URL}" alt="Cleaning World Inc." width="240" style="width:240px;max-width:80%;height:auto;" />` +
    `</div>` +
    `<div style="background:${C.header};border-bottom:4px solid ${C.accent};padding:16px;">` +
    `<div style="font-size:22px;font-weight:700;color:#ffffff;">${esc(w.title)}</div>` +
    `<div style="font-size:14px;color:${C.tagline};margin-top:4px;">${esc(data.accountName)}</div>` +
    `</div>` +
    `<p style="margin:14px 16px 4px;font-size:15px;color:${C.text};">${esc(w.hello(data.subName || "there"))}</p>` +
    `<p style="margin:0 16px 4px;font-size:14px;line-height:1.55;color:${C.text};">${esc(w.intro)}</p>` +
    subPacketSections(data).map((section) => sectionHtml(section, w.openMap)).join("") +
    `<div style="border-top:2px solid ${C.accent};margin-top:16px;color:${C.muted};padding:14px 16px;text-align:center;font-size:12px;line-height:1.7;">` +
    `Cleaning World Inc. · ${SUB_PACKET_OFFICE.phone} · ${SUB_PACKET_OFFICE.email} · cleaningworldinc.com<br>${esc(data.sentDate)}` +
    `</div>` +
    `<p style="margin:12px 0 0;font-size:12px;color:${C.muted};text-align:center;">${esc(w.pdfNote)}</p>`;
  return (
    `<!DOCTYPE html><html lang="${data.lang}" style="background:#ffffff;"><head>` +
    `<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />` +
    `<meta name="color-scheme" content="light only" /><meta name="supported-color-schemes" content="light only" />` +
    `<title>${esc(subPacketSubject(data))}</title><style>:root{color-scheme:light only;supported-color-schemes:light only;}</style></head>` +
    `<body bgcolor="#ffffff" style="margin:0;padding:0;background:#ffffff;${FONT}color:${C.text};">` +
    `<table ${TABLE} bgcolor="#ffffff" style="background:#ffffff;"><tr><td align="center" style="padding:16px 10px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background:#ffffff;"><tr><td style="text-align:left;${FONT}color:${C.text};">` +
    body +
    `</td></tr></table></td></tr></table></body></html>`
  );
}

/** The plain-text twin, for mail apps that do not show HTML. */
export function subPacketText(data: SubPacketData): string {
  const w = WORDS[data.lang];
  const out: string[] = [w.title, data.accountName, "", w.hello(data.subName || "there"), w.intro, ""];
  for (const section of subPacketSections(data)) {
    out.push(section.title.toUpperCase());
    if (section.kind === "text") out.push(section.text);
    else if (section.kind === "links") for (const link of section.links) out.push(`${link.label}: ${link.url}`);
    else for (const row of section.rows) out.push(`${row.label}: ${row.value}${row.href ? ` (${row.href})` : ""}`);
    out.push("");
  }
  out.push(`Cleaning World Inc. · ${SUB_PACKET_OFFICE.phone} · ${SUB_PACKET_OFFICE.email}`, data.sentDate, "", w.pdfNote);
  return out.join("\n");
}
