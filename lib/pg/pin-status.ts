// Pin Board status check (migration 062). Server only.
//
// A pin that sits 2 business days with no update (the same rule as a new
// account's red pin, lib/accountFlow.ts) gets "Status needed", and whoever
// has it is asked for a status by text and push:
//
//   who has it   whoever took it with "Got it"; else the manager whose square
//                it is in. A shared box (New accepted, Extra jobs, Complaints,
//                Supply orders, Office) has nobody: tag only, no text.
//   the clock    starts again at the latest of: pinned, changed hands
//                (board_owner_since), a status, a new account's flow step
//                moving, the last ask.
//   repeats      every 2 business days until someone gives a status.
//   the owner    (manager_accounts role 'owner') is told on the third ask with
//                no answer, once until the next status.
//
// runPinStatusChecks runs from the daily-reminders cron, on weekdays only, and
// asks a pin at most once a day. One text per person per run: a single pin
// gets the plain wording, several are named in one text.

import { getSql } from "@/lib/db";
import { FLOW_RED_BUSINESS_DAYS, businessDaysBetween, officeDay } from "@/lib/accountFlow";
import { PAPER_KINDS, isPinStatus, STATUS_NOTE_MAX, type PinStatusEvent, type PinStatusKey } from "@/lib/board";
import { handoffLive } from "@/lib/pg/account-live";
import { boardReady, finishPaper, flowTableReady, isExtraJobPaper, listBoardManagers, pinStatusReady } from "@/lib/pg/board";
import { staffContact, textBoardPerson, type StaffContact } from "@/lib/pg/board-sms";
import { sendPush } from "@/lib/push";

const clean = (value: unknown) => String(value ?? "").trim();
const KINDS_SQL = PAPER_KINDS.map((kind) => `'${kind}'`).join(", ");
/** The third ask with no answer tells the owner. */
const OWNER_AFTER_ASKS = 3;
const PUSH_TITLE = "Status needed";
/** How many pin names one combined text lists before "and N more". */
const NAMES_IN_TEXT = 4;

/* ---------- giving a status ---------- */

/**
 * Someone gave a pin a status: it is saved as the latest, the clock starts
 * again and "Status needed" is cleared. "Done" also takes the pin down (into
 * the Done tray), except an extra job, which comes down when the job is done.
 * false = the pin is not on the board any more.
 */
export async function setPaperStatus(input: { kind: string; itemId: string; status: PinStatusKey; note: string; by: string }): Promise<{ ok: boolean; takenDown: boolean }> {
  if (!isPinStatus(input.status)) return { ok: false, takenDown: false };
  const note = clean(input.note).slice(0, STATUS_NOTE_MAX);
  const by = clean(input.by).slice(0, 120) || "Staff";
  const sql = getSql();
  const rows = (await sql`
    UPDATE handoff_items SET board_status = ${input.status}, board_status_note = ${note}, board_status_by = ${by}, board_status_at = now(),
                             board_asks = 0, board_asked_at = NULL, board_owner_told_at = NULL
    WHERE kind = ${input.kind} AND item_id = ${input.itemId} AND board_pinned_at IS NOT NULL AND board_done_at IS NULL
    RETURNING item_id
  `) as unknown[];
  if (rows.length === 0) return { ok: false, takenDown: false };
  await sql`INSERT INTO board_status_log (kind, item_id, event, status, note, by_name) VALUES (${input.kind}, ${input.itemId}, 'status', ${input.status}, ${note}, ${by})`;
  const takeDown = input.status === "done" && !isExtraJobPaper(input.kind, input.itemId);
  if (takeDown) await finishPaper(input.kind, input.itemId, by, true);
  return { ok: true, takenDown: takeDown };
}

/** A pin's status history, newest first: the statuses, the asks and the owner notices. */
export async function statusHistory(kind: string, itemId: string): Promise<PinStatusEvent[]> {
  const rows = (await getSql()`
    SELECT event, status, note, by_name, at FROM board_status_log
    WHERE kind = ${kind} AND item_id = ${itemId}
    ORDER BY at DESC, id DESC
    LIMIT 50
  `) as { event: PinStatusEvent["event"]; status: string; note: string; by_name: string; at: string | Date }[];
  return rows.map((row) => ({ event: row.event, status: row.status, note: row.note, by: row.by_name, at: new Date(row.at).toISOString() }));
}

/* ---------- the daily ask ---------- */

type OpenPin = {
  kind: string;
  item_id: string;
  title: string;
  account_name: string;
  board_square: string;
  taken_by: string;
  board_pinned_at: string | Date;
  board_owner_since: string | Date | null;
  board_status_at: string | Date | null;
  board_asks: number;
  board_asked_at: string | Date | null;
  board_owner_told_at: string | Date | null;
  flow_since: string | Date | null;
};

const latest = (...values: (string | Date | null | undefined)[]) =>
  values.reduce<Date | null>((best, value) => {
    if (!value) return best;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return best;
    return !best || date > best ? date : best;
  }, null);

/** The few words that name a pin in a text: its account, else the line on it. */
function pinName(pin: OpenPin): string {
  const name = clean(pin.account_name) || clean(pin.title) || "A pin";
  return name.length > 60 ? `${name.slice(0, 57)}...` : name;
}

const daysWord = (days: number) => (days === 1 ? "1 day" : `${days} days`);

/** The words of the ask. Exported so the wording has one home. */
export function askText(pins: { name: string; days: number }[]): string {
  if (pins.length === 1) return `${pins[0].name} has been on your board ${daysWord(pins[0].days)}. Please update its status in the app.`;
  const names = pins.slice(0, NAMES_IN_TEXT).map((pin) => pin.name);
  const more = pins.length - names.length;
  return `${pins.length} pins have been on your board 2+ days with no update: ${names.join(", ")}${more > 0 ? ` and ${more} more` : ""}. Please update their status in the app.`;
}

/** The words the owner gets on the third unanswered ask. */
export function ownerText(pins: { name: string; days: number; who: string; asks: number }[]): string {
  if (pins.length === 1) {
    const pin = pins[0];
    return `${pin.name} still has no status after ${pin.asks} asks to ${pin.who} (${daysWord(pin.days)} on the board). Please check in.`;
  }
  const names = pins.slice(0, NAMES_IN_TEXT).map((pin) => `${pin.name} (${pin.who})`);
  const more = pins.length - names.length;
  return `${pins.length} pins still have no status after ${OWNER_AFTER_ASKS} asks: ${names.join(", ")}${more > 0 ? ` and ${more} more` : ""}. Please check in.`;
}

/** Text and push to one person. Each is best-effort; neither stops the other. */
async function tell(contact: StaffContact, text: string, paperId: string, origin: string, routeContext: string): Promise<{ texted: boolean; pushed: boolean }> {
  const [texted, pushed] = await Promise.all([
    textBoardPerson(contact, text, paperId, routeContext).catch(() => false),
    sendPush(contact.staffId, PUSH_TITLE, text, `${origin}/board`, routeContext)
      .then((result) => result.success)
      .catch(() => false),
  ]);
  return { texted, pushed };
}

export type PinStatusRun = { skipped?: string; due: number; asked: number; texts: number; pushes: number; ownerTold: number };

/** The daily part of the daily-reminders cron. */
export async function runPinStatusChecks(origin: string, now = new Date()): Promise<PinStatusRun> {
  const run: PinStatusRun = { due: 0, asked: 0, texts: 0, pushes: 0, ownerTold: 0 };
  if (!(await boardReady())) return { ...run, skipped: "board off" };
  if (!(await pinStatusReady())) return { ...run, skipped: "migration 062 not in" };
  const today = officeDay(now);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return { ...run, skipped: "weekend" };

  const sql = getSql();
  const withFlow = await flowTableReady();
  const pins = (await sql.query(`
    SELECT i.kind, i.item_id, i.title, i.account_name, i.board_square, i.taken_by, i.board_pinned_at, i.board_owner_since,
           i.board_status_at, i.board_asks, i.board_asked_at, i.board_owner_told_at,
           ${withFlow ? "f.step_since" : "NULL::timestamptz"} AS flow_since
    FROM handoff_items i
    ${withFlow ? "LEFT JOIN account_flows f ON i.kind = 'account' AND f.account_id = i.item_id" : ""}
    WHERE i.board_pinned_at IS NOT NULL AND i.board_done_at IS NULL AND i.kind IN (${KINDS_SQL}) AND ${handoffLive("i")}
    ORDER BY i.board_pinned_at
  `)) as OpenPin[];

  // Who has it: the person who took it (by name), else the manager whose square it is in.
  const managers = new Set((await listBoardManagers()).map((manager) => manager.id));
  const staffRows = (await sql`SELECT id, name FROM staff WHERE active AND btrim(name) <> ''`) as { id: string; name: string }[];
  const staffByName = new Map(staffRows.map((row) => [row.name.trim().toLowerCase(), row.id]));
  const holderOf = (pin: OpenPin): string => {
    const taker = clean(pin.taken_by).toLowerCase();
    if (taker && staffByName.has(taker)) return staffByName.get(taker)!;
    const square = clean(pin.board_square);
    return square && managers.has(square) ? square : "";
  };

  type Due = { pin: OpenPin; name: string; days: number; asks: number; holder: string };
  const due: Due[] = [];
  for (const pin of pins) {
    // Asked already today (a second cron run, or a manual one): not again.
    if (pin.board_asked_at && officeDay(new Date(pin.board_asked_at)) === today) continue;
    const lastUpdate = latest(pin.board_pinned_at, pin.board_owner_since, pin.board_status_at, pin.flow_since);
    const clockStart = latest(lastUpdate, pin.board_asked_at);
    if (!lastUpdate || !clockStart) continue;
    if (businessDaysBetween(officeDay(clockStart), today) < FLOW_RED_BUSINESS_DAYS) continue;
    due.push({ pin, name: pinName(pin), days: businessDaysBetween(officeDay(lastUpdate), today), asks: Number(pin.board_asks ?? 0) + 1, holder: holderOf(pin) });
  }
  run.due = due.length;

  // The tag, the count and the history first: they hold even when a text fails.
  const contacts = new Map<string, StaffContact | null>();
  const contactOf = async (staffId: string) => {
    if (!contacts.has(staffId)) contacts.set(staffId, await staffContact(staffId).catch(() => null));
    return contacts.get(staffId) ?? null;
  };
  const asked: Due[] = [];
  for (const entry of due) {
    const updated = (await sql`
      UPDATE handoff_items SET board_asks = ${entry.asks}, board_asked_at = now()
      WHERE kind = ${entry.pin.kind} AND item_id = ${entry.pin.item_id} AND board_asks = ${entry.asks - 1} AND board_done_at IS NULL
      RETURNING item_id
    `) as unknown[];
    if (updated.length === 0) continue;
    const contact = entry.holder ? await contactOf(entry.holder) : null;
    await sql`INSERT INTO board_status_log (kind, item_id, event, by_name) VALUES (${entry.pin.kind}, ${entry.pin.item_id}, 'ask', ${contact?.name ?? ""})`;
    asked.push(entry);
  }
  run.asked = asked.length;

  // One text and one push per person.
  const byHolder = new Map<string, Due[]>();
  for (const entry of asked) if (entry.holder) byHolder.set(entry.holder, [...(byHolder.get(entry.holder) ?? []), entry]);
  for (const [holder, list] of byHolder) {
    const contact = await contactOf(holder);
    if (!contact) continue;
    const result = await tell(contact, askText(list), list[0].pin.item_id, origin, "board/status-ask");
    if (result.texted) run.texts++;
    if (result.pushed) run.pushes++;
  }

  // The third unanswered ask: the owner is told, once until the next status. Only pins someone has (a shared box is tag only).
  const ownerDue = asked.filter((entry) => entry.holder && entry.asks >= OWNER_AFTER_ASKS && !entry.pin.board_owner_told_at);
  if (ownerDue.length > 0) {
    const ownerIds = (await sql`SELECT staff_id FROM manager_accounts WHERE role = 'owner' AND staff_id IS NOT NULL AND btrim(staff_id) <> ''`) as { staff_id: string }[];
    const owners = (await Promise.all(ownerIds.map((row) => contactOf(row.staff_id)))).filter((contact): contact is StaffContact => contact !== null);
    const lines = await Promise.all(ownerDue.map(async (entry) => ({ name: entry.name, days: entry.days, asks: entry.asks, who: (await contactOf(entry.holder))?.name || "its owner" })));
    for (const entry of ownerDue) {
      await sql`UPDATE handoff_items SET board_owner_told_at = now() WHERE kind = ${entry.pin.kind} AND item_id = ${entry.pin.item_id}`;
      await sql`INSERT INTO board_status_log (kind, item_id, event, by_name) VALUES (${entry.pin.kind}, ${entry.pin.item_id}, 'owner', ${owners.map((owner) => owner.name).join(", ")})`;
    }
    for (const owner of owners) {
      // Not when the owner is the one who was asked: they already got the ask.
      const forThem = lines.filter((_, index) => ownerDue[index].holder !== owner.staffId);
      if (forThem.length === 0) continue;
      await tell(owner, ownerText(forThem), ownerDue[0].pin.item_id, origin, "board/status-owner");
      run.ownerTold++;
    }
  }
  return run;
}
