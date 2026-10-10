// Account Updates on Postgres (DATA_SOURCE_ACCOUNT_UPDATES=postgres).
//
// The same list and the same "add" that Apps Script's getAccountUpdates and
// addAccountUpdate gave, with the same field names, so the pages do not
// change. Nothing here reads or writes Google Sheets or Apps Script.
//
// The table is account_updates (migration 005), filled from the sheet by
// scripts/migrate/import-accounts.mts. Rows saved here have no source_sheet.
import { getSql } from "@/lib/db";
import { sendStaffNotification } from "@/lib/email";

/** One update, in the shape Apps Script answered with. */
export type AccountUpdateRow = {
  id: string;
  date: string;
  accountId: string;
  accountName: string;
  updateType: string;
  title: string;
  manager: string;
  notes: string;
  notifyEmail: string;
  followUpNeeded: string;
  followUpDate: string;
};

export type NewAccountUpdate = {
  date: string;
  accountName: string;
  accountId: string;
  updateType: string;
  manager: string;
  notes: string;
  notifyEmail: string;
  title?: string;
  followUpNeeded?: string;
  followUpDate?: string;
};

type DbRow = {
  update_id_raw: string;
  update_date: string | null;
  update_date_raw: string;
  account_id_raw: string;
  account_name: string;
  update_type: string;
  update_title: string;
  created_by: string;
  notes: string;
  notify_email: string;
  follow_up_needed: string;
  follow_up_date_raw: string;
};

const clean = (value: unknown) => String(value ?? "").trim();

// The sheet's id columns were formulas; a broken one left "#REF!" in the cell. Apps Script answered "" for those.
const noSheetError = (value: string) => (/^#[A-Z0-9/]+[!?]?$/.test(value.trim()) ? "" : value);

/** Every update, oldest first (the order the sheet had; new ones are added at the end). */
export async function listAccountUpdates(): Promise<AccountUpdateRow[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT update_id_raw, to_char(update_date, 'YYYY-MM-DD') AS update_date, update_date_raw, account_id_raw, account_name, update_type, update_title, created_by, notes, notify_email, follow_up_needed, follow_up_date_raw
    FROM account_updates
    ORDER BY (source_row IS NULL), source_row, id
  `) as DbRow[];
  return rows.map((row) => ({
    id: noSheetError(row.update_id_raw),
    // Apps Script answered with the day as YYYY-MM-DD; text that is not a date is passed on as typed.
    date: row.update_date ?? row.update_date_raw,
    accountId: noSheetError(row.account_id_raw),
    accountName: row.account_name,
    updateType: row.update_type,
    title: row.update_title,
    manager: row.created_by,
    notes: row.notes,
    notifyEmail: row.notify_email,
    followUpNeeded: row.follow_up_needed,
    followUpDate: row.follow_up_date_raw,
  }));
}

/** "UPD-20261006101500": the same id Apps Script made, from the time in New York. */
function newUpdateId(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `UPD-${get("year")}${get("month")}${get("day")}${get("hour")}${get("minute")}${get("second")}`;
}

/**
 * Saves one update at the end of the list and, when an email was asked for,
 * sends the notice. A notice that does not go out never undoes the save.
 */
export async function addAccountUpdate(input: NewAccountUpdate): Promise<{ id: string; emailed: boolean }> {
  const sql = getSql();
  const update = {
    date: clean(input.date),
    accountName: clean(input.accountName),
    accountId: clean(input.accountId),
    updateType: clean(input.updateType),
    manager: clean(input.manager),
    notes: clean(input.notes),
    notifyEmail: clean(input.notifyEmail),
    title: clean(input.title),
    followUpNeeded: clean(input.followUpNeeded),
    followUpDate: clean(input.followUpDate),
  };

  // Two saves in the same second get different ids.
  let id = "";
  for (let attempt = 0; attempt < 5 && !id; attempt++) {
    const candidate = attempt === 0 ? newUpdateId() : `${newUpdateId()}-${attempt + 1}`;
    const saved = (await sql`
      INSERT INTO account_updates (legacy_key, update_id_raw, account_id_raw, account_pk, account_name, update_date, update_date_raw, update_type, notes, created_by, notify_email, update_title, follow_up_needed, follow_up_date_raw)
      VALUES (${candidate}, ${candidate}, ${update.accountId}, (SELECT pk FROM accounts WHERE id = ${update.accountId} AND ${update.accountId} <> '' LIMIT 1), ${update.accountName},
              CASE WHEN ${update.date} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN ${update.date}::date END, ${update.date}, ${update.updateType}, ${update.notes}, ${update.manager}, ${update.notifyEmail},
              ${update.title}, ${update.followUpNeeded}, ${update.followUpDate})
      ON CONFLICT (legacy_key) DO NOTHING
      RETURNING update_id_raw
    `) as { update_id_raw: string }[];
    if (saved.length > 0) id = saved[0].update_id_raw;
  }
  if (!id) throw new Error("The update could not be saved. Please try again.");

  let emailed = false;
  if (update.notifyEmail) {
    try {
      emailed = await sendStaffNotification(update.notifyEmail, `Account update: ${update.accountName || "account"}`, [
        `Account: ${update.accountName}`,
        `Date: ${update.date}`,
        `Type: ${update.updateType || "Update"}`,
        `Manager: ${update.manager}`,
        "",
        update.notes,
      ]);
    } catch (error) {
      console.error("[account-updates] notice email failed:", error instanceof Error ? error.message : error);
    }
  }
  return { id, emailed };
}
