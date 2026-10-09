// The simple sub portal home (db/migrations/019_sub_home.sql): PIN login,
// today's sites, the sub's requests, site photos. Postgres only.
//
// Feature flag FEATURE_SUB_HOME, same rule as handoffs: "1" on, "0" off,
// unset = off on Production (the portal stays on today's screen there until
// the cutover) and on in local dev and on Vercel previews.

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { getSql } from "@/lib/db";
import { fetchAllMainAccounts } from "@/lib/data/accounts";
import { fetchSubSchedules, getAllSubcontractorVisits } from "@/lib/data/scheduling";
import { subStatus, type HandoffItem, type HandoffKind } from "@/lib/handoffs";
import { generateScheduleDates, isScheduleEffectivelyActive, parseISO, todayISO } from "@/lib/scheduleRecurrence";
import { handoffsReady, startHandoff } from "@/lib/pg/handoffs";

export const PIN_MAX_TRIES = 5;
export const PIN_LOCK_MINUTES = 15;
export const SETUP_LINK_DAYS = 7;
export const DEVICE_DAYS = 90;

export function subHomeFlagOn(): boolean {
  const flag = (process.env.FEATURE_SUB_HOME ?? "").trim();
  if (flag === "1") return true;
  if (flag === "0") return false;
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "development";
}

let ready: boolean | null = null;

/** On only where the flag is on, the tables exist and handoffs are on (problems and extra jobs are handoffs). */
export async function subHomeReady(): Promise<boolean> {
  if (!subHomeFlagOn()) return false;
  if (ready !== true) {
    try {
      const rows = (await getSql()`SELECT to_regclass('public.sub_pins') IS NOT NULL AS ok`) as { ok: boolean }[];
      ready = rows[0]?.ok === true;
    } catch {
      ready = false;
    }
  }
  return ready === true && (await handoffsReady());
}

const lower = (value: unknown) => String(value ?? "").trim().toLowerCase();
const sha256 = (text: string) => crypto.createHash("sha256").update(text).digest("hex");
export const isPin = (pin: unknown): pin is string => typeof pin === "string" && /^\d{4}$/.test(pin);

/* ---------- PIN ---------- */

export async function hasPin(email: string): Promise<boolean> {
  const rows = (await getSql().query(`SELECT 1 FROM sub_pins WHERE email = $1`, [lower(email)])) as unknown[];
  return rows.length > 0;
}

export async function setPin(email: string, pin: string): Promise<void> {
  const hash = await bcrypt.hash(pin, 10);
  await getSql().query(
    `INSERT INTO sub_pins (email, pin_hash) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET pin_hash = EXCLUDED.pin_hash, tries = 0, locked_until = NULL, updated_at = now()`,
    [lower(email), hash]
  );
}

export type PinCheck = { ok: true } | { ok: false; reason: "no-pin" | "wrong" | "locked"; triesLeft: number; minutes: number };

/** 5 wrong tries lock the PIN for 15 minutes. A right PIN clears the count. */
export async function checkPin(email: string, pin: string): Promise<PinCheck> {
  const sql = getSql();
  const rows = (await sql.query(`SELECT pin_hash, tries, locked_until FROM sub_pins WHERE email = $1`, [lower(email)])) as {
    pin_hash: string;
    tries: number;
    locked_until: string | Date | null;
  }[];
  const row = rows[0];
  if (!row) return { ok: false, reason: "no-pin", triesLeft: 0, minutes: 0 };
  const lockedUntil = row.locked_until ? new Date(row.locked_until).getTime() : 0;
  if (lockedUntil > Date.now()) return { ok: false, reason: "locked", triesLeft: 0, minutes: Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60000)) };
  // A lock that has run out starts a fresh count.
  const triesSoFar = lockedUntil ? 0 : row.tries;
  if (isPin(pin) && (await bcrypt.compare(pin, row.pin_hash))) {
    await sql.query(`UPDATE sub_pins SET tries = 0, locked_until = NULL, updated_at = now() WHERE email = $1`, [lower(email)]);
    return { ok: true };
  }
  const tries = triesSoFar + 1;
  if (tries >= PIN_MAX_TRIES) {
    await sql.query(`UPDATE sub_pins SET tries = 0, locked_until = now() + ($2 || ' minutes')::interval, updated_at = now() WHERE email = $1`, [lower(email), String(PIN_LOCK_MINUTES)]);
    return { ok: false, reason: "locked", triesLeft: 0, minutes: PIN_LOCK_MINUTES };
  }
  await sql.query(`UPDATE sub_pins SET tries = $2, locked_until = NULL, updated_at = now() WHERE email = $1`, [lower(email), tries]);
  return { ok: false, reason: "wrong", triesLeft: PIN_MAX_TRIES - tries, minutes: 0 };
}

/* ---------- the personal setup link ---------- */

/** Makes a new link token for this sub (older unused ones stop working). Returns the token; only its hash is stored. */
export async function createSetupLink(email: string, createdBy: string): Promise<string> {
  const sql = getSql();
  const token = crypto.randomBytes(24).toString("base64url");
  await sql.query(`UPDATE sub_setup_links SET used_at = now() WHERE email = $1 AND used_at IS NULL`, [lower(email)]);
  await sql.query(`INSERT INTO sub_setup_links (token_hash, email, expires_at, created_by) VALUES ($1, $2, now() + ($3 || ' days')::interval, $4)`, [
    sha256(token),
    lower(email),
    String(SETUP_LINK_DAYS),
    createdBy,
  ]);
  return token;
}

/** The email a still-valid link belongs to, or "". */
export async function setupLinkEmail(token: string): Promise<string> {
  if (!token) return "";
  const rows = (await getSql().query(`SELECT email FROM sub_setup_links WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`, [sha256(token)])) as { email: string }[];
  return rows[0]?.email ?? "";
}

export async function markSetupLinkUsed(token: string): Promise<void> {
  await getSql().query(`UPDATE sub_setup_links SET used_at = now() WHERE token_hash = $1`, [sha256(token)]);
}

/* ---------- today's sites ---------- */

export type TodaySite = { accountId: string; accountName: string; address: string; timeWindow: string; done: boolean };

const WINDOW_ORDER = ["Morning", "Midday", "Afternoon", "Evening"];

export async function todaySites(email: string, accounts: Record<string, unknown>[]): Promise<TodaySite[]> {
  const today = todayISO();
  const day = parseISO(today);
  const mine = lower(email);
  const [schedules, visits] = await Promise.all([fetchSubSchedules().catch(() => []), getAllSubcontractorVisits().catch(() => [])]);
  const byId = new Map<string, Record<string, unknown>>();
  for (const account of accounts) {
    const id = String(account.accountId ?? account.id ?? "").trim();
    if (id) byId.set(id, account);
  }
  const doneNames = new Set(visits.filter((visit) => lower(visit.subEmail) === mine && String(visit.visitDate ?? "").slice(0, 10) === today).map((visit) => lower(visit.accountName)));
  const sites = new Map<string, TodaySite>();
  for (const schedule of schedules) {
    if (lower(schedule.subId) !== mine || !isScheduleEffectivelyActive(schedule, today)) continue;
    if (!generateScheduleDates(schedule, day, day).includes(today)) continue;
    const account = byId.get(String(schedule.accountId).trim());
    const accountName = String(account?.accountName ?? account?.name ?? schedule.accountId);
    if (sites.has(schedule.accountId)) continue;
    sites.set(schedule.accountId, {
      accountId: schedule.accountId,
      accountName,
      address: String(account?.address ?? ""),
      timeWindow: schedule.timeWindow,
      done: doneNames.has(lower(accountName)),
    });
  }
  return [...sites.values()].sort((a, b) => WINDOW_ORDER.indexOf(a.timeWindow) - WINDOW_ORDER.indexOf(b.timeWindow) || a.accountName.localeCompare(b.accountName));
}

/* ---------- the sub's own requests ---------- */

export type SubRequest = { kind: HandoffKind; title: string; detail: string; status: "received" | "approved" | "done"; date: string };

type RequestRow = { kind: HandoffKind; title: string; step: string; data: Record<string, unknown> | null; created_at: string | Date; done_at: string | Date | null };

/** The last 30 things this sub sent: problems, extra jobs and supply orders, with what the sub may see of their status. */
export async function subRequests(email: string): Promise<SubRequest[]> {
  const rows = (await getSql().query(
    `SELECT kind, title, step, data, created_at, done_at FROM handoff_items
     WHERE kind IN ('issue', 'extra', 'order') AND lower(data->>'subEmail') = $1
     ORDER BY created_at DESC LIMIT 30`,
    [lower(email)]
  )) as RequestRow[];
  return rows.map((row) => {
    const data = row.data ?? {};
    const item = { kind: row.kind, step: row.step, doneAt: row.done_at ? new Date(row.done_at).toISOString() : "" } as Pick<HandoffItem, "kind" | "step" | "doneAt">;
    return {
      kind: row.kind,
      title: row.title,
      detail: String(data.items ?? data.problemType ?? data.notes ?? "").slice(0, 140),
      status: subStatus(item),
      date: new Date(row.created_at).toISOString(),
    };
  });
}

/** The account's manager, for a handoff that starts with the manager or shows the manager's name. */
export async function managerOf(accountId: string, accountName: string): Promise<string> {
  try {
    const accounts = await fetchAllMainAccounts();
    const found = accounts.find((account) => (accountId && account.accountId.trim() === accountId.trim()) || lower(account.accountName) === lower(accountName));
    return found?.managerName ?? "";
  } catch {
    return "";
  }
}

/** A request from a sub becomes a handoff: a problem goes to the manager, an extra job to the office, an order into the supply steps. */
export async function startSubRequest(input: {
  kind: "issue" | "extra" | "order";
  itemId?: string;
  accountId: string;
  accountName: string;
  sub: string;
  subEmail: string;
  data: Record<string, string>;
}): Promise<HandoffItem> {
  const step = input.kind === "issue" ? "reported" : input.kind === "extra" ? "received" : "ordered";
  return startHandoff({
    kind: input.kind,
    itemId: input.itemId || `${input.kind === "issue" ? "p" : input.kind === "extra" ? "x" : "o"}-${crypto.randomUUID()}`,
    title: input.accountName || (input.kind === "order" ? "Supply order" : input.kind === "extra" ? "Extra job" : "Problem"),
    accountId: input.accountId,
    accountName: input.accountName,
    manager: await managerOf(input.accountId, input.accountName),
    step,
    data: { ...input.data, sub: input.sub, subcontractor: input.sub, subEmail: lower(input.subEmail) },
    createdBy: input.sub,
  });
}

/* ---------- site photos ---------- */

export async function addSitePhoto(input: { subEmail: string; subName: string; accountId: string; accountName: string; moment: "before" | "after"; url: string }): Promise<void> {
  await getSql().query(`INSERT INTO sub_site_photos (sub_email, sub_name, account_id, account_name, moment, url) VALUES ($1, $2, $3, $4, $5, $6)`, [
    lower(input.subEmail),
    input.subName,
    input.accountId,
    input.accountName,
    input.moment,
    input.url,
  ]);
}

export type SitePhoto = { url: string; moment: string; subName: string; takenAt: string };

export async function sitePhotos(accountId: string, accountName: string): Promise<SitePhoto[]> {
  const rows = (await getSql().query(
    `SELECT url, moment, sub_name, taken_at FROM sub_site_photos
     WHERE (account_id <> '' AND account_id = $1) OR lower(account_name) = $2
     ORDER BY taken_at DESC LIMIT 40`,
    [accountId, lower(accountName)]
  )) as { url: string; moment: string; sub_name: string; taken_at: string | Date }[];
  return rows.map((row) => ({ url: row.url, moment: row.moment, subName: row.sub_name, takenAt: new Date(row.taken_at).toISOString() }));
}
