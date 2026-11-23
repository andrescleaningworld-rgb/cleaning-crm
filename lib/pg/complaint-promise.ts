// "We're on it": saving the team's promised date, and the check that tells the
// account manager when it passes (cron /api/cron/complaint-clock, every 15
// minutes, once per promised date). Uses complaint_events: no new table. Server only.

import { getSql } from "@/lib/db";
import { cleanPromiseTime, isPromiseDay, isPromiseReason, promisePassed, promiseWhen, readPromise, type ComplaintPromise } from "@/lib/complaintPromise";
import { complaintEventsReady, listComplaintEvents } from "@/lib/pg/complaint-events";
import { markFirstResponse } from "@/lib/pg/complaint-response";
import { staffContact, textBoardPerson } from "@/lib/pg/board-sms";
import { sendPush } from "@/lib/notify";

const clean = (value: unknown) => String(value ?? "").trim();
const OPEN_SQL = `lower(btrim(c.status)) NOT LIKE 'closed%' AND lower(btrim(c.status)) NOT LIKE 'resolved%' AND lower(btrim(c.status)) NOT LIKE 'merged%'`;

/** A problem the sub can fix. `code` picks the words in their language. */
export class ComplaintPromiseError extends Error {
  constructor(public code: "needDate" | "needFuture" | "needReason" | "needOther" | "sameDate" | "failed") {
    super(code);
  }
}

/** The first date, or a changed one (which needs a reason). The tracker moves to "Team on it". */
export async function setComplaintPromise(input: { rowId: number; dueDate: string; dueTime: string; reason?: unknown; reasonText?: unknown; by: string }): Promise<ComplaintPromise> {
  if (!(await complaintEventsReady())) throw new ComplaintPromiseError("failed");
  const dueDate = clean(input.dueDate);
  const dueTime = cleanPromiseTime(input.dueTime);
  if (!isPromiseDay(dueDate) || (clean(input.dueTime) !== "" && !dueTime)) throw new ComplaintPromiseError("needDate");
  if (promisePassed({ dueDate, dueTime })) throw new ComplaintPromiseError("needFuture");

  const saved = await listComplaintEvents(input.rowId, ["promise"]);
  const current = saved.map((event) => readPromise(event.detail, event.by, event.at)).find(Boolean) ?? null;
  const reason = current && isPromiseReason(input.reason) ? input.reason : "";
  const reasonText = reason === "other" ? clean(input.reasonText).slice(0, 300) : "";
  if (current) {
    if (current.dueDate === dueDate && current.dueTime === dueTime) throw new ComplaintPromiseError("sameDate");
    if (!reason) throw new ComplaintPromiseError("needReason");
    if (reason === "other" && !reasonText) throw new ComplaintPromiseError("needOther");
  }

  const by = clean(input.by).slice(0, 120) || "The team";
  const rows = (await getSql().query(
    `INSERT INTO complaint_events (complaint_id, kind, channel, status, detail, photos, by_name)
     VALUES ($1, 'promise', $2, '', $3, '', $4) RETURNING created_at`,
    [input.rowId, current ? "change" : "first", JSON.stringify({ dueDate, dueTime, reason, reasonText }), by]
  )) as { created_at: string | Date }[];
  await markFirstResponse(input.rowId, by);
  const at = rows[0]?.created_at instanceof Date ? rows[0].created_at.toISOString() : String(rows[0]?.created_at ?? new Date().toISOString());
  return { dueDate, dueTime, reason, reasonText, by, at };
}

type Open = { event_id: string | number; complaint_row: string | number; detail: string; by_name: string; created_at: string | Date; account_name: string; complaint_key: string; manager: string };

export type PromiseRun = { checked: number; late: number; alerted: number; noManager: number };

/** A promised date passed with no "Ready to review": one text + push to the account's manager. A new date can alert again. */
export async function runPromiseLateChecks(origin: string, now = new Date()): Promise<PromiseRun> {
  const result: PromiseRun = { checked: 0, late: 0, alerted: 0, noManager: 0 };
  if (!(await complaintEventsReady())) return result;
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT DISTINCT ON (e.complaint_id) e.id AS event_id, e.complaint_id AS complaint_row, e.detail, e.by_name, e.created_at, c.account_name,
            COALESCE(NULLIF(btrim(c.complaint_id), ''), c.sheet_row::text) AS complaint_key,
            COALESCE(NULLIF(btrim(m.name), ''), NULLIF(btrim(a.manager_raw), ''), btrim(c.assigned_to), '') AS manager
     FROM complaint_events e
     JOIN complaints c ON c.id = e.complaint_id
     LEFT JOIN accounts a ON a.id = c.account_ref
     LEFT JOIN managers m ON m.id = a.manager_id
     WHERE e.kind = 'promise' AND ${OPEN_SQL}
     ORDER BY e.complaint_id, e.created_at DESC, e.id DESC`
  )) as Open[];

  for (const row of rows) {
    result.checked += 1;
    const promise = readPromise(row.detail, row.by_name, new Date(row.created_at).toISOString());
    if (!promise || !promisePassed(promise, now)) continue;
    result.late += 1;
    const promiseId = String(row.event_id);
    // Claimed first, so two runs at once never text twice.
    const claimed = (await sql.query(
      `INSERT INTO complaint_events (complaint_id, kind, channel, status, detail, photos, by_name)
       SELECT $1::bigint, 'promise_late', $2::text, 'pending', '', '', 'System'
       WHERE NOT EXISTS (SELECT 1 FROM complaint_events WHERE complaint_id = $1::bigint AND kind = 'promise_late' AND channel = $2::text)
       RETURNING id`,
      [row.complaint_row, promiseId]
    )) as { id: string | number }[];
    if (!claimed[0]) continue;
    const finish = (status: string, detail: string) => sql.query(`UPDATE complaint_events SET status = $2, detail = $3 WHERE id = $1`, [claimed[0].id, status, detail]);

    const staff = row.manager
      ? ((await sql.query(`SELECT id FROM staff WHERE active AND lower(btrim(name)) = lower($1) ORDER BY (role = 'Manager') DESC LIMIT 1`, [row.manager])) as { id: string }[])
      : [];
    const contact = staff[0] ? await staffContact(staff[0].id).catch(() => null) : null;
    if (!contact) {
      result.noManager += 1;
      await finish("skipped", row.manager ? `No active staff member named "${row.manager}".` : "No manager on this account.");
      continue;
    }
    const account = clean(row.account_name) || "an account";
    const text = `Complaint for ${account} is late: the team promised ${promiseWhen(promise.dueDate, promise.dueTime, "en")} and it is not ready for review. Please check it in the app.`;
    const [texted, pushed] = await Promise.all([
      textBoardPerson(contact, text, `complaint:${row.complaint_key}`, "complaints/promise-late").catch(() => false),
      sendPush(contact.staffId, "Complaint late", text, `${origin}/complaints/${encodeURIComponent(row.complaint_key)}`, "complaints/promise-late")
        .then((sent) => sent.success)
        .catch(() => false),
    ]);
    if (texted || pushed) result.alerted += 1;
    await finish(texted || pushed ? "sent" : "failed", `To ${contact.name}: text ${texted ? "sent" : "not sent"}, push ${pushed ? "sent" : "not sent"}.`);
  }
  return result;
}
