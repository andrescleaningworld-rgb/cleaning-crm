// The Cleaning calendar in Postgres: what was scheduled on each day (from
// the sub schedules and their exceptions), and what shows it was cleaned.
// Postgres only. Nothing here reads or writes Google Sheets or Apps Script.
// The rules for cleaned / missed are in lib/cleanings.ts.

import { getSql } from "@/lib/db";
import { addDays, dayToDate, officeDay, OFFICE_TIME_ZONE, type CalendarData, type Cleaning, type CleaningProof } from "@/lib/cleanings";
import { generateScheduleDates } from "@/lib/scheduleRecurrence";

type AccountRow = { id: string; account_name: string; checklist_needed: string; manager: string; sub: string; sub_id: string };
type ScheduleRow = {
  account_id: string;
  frequency: string;
  recurring: string;
  day_of_week: string;
  monthly_occurrence: string;
  time_window: string;
  effective_start: string | null;
  effective_end: string | null;
  sub: string;
  sub_id: string;
};
type ExceptionRow = { account_id: string; original_day: string | null; type: string; new_day: string | null; new_time_window: string };
type DayRow = { account_id: string; day: string };
type MarkRow = DayRow & { mark: "cleaned" | "missed" };
type ExtraRow = { item_id: string; account_id: string; account_name: string; title: string; day: string; manager: string };

const key = (accountId: string, day: string) => `${accountId}|${day}`;

/** Every cleaning between two days (inclusive), with its status. At most 62 days at a time. */
export async function listCleanings(from: string, to: string): Promise<CalendarData> {
  const sql = getSql();
  const today = officeDay();
  const last = addDays(from, 62) < to ? addDays(from, 62) : to;

  const [accounts, schedules, exceptions, marks, checklists, subVisits, photos, visits, extras, pinned] = (await Promise.all([
    sql`
      SELECT a.id, btrim(a.account_name) AS account_name, a.checklist_needed,
             COALESCE(NULLIF(btrim(m.name), ''), btrim(a.manager_raw), '') AS manager,
             COALESCE(NULLIF(btrim(s.contact_name), ''), NULLIF(btrim(s.company_name), ''), '') AS sub,
             COALESCE(a.subcontractor_id, '') AS sub_id
      FROM accounts a
      LEFT JOIN managers m ON m.id = a.manager_id
      LEFT JOIN subcontractors s ON s.id = a.subcontractor_id
      WHERE a.id IS NOT NULL AND a.status_key <> 'cancelled'
    `,
    sql`
      SELECT COALESCE(s.account_ref, btrim(s.account_id)) AS account_id, s.frequency, s.recurring, s.day_of_week, s.monthly_occurrence,
             s.time_window, s.effective_start::text AS effective_start, s.effective_end::text AS effective_end,
             COALESCE(NULLIF(btrim(sub.contact_name), ''), NULLIF(btrim(sub.company_name), ''), '') AS sub,
             COALESCE(s.subcontractor_id, '') AS sub_id
      FROM sub_schedules s
      LEFT JOIN subcontractors sub ON sub.id = s.subcontractor_id
      WHERE lower(btrim(s.status)) = 'active'
    `,
    sql`
      SELECT COALESCE(e.account_ref, btrim(e.account_id)) AS account_id, e.original_date::text AS original_day, btrim(e.type) AS type,
             e.new_date::text AS new_day, e.new_time_window
      FROM schedule_exceptions e
      WHERE e.original_date BETWEEN ${from}::date AND ${last}::date OR e.new_date BETWEEN ${from}::date AND ${last}::date
    `,
    sql`SELECT account_id, day::text AS day, mark FROM cleaning_marks WHERE day BETWEEN ${from}::date AND ${last}::date`,
    sql`
      SELECT account_id, (submitted_at AT TIME ZONE ${OFFICE_TIME_ZONE})::date::text AS day
      FROM checklist_submissions
      WHERE (submitted_at AT TIME ZONE ${OFFICE_TIME_ZONE})::date BETWEEN ${from}::date AND ${last}::date
    `,
    sql`
      SELECT COALESCE(v.account_ref, a.id, '') AS account_id, v.visit_date::text AS day
      FROM subcontractor_visits v
      LEFT JOIN accounts a ON v.account_ref IS NULL AND lower(btrim(a.account_name)) = lower(btrim(v.account_name))
      WHERE v.visit_date BETWEEN ${from}::date AND ${last}::date
    `,
    sql`
      SELECT account_id, (taken_at AT TIME ZONE ${OFFICE_TIME_ZONE})::date::text AS day
      FROM sub_site_photos
      WHERE moment = 'after' AND (taken_at AT TIME ZONE ${OFFICE_TIME_ZONE})::date BETWEEN ${from}::date AND ${last}::date
    `,
    sql`SELECT COALESCE(account_ref, '') AS account_id, visit_date::text AS day FROM visits WHERE visit_date BETWEEN ${from}::date AND ${last}::date`,
    sql`
      SELECT h.item_id, h.account_id, h.account_name, h.title, h.data->>'date' AS day, h.manager
      FROM handoff_items h
      WHERE h.kind = 'extra' AND h.board_pinned_at IS NOT NULL AND h.data->>'date' BETWEEN ${from} AND ${last}
    `,
    sql`SELECT item_id FROM handoff_items WHERE kind = 'note' AND item_id LIKE 'missed-%' AND board_done_at IS NULL`,
  ])) as [AccountRow[], ScheduleRow[], ExceptionRow[], MarkRow[], DayRow[], DayRow[], DayRow[], DayRow[], ExtraRow[], { item_id: string }[]];

  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const rangeStart = dayToDate(from);
  const rangeEnd = dayToDate(last);

  // 1. What the schedules say: account + day -> the sub and the time window.
  const planned = new Map<string, { accountId: string; day: string; sub: string; subId: string; timeWindow: string }>();
  for (const row of schedules) {
    if (!accountById.has(row.account_id)) continue;
    // Rows from before Frequency existed are plain weekly ones (Recurring = Y and a day of the week).
    const frequency = row.frequency.trim() || (row.recurring.trim().toUpperCase() === "Y" && row.day_of_week.trim() ? "WEEKLY" : "");
    const days = generateScheduleDates(
      { frequency, dayOfWeek: row.day_of_week, monthlyOccurrence: row.monthly_occurrence, effectiveStart: row.effective_start ?? "", effectiveEnd: row.effective_end ?? "" },
      rangeStart,
      rangeEnd
    );
    for (const day of days) {
      const k = key(row.account_id, day);
      const existing = planned.get(k);
      if (existing) {
        if (row.time_window && !existing.timeWindow.includes(row.time_window)) existing.timeWindow = [existing.timeWindow, row.time_window].filter(Boolean).join(", ");
      } else {
        planned.set(k, { accountId: row.account_id, day, sub: row.sub, subId: row.sub_id, timeWindow: row.time_window });
      }
    }
  }

  // 2. Exceptions: a skipped day comes off, a rescheduled one moves.
  for (const exception of exceptions) {
    const original = exception.original_day ? planned.get(key(exception.account_id, exception.original_day)) : undefined;
    const type = exception.type.toLowerCase();
    if (type === "skip") {
      if (exception.original_day) planned.delete(key(exception.account_id, exception.original_day));
    } else if (type === "reschedule" && exception.new_day) {
      if (exception.original_day) planned.delete(key(exception.account_id, exception.original_day));
      if (exception.new_day >= from && exception.new_day <= last && accountById.has(exception.account_id)) {
        const account = accountById.get(exception.account_id)!;
        planned.set(key(exception.account_id, exception.new_day), {
          accountId: exception.account_id,
          day: exception.new_day,
          sub: original?.sub ?? account.sub,
          subId: original?.subId ?? account.sub_id,
          timeWindow: exception.new_time_window || original?.timeWindow || "",
        });
      }
    }
  }

  // 3. What shows a day was cleaned. The first kind of proof found is the one named.
  const proof = new Map<string, CleaningProof>();
  const addProof = (rows: DayRow[], kind: CleaningProof) => {
    for (const row of rows) {
      const k = key(row.account_id, row.day);
      if (row.account_id && !proof.has(k)) proof.set(k, kind);
    }
  };
  addProof(checklists, "checklist");
  addProof(subVisits, "sub-visit");
  addProof(photos, "photo");
  const markBy = new Map(marks.map((mark) => [key(mark.account_id, mark.day), mark.mark]));
  const visited = new Set(visits.filter((visit) => visit.account_id).map((visit) => key(visit.account_id, visit.day)));
  const pinnedMissed = new Set(pinned.map((row) => row.item_id));

  const cleanings: Cleaning[] = [];
  const build = (accountId: string, day: string, plan: { sub: string; subId: string; timeWindow: string } | null): Cleaning | null => {
    const account = accountById.get(accountId);
    if (!account) return null;
    const k = key(accountId, day);
    const mark = markBy.get(k);
    const found = proof.get(k) ?? "";
    let status: Cleaning["status"];
    let shown: CleaningProof = found;
    if (mark === "missed") {
      status = "missed";
      shown = "marked";
    } else if (mark === "cleaned") {
      status = "cleaned";
      shown = found || "marked";
    } else if (found) {
      status = "cleaned";
    } else if (day < today) {
      status = account.checklist_needed.trim().toLowerCase() === "yes" ? "missed" : "unconfirmed";
    } else {
      status = "scheduled";
    }
    return {
      day,
      accountId,
      accountName: account.account_name,
      sub: plan?.sub || account.sub,
      subId: plan?.subId || account.sub_id,
      manager: account.manager,
      timeWindow: plan?.timeWindow ?? "",
      status,
      proof: status === "cleaned" || status === "missed" ? shown : "",
      visited: visited.has(k),
      unscheduled: plan === null,
      paperId: "",
      pinned: pinnedMissed.has(missedPaperId(accountId, day)),
    };
  };

  for (const plan of planned.values()) {
    const cleaning = build(plan.accountId, plan.day, plan);
    if (cleaning) cleanings.push(cleaning);
  }
  // Cleaned (or marked) on a day the schedule did not have.
  for (const k of new Set([...proof.keys(), ...markBy.keys()])) {
    if (planned.has(k)) continue;
    const [accountId, day] = k.split("|");
    const cleaning = build(accountId, day, null);
    if (cleaning) cleanings.push(cleaning);
  }
  // Extra jobs that were given a day on the board.
  for (const extra of extras) {
    const account = accountById.get(extra.account_id);
    cleanings.push({
      day: extra.day,
      accountId: extra.account_id,
      accountName: extra.account_name || extra.title,
      sub: account?.sub ?? "",
      subId: account?.sub_id ?? "",
      manager: account?.manager ?? extra.manager,
      timeWindow: "",
      status: "extra",
      proof: "",
      visited: false,
      unscheduled: true,
      paperId: extra.item_id,
      pinned: false,
    });
  }

  cleanings.sort((a, b) => a.day.localeCompare(b.day) || a.accountName.localeCompare(b.accountName));
  const names = (values: string[]) => Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  return { today, from, to: last, cleanings, managers: names(cleanings.map((c) => c.manager)), subs: names(cleanings.map((c) => c.sub)) };
}

/** The board paper for one missed cleaning. One per account and day, so a second tap pins nothing new. */
export function missedPaperId(accountId: string, day: string): string {
  return `missed-${accountId}-${day}`;
}

/** A manager's own answer for one account on one day. `mark: ""` takes the answer back. */
export async function markCleaning(input: { accountId: string; day: string; mark: "cleaned" | "missed" | ""; by: string }): Promise<void> {
  const sql = getSql();
  if (input.mark === "") {
    await sql`DELETE FROM cleaning_marks WHERE account_id = ${input.accountId} AND day = ${input.day}::date`;
    return;
  }
  await sql`
    INSERT INTO cleaning_marks (account_id, day, mark, account_name, marked_by)
    SELECT ${input.accountId}, ${input.day}::date, ${input.mark}, COALESCE((SELECT btrim(account_name) FROM accounts WHERE id = ${input.accountId}), ''), ${input.by}
    ON CONFLICT (account_id, day) DO UPDATE SET mark = EXCLUDED.mark, marked_by = EXCLUDED.marked_by, marked_at = now()
  `;
}

/**
 * Pins a missed cleaning to the board as a to-do, in the square of the
 * account's manager when that manager has one. Returns false when it was
 * already pinned.
 */
export async function pinMissedCleaning(input: { accountId: string; day: string; by: string }): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    SELECT btrim(a.account_name) AS account_name, COALESCE(NULLIF(btrim(m.name), ''), btrim(a.manager_raw), '') AS manager,
           COALESCE((SELECT s.id FROM staff s WHERE s.id = m.staff_id AND s.role = 'Manager' AND s.active), '') AS square
    FROM accounts a LEFT JOIN managers m ON m.id = a.manager_id
    WHERE a.id = ${input.accountId}
  `) as { account_name: string; manager: string; square: string }[];
  const account = rows[0];
  if (!account) return false;
  const label = dayToDate(input.day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const inserted = (await sql`
    INSERT INTO handoff_items (kind, item_id, title, account_id, account_name, manager, step, data, created_by, board_pinned_at, board_square)
    VALUES ('note', ${missedPaperId(input.accountId, input.day)}, ${`Missed cleaning ${label}: ${account.account_name}`}, ${input.accountId}, ${account.account_name},
            ${account.manager}, 'pinned', ${JSON.stringify({ notes: "", date: input.day })}::jsonb, ${input.by}, now(), ${account.square})
    ON CONFLICT (kind, item_id) DO NOTHING
    RETURNING item_id
  `) as unknown[];
  return inserted.length > 0;
}
