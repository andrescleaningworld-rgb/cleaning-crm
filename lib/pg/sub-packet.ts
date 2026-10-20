// Fills the Sub Packet (lib/subPacket.ts) from the account: its sub, manager,
// contacts, schedule, pay, scope, Notes for Sub, access, Crew Link and time
// on site. Only the sub's own pay: never the revenue, the margin or the
// internal Notes. Server only.

import { getSql } from "@/lib/db";
import { listContacts, accountContactsReady } from "@/lib/pg/account-contacts";
import { getTimeOnSite, timeOnSiteReady } from "@/lib/pg/time-on-site";
import { perCleaningFromMonthlyPay } from "@/lib/frequency";
import { SUB_PORTAL_PATH } from "@/lib/subPortalInvite";
import type { SubPacketContact, SubPacketData, SubPacketLang } from "@/lib/subPacket";

export type SubPacketInfo = Omit<SubPacketData, "lang" | "sentDate" | "portalUrl" | "crewLinkUrl"> & {
  accountId: string;
  subId: string;
  subEmail: string;
  crewLinkCode: string;
};

const clean = (value: unknown) => String(value ?? "").trim();

type Row = Record<string, unknown>;

export async function loadSubPacketInfo(accountId: string): Promise<SubPacketInfo | null> {
  const id = accountId.trim();
  if (!id) return null;
  const sql = getSql();
  // The columns added later (notes_for_sub 037, sub_price_per_cleaning 048,
  // cleaning_time 050) through to_jsonb, so this reads the same before they exist.
  const rows = (await sql`
    SELECT a.id, a.account_name, a.address, a.city, a.zip, a.latitude, a.longitude, a.contact_name, a.phone,
           a.start_date::text AS start_date, a.start_date_raw, a.cleaning_days, a.frequency, a.scope_of_work,
           a.key_alarm_access_info, a.has_key, a.alarm_code, a.monthly_sub_pay, a.subcontractor_raw,
           to_jsonb(a) ->> 'notes_for_sub' AS notes_for_sub,
           to_jsonb(a) ->> 'sub_price_per_cleaning' AS sub_price_per_cleaning,
           to_jsonb(a) ->> 'cleaning_time' AS cleaning_time,
           m.name AS manager_name, m.phone AS manager_phone, a.manager_raw,
           s.id AS sub_id, s.contact_name AS sub_contact, s.company_name AS sub_company, s.email AS sub_email
    FROM accounts a
    LEFT JOIN LATERAL (
      SELECT name, phone FROM managers
      WHERE id = a.manager_id OR (a.manager_id IS NULL AND a.manager_raw <> '' AND lower(btrim(name)) = lower(btrim(a.manager_raw)))
      ORDER BY (id = a.manager_id) DESC NULLS LAST, row_no LIMIT 1
    ) m ON true
    LEFT JOIN LATERAL (
      SELECT id, contact_name, company_name, email FROM subcontractors
      WHERE id = a.subcontractor_id
         OR (a.subcontractor_id IS NULL AND btrim(a.subcontractor_raw) <> ''
             AND (lower(btrim(contact_name)) = lower(btrim(a.subcontractor_raw)) OR lower(btrim(company_name)) = lower(btrim(a.subcontractor_raw))))
      ORDER BY (id = a.subcontractor_id) DESC NULLS LAST LIMIT 1
    ) s ON true
    WHERE a.id = ${id} AND (to_jsonb(a) ->> 'deleted_at') IS NULL
    LIMIT 1
  `) as Row[];
  const row = rows[0];
  if (!row) return null;

  const street = clean(row.address);
  // The full address is usually in one field already, with its ZIP: then the city / zip columns are not added again.
  const extra = /\b\d{5}\b/.test(street) ? [] : [clean(row.city), clean(row.zip)].filter((part) => part && !street.toLowerCase().includes(part.toLowerCase()));
  const address = [street, ...extra].filter(Boolean).join(", ");
  const lat = Number(row.latitude);
  const lng = Number(row.longitude);
  const mapUrl = address
    ? Number.isFinite(lat) && Number.isFinite(lng) && row.latitude !== null && row.longitude !== null
      ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : "";

  // Everyone on the account (the main contact first); before migration 034, the account's own contact.
  let contacts: SubPacketContact[] = [];
  if (await accountContactsReady().catch(() => false)) {
    contacts = ((await listContacts(id).catch(() => null)) ?? []).map((contact) => ({ name: contact.name, role: contact.isMain ? "" : contact.role, phone: contact.phone, email: "" }));
  }
  if (contacts.length === 0 && (clean(row.contact_name) || clean(row.phone))) contacts = [{ name: clean(row.contact_name), role: "", phone: clean(row.phone), email: "" }];

  const monthlyPay = Number(row.monthly_sub_pay) || 0;
  const frequency = clean(row.frequency);
  const savedPer = Number(row.sub_price_per_cleaning) || 0;
  const perCleaning = savedPer || perCleaningFromMonthlyPay(monthlyPay, frequency) || 0;

  const access = [
    clean(row.key_alarm_access_info),
    clean(row.has_key) && !/^(no|false)$/i.test(clean(row.has_key)) ? `Key: ${clean(row.has_key)}` : "",
    clean(row.alarm_code) ? `Alarm code: ${clean(row.alarm_code)}` : "",
  ].filter(Boolean).join("\n");

  let minutesOnSite = 0;
  if (await timeOnSiteReady().catch(() => false)) minutesOnSite = (await getTimeOnSite(id).catch(() => null))?.minutes ?? 0;

  let crewLinkCode = "";
  try {
    const codes = (await sql`SELECT porter_code FROM checklist_templates WHERE account_id = ${id} LIMIT 1`) as { porter_code: string | null }[];
    crewLinkCode = clean(codes[0]?.porter_code);
  } catch {
    crewLinkCode = "";
  }

  return {
    accountId: clean(row.id),
    accountName: clean(row.account_name),
    address,
    mapUrl,
    contacts,
    startDate: clean(row.start_date).slice(0, 10) || clean(row.start_date_raw),
    cleaningDays: clean(row.cleaning_days),
    frequency,
    cleaningTime: clean(row.cleaning_time),
    minutesOnSite,
    perCleaning,
    monthlyPay,
    scope: clean(row.scope_of_work),
    notesForSub: clean(row.notes_for_sub),
    access,
    managerName: clean(row.manager_name) || clean(row.manager_raw),
    managerPhone: clean(row.manager_phone),
    subId: clean(row.sub_id),
    subName: clean(row.sub_contact) || clean(row.sub_company) || clean(row.subcontractor_raw),
    subEmail: clean(row.sub_email),
    crewLinkCode,
  };
}

/** What stops the packet from going out, in plain words ([] = it can go). */
export function subPacketProblems(info: SubPacketInfo, to: string): string[] {
  const problems: string[] = [];
  if (!info.subName) problems.push("This account has no subcontractor yet. Pick one on Edit Account first.");
  if (!to.trim()) problems.push(`No email for ${info.subName || "the sub"}. Add it on the sub's page, or type it here.`);
  else if (!/^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(to.trim())) problems.push("That is not an email address.");
  return problems;
}

export function subPacketData(info: SubPacketInfo, lang: SubPacketLang, origin: string, now = new Date()): SubPacketData {
  const base = origin.replace(/\/$/, "");
  return {
    ...info,
    lang,
    portalUrl: `${base}${SUB_PORTAL_PATH}`,
    crewLinkUrl: info.crewLinkCode ? `${base}/porter/${encodeURIComponent(info.crewLinkCode)}` : "",
    sentDate: now.toLocaleDateString(lang === "es" ? "es-US" : lang === "pt" ? "pt-BR" : "en-US", { timeZone: "America/New_York", month: "long", day: "numeric", year: "numeric" }),
  };
}
