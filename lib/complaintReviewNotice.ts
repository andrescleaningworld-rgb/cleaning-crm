// "Ready to review": when a team (sub) marks a complaint resolved in the sub
// portal, the office is told so it can check the fix before the customer
// sees it: an email to the office inbox and a push to Andrés, both with a
// link straight to the review on the Complaint page (#review). The complaint's
// pin stays on the Pin Board, its tracker on "Ready to review", until the
// office closes it (lib/pg/board.ts). Each try is written on the complaint
// (complaint_events 'review_notified'). Never throws. Server only.

import { getSql } from "@/lib/db";
import { sendHtmlEmail } from "@/lib/email";
import { sendPush } from "@/lib/push";
import { managerKey } from "@/lib/managerNames";
import { addComplaintEvent } from "@/lib/pg/complaint-events";

/** Where the "Ready to review" email goes. */
export const REVIEW_EMAIL = "crm@cleaningworldinc.com";
/** Who gets the push: the active staff member with this first name (accents do not matter). */
export const REVIEW_PUSH_NAME = "andres";

const clean = (value: unknown) => String(value ?? "").trim();
const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function notifyReadyToReview(input: { rowId: number; origin: string; teamName: string; note: string; photoCount: number }): Promise<void> {
  try {
    const rows = (await getSql().query(`SELECT btrim(complaint_id) AS complaint_id, sheet_row, account_name, left(issue, 300) AS issue FROM complaints WHERE id = $1`, [input.rowId])) as {
      complaint_id: string;
      sheet_row: number;
      account_name: string;
      issue: string;
    }[];
    const row = rows[0];
    if (!row) return;
    const key = clean(row.complaint_id) || String(row.sheet_row);
    const link = `${input.origin.replace(/\/$/, "")}/complaints/${encodeURIComponent(key)}#review`;
    const account = clean(row.account_name) || "an account";
    const team = clean(input.teamName) || "The team";
    const title = `Ready to review: ${account}`;
    const line = `${team} marked complaint ${key} resolved (${input.photoCount} photo${input.photoCount === 1 ? "" : "s"}). Check it, then Close & send to customer.`;

    const html =
      `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#10233f;max-width:600px;">` +
      `<p style="font-size:20px;font-weight:700;margin:0 0 12px;">${esc(title)}</p>` +
      `<p style="margin:0 0 12px;">${esc(line)}</p>` +
      (row.issue ? `<p style="margin:0 0 4px;font-weight:700;">The complaint</p><p style="margin:0 0 12px;white-space:pre-wrap;">${esc(clean(row.issue))}</p>` : "") +
      (input.note ? `<p style="margin:0 0 4px;font-weight:700;">What the team wrote</p><p style="margin:0 0 16px;white-space:pre-wrap;">${esc(clean(input.note))}</p>` : "") +
      `<p style="margin:0 0 12px;"><a href="${esc(link)}" style="display:inline-block;background:#147a52;color:#ffffff;padding:14px 24px;border-radius:8px;font-weight:700;text-decoration:none;">Review it</a></p>` +
      `<p style="margin:0;color:#52627a;font-size:13px;">The customer sees "Team on it" until you close it.</p>` +
      `</div>`;
    const text = [title, "", line, row.issue ? `\nThe complaint: ${clean(row.issue)}` : "", input.note ? `\nWhat the team wrote: ${clean(input.note)}` : "", `\nReview it: ${link}`].filter(Boolean).join("\n");

    const emailed = await sendHtmlEmail({ to: [REVIEW_EMAIL], subject: `${title} – complaint ${key}`, text, html, log: { type: "Complaint ready to review", accountName: account, sentBy: "System" } }).catch(() => false);
    await addComplaintEvent({ complaintId: input.rowId, kind: "review_notified", channel: "email", status: emailed ? "sent" : "failed", detail: `To ${REVIEW_EMAIL}` });

    const staff = (await getSql().query(`SELECT id, name FROM staff WHERE active`).catch(() => [])) as { id: string; name: string }[];
    const me = staff.find((person) => managerKey(person.name).split(" ")[0] === REVIEW_PUSH_NAME);
    if (!me) {
      await addComplaintEvent({ complaintId: input.rowId, kind: "review_notified", channel: "push", status: "skipped", detail: `No active staff member named ${REVIEW_PUSH_NAME}.` });
      return;
    }
    const pushed = await sendPush(String(me.id), title, line, link, "complaints/ready-to-review");
    await addComplaintEvent({ complaintId: input.rowId, kind: "review_notified", channel: "push", status: pushed.success ? "sent" : "failed", detail: pushed.success ? `To ${me.name}` : `To ${me.name}: ${pushed.reason ?? "not sent"}` });
  } catch (error) {
    console.error("[complaint review notice]", error instanceof Error ? error.message : error);
  }
}
