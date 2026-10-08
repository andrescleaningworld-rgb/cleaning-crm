// Postgres versions of the to-do and text-message-log reads/writes in
// lib/googleSheets.ts (To Do, SmsLog). Same function names, arguments,
// return shapes, ordering and error messages, so lib/data/todos.ts can
// switch between the two.
//
// Flags and priority are stored as the text the sheet holds, and read with
// the same rules: Calendar Sync Failed is true only for "TRUE", Sync To
// Calendar is off only for "FALSE" (blank means on), Priority falls back to
// Medium. Rows are read in sheet order (sheet_row); rows created here get
// the next row number, where Sheets would have put them.

import { getSql } from "@/lib/db";
import { DEFAULT_TO_DO_PRIORITY, normalizeToDoPriority } from "@/lib/toDoPriority";
import type * as sheets from "@/lib/googleSheets";
import type {
  SmsLogEntry,
  ToDo,
  ToDoBulkEditEntry,
  ToDoBulkEditResult,
  ToDoEditInput,
  ToDoEditResult,
  ToDoStatusUpdateResult,
} from "@/lib/googleSheets";

type ToDoInput = Parameters<typeof sheets.appendToDo>[0];

type ToDoRow = {
  todo_id: string;
  created_date_raw: string;
  due_date_raw: string;
  assigned_to: string;
  account_name: string;
  task_type: string;
  why: string;
  status: string;
  notes: string;
  group_id: string;
  outcome: string;
  calendar_event_id: string;
  calendar_sync_failed_raw: string;
  sync_to_calendar_raw: string;
  priority_raw: string;
  account_id_raw: string;
  sheet_row: number;
};

const TODO_COLUMNS =
  "todo_id, created_date_raw, due_date_raw, assigned_to, account_name, task_type, why, status, notes, group_id, outcome, calendar_event_id, calendar_sync_failed_raw, sync_to_calendar_raw, priority_raw, account_id_raw, sheet_row";

async function allToDoRows(): Promise<ToDoRow[]> {
  const sql = getSql();
  return (await sql.query(`SELECT ${TODO_COLUMNS} FROM todos WHERE account_ref IS NULL OR account_ref NOT IN (SELECT id FROM accounts WHERE is_test AND id IS NOT NULL) ORDER BY sheet_row`)) as ToDoRow[];
}

/** YYYY-MM-DD for the typed column, or null. */
function toDay(text: string): string | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(text ?? "").trim());
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
}

/* ---------- Reads ---------- */

export async function fetchToDos(): Promise<ToDo[]> {
  return (await allToDoRows())
    .map((r) => ({
      sheetRow: r.sheet_row,
      id: r.todo_id,
      createdDate: r.created_date_raw,
      dueDate: r.due_date_raw,
      assignedTo: r.assigned_to,
      accountName: r.account_name,
      taskType: r.task_type,
      why: r.why,
      status: r.status,
      notes: r.notes,
      groupId: r.group_id,
      outcome: r.outcome,
      calendarEventId: r.calendar_event_id,
      calendarSyncFailed: r.calendar_sync_failed_raw === "TRUE",
      syncToCalendar: r.sync_to_calendar_raw !== "FALSE",
      priority: normalizeToDoPriority(r.priority_raw),
      accountId: r.account_id_raw,
    }))
    .filter((t) => t.id);
}

// Same lookup as the Sheets findToDoRow: the first row whose ID matches.
async function findToDoRow(targetId: string): Promise<ToDoRow> {
  const row = (await allToDoRows()).find((r) => r.todo_id.trim() === targetId);
  if (!row) throw new Error(`To-do "${targetId}" not found.`);
  return row;
}

/* ---------- Create ---------- */

function insertValues(id: string, createdDate: string, data: ToDoInput): unknown[] {
  return [
    id,
    createdDate,
    data.dueDate,
    toDay(data.dueDate),
    data.assignedTo,
    data.accountName,
    data.accountId ?? "",
    data.taskType,
    data.why,
    data.status,
    data.notes,
    data.groupId ?? "",
    data.calendarEventId ?? "",
    data.calendarSyncFailed ? "TRUE" : "",
    data.syncToCalendar === false ? "FALSE" : "TRUE",
    normalizeToDoPriority(data.priority),
  ];
}

// $17 is the offset inside a batch (0 for a single to-do), so every row of a
// batch gets its own consecutive row number in one statement.
const INSERT_TODO = `
  INSERT INTO todos (
    legacy_key, todo_id, created_date_raw, created_date, due_date_raw, due_date, assigned_to,
    account_name, account_id_raw, account_ref, task_type, why, status, notes, group_id,
    calendar_event_id, calendar_sync_failed_raw, sync_to_calendar_raw, priority_raw, sheet_row)
  SELECT
    CASE WHEN EXISTS (SELECT 1 FROM todos WHERE legacy_key = $1::text) THEN $1::text || '#' || (base.n + $17::int)::text ELSE $1::text END,
    $1::text, $2::text, $2::date, $3::text, $4::date, $5::text,
    $6::text, $7::text,
    COALESCE(
      (SELECT id FROM accounts WHERE btrim($7::text) <> '' AND id = btrim($7::text) LIMIT 1),
      (SELECT CASE WHEN count(*) = 1 THEN min(id) END FROM accounts WHERE btrim($6::text) <> '' AND lower(btrim(account_name)) = lower(btrim($6::text)))
    ),
    $8::text, $9::text, $10::text, $11::text, $12::text,
    $13::text, $14::text, $15::text, $16::text, base.n + $17::int
  FROM (SELECT COALESCE(MAX(sheet_row), 1) + 1 AS n FROM todos) base`;

export async function appendToDo(data: ToDoInput): Promise<string> {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const id = `TODO-${stamp}`;
  const createdDate = new Date().toISOString().slice(0, 10);
  const sql = getSql();
  await sql.query(INSERT_TODO, [...insertValues(id, createdDate, data), 0]);
  return id;
}

// One request for the whole batch, same as the Sheets version: ids get the
// row's index as a suffix, and the rows land together, in order.
export async function appendToDos(entries: ToDoInput[]): Promise<string[]> {
  if (entries.length === 0) return [];

  const baseStamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const createdDate = new Date().toISOString().slice(0, 10);
  const ids = entries.map((_, index) => `TODO-${baseStamp}-${index}`);

  const sql = getSql();
  // A transaction runs the statements one after the other, so each row sees
  // the one before it and takes the next row number.
  await sql.transaction(entries.map((data, index) => sql.query(INSERT_TODO, [...insertValues(ids[index], createdDate, data), 0])));
  return ids;
}

/* ---------- Updates ---------- */

export async function updateToDoStatus(toDoId: string, status: string, notes: string): Promise<ToDoStatusUpdateResult> {
  const targetId = toDoId.trim();
  if (!targetId) throw new Error("Missing to-do id.");

  const row = await findToDoRow(targetId);
  const sql = getSql();
  await sql.query(`UPDATE todos SET status = $2::text, notes = $3::text, updated_at = now() WHERE sheet_row = $1`, [row.sheet_row, status, notes]);

  return { accountName: row.account_name, why: row.why, calendarEventId: row.calendar_event_id };
}

export async function setToDoCalendarSyncFailed(toDoId: string, failed: boolean): Promise<void> {
  const targetId = toDoId.trim();
  if (!targetId) throw new Error("Missing to-do id.");

  const row = await findToDoRow(targetId);
  const sql = getSql();
  await sql.query(`UPDATE todos SET calendar_sync_failed_raw = $2::text, updated_at = now() WHERE sheet_row = $1`, [row.sheet_row, failed ? "TRUE" : ""]);
}

export async function setToDoCalendarFields(toDoId: string, fields: { calendarEventId?: string; calendarSyncFailed?: boolean }): Promise<void> {
  const targetId = toDoId.trim();
  if (!targetId) throw new Error("Missing to-do id.");

  const row = await findToDoRow(targetId);
  await writeCalendarFields(row.sheet_row, fields);
}

async function writeCalendarFields(sheetRow: number, fields: { calendarEventId?: string; calendarSyncFailed?: boolean }): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [sheetRow];
  if (fields.calendarEventId !== undefined) {
    params.push(fields.calendarEventId);
    sets.push(`calendar_event_id = $${params.length}::text`);
  }
  if (fields.calendarSyncFailed !== undefined) {
    params.push(fields.calendarSyncFailed ? "TRUE" : "");
    sets.push(`calendar_sync_failed_raw = $${params.length}::text`);
  }
  if (sets.length === 0) return;
  const sql = getSql();
  await sql.query(`UPDATE todos SET ${sets.join(", ")}, updated_at = now() WHERE sheet_row = $1`, params);
}

// Writes only the fields present in `updates`, on one row.
async function writeEdit(sheetRow: number, updates: ToDoEditInput): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [sheetRow];
  const set = (column: string, value: unknown, cast = "text") => {
    params.push(value);
    sets.push(`${column} = $${params.length}::${cast}`);
  };
  if (updates.dueDate !== undefined) {
    set("due_date_raw", updates.dueDate);
    set("due_date", toDay(updates.dueDate), "date");
  }
  if (updates.assignedTo !== undefined) set("assigned_to", updates.assignedTo);
  if (updates.taskType !== undefined) set("task_type", updates.taskType);
  if (updates.status !== undefined) set("status", updates.status);
  if (updates.notes !== undefined) set("notes", updates.notes);
  if (updates.syncToCalendar !== undefined) set("sync_to_calendar_raw", updates.syncToCalendar ? "TRUE" : "FALSE");
  if (updates.priority !== undefined) set("priority_raw", updates.priority);
  if (sets.length === 0) return;
  const sql = getSql();
  await sql.query(`UPDATE todos SET ${sets.join(", ")}, updated_at = now() WHERE sheet_row = $1`, params);
}

// The resolved values after an edit: the new value where the edit changed
// it, the stored value otherwise, plus the pre-edit event id and assignee.
function editResult(row: ToDoRow, updates: ToDoEditInput): ToDoEditResult {
  return {
    accountName: row.account_name,
    why: row.why,
    taskType: updates.taskType ?? row.task_type,
    dueDate: updates.dueDate ?? row.due_date_raw,
    assignedTo: updates.assignedTo ?? row.assigned_to,
    status: updates.status ?? row.status,
    notes: updates.notes ?? row.notes,
    syncToCalendar: updates.syncToCalendar !== undefined ? updates.syncToCalendar : row.sync_to_calendar_raw !== "FALSE",
    priority: updates.priority ?? normalizeToDoPriority(row.priority_raw),
    previousCalendarEventId: row.calendar_event_id,
    previousAssignedTo: row.assigned_to,
  };
}

export async function updateToDo(toDoId: string, updates: ToDoEditInput): Promise<ToDoEditResult> {
  const targetId = toDoId.trim();
  if (!targetId) throw new Error("Missing to-do id.");

  const row = await findToDoRow(targetId);
  await writeEdit(row.sheet_row, updates);
  return editResult(row, updates);
}

// An id that no longer exists is reported back with notFound instead of
// failing the batch, same as the Sheets version.
export async function updateToDosBatch(entries: ToDoBulkEditEntry[]): Promise<ToDoBulkEditResult[]> {
  const targetIds = entries.map((entry) => entry.toDoId.trim()).filter(Boolean);
  if (targetIds.length === 0) return [];

  // Like the Sheets findToDoRows: when an ID appears on two rows, the later one wins.
  const rowsById = new Map<string, ToDoRow>();
  for (const row of await allToDoRows()) {
    const id = row.todo_id.trim();
    if (targetIds.includes(id)) rowsById.set(id, row);
  }

  const results: ToDoBulkEditResult[] = [];
  for (const entry of entries) {
    const targetId = entry.toDoId.trim();
    const row = rowsById.get(targetId);
    if (!row) {
      results.push({
        toDoId: targetId,
        sheetRow: -1,
        accountName: "",
        why: "",
        taskType: "",
        dueDate: "",
        assignedTo: "",
        status: "",
        notes: "",
        syncToCalendar: true,
        priority: DEFAULT_TO_DO_PRIORITY,
        previousCalendarEventId: "",
        previousAssignedTo: "",
        notFound: true,
      });
      continue;
    }
    await writeEdit(row.sheet_row, entry.updates);
    results.push({ toDoId: targetId, sheetRow: row.sheet_row, ...editResult(row, entry.updates) });
  }
  return results;
}

export async function setToDoCalendarFieldsBatch(
  entries: { sheetRow: number; calendarEventId?: string; calendarSyncFailed?: boolean }[]
): Promise<void> {
  for (const entry of entries) {
    if (entry.sheetRow < 0) continue; // notFound placeholder
    await writeCalendarFields(entry.sheetRow, entry);
  }
}

export async function updateToDoOutcome(toDoId: string, outcome: string): Promise<void> {
  const targetId = toDoId.trim();
  if (!targetId) throw new Error("Missing to-do id.");

  const row = await findToDoRow(targetId);
  const sql = getSql();
  await sql.query(`UPDATE todos SET outcome = $2::text, updated_at = now() WHERE sheet_row = $1`, [row.sheet_row, outcome]);
}

/* ---------- Text-message log ---------- */

type SmsRow = {
  todo_id: string;
  text_id: string;
  manager_phone: string;
  status: string;
  sent_at_raw: string;
  last_checked_at_raw: string;
  quota_remaining_raw: string;
  sheet_row: number;
};

async function allSmsRows(): Promise<SmsRow[]> {
  const sql = getSql();
  return (await sql.query(
    `SELECT todo_id, text_id, manager_phone, status, sent_at_raw, last_checked_at_raw, quota_remaining_raw, sheet_row FROM todo_sms_log ORDER BY sheet_row`
  )) as SmsRow[];
}

// Every attempt for a to-do, most recent first.
export async function fetchSmsLogForToDo(toDoId: string): Promise<SmsLogEntry[]> {
  const target = toDoId.trim();
  if (!target) return [];

  return (await allSmsRows())
    .map((r) => ({
      sheetRow: r.sheet_row,
      toDoId: r.todo_id,
      textId: r.text_id,
      managerPhone: r.manager_phone,
      status: r.status,
      sentAt: r.sent_at_raw,
      lastCheckedAt: r.last_checked_at_raw,
      quotaRemaining: r.quota_remaining_raw,
    }))
    .filter((entry) => entry.toDoId === target)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

export async function appendSmsLog(entry: {
  toDoId: string;
  textId: string;
  managerPhone: string;
  status: string;
  quotaRemaining?: number;
}): Promise<void> {
  const sentAt = new Date().toISOString();
  const sql = getSql();
  // The key only has to be unique: the provider's id when there is one,
  // else the to-do and the moment.
  const key = entry.textId.trim() ? `text:${entry.textId.trim()}` : `attempt:${entry.toDoId}:${sentAt}`;
  await sql.query(
    `INSERT INTO todo_sms_log (legacy_key, todo_id, text_id, manager_phone, status, sent_at_raw, sent_at, quota_remaining_raw, sheet_row)
     SELECT
       CASE WHEN EXISTS (SELECT 1 FROM todo_sms_log WHERE legacy_key = $1::text) THEN $1::text || '#' || base.n::text ELSE $1::text END,
       $2::text, $3::text, $4::text, $5::text, $6::text, $6::timestamptz, $7::text, base.n
     FROM (SELECT COALESCE(MAX(sheet_row), 1) + 1 AS n FROM todo_sms_log) base`,
    [key, entry.toDoId, entry.textId, entry.managerPhone, entry.status, sentAt, entry.quotaRemaining !== undefined ? String(entry.quotaRemaining) : ""]
  );
}

// The most recent send that reported a quota.
export async function fetchLatestSmsQuota(): Promise<{ quotaRemaining: number; sentAt: string } | null> {
  let latest: { quotaRemaining: number; sentAt: string } | null = null;
  for (const row of await allSmsRows()) {
    const raw = row.quota_remaining_raw;
    if (!raw) continue;
    const quotaRemaining = Number(raw);
    if (!Number.isFinite(quotaRemaining)) continue;

    const sentAt = row.sent_at_raw;
    if (!latest || sentAt > latest.sentAt) latest = { quotaRemaining, sentAt };
  }
  return latest;
}

// Keyed by the provider's text id; nothing happens for a blank id or an
// unknown one. Updates the first matching row, like the Sheets version.
export async function updateSmsLogStatus(textId: string, status: string): Promise<void> {
  const target = textId.trim();
  if (!target) return;

  const row = (await allSmsRows()).find((r) => r.text_id.trim() === target);
  if (!row) return;

  const lastCheckedAt = new Date().toISOString();
  const sql = getSql();
  await sql.query(
    `UPDATE todo_sms_log SET status = $2::text, last_checked_at_raw = $3::text, last_checked_at = $3::timestamptz, updated_at = now() WHERE sheet_row = $1`,
    [row.sheet_row, status, lastCheckedAt]
  );
}
