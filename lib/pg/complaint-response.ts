// The complaint response clock on the server (migration 076):
//   - markFirstResponse: the first time a manager or the sub answers a
//     complaint (changes its status, adds a note, closes it, taps "Got it"),
//     the time and who; later answers change nothing.
//   - runResponseClock (cron, every 15 minutes): an open complaint still
//     waiting past the red hours (business hours, Settings) texts and pushes
//     its assigned manager, once.
// Before migration 076 both do nothing. Server only.

import { getSql } from "@/lib/db";
import { getFeatureSetting } from "@/lib/pg/feature-settings";
import { clockState, minutesLabel } from "@/lib/responseClock";
import { complaintRowId, addComplaintEvent } from "@/lib/pg/complaint-events";
import { staffContact, textBoardPerson } from "@/lib/pg/board-sms";
import { sendPush } from "@/lib/push";
import { forgetRiskCache } from "@/lib/pg/account-risk";

const clean = (value: unknown) => String(value ?? "").trim();
const isMissingColumn = (error: unknown) => (error as { code?: string })?.code === "42703";

/** Records the first answer to a complaint. Never throws; true when this was the first one. */
export async function markFirstResponse(key: string | number, by: string): Promise<boolean> {
  try {
    const rowId = typeof key === "number" ? key : await complaintRowId(key);
    if (rowId === null) return false;
    const rows = (await getSql().query(
      `UPDATE complaints SET first_response_at = now(), first_response_by = $2 WHERE id = $1 AND first_response_at IS NULL RETURNING id`,
      [rowId, clean(by) || "Someone"]
    )) as unknown[];
    if (rows.length > 0) forgetRiskCache();
    return rows.length > 0;
  } catch (error) {
    if (!isMissingColumn(error)) console.error("[response clock] first response not saved:", error instanceof Error ? error.message : error);
    return false;
  }
}

type Waiting = { id: number | string; complaint_id: string; sheet_row: number; account_name: string; assigned_to: string; created_at: string | Date; status: string };

export type ClockRun = { skipped?: string; waiting: number; red: number; alerted: number; noManager: number };

/** The cron part: one text + push to the assigned manager when a waiting complaint turns red. */
export async function runResponseClock(origin: string): Promise<ClockRun> {
  const result: ClockRun = { waiting: 0, red: 0, alerted: 0, noManager: 0 };
  const sql = getSql();
  let rows: Waiting[];
  try {
    rows = (await sql.query(
      `SELECT id, btrim(complaint_id) AS complaint_id, sheet_row, account_name, btrim(assigned_to) AS assigned_to, created_at, status
       FROM complaints
       WHERE first_response_at IS NULL AND response_alert_at IS NULL
         AND lower(btrim(status)) NOT LIKE 'closed%' AND lower(btrim(status)) NOT LIKE 'resolved%' AND lower(btrim(status)) NOT LIKE 'merged%'
       ORDER BY created_at LIMIT 500`
    )) as Waiting[];
  } catch (error) {
    if (isMissingColumn(error)) return { ...result, skipped: "Migration 076 is not applied yet." };
    throw error;
  }
  result.waiting = rows.length;
  const setting = await getFeatureSetting("complaintClock");
  const now = new Date();

  for (const row of rows) {
    const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at);
    const state = clockState({ createdAt, answeredAt: "", open: true, setting, now });
    if (!state || state.level !== "red") continue;
    result.red += 1;

    // Claimed first, so two runs at once never text twice.
    const claimed = (await sql.query(`UPDATE complaints SET response_alert_at = now() WHERE id = $1 AND response_alert_at IS NULL RETURNING id`, [row.id])) as unknown[];
    if (claimed.length === 0) continue;

    const rowId = Number(row.id);
    const key = clean(row.complaint_id) || String(row.sheet_row);
    const staff = row.assigned_to
      ? ((await sql.query(`SELECT id FROM staff WHERE active AND lower(btrim(name)) = lower($1) ORDER BY (role = 'Manager') DESC LIMIT 1`, [row.assigned_to])) as { id: string }[])
      : [];
    const contact = staff[0] ? await staffContact(staff[0].id).catch(() => null) : null;
    if (!contact) {
      result.noManager += 1;
      await addComplaintEvent({ complaintId: rowId, kind: "response_alert", status: "skipped", detail: row.assigned_to ? `No active staff member named "${row.assigned_to}".` : "No manager is assigned." });
      continue;
    }

    const account = clean(row.account_name) || "an account";
    const text = `Complaint for ${account} has waited ${minutesLabel(state.minutes)} with no answer. Please answer it in the app.`;
    const [texted, pushed] = await Promise.all([
      textBoardPerson(contact, text, `complaint:${key}`, "complaints/response-clock").catch(() => false),
      sendPush(contact.staffId, "Complaint waiting", text, `${origin}/complaints/${encodeURIComponent(key)}`, "complaints/response-clock")
        .then((sent) => sent.success)
        .catch(() => false),
    ]);
    if (texted || pushed) result.alerted += 1;
    await addComplaintEvent({
      complaintId: rowId,
      kind: "response_alert",
      status: texted || pushed ? "sent" : "failed",
      detail: `To ${contact.name}: text ${texted ? "sent" : "not sent"}, push ${pushed ? "sent" : "not sent"}.`,
    });
  }
  return result;
}
