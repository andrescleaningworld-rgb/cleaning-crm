// The board calendar's other days (lib/officeEvents.ts), the staff dates
// behind birthdays and anniversaries, and the TV slideshow's photos.
// Postgres only. Nothing here reads or writes Google Sheets or Apps Script.
// Everything answers "nothing" until migration 030 is in the database, so
// the calendar and the TV work the same before it is applied.

import { getSql } from "@/lib/db";
import { dateOrNull } from "@/lib/dateUtils";
import { dayInYear, type OfficeEvent, type OfficeEventKind } from "@/lib/officeEvents";

let ready: boolean | null = null;

/** The tables of migration 030 are in this database. */
export async function officeEventsReady(): Promise<boolean> {
  if (ready === true) return true;
  try {
    const rows = (await getSql()`SELECT to_regclass('public.calendar_events') IS NOT NULL AND to_regclass('public.staff_dates') IS NOT NULL AS ok`) as { ok: boolean }[];
    ready = rows[0]?.ok === true;
  } catch {
    ready = false;
  }
  return ready === true;
}

type EventRow = { id: string; kind: "holiday" | "closed" | "event"; title: string; day: string; repeats_yearly: boolean };
type StaffRow = { id: string; name: string; birthday: string | null; work_start: string | null };

/** Every day to show between two days (both included), soonest first. */
export async function listOfficeEvents(from: string, to: string): Promise<OfficeEvent[]> {
  if (!(await officeEventsReady())) return [];
  const sql = getSql();
  const [events, staff] = (await Promise.all([
    sql`SELECT id::text AS id, kind, title, day::text AS day, repeats_yearly FROM calendar_events WHERE repeats_yearly OR day BETWEEN ${from}::date AND ${to}::date`,
    // Staff and managers only, and only the ones who are active.
    sql`SELECT s.id, btrim(s.name) AS name, d.birthday::text AS birthday, d.work_start::text AS work_start
        FROM staff_dates d JOIN staff s ON s.id = d.staff_id
        WHERE s.active AND (d.birthday IS NOT NULL OR d.work_start IS NOT NULL)`,
  ])) as [EventRow[], StaffRow[]];

  const years: number[] = [];
  for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) years.push(year);
  const inRange = (day: string) => day >= from && day <= to;
  const out: OfficeEvent[] = [];

  for (const event of events) {
    const days = event.repeats_yearly ? years.filter((year) => year >= Number(event.day.slice(0, 4))).map((year) => dayInYear(event.day, year)) : [event.day];
    for (const day of days) {
      if (inRange(day)) out.push({ id: `event:${event.id}`, kind: event.kind, title: event.title, day, byHand: true, yearly: event.repeats_yearly });
    }
  }
  for (const person of staff) {
    for (const year of years) {
      if (person.birthday) {
        const day = dayInYear(person.birthday, year);
        // Only the day and the month: never the year, never an age.
        if (inRange(day)) out.push({ id: `staff:${person.id}:birthday:${year}`, kind: "birthday", title: person.name, day, byHand: false, yearly: true });
      }
      if (person.work_start) {
        const count = year - Number(person.work_start.slice(0, 4));
        const day = dayInYear(person.work_start, year);
        if (count >= 1 && inRange(day)) {
          out.push({ id: `staff:${person.id}:anniversary:${year}`, kind: "anniversary", title: `${person.name}: ${count} year${count === 1 ? "" : "s"} with Cleaning World`, day, byHand: false, yearly: true });
        }
      }
    }
  }
  const order: OfficeEventKind[] = ["closed", "holiday", "event", "birthday", "anniversary"];
  return out.sort((a, b) => a.day.localeCompare(b.day) || order.indexOf(a.kind) - order.indexOf(b.kind) || a.title.localeCompare(b.title));
}

export async function addOfficeEvent(input: { kind: string; title: string; day: string; yearly: boolean; by: string }): Promise<void> {
  const day = dateOrNull(input.day);
  if (!day) throw new Error("Pick the date.");
  const title = input.title.trim().slice(0, 120);
  if (!title) throw new Error("Type what it is.");
  if (input.kind !== "holiday" && input.kind !== "closed" && input.kind !== "event") throw new Error("Pick what kind of day it is.");
  await getSql()`INSERT INTO calendar_events (kind, title, day, repeats_yearly, created_by) VALUES (${input.kind}, ${title}, ${day}::date, ${input.yearly}, ${input.by})`;
}

/** Takes a hand-added day off the calendar. `id` is "event:12". */
export async function removeOfficeEvent(id: string): Promise<boolean> {
  const number = /^event:(\d+)$/.exec(id)?.[1];
  if (!number) return false;
  const rows = (await getSql()`DELETE FROM calendar_events WHERE id = ${Number(number)} RETURNING id`) as unknown[];
  return rows.length > 0;
}

/* ---------- staff dates (Settings -> Staff) ---------- */

export type StaffDates = { birthday: string; workStart: string };

/** Staff id -> the two dates, "" where none is on file. */
export async function getStaffDates(): Promise<Record<string, StaffDates>> {
  if (!(await officeEventsReady())) return {};
  const rows = (await getSql()`SELECT staff_id, COALESCE(birthday::text, '') AS birthday, COALESCE(work_start::text, '') AS work_start FROM staff_dates`) as { staff_id: string; birthday: string; work_start: string }[];
  return Object.fromEntries(rows.map((row) => [row.staff_id, { birthday: row.birthday, workStart: row.work_start }]));
}

/** Saves one person's dates. A blank date clears it. Only for someone on the Staff list. */
export async function setStaffDates(input: { staffId: string; birthday: string; workStart: string; by: string }): Promise<void> {
  const sql = getSql();
  const known = (await sql`SELECT 1 FROM staff WHERE id = ${input.staffId}`) as unknown[];
  if (known.length === 0) throw new Error("That person is not on the Staff list.");
  const birthday = dateOrNull(input.birthday);
  const workStart = dateOrNull(input.workStart);
  if (input.birthday.trim() && !birthday) throw new Error("The birthday is not a date.");
  if (input.workStart.trim() && !workStart) throw new Error("The first day of work is not a date.");
  await sql`
    INSERT INTO staff_dates (staff_id, birthday, work_start, updated_by) VALUES (${input.staffId}, ${birthday}::date, ${workStart}::date, ${input.by})
    ON CONFLICT (staff_id) DO UPDATE SET birthday = EXCLUDED.birthday, work_start = EXCLUDED.work_start, updated_by = EXCLUDED.updated_by, updated_at = now()
  `;
}

/* ---------- the TV slideshow ---------- */

export type TvSlide = { url: string; caption: string };

/**
 * The photos with the "Show on TV" star, newest first. Only pictures kept in
 * the app's own storage: a TV has no staff login, and a Google Drive photo
 * can only be fetched with one. The caption is the account name and nothing
 * else, like everything on the TV. Empty when the photo list or the star is
 * not in this database yet.
 */
export async function tvSlides(limit = 30): Promise<TvSlide[]> {
  try {
    const rows = (await getSql()`
      SELECT url, account_name, COALESCE(to_jsonb(photo_index) ->> 'thumb_url', '') AS thumb_url FROM photo_index
      WHERE show_on_tv AND is_image AND store = 'blob'
      ORDER BY taken_at DESC, id DESC LIMIT ${limit}
    `) as { url: string; account_name: string; thumb_url: string }[];
    // The small copy when the photo has one (site survey shots, migration 063).
    return rows.map((row) => ({ url: row.thumb_url || row.url, caption: row.account_name.trim() }));
  } catch {
    return [];
  }
}

/** Puts the star on a photo, or takes it off. False when the star is not in this database yet. */
export async function setShowOnTv(photoId: number, on: boolean): Promise<boolean> {
  try {
    const rows = (await getSql()`UPDATE photo_index SET show_on_tv = ${on} WHERE id = ${photoId} RETURNING id`) as unknown[];
    return rows.length > 0;
  } catch {
    return false;
  }
}
