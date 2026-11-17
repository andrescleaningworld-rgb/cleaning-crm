// CW Now (Crew Link) for the office: the crew list, the message each person
// gets, and the status words. Plain TS (no server imports): used by the
// account's CW Now card, the CW Now page and the API. Database side:
// lib/pg/crew-link-people.ts (migration 081).
//
// Links go by WhatsApp (wa.me opens WhatsApp Web / Desktop or the phone app
// with the message filled in), never by our own text messages: Textbelt
// blocks texts with links. Crew-facing words never say "sub".

export type CrewLang = "en" | "es" | "pt";
export const CREW_LANGS: { value: CrewLang; label: string }[] = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "pt", label: "Português" },
];
export const isCrewLang = (value: unknown): value is CrewLang => value === "en" || value === "es" || value === "pt";

export type CrewSendMethod = "whatsapp" | "copy" | "phone" | "print";
export const isCrewSendMethod = (value: unknown): value is CrewSendMethod => value === "whatsapp" || value === "copy" || value === "phone" || value === "print";

/** One person on an account's crew, with their last send. */
export type CrewPerson = {
  id: number;
  name: string;
  phone: string;
  language: CrewLang;
  /** Their own checklist tab (the link opens on it); null = the link opens as usual. */
  tabId: number | null;
  lastSentAt: string;
  lastSentBy: string;
  sendCount: number;
};

/** What the account's CW Now card reads (GET /api/crew-link/people). */
export type CrewPeopleData = {
  /** Migration 081 is in. */
  ready: boolean;
  people: CrewPerson[];
  /** The last checklist the crew sent (any tab). */
  lastUsedAt: string;
};

/**
 * The person's own link: the account's crew link, opening on their tab and
 * in their language. Only the tab and the language are in it (no name).
 */
export function crewPersonLink(baseUrl: string, person: Pick<CrewPerson, "tabId" | "language">): string {
  if (!baseUrl) return "";
  const params = new URLSearchParams();
  if (person.tabId) params.set("tab", String(person.tabId));
  if (person.language !== "en") params.set("lang", person.language);
  const query = params.toString();
  return query ? `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}${query}` : baseUrl;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/** The WhatsApp / copy message, in the person's language, with their link. */
export function crewInviteMessage(language: CrewLang, name: string, placeName: string, url: string): string {
  const who = firstName(name);
  const place = placeName.trim();
  if (language === "es") {
    return `Hola${who ? ` ${who}` : ""}, somos Cleaning World. Abre este enlace cada noche para ver tu lista${place ? ` de ${place}` : ""} y marcar tu trabajo: ${url}`;
  }
  if (language === "pt") {
    return `Olá${who ? ` ${who}` : ""}, aqui é a Cleaning World. Abra este link todas as noites para ver sua lista${place ? ` de ${place}` : ""} e marcar seu trabalho: ${url}`;
  }
  return `Hi${who ? ` ${who}` : ""}, this is Cleaning World. Open this link each night to see your checklist${place ? ` for ${place}` : ""} and check off your work: ${url}`;
}

/** The phone as WhatsApp wants it: digits with the country code (a 10-digit number is taken as US / Canada). "" when it can't be read. */
export function whatsappNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `1${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return "";
}

/** Opens WhatsApp with the message filled in; with no usable phone, WhatsApp asks who to send it to. */
export function whatsappHref(phone: string, text: string): string {
  const number = whatsappNumber(phone);
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/* ---------- when ---------- */

const TIME_ZONE = "America/New_York";
const dayKey = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: TIME_ZONE });

/** "today", "last night", "Fri", "Nov 3": short, in office time. */
export function whenShort(iso: string, now = new Date()): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const hours = (now.getTime() - date.getTime()) / 3_600_000;
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000));
  const day = dayKey(date);
  const hour = Number(date.toLocaleString("en-US", { timeZone: TIME_ZONE, hour: "numeric", hourCycle: "h23" }));
  // Yesterday evening, or after midnight today (a night shift), is "last night".
  if ((day === yesterday && hour >= 15) || (day === today && hour < 6)) return "last night";
  if (day === today) return "today";
  if (day === yesterday) return "yesterday";
  if (hours < 6 * 24) return date.toLocaleDateString("en-US", { timeZone: TIME_ZONE, weekday: "short" });
  return date.toLocaleDateString("en-US", { timeZone: TIME_ZONE, month: "short", day: "numeric" });
}

/** "Nov 17, 2:05 PM" in office time. */
export function whenLong(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("en-US", { timeZone: TIME_ZONE, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/* ---------- the CW Now page's status ---------- */

/**
 * ⚪ not set up · 🟡 set up (sent or not), never used yet · 🟢 in use (used,
 * and no more than one service day missed since) · 🔴 not used in 2 or more
 * service days. "Used" = the crew sent a checklist.
 */
export type CrewUsage = "notSetUp" | "notUsedYet" | "inUse" | "stopped";

export const CREW_USAGE: Record<CrewUsage, { dot: string; label: string; color: string }> = {
  notSetUp: { dot: "⚪", label: "Not set up", color: "text-slate-500" },
  notUsedYet: { dot: "🟡", label: "Sent, not used yet", color: "text-amber-700" },
  inUse: { dot: "🟢", label: "In use", color: "text-green-700" },
  stopped: { dot: "🔴", label: "Not used in 2+ service days", color: "text-red-700" },
};

/** How many service days in a row can go by with no checklist before it is 🔴. */
export const STOPPED_AFTER_MISSED_DAYS = 2;
