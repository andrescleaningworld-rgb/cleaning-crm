// The Email log (migration 052): every email (and new-account offer text)
// the app sends, with exactly what was sent. Written by sendHtmlEmail and
// the plain-text senders in lib/email.ts when the caller passes `log`, and
// by the New Account offer (a text). Read by Office -> Email log and the
// Email log tab on a sub's page. Server only.
//
// Logging never breaks a send: a log that cannot be written (before 052 has
// run, a database hiccup) is only reported on the server console.

import { getSql } from "@/lib/db";

/** What a sender says about the email, beyond to / subject / body. */
export type EmailLogMeta = {
  type: string;
  accountId?: string;
  accountName?: string;
  subId?: string;
  subName?: string;
  /** The staff member who sent it; "System" when the app sent it by itself. */
  sentBy?: string;
};

export type EmailLogEntry = EmailLogMeta & {
  channel?: "email" | "text";
  to: string[];
  cc?: string[];
  subject: string;
  status: "sent" | "failed";
  error?: string;
  html?: string;
  text?: string;
  attachments?: string[];
};

let ready: boolean | null = null;

export async function emailLogReady(): Promise<boolean> {
  if (ready === true) return true;
  try {
    const rows = (await getSql()`SELECT to_regclass('public.email_log') IS NOT NULL AS ok`) as { ok: boolean }[];
    ready = rows[0]?.ok === true;
  } catch {
    ready = false;
  }
  return ready === true;
}

const clip = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

/** Adds one row. Never throws. */
export async function logEmail(entry: EmailLogEntry): Promise<void> {
  try {
    if (!(await emailLogReady())) return;
    await getSql()`
      INSERT INTO email_log (channel, to_address, cc, subject, email_type, account_id, account_name, sub_id, sub_name, sent_by, status, error, body_html, body_text, attachments)
      VALUES (
        ${entry.channel ?? "email"}, ${clip(entry.to.join(", "), 1000)}, ${clip((entry.cc ?? []).join(", "), 1000)}, ${clip(entry.subject, 500)},
        ${clip(entry.type, 80)}, ${clip(entry.accountId, 80)}, ${clip(entry.accountName, 200)}, ${clip(entry.subId, 80)}, ${clip(entry.subName, 200)},
        ${clip(entry.sentBy || "System", 120)}, ${entry.status}, ${clip(entry.error, 1000)}, ${String(entry.html ?? "")}, ${String(entry.text ?? "")},
        ${clip((entry.attachments ?? []).join(", "), 500)}
      )
    `;
  } catch (error) {
    console.error("[email log] not written:", error instanceof Error ? error.message : error);
  }
}

export type EmailLogRow = {
  id: number;
  sentAt: string;
  channel: string;
  to: string;
  cc: string;
  subject: string;
  type: string;
  accountId: string;
  accountName: string;
  subId: string;
  subName: string;
  sentBy: string;
  status: "sent" | "failed";
  error: string;
  attachments: string;
  source: string;
  /** Old rows from the sheet tab have no body. */
  hasBody: boolean;
};

type Row = {
  id: string | number;
  sent_at: string | Date;
  channel: string;
  to_address: string;
  cc: string;
  subject: string;
  email_type: string;
  account_id: string;
  account_name: string;
  sub_id: string;
  sub_name: string;
  sent_by: string;
  status: "sent" | "failed";
  error: string;
  attachments: string;
  source: string;
  has_body: boolean;
};

const toRow = (row: Row): EmailLogRow => ({
  id: Number(row.id),
  sentAt: new Date(row.sent_at).toISOString(),
  channel: row.channel,
  to: row.to_address,
  cc: row.cc,
  subject: row.subject,
  type: row.email_type,
  accountId: row.account_id,
  accountName: row.account_name,
  subId: row.sub_id,
  subName: row.sub_name,
  sentBy: row.sent_by,
  status: row.status,
  error: row.error,
  attachments: row.attachments,
  source: row.source,
  hasBody: row.has_body,
});

/**
 * Newest first. q looks in to / subject / account / sub / sent by. subId also
 * matches rows sent to that sub's email (old rows have no sub id).
 */
export async function listEmailLog(filter: { q?: string; type?: string; subId?: string; subEmail?: string; accountId?: string; limit?: number; offset?: number }): Promise<{ rows: EmailLogRow[]; total: number; types: string[] }> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace("?", `$${params.length}`));
  };
  const q = clip(filter.q, 100).toLowerCase();
  if (q) add("lower(to_address || ' ' || subject || ' ' || account_name || ' ' || sub_name || ' ' || sent_by || ' ' || email_type) LIKE ?", `%${q}%`);
  if (filter.type) add("email_type = ?", clip(filter.type, 80));
  if (filter.accountId) add("account_id = ?", clip(filter.accountId, 80));
  if (filter.subId || filter.subEmail) {
    const parts: string[] = [];
    if (filter.subId) {
      params.push(clip(filter.subId, 80));
      parts.push(`sub_id = $${params.length}`);
    }
    if (filter.subEmail) {
      params.push(`%${clip(filter.subEmail, 200).toLowerCase()}%`);
      parts.push(`lower(to_address) LIKE $${params.length}`);
    }
    where.push(`(${parts.join(" OR ")})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.min(200, Math.max(1, Math.round(filter.limit ?? 100)));
  const offset = Math.max(0, Math.round(filter.offset ?? 0));
  const sql = getSql();
  const [rows, count, types] = await Promise.all([
    sql.query(
      `SELECT id, sent_at, channel, to_address, cc, subject, email_type, account_id, account_name, sub_id, sub_name, sent_by, status, error, attachments, source,
              (body_html <> '' OR body_text <> '') AS has_body
       FROM email_log ${whereSql} ORDER BY sent_at DESC, id DESC LIMIT ${limit} OFFSET ${offset}`,
      params
    ),
    sql.query(`SELECT count(*)::int AS n FROM email_log ${whereSql}`, params),
    sql.query(`SELECT DISTINCT email_type FROM email_log WHERE email_type <> '' ORDER BY email_type`),
  ]);
  return {
    rows: (rows as Row[]).map(toRow),
    total: (count as { n: number }[])[0]?.n ?? 0,
    types: (types as { email_type: string }[]).map((row) => row.email_type),
  };
}

/** One row with exactly what was sent. */
export async function getEmailLogEntry(id: number): Promise<(EmailLogRow & { html: string; text: string }) | null> {
  const rows = (await getSql()`
    SELECT *, (body_html <> '' OR body_text <> '') AS has_body FROM email_log WHERE id = ${id} LIMIT 1
  `) as (Row & { body_html: string; body_text: string })[];
  const row = rows[0];
  return row ? { ...toRow(row), html: row.body_html, text: row.body_text } : null;
}
