// CW Now to-dos for subs (migration 087). The office makes one on the Pin
// Board; the sub opens its private link (/porter/task/<token>), sees it and
// taps Done. Reuses the board's paper, the to-do Google Calendar functions,
// Textbelt, push and the private file store. A task is NOT a row in the old
// To-Do list, so managers never get a sub's reminders. Server only.
//
// Texts carry the link only when TEXT_LINKS_ALLOWED is on. Until then the task
// stays "Needs link" until someone uses Share on the pin.

import { randomBytes } from "node:crypto";
import { getSql } from "@/lib/db";
import { isCrewLang, type CrewLang } from "@/lib/crewLinkPeople";
import {
  NEEDS_PHOTO_ERROR,
  TASK_EMAIL_SUBJECT,
  TASK_FILE_EXTENSIONS,
  TASK_MAX,
  TASK_MAX_FILES,
  TASK_NOTE_MAX,
  TASK_OFFICE_FOLDER,
  cleanTaskTime,
  isOpenTask,
  isTaskToken,
  plainLetters,
  taskIcs,
  taskShareMessage,
  taskSmsText,
  taskSubFolder,
  type CwNowShareMethod,
  type CwNowStatus,
  type MyTodo,
  type StaffTaskRow,
  type TaskLinkKind,
  type TaskListStatus,
  type PublicTask,
  type StaffTask,
  type TaskTextKind,
} from "@/lib/cwNowTasks";
import { privateStoreOn, storedPathname, toStoredUrl } from "@/lib/files";
import { createCalendarEventForToDo, deleteCalendarEventForToDo, updateCalendarEventForToDo } from "@/lib/googleCalendar";
import { sendSubcontractorNotification } from "@/lib/email";
import { sendPush } from "@/lib/push";
import { smsLastLine, smsLinksOn } from "@/lib/sms";
import { rolloutOn } from "@/lib/rollout";
import { translateTo, translateToEnglish } from "@/lib/translate";
import { staffContact, textBoardPerson } from "@/lib/pg/board-sms";
import { todoLocation } from "@/lib/pg/todo-extras";
import { officeClock } from "@/lib/pg/todo-reminders";
import { closeComplaint } from "@/lib/data/complaints";
import { addComplaintEvent, complaintRowId, listComplaintEvents } from "@/lib/pg/complaint-events";
import { markFirstResponse } from "@/lib/pg/complaint-response";
import { recordFix } from "@/lib/pg/complaint-fix";
import { notifyReadyToReview } from "@/lib/complaintReviewNotice";
import { addJobPhoto, finishExtraJob, getExtraJob, stampEmailed } from "@/lib/pg/extra-jobs";
import { sendExtraJobDone } from "@/lib/extraJobEmail";

const clean = (value: unknown) => String(value ?? "").trim();
const iso = (value: string | Date | null | undefined) => (value ? new Date(value).toISOString() : "");
const dayText = (value: string | Date) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));
const paperId = (taskId: number) => `task-${taskId}`;
const DAY_REMINDER_AT = 8 * 60;
/** How long the sub's link keeps working after the task is done. */
const DONE_LINK_DAYS = 30;

/** A problem the person can fix: its words are safe to show. */
export class CwNowTaskError extends Error {}

let ready = false;
export async function cwNowTasksReady(): Promise<boolean> {
  if (ready) return true;
  const rows = (await getSql()`SELECT to_regclass('public.cw_now_task_events') IS NOT NULL AS ok`) as { ok: boolean }[];
  ready = rows[0]?.ok === true;
  return ready;
}

type TaskRow = {
  id: string | number;
  token: string;
  account_id: string;
  account_name: string;
  sub_id: string | null;
  sub_name: string;
  task: string;
  translations: Record<string, string> | null;
  due_date: string | Date;
  due_time: string;
  priority: string;
  status: CwNowStatus;
  link_sent_at: string | Date | null;
  seen_at: string | Date | null;
  done_at: string | Date | null;
  done_by: string;
  created_by: string;
  created_by_staff_id: string;
  created_at: string | Date;
  calendar_event_id: string;
  calendar_sync_failed: boolean;
  reminded_before_at: string | Date | null;
  reminded_day_at: string | Date | null;
  /** Migration 088; undefined before it runs. */
  extra_job_id?: string | number | null;
  complaint_row_id?: string | number | null;
  complaint_mode?: string;
  task_page?: Record<string, unknown> | null;
  sub_phone: string | null;
  sub_email: string | null;
  sub_language: string | null;
  sub_contact: string | null;
  account_gone: boolean;
};

const SELECT_TASK = `
  SELECT t.*, s.phone AS sub_phone, s.email AS sub_email, s.language AS sub_language, s.contact_name AS sub_contact,
         (a.id IS NULL OR (to_jsonb(a)->>'deleted_at') IS NOT NULL) AS account_gone
  FROM cw_now_tasks t
  LEFT JOIN subcontractors s ON s.id = t.sub_id
  LEFT JOIN accounts a ON a.id = t.account_id`;

const langOf = (row: Pick<TaskRow, "sub_language">): CrewLang => (isCrewLang(row.sub_language) ? row.sub_language : "en");
const taskIdOf = (row: Pick<TaskRow, "id">) => Number(row.id);
const dueOf = (row: Pick<TaskRow, "due_date">) => dayText(row.due_date);
const taskLink = (origin: string, row: Pick<TaskRow, "token" | "sub_language">) => {
  const lang = langOf(row);
  return `${origin.replace(/\/$/, "")}/porter/task/${row.token}${lang === "en" ? "" : `?lang=${lang}`}`;
};
const shortTask = (task: string, max = 120) => {
  const line = clean(task).split(/\r?\n/)[0] ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

async function taskById(id: number): Promise<TaskRow | null> {
  const rows = (await getSql().query(`${SELECT_TASK} WHERE t.id = $1 LIMIT 1`, [id])) as TaskRow[];
  return rows[0] ?? null;
}

async function taskByToken(token: string): Promise<TaskRow | null> {
  if (!isTaskToken(token)) return null;
  const rows = (await getSql().query(`${SELECT_TASK} WHERE t.token = $1 LIMIT 1`, [token])) as TaskRow[];
  const row = rows[0];
  if (!row || row.account_gone || row.status === "cancelled") return null;
  if (row.status === "done" && row.done_at && Date.now() - new Date(row.done_at).getTime() > DONE_LINK_DAYS * 86_400_000) return null;
  return row;
}

async function addEvent(taskId: number, event: string, fields: { method?: string; detail?: string; detailEn?: string; by?: string } = {}): Promise<number> {
  const rows = (await getSql()`
    INSERT INTO cw_now_task_events (task_id, event, method, detail, detail_en, by_name)
    VALUES (${taskId}, ${event}, ${fields.method ?? ""}, ${fields.detail ?? ""}, ${fields.detailEn ?? ""}, ${(fields.by ?? "").slice(0, 120)})
    RETURNING id
  `) as { id: string | number }[];
  return Number(rows[0]?.id ?? 0);
}

/** The paper follows the task. Only these few words are on it, never the link. */
async function patchPaper(taskId: number, patch: Record<string, string>): Promise<void> {
  await getSql()`UPDATE handoff_items SET data = data || ${JSON.stringify(patch)}::jsonb WHERE kind = 'cwnow' AND item_id = ${paperId(taskId)}`;
}

/* ---------- the form ---------- */

export type TaskSubOption = { id: string; name: string; language: CrewLang; hasPhone: boolean; hasEmail: boolean; inactive: boolean };

const subName = (row: { company_name: string; contact_name: string }) => clean(row.company_name) || clean(row.contact_name);

export async function listTaskSubs(): Promise<TaskSubOption[]> {
  const rows = (await getSql()`SELECT id, company_name, contact_name, phone, email, status, language FROM subcontractors`) as { id: string; company_name: string; contact_name: string; phone: string; email: string; status: string; language: string }[];
  return rows
    .filter((row) => subName(row))
    .map((row) => ({ id: row.id, name: subName(row), language: isCrewLang(row.language) ? row.language : ("en" as const), hasPhone: clean(row.phone) !== "", hasEmail: clean(row.email) !== "", inactive: /inactive/i.test(clean(row.status)) }))
    .sort((a, b) => Number(a.inactive) - Number(b.inactive) || a.name.localeCompare(b.name));
}

/** The sub assigned to the account. "" when the account has none, or only a typed name that matches no sub. */
export async function assignedSubId(accountId: string): Promise<string> {
  const rows = (await getSql()`SELECT subcontractor_id FROM accounts WHERE id = ${accountId} LIMIT 1`) as { subcontractor_id: string | null }[];
  return clean(rows[0]?.subcontractor_id);
}

/* ---------- making one ---------- */

export type NewTaskFile = { url: string; name: string; size: number; contentType: string };

export async function createTask(input: { accountId: string; subId: string; task: string; dueDate: string; dueTime: string; urgent: boolean; files: NewTaskFile[]; by: string; byStaffId: string; link?: TaskLink }): Promise<number> {
  const task = clean(input.task).slice(0, TASK_MAX);
  if (!task) throw new CwNowTaskError("Write the task.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) throw new CwNowTaskError("Pick the due date.");
  if (input.files.length > TASK_MAX_FILES) throw new CwNowTaskError(`Up to ${TASK_MAX_FILES} files.`);
  const files = input.files.map((file) => {
    const url = toStoredUrl(file.url);
    const path = storedPathname(url);
    const name = clean(file.name).slice(0, 200);
    if (!privateStoreOn() || !path || !path.startsWith(`${TASK_OFFICE_FOLDER}/`) || !TASK_FILE_EXTENSIONS.test(name)) throw new CwNowTaskError("A file did not upload to private storage. Remove it and try again.");
    return { url, name, size: Math.max(0, Math.round(Number(file.size) || 0)), contentType: clean(file.contentType).slice(0, 120) };
  });

  const sql = getSql();
  const [accounts, subs] = (await Promise.all([
    sql`SELECT id, account_name FROM accounts WHERE id = ${input.accountId} AND (to_jsonb(accounts)->>'deleted_at') IS NULL LIMIT 1`,
    sql`SELECT id, company_name, contact_name, phone FROM subcontractors WHERE id = ${input.subId} LIMIT 1`,
  ])) as [{ id: string; account_name: string }[], { id: string; company_name: string; contact_name: string; phone: string }[]];
  const account = accounts[0];
  const sub = subs[0];
  if (!account) throw new CwNowTaskError("Pick the account from the list.");
  if (!sub) throw new CwNowTaskError("Pick the sub.");

  const idRows = (await sql`SELECT nextval(pg_get_serial_sequence('cw_now_tasks', 'id')) AS id`) as { id: string }[];
  const id = Number(idRows[0].id);
  const token = randomBytes(24).toString("base64url");
  const accountName = clean(account.account_name);
  const name = subName(sub);
  const dueTime = cleanTaskTime(input.dueTime);
  const priority = input.urgent ? "urgent" : "normal";
  const data = {
    taskId: String(id),
    forWho: name,
    dueDate: input.dueDate,
    dueTime,
    notes: task.slice(0, 600),
    taskStatus: "needs_link",
    urgent: input.urgent ? "1" : "",
    noPhone: clean(sub.phone) ? "" : "1",
    hasNote: "",
    linkKind: input.link?.extraJobId ? "extra" : input.link?.complaintRowId ? "complaint" : "",
  };

  // All or nothing: the task, its files, its history and its paper.
  await sql.transaction([
    sql`INSERT INTO cw_now_tasks (id, token, account_id, account_name, sub_id, sub_name, task, due_date, due_time, priority, created_by, created_by_staff_id)
        VALUES (${id}, ${token}, ${account.id}, ${accountName}, ${sub.id}, ${name}, ${task}, ${input.dueDate}::date, ${dueTime}, ${priority}, ${input.by}, ${input.byStaffId})`,
    sql`INSERT INTO cw_now_task_files (task_id, source, file_url, file_name, file_size, content_type, uploaded_by)
        SELECT ${id}::bigint, 'office', f.url, f.name, f.size, f."contentType", ${input.by}
        FROM jsonb_to_recordset(${JSON.stringify(files)}::jsonb) AS f(url text, name text, size bigint, "contentType" text)`,
    sql`INSERT INTO cw_now_task_events (task_id, event, by_name) VALUES (${id}, 'created', ${input.by})`,
    sql`INSERT INTO handoff_items (kind, item_id, title, account_id, account_name, manager, step, data, created_by, board_pinned_at, board_square)
        VALUES ('cwnow', ${paperId(id)}, ${shortTask(task)}, ${account.id}, ${accountName}, '', 'pinned', ${JSON.stringify(data)}::jsonb, ${input.by}, now(), '')`,
    ...(input.link
      ? [sql`UPDATE cw_now_tasks SET extra_job_id = ${input.link.extraJobId ?? null}, complaint_row_id = ${input.link.complaintRowId ?? null}, complaint_mode = ${input.link.complaintMode ?? ""} WHERE id = ${id}`]
      : []),
  ]);
  return id;
}

/** After a new task is saved: its Spanish and Portuguese, the calendar and the text. Never throws. */
export async function deliverNewTask(taskId: number, origin: string): Promise<void> {
  try {
    const row = await taskById(taskId);
    if (!row) return;
    const [es, pt] = await Promise.all([translateTo(row.task, "es").catch(() => null), translateTo(row.task, "pt").catch(() => null)]);
    const translations = { ...(es ? { es } : {}), ...(pt ? { pt } : {}) };
    if (Object.keys(translations).length > 0) await getSql()`UPDATE cw_now_tasks SET translations = ${JSON.stringify(translations)}::jsonb WHERE id = ${taskId}`;
    await addCalendarEvent(row);
    let reached = await textSub(row, "new", origin);
    // FEATURE_SUB_NOTICES: the private link also goes by email. It counts as Sent, with its line in the history.
    if (rolloutOn("SUB_NOTICES") && clean(row.sub_email)) {
      await shareTask(taskId, "email", "CW Now", origin)
        .then(() => {
          reached = true;
        })
        .catch(async (error) => {
          console.error("[cw-now task] email:", error instanceof Error ? error.message : error);
          await addEvent(taskId, "share", { method: "email", detail: "Failed" });
        });
    }
    // A complaint's tracker: "Sent to team", only when something really went out.
    if (row.complaint_row_id) {
      await addComplaintEvent({ complaintId: Number(row.complaint_row_id), kind: "sub_notified", channel: "cw_now", status: reached ? "sent" : "skipped", detail: reached ? `CW Now task to ${row.sub_name}` : `CW Now task to ${row.sub_name}: not sent yet, use Share`, by: row.created_by || "System" });
    }
  } catch (error) {
    console.error("[cw-now task] delivery:", error instanceof Error ? error.message : error);
  }
}

/* ---------- Google Calendar ---------- */

const calendarWhy = (row: Pick<TaskRow, "sub_name" | "task">) => `${clean(row.sub_name) || "Sub"}: ${shortTask(row.task, 80)}`;

async function addCalendarEvent(row: TaskRow): Promise<void> {
  const location = await todoLocation(row.account_id, row.account_name);
  const result = await createCalendarEventForToDo({
    taskType: "CW Now",
    dueDate: dueOf(row),
    dueTime: cleanTaskTime(row.due_time),
    accountName: row.account_name,
    why: calendarWhy(row),
    notes: row.task,
    // The calendar color of the person who made it.
    assignedTo: row.created_by,
    status: "Open",
    syncToCalendar: true,
    location,
  });
  await getSql()`UPDATE cw_now_tasks SET calendar_event_id = ${result.eventId ?? ""}, calendar_sync_failed = ${result.failed}, updated_at = now() WHERE id = ${taskIdOf(row)}`;
}

async function setCalendarStatus(row: TaskRow, status: "Open" | "Done"): Promise<void> {
  if (!row.calendar_event_id) {
    if (status === "Open") await addCalendarEvent(row);
    return;
  }
  const result = await updateCalendarEventForToDo({
    eventId: row.calendar_event_id,
    accountName: row.account_name,
    why: calendarWhy(row),
    status,
    ...(status === "Open" ? { restoreReminders: true, dueDate: dueOf(row), dueTime: cleanTaskTime(row.due_time) } : {}),
  });
  await getSql()`UPDATE cw_now_tasks SET calendar_sync_failed = ${result.failed}, updated_at = now() WHERE id = ${taskIdOf(row)}`;
}

/* ---------- reaching the sub ---------- */

async function linkWentOut(taskId: number, method: string, by: string): Promise<void> {
  const rows = (await getSql()`
    UPDATE cw_now_tasks SET status = CASE WHEN status = 'needs_link' THEN 'sent' ELSE status END, link_sent_at = COALESCE(link_sent_at, now()), updated_at = now()
    WHERE id = ${taskId} RETURNING status
  `) as { status: CwNowStatus }[];
  await addEvent(taskId, "share", { method, by });
  if (rows[0]) await patchPaper(taskId, { taskStatus: rows[0].status });
}

/** One text to the sub, with the link only when links are on. Counts as Sent only when the link really went. */
async function textSub(row: TaskRow, kind: TaskTextKind, origin: string): Promise<boolean> {
  const taskId = taskIdOf(row);
  const phone = clean(row.sub_phone);
  const event = kind === "new" ? "text" : "reminder";
  if (!phone) {
    await addEvent(taskId, event, { method: kind, detail: "No phone on file" });
    await patchPaper(taskId, { noPhone: "1" });
    return false;
  }
  const withLink = smsLinksOn();
  const text = taskSmsText(kind, langOf(row), row.account_name, dueOf(row), row.due_time, withLink ? taskLink(origin, row) : "", rolloutOn("MY_TODOS"));
  const sent = await textBoardPerson({ staffId: "", name: row.sub_name, phone }, text, paperId(taskId), `cw-now/${kind}`);
  await addEvent(taskId, event, { method: kind, detail: sent ? (withLink ? "Sent with link" : "Sent without link") : "Failed" });
  if (sent && withLink && !row.link_sent_at) await linkWentOut(taskId, "text", "CW Now");
  return sent;
}

/** Share on the pin: Copy / WhatsApp / a hand-sent text are logged when tapped; Email is sent from here. */
export async function shareTask(taskId: number, method: CwNowShareMethod, by: string, origin: string): Promise<void> {
  const row = await taskById(taskId);
  if (!row) throw new CwNowTaskError("That task was not found.");
  if (!isOpenTask(row.status)) throw new CwNowTaskError("This task is closed.");
  if (method === "email") {
    const to = clean(row.sub_email);
    if (!to) throw new CwNowTaskError("No email on file for this sub.");
    const lang = langOf(row);
    const sent = await sendSubcontractorNotification(to, TASK_EMAIL_SUBJECT[lang](row.account_name), [taskShareMessage(lang, clean(row.sub_contact), row.account_name, dueOf(row), row.due_time, taskLink(origin, row))]);
    if (!sent) throw new CwNowTaskError("The email did not send. Try Copy or WhatsApp.");
  }
  if (method === "text" && smsLinksOn()) {
    const phone = clean(row.sub_phone);
    if (!phone) throw new CwNowTaskError("No phone on file for this sub.");
    const text = taskSmsText("new", langOf(row), row.account_name, dueOf(row), row.due_time, taskLink(origin, row));
    const sent = await textBoardPerson({ staffId: "", name: row.sub_name, phone }, text, paperId(taskId), "cw-now/share");
    if (!sent) throw new CwNowTaskError("The text did not send. Try Copy or WhatsApp.");
  }
  await linkWentOut(taskId, method, by);
}

/* ---------- what the office does on the card ---------- */

function toStaffFiles(rows: FileRow[]): StaffTask["files"] {
  return rows.map((file) => ({ id: Number(file.id), source: file.source, name: clean(file.file_name) || "File", url: file.file_url, size: Number(file.file_size) || 0 }));
}

type FileRow = { id: string | number; source: "office" | "sub"; file_url: string; file_name: string; file_size: string | number; content_type: string; created_at: string | Date };
type EventRow = { id: string | number; event: string; method: string; detail: string; detail_en: string; by_name: string; at: string | Date };

export async function staffTask(taskId: number, origin: string): Promise<StaffTask | null> {
  const row = await taskById(taskId);
  if (!row) return null;
  const sql = getSql();
  const [files, events] = (await Promise.all([
    sql`SELECT id, source, file_url, file_name, file_size, content_type, created_at FROM cw_now_task_files WHERE task_id = ${taskId} ORDER BY created_at, id`,
    sql`SELECT id, event, method, detail, detail_en, by_name, at FROM cw_now_task_events WHERE task_id = ${taskId} ORDER BY at DESC, id DESC LIMIT 60`,
  ])) as [FileRow[], EventRow[]];
  const link = taskLink(origin, row);
  return {
    id: taskId,
    accountId: row.account_id,
    accountName: row.account_name,
    subName: row.sub_name,
    task: row.task,
    dueDate: dueOf(row),
    dueTime: cleanTaskTime(row.due_time),
    urgent: row.priority === "urgent",
    status: row.status,
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
    calendarFailed: row.calendar_sync_failed,
    linksOn: smsLinksOn(),
    link,
    // "Hi Ana": the contact's first name. A company name is not a greeting, so with no contact it is just "Hi".
    message: taskShareMessage(langOf(row), clean(row.sub_contact), row.account_name, dueOf(row), row.due_time, link),
    phone: clean(row.sub_phone),
    email: clean(row.sub_email),
    files: toStaffFiles(files),
    events: events.map((event) => ({ id: Number(event.id), event: event.event, method: event.method, detail: event.detail, detailEn: event.detail_en, by: event.by_name, at: iso(event.at) })),
  };
}

/** Done, from the sub's link or the office's card. False when it was already closed. */
async function finishTask(row: TaskRow, by: string, doneByLabel: string): Promise<boolean> {
  const taskId = taskIdOf(row);
  const sql = getSql();
  const results = await sql.transaction([
    sql`UPDATE cw_now_tasks SET status = 'done', done_at = now(), done_by = ${by}, updated_at = now() WHERE id = ${taskId} AND status NOT IN ('done', 'cancelled') RETURNING id`,
    sql`UPDATE handoff_items SET data = data || '{"taskStatus":"done"}'::jsonb, board_done_at = now(), board_done_by = ${doneByLabel}
        WHERE kind = 'cwnow' AND item_id = ${paperId(taskId)}
          AND EXISTS (SELECT 1 FROM cw_now_tasks t WHERE t.id = ${taskId} AND t.status = 'done' AND t.done_by = ${by})`,
  ]);
  if ((results[0] as unknown[]).length === 0) return false;
  await addEvent(taskId, "done", { by });
  return true;
}

/** The person who made it hears it is done (text + push). Not when they marked it themselves. Never throws. */
async function tellCreator(row: TaskRow, who: string, byStaffId: string, origin: string): Promise<void> {
  try {
    const staffId = clean(row.created_by_staff_id);
    if (!staffId || staffId === byStaffId) return;
    const contact = await staffContact(staffId);
    if (!contact) return;
    const what = `${row.account_name} - ${shortTask(row.task, 70)}`;
    await textBoardPerson(contact, plainLetters(`CW Now to-do done by ${who}: ${what}\n${smsLastLine(`${origin}/board`, "staff")}`), paperId(taskIdOf(row)), "cw-now/done");
    await sendPush(staffId, "CW Now to-do done", `${who}: ${what}`, `${origin}/board`, "cw-now/done");
  } catch (error) {
    console.error("[cw-now task] notice:", error instanceof Error ? error.message : error);
  }
}

export async function staffFinishTask(taskId: number, by: string, byStaffId: string, origin: string): Promise<(() => Promise<void>) | null> {
  const row = await taskById(taskId);
  if (!row) throw new CwNowTaskError("That task was not found.");
  if (await complaintNeedsPhoto(row)) throw new CwNowTaskError("This complaint needs an after photo from the team. Or close it on the complaint's page.");
  if (!(await finishTask(row, by, `${by} (office)`))) return null;
  const linked = await finishLinkedRecord(row, by, origin);
  return async () => {
    await setCalendarStatus(row, "Done").catch((error) => console.error("[cw-now task] calendar:", error));
    await tellCreator(row, by, byStaffId, origin);
    await linked?.();
  };
}

export async function cancelTask(taskId: number, by: string): Promise<(() => Promise<void>) | null> {
  const sql = getSql();
  const row = await taskById(taskId);
  if (!row) throw new CwNowTaskError("That task was not found.");
  const updated = (await sql`UPDATE cw_now_tasks SET status = 'cancelled', cancelled_at = now(), updated_at = now() WHERE id = ${taskId} AND status NOT IN ('done', 'cancelled') RETURNING id`) as unknown[];
  if (updated.length === 0) return null;
  await sql`UPDATE handoff_items SET data = data || '{"taskStatus":"cancelled"}'::jsonb, board_done_at = now(), board_done_by = ${`Cancelled by ${by}`.slice(0, 120)} WHERE kind = 'cwnow' AND item_id = ${paperId(taskId)}`;
  await addEvent(taskId, "cancelled", { by });
  await restoreMovedComplaint(row);
  return async () => {
    if (!row.calendar_event_id) return;
    const result = await deleteCalendarEventForToDo(row.calendar_event_id);
    await sql`UPDATE cw_now_tasks SET calendar_event_id = ${result.failed ? row.calendar_event_id : ""}, calendar_sync_failed = ${result.failed} WHERE id = ${taskId}`;
  };
}

/** "Pin back" in the Done tray: the task is open again, where it was before. */
export async function reopenTaskByPaper(itemId: string, by: string): Promise<boolean> {
  const taskId = Number(/^task-(\d+)$/.exec(itemId)?.[1] ?? 0);
  if (!taskId) return false;
  const linkedRow = await taskById(taskId);
  if (linkedRow?.complaint_row_id || linkedRow?.extra_job_id) throw new CwNowTaskError("This to-do is tied to its complaint or extra job. Send a new one from there.");
  const sql = getSql();
  const updated = (await sql`
    UPDATE cw_now_tasks
    SET status = CASE WHEN seen_at IS NOT NULL THEN 'seen' WHEN link_sent_at IS NOT NULL THEN 'sent' ELSE 'needs_link' END,
        done_at = NULL, done_by = '', cancelled_at = NULL, updated_at = now()
    WHERE id = ${taskId} AND status IN ('done', 'cancelled')
    RETURNING status
  `) as { status: CwNowStatus }[];
  if (updated.length === 0) return false;
  await sql`UPDATE handoff_items SET data = data || ${JSON.stringify({ taskStatus: updated[0].status })}::jsonb, board_done_at = NULL, board_done_by = '' WHERE kind = 'cwnow' AND item_id = ${paperId(taskId)}`;
  await addEvent(taskId, "reopened", { by });
  const row = await taskById(taskId);
  if (row) await setCalendarStatus(row, "Open").catch((error) => console.error("[cw-now task] calendar:", error));
  return true;
}

/* ---------- the sub's link ---------- */

/** This one task, and only what the sub needs. Null when the link is not good (any more). */
export async function publicTask(token: string): Promise<PublicTask | null> {
  const row = await taskByToken(token);
  if (!row) return null;
  const taskId = taskIdOf(row);
  const sql = getSql();
  const [files, notes, location] = (await Promise.all([
    sql`SELECT id, source, file_url, file_name, file_size, content_type, created_at FROM cw_now_task_files WHERE task_id = ${taskId} ORDER BY created_at, id`,
    sql`SELECT detail, at FROM cw_now_task_events WHERE task_id = ${taskId} AND event = 'note' ORDER BY at, id`,
    todoLocation(row.account_id, row.account_name),
  ])) as [FileRow[], { detail: string; at: string | Date }[], string];
  const translations = row.translations ?? {};
  return {
    accountName: row.account_name,
    location,
    task: row.task,
    translations: { ...(translations.es ? { es: translations.es } : {}), ...(translations.pt ? { pt: translations.pt } : {}) },
    dueDate: dueOf(row),
    dueTime: cleanTaskTime(row.due_time),
    urgent: row.priority === "urgent",
    status: row.status,
    language: langOf(row),
    dueColors: rolloutOn("MY_TODOS"),
    linkKind: linkKindOf(row),
    needsPhoto: Boolean(row.complaint_row_id) && !files.some((file) => file.source === "sub"),
    canAddPhoto: privateStoreOn(),
    uploadFolder: taskSubFolder(taskId),
    files: files.filter((file) => file.source === "office").map((file) => ({ id: Number(file.id), name: clean(file.file_name) || "File", url: file.file_url, size: Number(file.file_size) || 0, contentType: clean(file.content_type) })),
    notes: notes.map((note) => ({ text: note.detail, at: iso(note.at) })),
    photos: files.filter((file) => file.source === "sub").map((file) => ({ id: Number(file.id), url: file.file_url })),
  };
}

/** The upload folder for this link's photos, while the task is open. */
export async function taskUploadFolder(token: string): Promise<string | null> {
  const row = await taskByToken(token);
  return row && isOpenTask(row.status) ? taskSubFolder(taskIdOf(row)) : null;
}

/** First real open of the link. */
export async function markSeen(token: string): Promise<void> {
  const row = await taskByToken(token);
  if (!row || (row.status !== "needs_link" && row.status !== "sent")) return;
  const taskId = taskIdOf(row);
  const updated = (await getSql()`
    UPDATE cw_now_tasks SET status = 'seen', seen_at = now(), link_sent_at = COALESCE(link_sent_at, now()), updated_at = now()
    WHERE id = ${taskId} AND status IN ('needs_link', 'sent') RETURNING id
  `) as unknown[];
  if (updated.length === 0) return;
  await addEvent(taskId, "seen");
  await patchPaper(taskId, { taskStatus: "seen" });
}

export async function addNoteFromLink(token: string, name: string, text: string): Promise<(() => Promise<void>) | null> {
  const row = await taskByToken(token);
  if (!row || !isOpenTask(row.status)) return null;
  const note = clean(text).slice(0, TASK_NOTE_MAX);
  if (!note) throw new CwNowTaskError("Write the note.");
  const taskId = taskIdOf(row);
  const eventId = await addEvent(taskId, "note", { detail: note, by: clean(name).slice(0, 80) });
  await patchPaper(taskId, { hasNote: "1" });
  await teamOnIt(row, clean(name));
  return async () => {
    const english = await translateToEnglish(note).catch(() => null);
    if (english && english.english !== note) await getSql()`UPDATE cw_now_task_events SET detail_en = ${english.english} WHERE id = ${eventId}`;
  };
}

export async function addPhotoFromLink(token: string, name: string, file: NewTaskFile): Promise<boolean> {
  const row = await taskByToken(token);
  if (!row || !isOpenTask(row.status) || !privateStoreOn()) return false;
  const taskId = taskIdOf(row);
  const url = toStoredUrl(file.url);
  const path = storedPathname(url);
  if (!path || !path.startsWith(`${taskSubFolder(taskId)}/`)) return false;
  const who = clean(name).slice(0, 80);
  await getSql()`
    INSERT INTO cw_now_task_files (task_id, source, file_url, file_name, file_size, content_type, uploaded_by)
    VALUES (${taskId}, 'sub', ${url}, ${clean(file.name).slice(0, 200)}, ${Math.max(0, Math.round(Number(file.size) || 0))}, ${clean(file.contentType).slice(0, 120)}, ${who})
  `;
  await addEvent(taskId, "photo", { by: who });
  await patchPaper(taskId, { hasNote: "1" });
  await teamOnIt(row, who);
  return true;
}

export async function doneFromLink(token: string, name: string, origin: string): Promise<(() => Promise<void>) | null> {
  const row = await taskByToken(token);
  if (!row || !isOpenTask(row.status)) return null;
  const who = clean(name).slice(0, 80) || clean(row.sub_name) || "The sub";
  if (await complaintNeedsPhoto(row)) throw new CwNowTaskError(NEEDS_PHOTO_ERROR);
  if (!(await finishTask(row, who, `${who} (CW Now)`))) return null;
  const linked = await finishLinkedRecord(row, who, origin);
  return async () => {
    await setCalendarStatus(row, "Done").catch((error) => console.error("[cw-now task] calendar:", error));
    await tellCreator(row, who, "", origin);
    await linked?.();
  };
}

/** The phone calendar file for this link's task. Null when the link is not good. */
export async function taskCalendarFile(token: string): Promise<string | null> {
  const row = await taskByToken(token);
  if (!row) return null;
  const lang = langOf(row);
  const translated = row.translations?.[lang];
  const location = await todoLocation(row.account_id, row.account_name);
  return taskIcs({ taskId: taskIdOf(row), title: `${row.account_name}: ${shortTask(translated || row.task, 70)}`, description: translated || row.task, location, dueDate: dueOf(row), dueTime: row.due_time });
}

/* ---------- "My to-dos" in the Sub Portal ---------- */

/** The logged-in sub: by the ID in their session, else by an email only one sub has. "" = not found. */
export async function subIdOfSession(subId: string, email: string): Promise<string> {
  const sql = getSql();
  if (clean(subId)) {
    const rows = (await sql`SELECT id FROM subcontractors WHERE id = ${clean(subId)} LIMIT 1`) as { id: string }[];
    if (rows[0]) return clean(rows[0].id);
  }
  const rows = (await sql`SELECT id FROM subcontractors WHERE btrim(email) <> '' AND lower(btrim(email)) = lower(btrim(${email})) LIMIT 2`) as { id: string }[];
  return rows.length === 1 ? clean(rows[0].id) : "";
}

/** One sub's own tasks: everything open, and what they finished in the last 30 days (their link still works that long). */
export async function listMyTodos(subId: string, options: { withLocation?: boolean } = {}): Promise<MyTodo[]> {
  if (!subId) return [];
  const rows = (await getSql().query(
    `${SELECT_TASK}
     WHERE t.sub_id = $1 AND (t.status NOT IN ('done', 'cancelled') OR (t.status = 'done' AND t.done_at > now() - ($2::int || ' days')::interval))
     ORDER BY t.due_date ASC, t.due_time ASC, t.id ASC LIMIT 300`,
    [subId, DONE_LINK_DAYS]
  )) as TaskRow[];
  const live = rows.filter((row) => !row.account_gone);
  const locations = options.withLocation ? await Promise.all(live.map((row) => todoLocation(row.account_id, row.account_name).catch(() => ""))) : [];
  return live.map((row, index) => {
    const translations = row.translations ?? {};
    return {
      id: taskIdOf(row),
      accountName: row.account_name,
      location: locations[index] ?? "",
      task: row.task,
      translations: { ...(translations.es ? { es: translations.es } : {}), ...(translations.pt ? { pt: translations.pt } : {}) },
      dueDate: dueOf(row),
      dueTime: cleanTaskTime(row.due_time),
      urgent: row.priority === "urgent",
      status: row.status,
      doneAt: iso(row.done_at),
      href: `/porter/task/${row.token}`,
      kind: linkKindOf(row),
    };
  });
}

/* ---------- extra jobs and complaints (migration 088, FEATURE_CW_NOW_LINKS) ---------- */

export type TaskLink = { extraJobId?: number; complaintRowId?: number; complaintMode?: "move" | "duplicate" };
export type SetUpJob = { id: string; jobNumber: string; description: string; jobDate: string; inHouse: boolean; subId: string };

const linkKindOf = (row: Pick<TaskRow, "extra_job_id" | "complaint_row_id">): TaskLinkKind => (row.extra_job_id ? "extra" : row.complaint_row_id ? "complaint" : "");
const MOVED = "Moved to CW Now";
const CLOSED_COMPLAINT = /^(closed|resolved|merged)/i;

let linksColumn = false;
export async function cwNowLinksReady(): Promise<boolean> {
  if (linksColumn) return true;
  const rows = (await getSql()`SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cw_now_tasks' AND column_name = 'complaint_row_id' LIMIT 1`) as unknown[];
  linksColumn = rows.length > 0;
  return linksColumn;
}

/** The switch is on and migration 088 is in. */
export async function cwNowLinksOn(): Promise<boolean> {
  return rolloutOn("CW_LINKS") && (await cwNowTasksReady()) && (await cwNowLinksReady());
}

/** The account's extra jobs on Set up. Never their prices or the sub's pay. */
export async function setUpJobsFor(accountId: string): Promise<SetUpJob[]> {
  const rows = (await getSql()`
    SELECT id::text AS id, job_number, description, job_date::text AS job_date, sub_id, to_jsonb(extra_jobs)->>'performed_by' AS performed_by
    FROM extra_jobs WHERE account_id = ${accountId} AND status = 'setup' ORDER BY job_date, id
  `) as { id: string; job_number: string; description: string; job_date: string; sub_id: string; performed_by: string | null }[];
  return rows.map((row) => ({ id: row.id, jobNumber: row.job_number, description: row.description, jobDate: row.job_date, inHouse: row.performed_by === "in_house", subId: clean(row.sub_id) }));
}

/** Checks the job can be sent to this sub. The job stays on the Extra Jobs page: the task only points at it. */
export async function extraJobLink(jobId: string, accountId: string, subId: string): Promise<TaskLink> {
  if (!(await cwNowLinksOn())) throw new CwNowTaskError("Extra job tasks are not turned on here yet.");
  const job = (await setUpJobsFor(accountId)).find((entry) => entry.id === jobId);
  if (!job) throw new CwNowTaskError("Pick an extra job on Set up for this account.");
  if (job.inHouse) throw new CwNowTaskError("This job is In-house, so it does not go to a sub.");
  if (job.subId && job.subId !== subId) throw new CwNowTaskError("This extra job is set up for another sub. Pick that sub, or change the job first.");
  const taken = (await getSql()`SELECT 1 FROM cw_now_tasks WHERE extra_job_id = ${Number(jobId)} AND status <> 'cancelled' LIMIT 1`) as unknown[];
  if (taken.length > 0) throw new CwNowTaskError("This extra job already has a CW Now task.");
  return { extraJobId: Number(jobId) };
}

type ComplaintFacts = { id: number; key: string; sheet_row: number; status: string; account_ref: string | null; account_name: string; issue: string };

async function complaintFacts(rowId: number): Promise<ComplaintFacts | null> {
  const rows = (await getSql()`
    SELECT id, COALESCE(NULLIF(btrim(complaint_id), ''), legacy_key) AS key, sheet_row, status, account_ref, account_name, issue
    FROM complaints WHERE id = ${rowId} LIMIT 1
  `) as ComplaintFacts[];
  return rows[0] ?? null;
}

/** What "Send to team's CW Now" needs. Null when there is no such complaint. */
export async function complaintForTask(key: string) {
  const rowId = await complaintRowId(key);
  if (rowId === null) return null;
  const facts = await complaintFacts(rowId);
  if (!facts) return null;
  const open = (await getSql()`SELECT id, sub_name FROM cw_now_tasks WHERE complaint_row_id = ${rowId} AND status NOT IN ('done', 'cancelled') LIMIT 1`) as { id: number; sub_name: string }[];
  return {
    accountId: clean(facts.account_ref),
    accountName: clean(facts.account_name),
    issue: clean(facts.issue),
    closed: CLOSED_COMPLAINT.test(clean(facts.status)),
    assignedSubId: facts.account_ref ? await assignedSubId(facts.account_ref) : "",
    openTask: open[0] ? { id: Number(open[0].id), subName: clean(open[0].sub_name) } : null,
  };
}

/**
 * A complaint goes to a sub's CW Now. It stays ONE complaint, so it never
 * counts twice on the sub score: this only makes a task that points at it.
 * Move: its pin leaves Complaints until the task ends. Duplicate: it stays.
 */
export async function sendComplaintToCwNow(input: { key: string; subId: string; mode: "move" | "duplicate"; task: string; dueDate: string; dueTime: string; urgent: boolean; by: string; byStaffId: string }): Promise<number> {
  if (!(await cwNowLinksOn())) throw new CwNowTaskError("This is not turned on here yet.");
  const rowId = await complaintRowId(input.key);
  const facts = rowId === null ? null : await complaintFacts(rowId);
  if (!facts || rowId === null) throw new CwNowTaskError("That complaint was not found.");
  if (CLOSED_COMPLAINT.test(clean(facts.status))) throw new CwNowTaskError("This complaint is already resolved or closed.");
  if (!facts.account_ref) throw new CwNowTaskError("Link this complaint to an account first.");
  const taken = (await getSql()`SELECT 1 FROM cw_now_tasks WHERE complaint_row_id = ${rowId} AND status NOT IN ('done', 'cancelled') LIMIT 1`) as unknown[];
  if (taken.length > 0) throw new CwNowTaskError("This complaint already has an open CW Now task.");
  const id = await createTask({
    accountId: facts.account_ref,
    subId: input.subId,
    task: clean(input.task) || clean(facts.issue),
    dueDate: input.dueDate,
    dueTime: input.dueTime,
    urgent: input.urgent,
    files: [],
    by: input.by,
    byStaffId: input.byStaffId,
    link: { complaintRowId: rowId, complaintMode: input.mode },
  });
  if (input.mode === "move") {
    await getSql()`
      UPDATE handoff_items SET board_done_at = now(), board_done_by = ${MOVED}
      WHERE kind = 'complaint' AND item_id = ${facts.key} AND board_pinned_at IS NOT NULL AND board_done_at IS NULL
    `;
  }
  return id;
}

/** A moved complaint's pin comes back to the Complaints square. */
async function restoreMovedComplaint(row: TaskRow): Promise<void> {
  if (!row.complaint_row_id || row.complaint_mode !== "move") return;
  const facts = await complaintFacts(Number(row.complaint_row_id));
  if (!facts) return;
  await getSql()`UPDATE handoff_items SET board_done_at = NULL, board_done_by = '' WHERE kind = 'complaint' AND item_id = ${facts.key} AND board_done_by = ${MOVED}`;
}

const subPhotosOf = async (taskId: number) => (await getSql()`SELECT file_url, file_name FROM cw_now_task_files WHERE task_id = ${taskId} AND source = 'sub' ORDER BY created_at, id`) as { file_url: string; file_name: string }[];

/** A still-open complaint needs a photo of the fix before Done, the same rule as the Sub Portal. */
async function complaintNeedsPhoto(row: TaskRow): Promise<boolean> {
  if (!row.complaint_row_id) return false;
  const facts = await complaintFacts(Number(row.complaint_row_id));
  if (!facts || CLOSED_COMPLAINT.test(clean(facts.status))) return false;
  return (await subPhotosOf(taskIdOf(row))).length === 0;
}

/** The sub wrote or sent a photo: the complaint's tracker moves to "Team on it" (once). */
async function teamOnIt(row: TaskRow, who: string): Promise<void> {
  if (!row.complaint_row_id) return;
  try {
    const rowId = Number(row.complaint_row_id);
    const name = clean(who) || clean(row.sub_name);
    await markFirstResponse(rowId, name);
    const events = await listComplaintEvents(rowId, ["acknowledged"]);
    if (!events.some((event) => /from the sub/i.test(event.detail))) await addComplaintEvent({ complaintId: rowId, kind: "acknowledged", detail: "Got it from the sub (CW Now).", by: name });
  } catch (error) {
    console.error("[cw-now task] team on it:", error instanceof Error ? error.message : error);
  }
}

/**
 * The task is Done: its complaint goes to "Ready to review" (the office still
 * closes it and tells the customer), or its extra job goes to "Ready to
 * invoice". Returns the notice to send afterwards. A failure is logged and
 * never undoes the sub's Done.
 */
async function finishLinkedRecord(row: TaskRow, who: string, origin: string): Promise<(() => Promise<void>) | null> {
  try {
    const taskId = taskIdOf(row);
    const noteRows = (await getSql()`SELECT detail FROM cw_now_task_events WHERE task_id = ${taskId} AND event = 'note' ORDER BY at, id`) as { detail: string }[];
    const note = noteRows.map((entry) => clean(entry.detail)).filter(Boolean).join(" / ").slice(0, 900);
    const photos = await subPhotosOf(taskId);

    if (row.extra_job_id) {
      const jobId = String(row.extra_job_id);
      const job = await getExtraJob(jobId);
      if (!job || job.status !== "setup") return null;
      for (const photo of photos) await addJobPhoto(jobId, photo.file_url, clean(photo.file_name) || "photo", who);
      const finished = await finishExtraJob(jobId, who, note);
      if (typeof finished === "string") return null;
      return async () => {
        const sent = await sendExtraJobDone(finished, origin).catch(() => false);
        if (sent) await stampEmailed(finished.id, "done");
      };
    }

    if (row.complaint_row_id) {
      const rowId = Number(row.complaint_row_id);
      const facts = await complaintFacts(rowId);
      if (!facts) return null;
      await restoreMovedComplaint(row);
      if (CLOSED_COMPLAINT.test(clean(facts.status))) return null;
      await closeComplaint({ rowNumber: facts.sheet_row, id: facts.key, status: "Resolved by Sub", resolution: `Resolved by ${who}: ${note || "CW Now task done"}` });
      await markFirstResponse(rowId, who);
      await recordFix({ rowId, photos: photos.map((photo) => photo.file_url), by: who });
      return () => notifyReadyToReview({ rowId, origin, teamName: who, note, photoCount: photos.length });
    }
  } catch (error) {
    console.error("[cw-now task] linked record:", error instanceof Error ? error.message : error);
    await addEvent(taskIdOf(row), "note", { detail: "The linked complaint or extra job did not update. Check it.", by: "System" }).catch(() => 0);
  }
  return null;
}

/** A complaint or extra job finished on its own page: its open task closes, so the sub gets no more reminders. */
export async function syncLinkedTasks(): Promise<void> {
  if (!(await cwNowTasksReady()) || !(await cwNowLinksReady())) return;
  const rows = (await getSql().query(
    `${SELECT_TASK}
     LEFT JOIN complaints c ON c.id = t.complaint_row_id
     LEFT JOIN extra_jobs j ON j.id = t.extra_job_id
     WHERE t.status NOT IN ('done', 'cancelled')
       AND ((t.complaint_row_id IS NOT NULL AND lower(btrim(c.status)) ~ '^(closed|resolved|merged)') OR (t.extra_job_id IS NOT NULL AND j.status <> 'setup'))
     LIMIT 50`
  )) as TaskRow[];
  for (const row of rows) {
    if (row.extra_job_id) {
      const job = await getExtraJob(String(row.extra_job_id));
      if (job?.status === "cancelled") {
        const follow = await cancelTask(taskIdOf(row), "Extra job cancelled");
        await follow?.();
        continue;
      }
    }
    const label = row.extra_job_id ? "Extra job done" : "Complaint closed";
    if (await finishTask(row, label, label)) {
      await restoreMovedComplaintForReview(row);
      await setCalendarStatus(row, "Done").catch((error) => console.error("[cw-now task] calendar:", error));
    }
  }
}

/** Only a complaint waiting for review comes back up; a closed one stays in the Done tray. */
async function restoreMovedComplaintForReview(row: TaskRow): Promise<void> {
  if (!row.complaint_row_id) return;
  const facts = await complaintFacts(Number(row.complaint_row_id));
  if (facts && /^resolved by sub/i.test(clean(facts.status))) await restoreMovedComplaint(row);
}

/* ---------- the office's "Sub to-dos" list ---------- */

/** Every task the filters match, soonest due first (never the private link). Cancelled ones only when asked for by id. */
export async function listStaffTasks(filter: { id?: number; subId?: string; accountId?: string; status?: TaskListStatus; from?: string; to?: string; withLocation?: boolean }): Promise<StaffTaskRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: (slot: string) => string, value: unknown) => {
    params.push(value);
    where.push(sql(`$${params.length}`));
  };
  if (filter.id) add((slot) => `t.id = ${slot}`, filter.id);
  else where.push(`t.status <> 'cancelled'`);
  if (filter.subId) add((slot) => `t.sub_id = ${slot}`, filter.subId);
  if (filter.accountId) add((slot) => `t.account_id = ${slot}`, filter.accountId);
  if (filter.from) add((slot) => `t.due_date >= ${slot}::date`, filter.from);
  if (filter.to) add((slot) => `t.due_date <= ${slot}::date`, filter.to);
  if (filter.status === "open") where.push(`t.status NOT IN ('done', 'cancelled')`);
  if (filter.status === "seen") where.push(`t.status = 'seen'`);
  if (filter.status === "done") where.push(`t.status = 'done'`);
  if (filter.status === "overdue") add((slot) => `t.status NOT IN ('done', 'cancelled') AND t.due_date < ${slot}::date`, officeClock(new Date()).day);
  const rows = (await getSql().query(`${SELECT_TASK} WHERE ${where.join(" AND ") || "true"} ORDER BY t.due_date ASC, t.due_time ASC, t.id ASC LIMIT 500`, params)) as TaskRow[];
  const live = rows.filter((row) => !row.account_gone);
  const locations = filter.withLocation ? await Promise.all(live.map((row) => todoLocation(row.account_id, row.account_name).catch(() => ""))) : [];
  return live.map((row, index) => {
    const translations = row.translations ?? {};
    return {
      id: taskIdOf(row),
      accountId: row.account_id,
      accountName: row.account_name,
      location: locations[index] ?? "",
      subId: clean(row.sub_id),
      subName: row.sub_name,
      language: langOf(row),
      task: row.task,
      translations: { ...(translations.es ? { es: translations.es } : {}), ...(translations.pt ? { pt: translations.pt } : {}) },
      dueDate: dueOf(row),
      dueTime: cleanTaskTime(row.due_time),
      urgent: row.priority === "urgent",
      status: row.status,
      doneAt: iso(row.done_at),
      kind: linkKindOf(row),
    };
  });
}

/* ---------- the reminders (cron /api/cron/todo-reminders, every 15 minutes) ---------- */

export type TaskReminderRun = { checked: number; sent: number; skipped: number };

/** 8 AM the day before and 8 AM on the due day, while it is not done. Each goes once. Not on a task made after that 8 AM. */
export async function runCwNowTaskReminders(origin: string, now = new Date()): Promise<TaskReminderRun> {
  const run: TaskReminderRun = { checked: 0, sent: 0, skipped: 0 };
  if (!(await cwNowTasksReady())) return run;
  const clock = officeClock(now);
  if (clock.minutes < DAY_REMINDER_AT) return run;
  const sql = getSql();
  const rows = (await sql.query(
    `${SELECT_TASK}
     WHERE t.status NOT IN ('done', 'cancelled')
       AND ((t.due_date = $1::date AND t.reminded_day_at IS NULL) OR (t.due_date = $1::date + 1 AND t.reminded_before_at IS NULL))`,
    [clock.day]
  )) as TaskRow[];

  for (const row of rows) {
    if (row.account_gone) continue;
    run.checked += 1;
    const dueToday = dueOf(row) === clock.day;
    const column = dueToday ? "reminded_day_at" : "reminded_before_at";
    const claimed = (await sql.query(`UPDATE cw_now_tasks SET ${column} = now() WHERE id = $1 AND ${column} IS NULL RETURNING id`, [row.id])) as unknown[];
    if (claimed.length === 0) continue;
    const made = officeClock(new Date(row.created_at));
    const madeAfterEight = made.day === clock.day && made.minutes >= DAY_REMINDER_AT;
    const time = cleanTaskTime(row.due_time);
    const [h, m] = time ? time.split(":").map(Number) : [0, 0];
    const timePassed = dueToday && Boolean(time) && h * 60 + m <= clock.minutes;
    if (madeAfterEight || timePassed) {
      run.skipped += 1;
      continue;
    }
    if (await textSub(row, dueToday ? "today" : "tomorrow", origin)) run.sent += 1;
    else run.skipped += 1;
  }
  return run;
}
