// Postgres versions of the scheduling reads/writes in lib/googleSheets.ts
// (SubSchedules, ScheduleExceptions, subcontractor-visits). Same function
// names, arguments, return shapes, ordering and error messages, so
// lib/data/scheduling.ts can switch between the two.
//
// The app addresses these rows by row number (sheetRow). sheet_row holds it:
// imported rows keep their sheet row, rows created here get the next number
// (where Sheets would have appended them).
//
// One difference from Sheets, on purpose: deleting a row removes it. Sheets
// only blanks the cells, so a deleted row in the middle of the tab comes
// back as an entry with every field empty; here it is simply gone.

import { getSql } from "@/lib/db";
import { addDays, officeDay } from "@/lib/cleanings";
import { cancelledLastDays } from "@/lib/pg/accounts";
import type { ScheduleException, SubcontractorVisitWithRow, SubSchedule } from "@/lib/googleSheets";
import { dateOrNull, timestampOrNull } from "@/lib/dateUtils";
import { parseClock, toClock, toScheduleType } from "@/lib/schedule-time";

// The next row number for a table: after the last row, never before row 2
// (row 1 is the header in Sheets).
const nextRow = (table: string) => `(SELECT COALESCE(MAX(sheet_row), 1) + 1 FROM ${table})`;

type ColumnTarget = { column: string; typed?: { column: string; value: (text: string) => unknown } };

/** Builds "col = $n" pairs for the fields that were sent, text and typed column together. */
function buildSets(fields: Record<string, unknown>, targets: Record<string, ColumnTarget>, params: unknown[]): string[] {
  const sets: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    const target = targets[key];
    if (!target) continue;
    params.push(value);
    sets.push(`${target.column} = $${params.length}`);
    if (target.typed) {
      params.push(target.typed.value(String(value)));
      sets.push(`${target.typed.column} = $${params.length}`);
    }
  }
  return sets;
}

/* ---------- Subcontractor visit log ---------- */

type VisitRow = {
  visit_id: string;
  account_name: string;
  sub_email: string;
  sub_name: string;
  visit_date_raw: string;
  arrival_time: string;
  notes: string;
  sheet_row: number;
};

const rowToVisit = (r: VisitRow): SubcontractorVisitWithRow => ({
  sheetRow: r.sheet_row,
  visitId: r.visit_id,
  accountName: r.account_name,
  subEmail: r.sub_email,
  subName: r.sub_name,
  visitDate: r.visit_date_raw,
  arrivalTime: r.arrival_time,
  notes: r.notes,
});

async function allVisits(): Promise<SubcontractorVisitWithRow[]> {
  const sql = getSql();
  const rows = (await sql.query(`SELECT * FROM subcontractor_visits WHERE account_ref IS NULL OR account_ref NOT IN (SELECT id FROM accounts WHERE is_test AND id IS NOT NULL) ORDER BY sheet_row`)) as VisitRow[];
  return rows.map(rowToVisit);
}

export async function getAllSubcontractorVisits(): Promise<SubcontractorVisitWithRow[]> {
  return (await allVisits()).filter((v) => v.visitDate || v.visitId);
}

export async function getSubcontractorVisits(subEmail: string, accountName?: string): Promise<SubcontractorVisitWithRow[]> {
  const emailLower = subEmail.trim().toLowerCase();
  const accountLower = accountName?.trim().toLowerCase();
  return (await allVisits())
    .filter((r) => r.subEmail.trim().toLowerCase() === emailLower)
    .filter((r) => !accountLower || r.accountName.trim().toLowerCase() === accountLower);
}

export async function updateSubcontractorVisit(
  sheetRow: number,
  fields: Partial<{
    accountName: string;
    subName: string;
    visitDate: string;
    arrivalTime: string;
    notes: string;
  }>
): Promise<void> {
  const params: unknown[] = [sheetRow];
  const sets = buildSets(
    fields,
    {
      accountName: { column: "account_name" },
      subName: { column: "sub_name" },
      visitDate: { column: "visit_date_raw", typed: { column: "visit_date", value: dateOrNull } },
      arrivalTime: { column: "arrival_time" },
      notes: { column: "notes" },
    },
    params
  );
  if (sets.length === 0) return;
  const sql = getSql();
  await sql.query(`UPDATE subcontractor_visits SET ${sets.join(", ")}, updated_at = now() WHERE sheet_row = $1`, params);
}

export async function deleteSubcontractorVisit(sheetRow: number): Promise<void> {
  const sql = getSql();
  await sql.query(`DELETE FROM subcontractor_visits WHERE sheet_row = $1`, [sheetRow]);
}

export async function logSubcontractorVisit(data: {
  accountName: string;
  subEmail: string;
  subName: string;
  visitDate: string;
  arrivalTime: string;
  notes: string;
}): Promise<string> {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const visitId = `VIS-${data.visitDate.replace(/-/g, "")}-${stamp.slice(-8)}`;
  const sql = getSql();
  // legacy_key must be unique; the visit id is only unique to the second, so
  // a second visit logged in the same second for the same date gets a suffix.
  await sql.query(
    `INSERT INTO subcontractor_visits (legacy_key, visit_id, account_name, sub_email, sub_name, visit_date_raw, visit_date, arrival_time, notes, sheet_row)
     VALUES (
       CASE WHEN EXISTS (SELECT 1 FROM subcontractor_visits WHERE legacy_key = $1)
            THEN $1 || '#' || ${nextRow("subcontractor_visits")}::text ELSE $1 END,
       $1, $2, $3, $4, $5, $6, $7, $8, ${nextRow("subcontractor_visits")})`,
    [visitId, data.accountName, data.subEmail, data.subName, data.visitDate, dateOrNull(data.visitDate), data.arrivalTime, data.notes]
  );
  return visitId;
}

/* ---------- Subcontractor schedules ---------- */

type ScheduleRow = {
  schedule_id: string;
  account_id: string;
  account_ref: string | null;
  sub_id_raw: string;
  day_of_week: string;
  time_window: string;
  recurring: string;
  effective_start_raw: string;
  effective_end_raw: string;
  status: string;
  submitted_by: string;
  submitted_date_raw: string;
  last_edited_by: string;
  last_edited_date_raw: string;
  frequency: string;
  monthly_occurrence: string;
  submitted_via: string;
  sheet_row: number;
  // Migration 042; missing before it is applied.
  schedule_type?: string;
  start_time?: string | null;
};

// The last day a cancelled account has cleanings: its final cleaning date,
// or yesterday when none was recorded (so nothing from today on).
// undefined = the account is not cancelled.
async function lastDayByAccount(): Promise<(accountId: string) => string | undefined> {
  const lastDays = await cancelledLastDays();
  const yesterday = addDays(officeDay(), -1);
  return (accountId) => {
    const day = lastDays.get(accountId);
    return day === undefined ? undefined : day || yesterday;
  };
}

/**
 * Every schedule, for the screens. A cancelled account's schedules end on
 * its final cleaning date here (the "Change status" sheet), so no calendar
 * or "next cleaning" shows a day after it. Nothing is changed in the table:
 * the schedule records stay as they are, and when the account gets another
 * status its schedule is back without re-entering it. The end date that is
 * really stored rides along as storedEffectiveEnd, for the sheet that edits
 * a schedule.
 */
export async function fetchSubSchedules(): Promise<SubSchedule[]> {
  const [schedules, lastDayOf] = await Promise.all([storedSubSchedules(), lastDayByAccount()]);
  return schedules.map(({ schedule, accountId }) => {
    const lastDay = lastDayOf(accountId);
    if (!lastDay) return schedule;
    const end = dateOrNull(schedule.effectiveEnd);
    return end && end <= lastDay ? schedule : { ...schedule, effectiveEnd: lastDay, storedEffectiveEnd: schedule.effectiveEnd };
  });
}

// The schedules exactly as stored. The saves below read these, so a final
// cleaning date is never written into a schedule by accident.
async function storedSubSchedules(): Promise<{ schedule: SubSchedule; accountId: string }[]> {
  const sql = getSql();
  const rows = (await sql.query(`SELECT * FROM sub_schedules WHERE account_ref IS NULL OR account_ref NOT IN (SELECT id FROM accounts WHERE is_test AND id IS NOT NULL) ORDER BY sheet_row`)) as ScheduleRow[];
  return rows.map((r) => ({ accountId: (r.account_ref ?? r.account_id).trim(), schedule: toSubSchedule(r) }));
}

function toSubSchedule(r: ScheduleRow): SubSchedule {
  return {
    sheetRow: r.sheet_row,
    scheduleId: r.schedule_id,
    accountId: r.account_id,
    subId: r.sub_id_raw,
    dayOfWeek: r.day_of_week,
    timeWindow: r.time_window,
    recurring: r.recurring,
    effectiveStart: r.effective_start_raw,
    effectiveEnd: r.effective_end_raw,
    status: r.status,
    submittedBy: r.submitted_by,
    submittedDate: r.submitted_date_raw,
    lastEditedBy: r.last_edited_by,
    lastEditedDate: r.last_edited_date_raw,
    frequency: r.frequency,
    monthlyOccurrence: r.monthly_occurrence,
    // Historical rows predate this column: blank means "Sub Portal".
    submittedVia: r.submitted_via.trim() || "Sub Portal",
    scheduleType: toScheduleType(r.schedule_type),
    startTime: r.start_time ? toClock(parseClock(r.start_time) ?? 0) : "",
  };
}

export async function appendSubSchedule(data: {
  accountId: string;
  subId: string;
  dayOfWeek: string;
  timeWindow: string;
  recurring: string;
  effectiveStart: string;
  effectiveEnd: string;
  status: string;
  submittedBy: string;
  submittedVia: string;
  frequency?: string;
  monthlyOccurrence?: string;
  scheduleType?: string;
  startTime?: string;
}): Promise<string> {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const rand = Math.random().toString(36).slice(2, 6);
  const scheduleId = `SCH-${data.accountId}-${stamp.slice(-8)}-${rand}`;
  const today = new Date().toISOString().slice(0, 10);
  const sql = getSql();
  await sql.query(
    `INSERT INTO sub_schedules (
       legacy_key, schedule_id, account_id, account_ref, sub_id_raw, subcontractor_id,
       day_of_week, time_window, recurring, effective_start_raw, effective_start,
       effective_end_raw, effective_end, status, submitted_by, submitted_date_raw, submitted_date,
       frequency, monthly_occurrence, submitted_via, sheet_row)
     VALUES (
       $1, $1, $2,
       (SELECT id FROM accounts WHERE id = btrim($2) LIMIT 1),
       $3,
       (SELECT CASE WHEN count(*) = 1 THEN min(id) END FROM subcontractors WHERE btrim($3) <> '' AND lower(btrim(email)) = lower(btrim($3))),
       $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, ${nextRow("sub_schedules")})`,
    [
      scheduleId,
      data.accountId,
      data.subId,
      data.dayOfWeek,
      data.timeWindow,
      data.recurring,
      data.effectiveStart,
      dateOrNull(data.effectiveStart),
      data.effectiveEnd,
      dateOrNull(data.effectiveEnd),
      data.status,
      data.submittedBy,
      today,
      today,
      data.frequency ?? "",
      data.monthlyOccurrence ?? "",
      data.submittedVia,
    ]
  );
  await saveAppointment(scheduleId, data.scheduleType, data.startTime);
  return scheduleId;
}

// An appointment's exact start time, on the row just added. Its own step, so
// a database without migration 042 still saves the schedule (as a window).
async function saveAppointment(scheduleId: string, scheduleType: string | undefined, startTime: string | undefined): Promise<void> {
  const start = parseClock(startTime);
  if (toScheduleType(scheduleType) !== "appointment" || start === null) return;
  const sql = getSql();
  try {
    await sql.query(`UPDATE sub_schedules SET schedule_type = 'appointment', start_time = $2::time WHERE schedule_id = $1`, [scheduleId, toClock(start)]);
  } catch (error) {
    if ((error as { code?: string }).code !== "42703") throw error;
  }
}

// SubmittedBy/SubmittedDate/ScheduleID/AccountID/SubID are intentionally not
// editable here, same as the Sheets version.
export async function updateSubSchedule(
  sheetRow: number,
  fields: Partial<{
    dayOfWeek: string;
    timeWindow: string;
    recurring: string;
    effectiveStart: string;
    effectiveEnd: string;
    status: string;
    lastEditedBy: string;
    lastEditedDate: string;
    frequency: string;
    monthlyOccurrence: string;
  }>
): Promise<void> {
  const params: unknown[] = [sheetRow];
  const sets = buildSets(
    fields,
    {
      dayOfWeek: { column: "day_of_week" },
      timeWindow: { column: "time_window" },
      recurring: { column: "recurring" },
      effectiveStart: { column: "effective_start_raw", typed: { column: "effective_start", value: dateOrNull } },
      effectiveEnd: { column: "effective_end_raw", typed: { column: "effective_end", value: dateOrNull } },
      status: { column: "status" },
      lastEditedBy: { column: "last_edited_by" },
      lastEditedDate: { column: "last_edited_date_raw", typed: { column: "last_edited_at", value: timestampOrNull } },
      frequency: { column: "frequency" },
      monthlyOccurrence: { column: "monthly_occurrence" },
    },
    params
  );
  if (sets.length === 0) return;
  const sql = getSql();
  await sql.query(`UPDATE sub_schedules SET ${sets.join(", ")}, updated_at = now() WHERE sheet_row = $1`, params);
}

// Pattern-affecting edits are versioned, not patched in place: the existing
// row is closed (EffectiveEnd = the day before, Status "Superseded") and a
// new row starts on effectiveDate. See the Sheets version for the full rules.
export async function applySchedulePatternChange(
  scheduleId: string,
  newPattern: {
    dayOfWeek: string;
    timeWindow: string;
    frequency: string;
    monthlyOccurrence: string;
    status?: string;
    scheduleType?: string;
    startTime?: string;
  },
  effectiveDate: string,
  editedBy: string
): Promise<{ scheduleId: string; accountId: string; subId: string }> {
  const schedules = (await storedSubSchedules()).map(({ schedule }) => schedule);
  const current = schedules.find((s) => s.scheduleId === scheduleId);
  if (!current) {
    throw new Error(`SubSchedule ${scheduleId} not found`);
  }
  if (current.effectiveStart && effectiveDate <= current.effectiveStart) {
    throw new Error(
      `effectiveDate (${effectiveDate}) must be after this schedule's current EffectiveStart (${current.effectiveStart})`
    );
  }

  const dayBefore = new Date(`${effectiveDate}T00:00:00`);
  dayBefore.setDate(dayBefore.getDate() - 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  const effectiveEnd = `${dayBefore.getFullYear()}-${pad(dayBefore.getMonth() + 1)}-${pad(dayBefore.getDate())}`;

  await updateSubSchedule(current.sheetRow, {
    effectiveEnd,
    status: "Superseded",
    lastEditedBy: editedBy,
    lastEditedDate: new Date().toISOString(),
  });

  const recurring = newPattern.frequency === "AS_NEEDED" ? "N" : "Y";
  const newScheduleId = await appendSubSchedule({
    accountId: current.accountId,
    subId: current.subId,
    dayOfWeek: newPattern.dayOfWeek,
    timeWindow: newPattern.timeWindow,
    recurring,
    effectiveStart: effectiveDate,
    effectiveEnd: current.effectiveEnd, // carries the account's original end date forward unchanged
    status: newPattern.status ?? current.status,
    submittedBy: current.submittedBy,
    submittedVia: current.submittedVia,
    frequency: newPattern.frequency,
    monthlyOccurrence: newPattern.monthlyOccurrence,
    // Not sent: the new row keeps the old one's appointment time.
    scheduleType: newPattern.scheduleType ?? current.scheduleType,
    startTime: newPattern.startTime ?? current.startTime,
  });

  return { scheduleId: newScheduleId, accountId: current.accountId, subId: current.subId };
}

// Closes every Active row for this exact account + sub before a fresh
// submission replaces them. Returns the rows it closed (as they were).
export async function supersedeActiveSubSchedulesForSub(
  accountId: string,
  subId: string,
  editedBy: string
): Promise<SubSchedule[]> {
  const schedules = (await storedSubSchedules()).map(({ schedule }) => schedule);
  const active = schedules.filter((s) => s.accountId === accountId && s.subId === subId && s.status === "Active");
  if (active.length === 0) return [];

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  const effectiveEnd = `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`;

  for (const row of active) {
    await updateSubSchedule(row.sheetRow, {
      effectiveEnd,
      status: "Superseded",
      lastEditedBy: editedBy,
      lastEditedDate: new Date().toISOString(),
    });
  }

  return active;
}

/* ---------- Schedule exceptions ---------- */

type ExceptionRow = {
  exception_id: string;
  account_id: string;
  account_ref: string | null;
  original_date_raw: string;
  type: string;
  new_date_raw: string;
  new_time_window: string;
  reason: string;
  created_by: string;
  created_date_raw: string;
  sheet_row: number;
};

export async function fetchScheduleExceptions(): Promise<ScheduleException[]> {
  const sql = getSql();
  const rows = (await sql.query(`SELECT * FROM schedule_exceptions WHERE account_ref IS NULL OR account_ref NOT IN (SELECT id FROM accounts WHERE is_test AND id IS NOT NULL) ORDER BY sheet_row`)) as ExceptionRow[];
  const lastDayOf = await lastDayByAccount();
  return rows.map((r) => {
    // A cleaning moved to a day after a cancelled account's last day does not
    // happen: the screens get it as a skipped day. The record is not changed.
    const lastDay = lastDayOf((r.account_ref ?? r.account_id).trim());
    const newDay = dateOrNull(r.new_date_raw);
    const movedPastLastDay = Boolean(lastDay && newDay && newDay > lastDay && r.type.trim().toLowerCase() === "reschedule");
    return {
      sheetRow: r.sheet_row,
      exceptionId: r.exception_id,
      accountId: r.account_id,
      originalDate: r.original_date_raw,
      type: movedPastLastDay ? "Skip" : r.type,
      newDate: movedPastLastDay ? "" : r.new_date_raw,
      newTimeWindow: movedPastLastDay ? "" : r.new_time_window,
      reason: r.reason,
      createdBy: r.created_by,
      createdDate: r.created_date_raw,
    };
  });
}

export async function appendScheduleException(data: {
  accountId: string;
  originalDate: string;
  type: string;
  newDate: string;
  newTimeWindow: string;
  reason: string;
  createdBy: string;
}): Promise<string> {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const exceptionId = `EXC-${data.accountId}-${stamp.slice(-8)}`;
  const today = new Date().toISOString().slice(0, 10);
  const sql = getSql();
  // Same note as logSubcontractorVisit: the id is unique to the second only.
  await sql.query(
    `INSERT INTO schedule_exceptions (
       legacy_key, exception_id, account_id, account_ref, original_date_raw, original_date, type,
       new_date_raw, new_date, new_time_window, reason, created_by, created_date_raw, created_date, sheet_row)
     VALUES (
       CASE WHEN EXISTS (SELECT 1 FROM schedule_exceptions WHERE legacy_key = $1)
            THEN $1 || '#' || ${nextRow("schedule_exceptions")}::text ELSE $1 END,
       $1, $2, (SELECT id FROM accounts WHERE id = btrim($2) LIMIT 1),
       $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, ${nextRow("schedule_exceptions")})`,
    [
      exceptionId,
      data.accountId,
      data.originalDate,
      dateOrNull(data.originalDate),
      data.type,
      data.newDate,
      dateOrNull(data.newDate),
      data.newTimeWindow,
      data.reason,
      data.createdBy,
      today,
      today,
    ]
  );
  return exceptionId;
}

// CreatedBy/CreatedDate/ExceptionID/AccountID are intentionally not editable.
export async function updateScheduleException(
  sheetRow: number,
  fields: Partial<{
    originalDate: string;
    type: string;
    newDate: string;
    newTimeWindow: string;
    reason: string;
  }>
): Promise<void> {
  const params: unknown[] = [sheetRow];
  const sets = buildSets(
    fields,
    {
      originalDate: { column: "original_date_raw", typed: { column: "original_date", value: dateOrNull } },
      type: { column: "type" },
      newDate: { column: "new_date_raw", typed: { column: "new_date", value: dateOrNull } },
      newTimeWindow: { column: "new_time_window" },
      reason: { column: "reason" },
    },
    params
  );
  if (sets.length === 0) return;
  const sql = getSql();
  await sql.query(`UPDATE schedule_exceptions SET ${sets.join(", ")}, updated_at = now() WHERE sheet_row = $1`, params);
}

export async function deleteScheduleException(sheetRow: number): Promise<void> {
  const sql = getSql();
  await sql.query(`DELETE FROM schedule_exceptions WHERE sheet_row = $1`, [sheetRow]);
}
