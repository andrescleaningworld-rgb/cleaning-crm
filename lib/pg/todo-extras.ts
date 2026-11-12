// What migration 077 adds to a to-do (db/migrations/077_todo_time_reminders.sql):
// an optional time, the CRM's own due-day reminder marks, and the link to a
// new account's step. Plus the account address the calendar event shows as
// its location. Before 077 runs, every read here gives "nothing" and every
// write is skipped, so to-dos work exactly as before. Server only.

import { getSql } from "@/lib/db";

const clean = (value: unknown) => String(value ?? "").trim();

let readyCache = false;

/** Migration 077 is in (due_time, reminded_*, flow_key on todos). */
export async function todoExtrasReady(): Promise<boolean> {
  if (readyCache) return true;
  try {
    const rows = (await getSql()`
      SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'todos' AND column_name IN ('due_time', 'reminded_day_at', 'reminded_hour_at', 'flow_key')
    `) as { n: number }[];
    readyCache = rows[0]?.n === 4;
  } catch {
    readyCache = false;
  }
  return readyCache;
}

/** "HH:MM" (24 hours) or "" — anything else is no time. */
export function cleanDueTime(value: unknown): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(clean(value));
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

/** "10:30" -> "10:30 AM". */
export function timeLabel(dueTime: string): string {
  const time = cleanDueTime(dueTime);
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Street, city, zip on one line (the same as the new-account panel shows). */
function addressLine(row: { address?: unknown; city?: unknown; zip?: unknown } | undefined): string {
  if (!row) return "";
  const street = clean(row.address);
  const extra = [clean(row.city), clean(row.zip)].filter((part) => part && !street.toLowerCase().includes(part.toLowerCase()));
  return [street, ...extra].filter(Boolean).join(", ");
}

/**
 * The calendar event's location: the account's address. By the account ID
 * when there is one, else the one live account with exactly that name.
 * "" when there is no account (a plain reminder) or no address. Never throws.
 */
export async function todoLocation(accountId: unknown, accountName: unknown): Promise<string> {
  const id = clean(accountId);
  const name = clean(accountName);
  if (!id && !name) return "";
  try {
    const rows = (await getSql().query(
      `SELECT address, city, zip FROM accounts
       WHERE (to_jsonb(accounts)->>'deleted_at') IS NULL
         AND (($1::text <> '' AND id = $1::text)
           OR ($1::text = '' AND lower(btrim(account_name)) = lower($2::text)
               AND (SELECT count(*) FROM accounts b WHERE (to_jsonb(b)->>'deleted_at') IS NULL AND lower(btrim(b.account_name)) = lower($2::text)) = 1))
       LIMIT 1`,
      [id, name]
    )) as { address: string; city: string; zip: string }[];
    return addressLine(rows[0]);
  } catch (error) {
    console.error("[to-do location]", error instanceof Error ? error.message : error);
    return "";
  }
}

/** A saved to-do's time and its account's address, for its calendar event. Never throws. */
export async function todoEventExtras(toDoId: string): Promise<{ dueTime: string; location: string }> {
  try {
    const ready = await todoExtrasReady();
    const rows = (await getSql().query(
      `SELECT t.account_ref, t.account_name, ${ready ? "t.due_time" : "''::text AS due_time"} FROM todos t WHERE btrim(t.todo_id) = $1 ORDER BY t.sheet_row LIMIT 1`,
      [toDoId.trim()]
    )) as { account_ref: string | null; account_name: string; due_time: string }[];
    const row = rows[0];
    if (!row) return { dueTime: "", location: "" };
    return { dueTime: cleanDueTime(row.due_time), location: await todoLocation(row.account_ref ?? "", row.account_name) };
  } catch (error) {
    console.error("[to-do event extras]", error instanceof Error ? error.message : error);
    return { dueTime: "", location: "" };
  }
}

/** The due date or time moved: the due-day reminders go again for the new day. */
export async function resetTodoReminders(sheetRow: number): Promise<void> {
  if (!(await todoExtrasReady())) return;
  await getSql().query(`UPDATE todos SET reminded_day_at = NULL, reminded_hour_at = NULL WHERE sheet_row = $1`, [sheetRow]);
}
