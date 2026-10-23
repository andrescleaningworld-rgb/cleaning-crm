// Sub insurance (COI): the rules and words shared by the office screens, the
// sub portal and the reminder emails. Plain TS, safe in the browser. The
// database side is lib/pg/sub-insurance.ts (migration 056).
//
// The expiration date that counts is the sub's own one (the "Insurance
// expiration" on the sub's page). Approving a COI sets it; a COI a sub sent
// from the portal counts only once the office approved it.

export const INSURANCE_SOON_DAYS = 30;
/** Where reminders for the office go. */
export const INSURANCE_OFFICE_EMAIL = "info@cleaningworldinc.com";

export type InsuranceState = "ok" | "soon" | "expired" | "none";

export type CoiDoc = {
  id: string;
  fileUrl: string;
  fileName: string;
  expiresOn: string;
  source: "office" | "sub";
  status: "pending" | "approved" | "rejected" | "replaced";
  uploadedBy: string;
  uploadedAt: string;
  reviewedBy: string;
  reviewedAt: string;
  rejectReason: string;
};

/** One sub's insurance, as every staff screen shows it. */
export type SubInsurance = {
  subId: string;
  /** The id in the sub's page address (/subcontractors/<pageId>). */
  pageId: string;
  /** Every id and name the sub is known by on other screens (lower case), to find it from them. */
  keys: string[];
  name: string;
  company: string;
  email: string;
  /** YYYY-MM-DD, "" when none is on file. */
  expiresOn: string;
  state: InsuranceState;
  /** Days until it expires (negative once expired); null without a date. */
  daysLeft: number | null;
  /** The approved COI's file, "" when there is none in the CRM. */
  fileUrl: string;
  /** Sent from the sub portal and not checked yet. */
  pending: CoiDoc | null;
};

/** Today in the office's time zone, YYYY-MM-DD. */
export function easternToday(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)));
  const b = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  return Math.round((b - a) / 86_400_000);
}

/** A typed date ("2026-05-01", "5/1/2026", "05/01/26") as YYYY-MM-DD; "" when it is not a date. */
export function looseDate(value: unknown): string {
  const text = String(value ?? "").trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  const us = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(text);
  const [y, m, d] = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : us ? [Number(us[3].length === 2 ? `20${us[3]}` : us[3]), Number(us[1]), Number(us[2])] : [0, 0, 0];
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return "";
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return "";
  return date.toISOString().slice(0, 10);
}

export function insuranceState(expiresOn: string, today = easternToday()): InsuranceState {
  if (!expiresOn) return "none";
  const left = daysBetween(today, expiresOn);
  if (left < 0) return "expired";
  return left <= INSURANCE_SOON_DAYS ? "soon" : "ok";
}

/** "Oct 12, 2026" from YYYY-MM-DD. */
export function niceDay(day: string, locale = "en-US"): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(locale, { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}

/** The short words on the badge. */
export const INSURANCE_BADGE: Record<InsuranceState, string> = {
  ok: "Insurance OK",
  soon: "Insurance expiring",
  expired: "Insurance expired",
  none: "No insurance on file",
};

/** The keys to look a sub up by, from any sub record a screen has. */
export function insuranceLookupKeys(sub: Record<string, unknown>): string[] {
  const keys = ["subId", "id", "subcontractorId", "contactName", "companyName", "name", "subcontractor"]
    .map((field) => String(sub[field] ?? "").trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(keys));
}

/** Finds a sub's insurance from any sub record (by id first, then name). */
export function findInsurance(map: Map<string, SubInsurance>, sub: Record<string, unknown>): SubInsurance | null {
  for (const key of insuranceLookupKeys(sub)) {
    const found = map.get(key);
    if (found) return found;
  }
  return null;
}

/* ---------- the sub's words (portal and email), English / Spanish / Portuguese ---------- */

export type InsuranceLang = "en" | "es" | "pt";

export const SUB_INSURANCE_WORDS: Record<
  InsuranceLang,
  {
    upload: string;
    title: string;
    photoOrPdf: string;
    expires: string;
    send: string;
    sending: string;
    sent: string;
    waiting: string;
    rejected: (reason: string) => string;
    soonBanner: (day: string) => string;
    expiredBanner: (day: string) => string;
    noneBanner: string;
    okLine: (day: string) => string;
    pickFile: string;
    pickDate: string;
    failed: string;
    cancel: string;
    emailSubject: (expired: boolean) => string;
    emailHello: (name: string) => string;
    emailSoon: (day: string) => string;
    emailExpired: (day: string) => string;
    emailAsk: string;
    emailButton: string;
  }
> = {
  en: {
    upload: "Upload my insurance",
    title: "My insurance",
    photoOrPdf: "Take a photo or pick a PDF",
    expires: "Expiration date",
    send: "Send",
    sending: "Sending…",
    sent: "Sent ✓ The office will check it.",
    waiting: "The office is checking your insurance.",
    rejected: (reason) => `The office could not accept your insurance: ${reason}. Please send it again.`,
    soonBanner: (day) => `Your insurance expires on ${day}. Please upload the new one.`,
    expiredBanner: (day) => `Your insurance expired on ${day}. Please upload the new one now.`,
    noneBanner: "We do not have your insurance. Please upload it.",
    okLine: (day) => `Your insurance is good until ${day}.`,
    pickFile: "Take a photo or pick a PDF first.",
    pickDate: "Enter the expiration date.",
    failed: "That did not send. Try again.",
    cancel: "Cancel",
    emailSubject: (expired) => (expired ? "Your insurance has expired – Cleaning World" : "Your insurance expires soon – Cleaning World"),
    emailHello: (name) => `Hi ${name},`,
    emailSoon: (day) => `Your insurance certificate (COI) expires on ${day}.`,
    emailExpired: (day) => `Your insurance certificate (COI) expired on ${day}.`,
    emailAsk: "Please upload the new one in your sub portal. Tap the button, then \"Upload my insurance\".",
    emailButton: "Open my sub portal",
  },
  es: {
    upload: "Subir mi seguro",
    title: "Mi seguro",
    photoOrPdf: "Tome una foto o elija un PDF",
    expires: "Fecha de vencimiento",
    send: "Enviar",
    sending: "Enviando…",
    sent: "Enviado ✓ La oficina lo revisará.",
    waiting: "La oficina está revisando su seguro.",
    rejected: (reason) => `La oficina no pudo aceptar su seguro: ${reason}. Por favor envíelo de nuevo.`,
    soonBanner: (day) => `Su seguro vence el ${day}. Por favor suba el nuevo.`,
    expiredBanner: (day) => `Su seguro venció el ${day}. Por favor suba el nuevo ahora.`,
    noneBanner: "No tenemos su seguro. Por favor súbalo.",
    okLine: (day) => `Su seguro es válido hasta el ${day}.`,
    pickFile: "Primero tome una foto o elija un PDF.",
    pickDate: "Escriba la fecha de vencimiento.",
    failed: "No se envió. Intente de nuevo.",
    cancel: "Cancelar",
    emailSubject: (expired) => (expired ? "Su seguro ha vencido – Cleaning World" : "Su seguro vence pronto – Cleaning World"),
    emailHello: (name) => `Hola ${name}:`,
    emailSoon: (day) => `Su certificado de seguro (COI) vence el ${day}.`,
    emailExpired: (day) => `Su certificado de seguro (COI) venció el ${day}.`,
    emailAsk: "Por favor suba el nuevo en su portal. Toque el botón y luego \"Subir mi seguro\".",
    emailButton: "Abrir mi portal",
  },
  pt: {
    upload: "Enviar meu seguro",
    title: "Meu seguro",
    photoOrPdf: "Tire uma foto ou escolha um PDF",
    expires: "Data de vencimento",
    send: "Enviar",
    sending: "Enviando…",
    sent: "Enviado ✓ O escritório vai verificar.",
    waiting: "O escritório está verificando o seu seguro.",
    rejected: (reason) => `O escritório não pôde aceitar o seu seguro: ${reason}. Por favor envie de novo.`,
    soonBanner: (day) => `Seu seguro vence em ${day}. Por favor envie o novo.`,
    expiredBanner: (day) => `Seu seguro venceu em ${day}. Por favor envie o novo agora.`,
    noneBanner: "Não temos o seu seguro. Por favor envie.",
    okLine: (day) => `Seu seguro é válido até ${day}.`,
    pickFile: "Primeiro tire uma foto ou escolha um PDF.",
    pickDate: "Digite a data de vencimento.",
    failed: "Não foi enviado. Tente de novo.",
    cancel: "Cancelar",
    emailSubject: (expired) => (expired ? "Seu seguro venceu – Cleaning World" : "Seu seguro vence em breve – Cleaning World"),
    emailHello: (name) => `Olá ${name},`,
    emailSoon: (day) => `Seu certificado de seguro (COI) vence em ${day}.`,
    emailExpired: (day) => `Seu certificado de seguro (COI) venceu em ${day}.`,
    emailAsk: "Por favor envie o novo no seu portal. Toque no botão e depois em \"Enviar meu seguro\".",
    emailButton: "Abrir meu portal",
  },
};

export const INSURANCE_LOCALE: Record<InsuranceLang, string> = { en: "en-US", es: "es-US", pt: "pt-BR" };
