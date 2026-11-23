// CW Now shifts (migration 090). Server only.
//
//   runShiftTexts    at shift start, each crew person gets one short text, in
//                    their language (FEATURE_SHIFT_TEXTS, and the account's switch)
//   runMissedPins    the morning after a scheduled shift with no checklist, one
//                    pin in the account manager's square. A checklist that comes
//                    in late takes it down
//   checklistCompletion   % of scheduled cleanings with a checklist, last 30 days,
//                    only for accounts with a checklist set up
//
// The days come from the cleaning schedule (listCleanings), so a skipped or
// moved cleaning never counts.

import { getSql } from "@/lib/db";
import { addDays, officeDay } from "@/lib/cleanings";
import { listCleanings } from "@/lib/pg/cleanings";
import { officeClock } from "@/lib/pg/todo-reminders";
import { getFeatureSetting } from "@/lib/pg/feature-settings";
import { sendText } from "@/lib/notify";
import { rolloutOn } from "@/lib/rollout";
import { smsLinksOn } from "@/lib/sms";
import { crewPersonLink, isCrewLang } from "@/lib/crewLinkPeople";
import { DAY_MINUTES, MISSED_PIN_FROM_MINUTES, SHIFT_TEXT_WINDOW_MINUTES, cleanShiftTime, minutesOf, missedPinTitle, shiftEndMinutes, shiftText, type CrewShift } from "@/lib/crewShifts";

const clean = (value: unknown) => String(value ?? "").trim();

let ready = false;
export async function crewShiftsReady(): Promise<boolean> {
  if (ready) return true;
  const rows = (await getSql()`SELECT to_regclass('public.crew_shift_texts') IS NOT NULL AS ok`) as { ok: boolean }[];
  ready = rows[0]?.ok === true;
  return ready;
}

export async function getShift(accountId: string): Promise<CrewShift | null> {
  if (!(await crewShiftsReady())) return null;
  const rows = (await getSql()`SELECT start_time, end_time, text_on FROM crew_shifts WHERE account_id = ${accountId} LIMIT 1`) as { start_time: string; end_time: string; text_on: boolean }[];
  return rows[0] ? { startTime: rows[0].start_time, endTime: rows[0].end_time, textOn: rows[0].text_on } : null;
}

export async function saveShift(accountId: string, input: { startTime: string; endTime: string; textOn: boolean }, by: string): Promise<CrewShift> {
  const startTime = cleanShiftTime(input.startTime);
  const endTime = cleanShiftTime(input.endTime);
  if (!startTime || !endTime) throw new Error("Pick the start and end time.");
  if (startTime === endTime) throw new Error("The shift must end at a different time.");
  await getSql()`
    INSERT INTO crew_shifts (account_id, start_time, end_time, text_on, updated_by) VALUES (${accountId}, ${startTime}, ${endTime}, ${input.textOn}, ${by})
    ON CONFLICT (account_id) DO UPDATE SET start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time, text_on = EXCLUDED.text_on, updated_by = EXCLUDED.updated_by, updated_at = now()
  `;
  return { startTime, endTime, textOn: input.textOn };
}

/** The accounts whose crew has a real checklist to open. */
const LIVE_CHECKLIST = `
  EXISTS (SELECT 1 FROM checklist_tabs tb, jsonb_array_elements(tb.sections_json) sec
          WHERE tb.account_id = a.id AND tb.deleted_at IS NULL AND jsonb_array_length(sec->'items') > 0)
  AND btrim(a.checklist_needed) = 'Yes' AND (to_jsonb(a)->>'deleted_at') IS NULL`;

type ShiftRow = { account_id: string; account_name: string; location_name: string | null; porter_code: string | null; start_time: string; end_time: string; text_on: boolean };

async function liveShifts(): Promise<ShiftRow[]> {
  return (await getSql().query(`
    SELECT s.account_id, btrim(a.account_name) AS account_name, ct.location_name, ct.porter_code, s.start_time, s.end_time, s.text_on
    FROM crew_shifts s
    JOIN accounts a ON a.id = s.account_id
    LEFT JOIN checklist_templates ct ON ct.account_id = s.account_id
    WHERE ${LIVE_CHECKLIST}
  `)) as ShiftRow[];
}

/** Which accounts are on the schedule that day (an extra job is not a shift). */
async function scheduledOn(day: string): Promise<Set<string>> {
  const { cleanings } = await listCleanings(day, day);
  return new Set(cleanings.filter((cleaning) => cleaning.status !== "extra" && !cleaning.unscheduled && cleaning.day === day).map((cleaning) => cleaning.accountId));
}

export type ShiftTextRun = { due: number; sent: number; failed: number; skipped: number };

export async function runShiftTexts(origin: string, now = new Date()): Promise<ShiftTextRun> {
  const run: ShiftTextRun = { due: 0, sent: 0, failed: 0, skipped: 0 };
  if (!rolloutOn("SHIFT_TEXTS") || !(await crewShiftsReady())) return run;
  const clock = officeClock(now);
  const shifts = (await liveShifts()).filter((shift) => shift.text_on);
  // The day the shift belongs to: a run just after midnight can still be the start of last night's.
  const due = shifts.flatMap((shift) => {
    const start = minutesOf(shift.start_time);
    const today = clock.minutes - start;
    if (today >= 0 && today < SHIFT_TEXT_WINDOW_MINUTES) return [{ shift, day: clock.day }];
    const lateNight = clock.minutes + DAY_MINUTES - start;
    return lateNight >= 0 && lateNight < SHIFT_TEXT_WINDOW_MINUTES ? [{ shift, day: addDays(clock.day, -1) }] : [];
  });
  if (due.length === 0) return run;

  const schedules = new Map<string, Set<string>>();
  const sql = getSql();
  for (const { shift, day } of due) {
    if (!schedules.has(day)) schedules.set(day, await scheduledOn(day));
    if (!schedules.get(day)!.has(shift.account_id)) continue;
    run.due += 1;
    const people = (await sql`SELECT id, name, phone, language, tab_id FROM crew_link_people WHERE account_id = ${shift.account_id} AND deleted_at IS NULL ORDER BY id`) as { id: string | number; name: string; phone: string; language: string; tab_id: number | null }[];
    const place = clean(shift.location_name) || clean(shift.account_name);
    for (const person of people) {
      if (!clean(person.phone)) {
        run.skipped += 1;
        continue;
      }
      // Claimed first, so two runs at once can never text the same person twice.
      const claimed = (await sql`INSERT INTO crew_shift_texts (account_id, day, person_id) VALUES (${shift.account_id}, ${day}::date, ${person.id}) ON CONFLICT DO NOTHING RETURNING person_id`) as unknown[];
      if (claimed.length === 0) continue;
      const language = isCrewLang(person.language) ? person.language : "en";
      const url = smsLinksOn() && shift.porter_code ? crewPersonLink(`${origin.replace(/\/$/, "")}/porter/${shift.porter_code}`, { tabId: person.tab_id, language }) : "";
      const result = await sendText(person.phone, shiftText(language, place, url), "cw-now/shift-start", `crew:${shift.account_id}:${day}`);
      await sql`UPDATE crew_shift_texts SET status = ${result.success ? "sent" : "failed"} WHERE account_id = ${shift.account_id} AND day = ${day}::date AND person_id = ${person.id}`;
      if (result.success) run.sent += 1;
      else run.failed += 1;
    }
  }
  return run;
}

const MISSED_PREFIX = "missed-checklist:";
/** A checklist this long before the shift still counts for it (a crew that starts early). */
const EARLY_MINUTES = 180;

/** The account manager's square, when they have one. "" = the Office box. */
const MANAGER_SQUARE = `COALESCE((
  SELECT st.id FROM staff st
  WHERE st.role = 'Manager' AND st.active AND btrim(st.name) <> '' AND lower(btrim(st.name)) <> 'cw'
    AND (st.id = mg.staff_id OR lower(btrim(st.name)) = lower(btrim(COALESCE(NULLIF(btrim(mg.name), ''), a.manager_raw, ''))))
  ORDER BY (st.id = mg.staff_id) DESC NULLS LAST
  LIMIT 1
), '')`;

export type MissedRun = { checked: number; pinned: number; cleared: number };

export async function runMissedPins(now = new Date()): Promise<MissedRun> {
  const run: MissedRun = { checked: 0, pinned: 0, cleared: 0 };
  if (!(await crewShiftsReady())) return run;
  const sql = getSql();

  // A checklist that came in after the pin went up: the pin comes down.
  const cleared = (await sql`
    UPDATE handoff_items h SET board_done_at = now(), board_done_by = 'Checklist came in late'
    WHERE h.kind = 'note' AND h.item_id LIKE ${`${MISSED_PREFIX}%`} AND h.board_pinned_at IS NOT NULL AND h.board_done_at IS NULL
      AND EXISTS (SELECT 1 FROM checklist_submissions c WHERE c.account_id = h.account_id AND c.submitted_at >= (h.data->>'windowFrom')::timestamptz AND c.submitted_at < (h.data->>'windowTo')::timestamptz)
    RETURNING h.item_id
  `) as unknown[];
  run.cleared = cleared.length;

  const clock = officeClock(now);
  if (clock.minutes < MISSED_PIN_FROM_MINUTES) return run;
  const day = addDays(clock.day, -1);
  const { missedHours } = await getFeatureSetting("crewShifts");
  const scheduled = await scheduledOn(day);
  for (const shift of await liveShifts()) {
    if (!scheduled.has(shift.account_id)) continue;
    const start = minutesOf(shift.start_time);
    const deadline = shiftEndMinutes(shift.start_time, shift.end_time) + Math.round(missedHours * 60);
    // Minutes from the start of the shift's day to now.
    if (clock.minutes + DAY_MINUTES < deadline) continue;
    run.checked += 1;
    const window = (await sql`
      SELECT (${day}::date::timestamp + make_interval(mins => ${start - EARLY_MINUTES})) AT TIME ZONE 'America/New_York' AS from_at,
             (${day}::date::timestamp + make_interval(mins => ${start - EARLY_MINUTES + DAY_MINUTES})) AT TIME ZONE 'America/New_York' AS to_at
    `) as { from_at: string | Date; to_at: string | Date }[];
    const fromAt = new Date(window[0].from_at).toISOString();
    // Up to the next shift's window: tonight's checklist must not take down last night's pin.
    const toAt = new Date(window[0].to_at).toISOString();
    const done = (await sql`SELECT 1 FROM checklist_submissions WHERE account_id = ${shift.account_id} AND submitted_at >= ${fromAt}::timestamptz AND submitted_at < ${toAt}::timestamptz LIMIT 1`) as unknown[];
    if (done.length > 0) continue;
    const itemId = `${MISSED_PREFIX}${shift.account_id}:${day}`;
    const data = JSON.stringify({ notes: "The crew did not send a checklist.", label: "No checklist", recordType: "missedChecklist", recordId: `${shift.account_id}:${day}`, href: `/accounts/${encodeURIComponent(shift.account_id)}`, forWho: "", dueDate: "", box: "", windowFrom: fromAt, windowTo: toAt, red: "1" });
    const inserted = (await sql.query(
      `INSERT INTO handoff_items (kind, item_id, title, account_id, account_name, manager, step, data, created_by, board_pinned_at, board_square)
       SELECT 'note', $1, $2, a.id, btrim(a.account_name), COALESCE(NULLIF(btrim(mg.name), ''), btrim(a.manager_raw), ''), 'pinned', $3::jsonb, 'CW Now', now(), ${MANAGER_SQUARE}
       FROM accounts a LEFT JOIN managers mg ON mg.id = a.manager_id
       WHERE a.id = $4
       ON CONFLICT (kind, item_id) DO NOTHING
       RETURNING item_id`,
      [itemId, missedPinTitle(clean(shift.account_name)), data, shift.account_id]
    )) as unknown[];
    run.pinned += inserted.length;
  }
  return run;
}

/** Scheduled cleanings since the last checklist (before today). Null when the account has none on the schedule. */
export async function missedSinceLastChecklist(accountId: string, today = officeDay()): Promise<number | null> {
  const rows = (await getSql()`SELECT ((max(submitted_at) AT TIME ZONE 'America/New_York') - interval '6 hours')::date::text AS day FROM checklist_submissions WHERE account_id = ${accountId}`) as { day: string | null }[];
  const last = rows[0]?.day;
  if (!last) return null;
  const from = addDays(today, -COMPLETION_DAYS);
  const { cleanings } = await listCleanings(from, addDays(today, -1));
  const days = cleanings.filter((cleaning) => cleaning.accountId === accountId && cleaning.status !== "extra" && !cleaning.unscheduled);
  if (days.length === 0) return null;
  return new Set(days.filter((cleaning) => cleaning.day > last).map((cleaning) => cleaning.day)).size;
}

/* ---------- checklist completion ---------- */

export type SubCompletion = { subId: string; subName: string; percent: number; done: number; expected: number; accounts: number };

export const COMPLETION_DAYS = 30;

/**
 * Of the scheduled cleanings in the last 30 days, how many have a checklist.
 * Only accounts with a checklist set up, only from the day it was set up. A
 * checklist sent before 6 AM counts for the night before.
 */
export async function checklistCompletion(today = officeDay()): Promise<SubCompletion[]> {
  const from = addDays(today, -COMPLETION_DAYS);
  const to = addDays(today, -1);
  const sql = getSql();
  const [calendar, live, submitted] = await Promise.all([
    listCleanings(from, to),
    sql.query(`
      SELECT a.id, (min(tb.created_at) AT TIME ZONE 'America/New_York')::date::text AS since
      FROM accounts a JOIN checklist_tabs tb ON tb.account_id = a.id AND tb.deleted_at IS NULL
      WHERE ${LIVE_CHECKLIST}
      GROUP BY a.id
    `) as unknown as Promise<{ id: string; since: string }[]>,
    sql`
      SELECT DISTINCT account_id, ((submitted_at AT TIME ZONE 'America/New_York') - interval '6 hours')::date::text AS day
      FROM checklist_submissions
      WHERE submitted_at >= ${from}::date - 1
    ` as unknown as Promise<{ account_id: string; day: string }[]>,
  ]);
  const since = new Map(live.map((row) => [row.id, row.since]));
  const doneDays = new Set(submitted.map((row) => `${row.account_id}|${row.day}`));
  const bySub = new Map<string, SubCompletion & { accountIds: Set<string> }>();
  for (const cleaning of calendar.cleanings) {
    const start = since.get(cleaning.accountId);
    if (!start || cleaning.day < start || cleaning.status === "extra" || cleaning.unscheduled || !cleaning.subId) continue;
    const entry = bySub.get(cleaning.subId) ?? { subId: cleaning.subId, subName: cleaning.sub, percent: 0, done: 0, expected: 0, accounts: 0, accountIds: new Set<string>() };
    entry.expected += 1;
    entry.accountIds.add(cleaning.accountId);
    if (doneDays.has(`${cleaning.accountId}|${cleaning.day}`)) entry.done += 1;
    bySub.set(cleaning.subId, entry);
  }
  return [...bySub.values()]
    .map(({ accountIds, ...entry }) => ({ ...entry, accounts: accountIds.size, percent: entry.expected > 0 ? Math.round((entry.done / entry.expected) * 100) : 0 }))
    .sort((a, b) => a.subName.localeCompare(b.subName));
}
