// CW Now (Crew Link): the crew list and the send log, the database side
// (migration 081). Server only. Words, links and messages:
// lib/crewLinkPeople.ts. API: app/api/crew-link/people.

import { getSql } from "@/lib/db";
import { isCrewLang, type CrewLang, type CrewPeopleData, type CrewPerson, type CrewSendMethod } from "@/lib/crewLinkPeople";

const clean = (value: unknown) => String(value ?? "").trim();
const iso = (value: unknown) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};

let readyCache = false;

/** Migration 081 is in. */
export async function crewPeopleReady(): Promise<boolean> {
  if (readyCache) return true;
  try {
    const rows = (await getSql()`
      SELECT to_regclass('public.crew_link_people') IS NOT NULL AND to_regclass('public.crew_link_sends') IS NOT NULL AS ok
    `) as { ok: boolean }[];
    readyCache = rows[0]?.ok === true;
  } catch {
    readyCache = false;
  }
  return readyCache;
}

export const PEOPLE_NOT_READY = "The crew list needs migration 081 first.";

/** When the crew last sent a checklist for this account ("" = never). */
async function lastUsedAt(accountId: string): Promise<string> {
  const rows = (await getSql()`SELECT MAX(submitted_at) AS at FROM checklist_submissions WHERE account_id = ${accountId}`) as { at: string | Date | null }[];
  return iso(rows[0]?.at);
}

/** The account's crew, in the order they were added, with each one's last send. */
export async function crewPeople(accountId: string): Promise<CrewPeopleData> {
  const used = await lastUsedAt(accountId);
  if (!(await crewPeopleReady())) return { ready: false, people: [], lastUsedAt: used };
  const rows = (await getSql()`
    SELECT p.id::text, p.name, p.phone, p.language, p.tab_id,
           s.sent_at AS last_sent_at, COALESCE(s.sent_by, '') AS last_sent_by,
           (SELECT count(*)::int FROM crew_link_sends x WHERE x.person_id = p.id) AS send_count
    FROM crew_link_people p
    LEFT JOIN LATERAL (SELECT sent_at, sent_by FROM crew_link_sends WHERE person_id = p.id ORDER BY sent_at DESC LIMIT 1) s ON true
    WHERE p.account_id = ${accountId} AND p.deleted_at IS NULL
    ORDER BY p.created_at, p.id
  `) as { id: string; name: string; phone: string; language: string; tab_id: number | null; last_sent_at: string | Date | null; last_sent_by: string; send_count: number }[];
  const people: CrewPerson[] = rows.map((r) => ({
    id: Number(r.id),
    name: clean(r.name),
    phone: clean(r.phone),
    language: isCrewLang(r.language) ? r.language : "en",
    tabId: r.tab_id ? Number(r.tab_id) : null,
    lastSentAt: iso(r.last_sent_at),
    lastSentBy: clean(r.last_sent_by),
    sendCount: Number(r.send_count) || 0,
  }));
  return { ready: true, people, lastUsedAt: used };
}

/** Adds a person (no id) or changes one. A tab must be one of this account's tabs. */
export async function savePerson(input: { accountId: string; id?: number | null; name: string; phone: string; language: CrewLang; tabId: number | null; by: string }): Promise<void> {
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new Error("Type the person's name.");
  const phone = input.phone.trim().slice(0, 40);
  const sql = getSql();
  let tabId = input.tabId;
  if (tabId) {
    const tabs = (await sql`SELECT 1 FROM checklist_tabs WHERE id = ${tabId} AND account_id = ${input.accountId} AND deleted_at IS NULL`) as unknown[];
    if (!tabs.length) tabId = null;
  }
  if (input.id) {
    const updated = (await sql`
      UPDATE crew_link_people SET name = ${name}, phone = ${phone}, language = ${input.language}, tab_id = ${tabId}, updated_at = now()
      WHERE id = ${input.id} AND account_id = ${input.accountId} AND deleted_at IS NULL RETURNING id
    `) as unknown[];
    if (!updated.length) throw new Error("That person is no longer on the list. Reload the page.");
    return;
  }
  await sql`
    INSERT INTO crew_link_people (account_id, name, phone, language, tab_id, created_by)
    VALUES (${input.accountId}, ${name}, ${phone}, ${input.language}, ${tabId}, ${input.by})
  `;
}

/** Takes a person off the list (their send log is kept). */
export async function removePerson(accountId: string, id: number): Promise<void> {
  await getSql()`UPDATE crew_link_people SET deleted_at = now() WHERE id = ${id} AND account_id = ${accountId} AND deleted_at IS NULL`;
}

/** "Sent <date> by <staff>": one row each time the office sends a person their link. */
export async function recordSend(accountId: string, personId: number, method: CrewSendMethod, by: string): Promise<void> {
  const rows = (await getSql()`SELECT 1 FROM crew_link_people WHERE id = ${personId} AND account_id = ${accountId} AND deleted_at IS NULL`) as unknown[];
  if (!rows.length) throw new Error("That person is no longer on the list. Reload the page.");
  await getSql()`INSERT INTO crew_link_sends (person_id, account_id, method, sent_by) VALUES (${personId}, ${accountId}, ${method}, ${by})`;
}

/** For the CW Now page: how many people each account has, and when its link was last sent. Empty before migration 081. */
export async function crewSummaryByAccount(): Promise<Map<string, { people: number; lastSentAt: string }>> {
  if (!(await crewPeopleReady())) return new Map();
  const rows = (await getSql()`
    SELECT p.account_id, count(DISTINCT p.id)::int AS people, MAX(s.sent_at) AS last_sent_at
    FROM crew_link_people p LEFT JOIN crew_link_sends s ON s.person_id = p.id
    WHERE p.deleted_at IS NULL GROUP BY p.account_id
  `) as { account_id: string; people: number; last_sent_at: string | Date | null }[];
  return new Map(rows.map((r) => [r.account_id, { people: r.people, lastSentAt: iso(r.last_sent_at) }]));
}
