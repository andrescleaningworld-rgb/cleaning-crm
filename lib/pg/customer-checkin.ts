// Customer check-ins: the database side (migrations 059 + 079 + 080). Server only.
// Words and the email: lib/customerCheckin.ts. Link: lib/checkinLink.ts.
//
// Nothing is sent by itself. A check-in goes out only when someone presses
// Send: one account (account page), picked accounts, or a saved list
// (Check-ins page). Each press is a batch:
//   previewCheckins()     who will get it and who is skipped, and why
//   sendCheckins()        writes one 'queued' row per account, then sends
//                         them, at most CHECKIN_DAILY_LIMIT a day
//   sendQueuedCheckins()  sends what is still queued (the daily job, and the
//                         end of each send): the rest of a big send goes over
//                         the next days by itself
// A row is claimed (queued → sent) before its email goes, so two runs never
// send the same one; a failed send is marked 'failed'.
//
// Skipped: cancelled accounts, no valid email, an open complaint, a check-in
// in the last CHECKIN_REPEAT_DAYS days (sent or queued), and "Stop these
// emails". The email and its subject are saved on the row: the copy behind
// "View email".
//
// "Viewed": the sent email carries a 1x1 picture (app/checkin/[token]/open,
// migration 080) that records the first open and how many. Approximate.
//
// Answers (app/checkin): every answer, and every feedback box sent after it,
// emails the office (crm@; "⚠️ Needs attention" starts the subject for
// those). The answer can be changed on the page before Submit.
// 😀 Great is just logged. 😟 Needs attention puts a
// paper in the account manager's square right away, with a text and a push;
// 😐 OK does the same once the customer writes what to do better.

import { getSql } from "@/lib/db";
import { logActivity, logCustomerActivity } from "@/lib/activityLog";
import { linesToHtml, sendHtmlEmail } from "@/lib/email";
import { sendPush } from "@/lib/push";
import { accountLive } from "@/lib/pg/account-live";
import { managerSquareFinder, pinOnce, takeDownPapers, updatePaperNotes } from "@/lib/pg/auto-pins";
import { notifyBoardSquare } from "@/lib/pg/board-sms";
import { complaintOpenSql } from "@/lib/pg/complaint-changes";
import { checkinOpenUrl, checkinToken, checkinUrl } from "@/lib/checkinLink";
import {
  CHECKIN_DAILY_LIMIT,
  CHECKIN_REPEAT_DAYS,
  CHECKIN_TEST_EMAIL,
  checkinEmail,
  ratingOf,
  ratingText,
  type CheckinAnswerValue,
  type CheckinBatch,
  type CheckinBatchKind,
  type CheckinLast,
  type CheckinList,
  type CheckinRating,
  type CheckinRow,
  type CheckinSkip,
  type CheckinStatus,
} from "@/lib/customerCheckin";

const clean = (value: unknown) => String(value ?? "").trim();
const iso = (value: unknown) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};
const EMAIL_RE = /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/;
/** Resend allows 2 emails a second: a little more than half a second between sends. */
const SEND_GAP_MS = 600;
/** One run stops starting new sends after this long (the route allows 300 s); the rest stay queued. */
const RUN_BUDGET_MS = 240_000;

let readyCache = false;

/** Migration 079 is in (the batches table and the new columns). */
export async function checkinReady(): Promise<boolean> {
  if (readyCache) return true;
  try {
    const rows = (await getSql()`
      SELECT to_regclass('public.checkin_batches') IS NOT NULL
         AND to_regclass('public.checkin_lists') IS NOT NULL
         AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customer_checkins' AND column_name = 'email_html') AS ok
    `) as { ok: boolean }[];
    readyCache = rows[0]?.ok === true;
  } catch {
    readyCache = false;
  }
  return readyCache;
}

export const NOT_READY = "Check-ins need migration 079 first.";

let viewCache = false;

/** Migration 080 is in ("Viewed" and "Best way to reach you"). Before it, check-ins work without those. */
async function viewReady(): Promise<boolean> {
  if (viewCache) return true;
  try {
    const rows = (await getSql()`
      SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customer_checkins' AND column_name = 'opened_at')
         AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customer_checkins' AND column_name = 'reach') AS ok
    `) as { ok: boolean }[];
    viewCache = rows[0]?.ok === true;
  } catch {
    viewCache = false;
  }
  return viewCache;
}

/** "2026-11" in New York (the old month column still needs a value). */
const easternMonth = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }).slice(0, 7);

function links(origin: string, id: number) {
  const token = checkinToken(id);
  return {
    great: checkinUrl(origin, token, "great"),
    ok: checkinUrl(origin, token, "ok"),
    attention: checkinUrl(origin, token, "attention"),
    stop: checkinUrl(origin, token, "stop"),
  };
}

async function contactsTableReady(): Promise<boolean> {
  const rows = (await getSql()`SELECT to_regclass('public.account_contacts') IS NOT NULL AS ok`) as { ok: boolean }[];
  return rows[0]?.ok === true;
}

/** Several addresses typed in one field: the first good one. */
const firstEmail = (value: string) => value.split(/[,;\s]+/).find((part) => EMAIL_RE.test(part)) ?? "";

type Candidate = {
  id: string;
  account_name: string;
  status_key: string;
  is_test: boolean;
  email: string;
  manager_name: string;
  manager_phone: string;
  manager_email: string;
  open_complaint: boolean;
  opted_out: boolean;
  recent_at: string | Date | null;
};

/** Each account with what decides whether it gets a check-in (the manager signs it: the Managers list, like the Welcome Packet). */
async function candidates(accountIds: string[]): Promise<Candidate[]> {
  const ids = [...new Set(accountIds.map(clean).filter(Boolean))];
  if (ids.length === 0) return [];
  const contacts = await contactsTableReady();
  return (await getSql().query(
    `SELECT a.id, a.account_name, a.status_key, a.is_test,
            COALESCE(NULLIF(btrim(a.email), ''), ${contacts ? `(SELECT btrim(c.email) FROM account_contacts c WHERE c.account_id = a.id AND c.is_main AND btrim(c.email) <> '' LIMIT 1)` : "NULL"}, '') AS email,
            COALESCE(NULLIF(btrim(m.name), ''), btrim(a.manager_raw), '') AS manager_name,
            COALESCE(btrim(m.phone), '') AS manager_phone,
            COALESCE(btrim(m.email), '') AS manager_email,
            EXISTS (SELECT 1 FROM complaints k WHERE k.account_ref = a.id AND ${complaintOpenSql("k.status")}) AS open_complaint,
            EXISTS (SELECT 1 FROM customer_checkin_optouts o WHERE o.account_id = a.id) AS opted_out,
            (SELECT max(COALESCE(r.sent_at, r.created_at)) FROM customer_checkins r
              WHERE r.account_id = a.id AND r.status IN ('sent', 'queued')
                AND COALESCE(r.sent_at, r.created_at) > now() - make_interval(days => $2::int)) AS recent_at
     FROM accounts a
     LEFT JOIN LATERAL (
       SELECT name, phone, email FROM managers
       WHERE id = a.manager_id
          OR (a.manager_id IS NULL AND a.manager_raw <> '' AND lower(btrim(name)) = lower(btrim(a.manager_raw)))
       ORDER BY (id = a.manager_id) DESC NULLS LAST, row_no
       LIMIT 1
     ) m ON true
     WHERE a.id = ANY($1::text[]) AND ${accountLive("a")}
     ORDER BY a.account_name`,
    [ids, CHECKIN_REPEAT_DAYS]
  )) as Candidate[];
}

const dayText = (value: string | Date | null) =>
  value ? new Date(value).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" }) : "";

/** Why this account is left out ("" = it gets one). */
function skipReason(c: Candidate): string {
  if (c.is_test) return "Test account";
  if (["cancelled", "canceled"].includes(clean(c.status_key).toLowerCase())) return "Cancelled";
  if (c.opted_out) return "Stopped these emails";
  if (!firstEmail(c.email)) return "No valid email";
  if (c.open_complaint) return "Open complaint";
  if (c.recent_at) return `Check-in in the last ${CHECKIN_REPEAT_DAYS} days (${dayText(c.recent_at)})`;
  return "";
}

/** How many check-in emails went today (New York day): sent and failed both used the provider. */
async function sentToday(): Promise<number> {
  const rows = (await getSql()`
    SELECT count(*)::int AS n FROM customer_checkins
    WHERE status IN ('sent', 'failed') AND sent_at IS NOT NULL
      AND (sent_at AT TIME ZONE 'America/New_York')::date = (now() AT TIME ZONE 'America/New_York')::date
  `) as { n: number }[];
  return rows[0]?.n ?? 0;
}

async function queuedCount(): Promise<number> {
  const rows = (await getSql()`SELECT count(*)::int AS n FROM customer_checkins WHERE status = 'queued'`) as { n: number }[];
  return rows[0]?.n ?? 0;
}

export type CheckinPreview = {
  willSend: { accountId: string; accountName: string; email: string }[];
  skipped: CheckinSkip[];
  /** How many can still go today; the rest are queued for the next days. */
  todayLeft: number;
  /** Already waiting from earlier sends (they go first). */
  alreadyQueued: number;
  /** The email the first account would get (its links answer nothing). */
  sample: { accountName: string; to: string; subject: string; html: string } | null;
};

export async function previewCheckins(accountIds: string[], origin: string): Promise<CheckinPreview> {
  const list = await candidates(accountIds);
  const found = new Set(list.map((c) => c.id));
  const skipped: CheckinSkip[] = accountIds
    .map(clean)
    .filter((id) => id && !found.has(id))
    .map((id) => ({ accountId: id, accountName: id, reason: "Account not found" }));
  const willSend: CheckinPreview["willSend"] = [];
  for (const c of list) {
    const reason = skipReason(c);
    if (reason) skipped.push({ accountId: c.id, accountName: c.account_name, reason });
    else willSend.push({ accountId: c.id, accountName: c.account_name, email: firstEmail(c.email) });
  }
  const first = list.find((c) => !skipReason(c));
  const [today, alreadyQueued] = await Promise.all([sentToday(), queuedCount()]);
  const sample = first
    ? {
        accountName: first.account_name,
        to: firstEmail(first.email),
        ...checkinEmail({
          customerName: first.account_name,
          managerName: first.manager_name,
          managerPhone: first.manager_phone,
          managerEmail: first.manager_email,
          links: links(origin, 0),
        }),
      }
    : null;
  return { willSend, skipped, todayLeft: Math.max(0, CHECKIN_DAILY_LIMIT - today), alreadyQueued, sample: sample ? { accountName: sample.accountName, to: sample.to, subject: sample.subject, html: sample.html } : null };
}

export type CheckinSendResult = { batchId: number; queued: number; sent: number; failed: number; skipped: number; stillQueued: number };

/** Press of Send: a batch, one queued row per account that can get one, then as many sent as today allows. */
export async function sendCheckins(input: {
  accountIds: string[];
  kind: CheckinBatchKind;
  listId?: number | null;
  listName?: string;
  by: string;
  origin: string;
}): Promise<CheckinSendResult> {
  const sql = getSql();
  const list = await candidates(input.accountIds);
  const found = new Set(list.map((c) => c.id));
  const skipped: CheckinSkip[] = input.accountIds
    .map(clean)
    .filter((id) => id && !found.has(id))
    .map((id) => ({ accountId: id, accountName: id, reason: "Account not found" }));
  const going: Candidate[] = [];
  for (const c of list) {
    const reason = skipReason(c);
    if (reason) skipped.push({ accountId: c.id, accountName: c.account_name, reason });
    else going.push(c);
  }

  const batch = (await sql`
    INSERT INTO checkin_batches (created_by, kind, list_id, list_name, skipped)
    VALUES (${input.by}, ${input.kind}, ${input.listId ?? null}, ${input.listName ?? ""}, ${JSON.stringify(skipped)}::jsonb)
    RETURNING id
  `) as { id: string }[];
  const batchId = Number(batch[0].id);

  const month = easternMonth();
  let queued = 0;
  for (const c of going) {
    await sql`
      INSERT INTO customer_checkins (account_id, month, channel, sent_to, sent_at, status, batch_id, sent_by, manager_name)
      VALUES (${c.id}, ${month}, 'email', ${firstEmail(c.email)}, NULL, 'queued', ${batchId}, ${input.by}, ${c.manager_name})
    `;
    queued += 1;
  }

  const run = queued > 0 ? await sendQueuedCheckins(input.origin) : { sent: 0, failed: 0, skipped: 0, stillQueued: await queuedCount() };
  return { batchId, queued, sent: run.sent, failed: run.failed, skipped: skipped.length, stillQueued: run.stillQueued };
}

type QueuedRow = { id: string; account_id: string; sent_to: string; sent_by: string };

/**
 * Sends the queued check-ins, oldest first, up to what is left of today's
 * limit. Each one is checked again first (cancelled, stopped the emails, no
 * email): those are 'skipped'. The daily job and every Send call this.
 */
export async function sendQueuedCheckins(origin: string, budgetMs = RUN_BUDGET_MS): Promise<{ sent: number; failed: number; skipped: number; stillQueued: number }> {
  if (!(await checkinReady())) return { sent: 0, failed: 0, skipped: 0, stillQueued: 0 };
  const sql = getSql();
  const started = Date.now();
  let left = Math.max(0, CHECKIN_DAILY_LIMIT - (await sentToday()));
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  const rows = left > 0 ? ((await sql`SELECT id::text, account_id, sent_to, sent_by FROM customer_checkins WHERE status = 'queued' ORDER BY created_at, id LIMIT ${left}`) as QueuedRow[]) : [];
  const info = new Map((await candidates(rows.map((r) => r.account_id))).map((c) => [c.id, c]));

  for (const row of rows) {
    if (left <= 0 || Date.now() - started > budgetMs) break;
    const id = Number(row.id);
    const c = info.get(row.account_id);
    const reason = !c
      ? "Account not found"
      : c.opted_out
        ? "Stopped these emails"
        : ["cancelled", "canceled"].includes(clean(c.status_key).toLowerCase())
          ? "Cancelled"
          : !firstEmail(c.email)
            ? "No valid email"
            : "";
    if (reason || !c) {
      await sql`UPDATE customer_checkins SET status = 'skipped', error = ${reason} WHERE id = ${id} AND status = 'queued'`;
      skipped += 1;
      continue;
    }
    const to = firstEmail(c.email);
    const emailInput = { customerName: c.account_name, managerName: c.manager_name, managerPhone: c.manager_phone, managerEmail: c.manager_email, links: links(origin, id) };
    // The saved copy ("View email") has no "Viewed" picture: staff opening it never counts as the customer.
    const copy = checkinEmail(emailInput);
    const email = (await viewReady()) ? checkinEmail({ ...emailInput, openPixelUrl: checkinOpenUrl(origin, checkinToken(id)) }) : copy;
    // Claim it first: a second run at the same time skips it.
    const claimed = (await sql`
      UPDATE customer_checkins SET status = 'sent', sent_at = now(), sent_to = ${to}, subject = ${email.subject}, email_html = ${copy.html}, manager_name = ${c.manager_name}
      WHERE id = ${id} AND status = 'queued' RETURNING id
    `) as unknown[];
    if (claimed.length === 0) continue;
    left -= 1;
    let ok = false;
    let error = "";
    try {
      ok = await sendHtmlEmail({
        to: [to],
        replyTo: c.manager_email || undefined,
        ...email,
        log: { type: "Customer check-in", accountId: c.id, accountName: c.account_name, sentBy: row.sent_by || "Office" },
      });
      if (!ok) error = "Email is not set up on this server.";
    } catch (sendError) {
      error = sendError instanceof Error ? sendError.message : "The email did not go.";
      console.error("[checkin] send:", error);
    }
    if (ok) {
      sent += 1;
      await logActivity({
        actorAccountId: null,
        actorRole: "manager",
        actorName: row.sent_by || "Office",
        action: "update",
        entityType: "account",
        entityId: c.id,
        detail: `Check-in email sent to: ${to}`,
      }).catch(() => undefined);
    } else {
      failed += 1;
      await sql`UPDATE customer_checkins SET status = 'failed', error = ${error.slice(0, 500)} WHERE id = ${id}`;
    }
    await new Promise((resolve) => setTimeout(resolve, SEND_GAP_MS));
  }
  return { sent, failed, skipped, stillQueued: await queuedCount() };
}

/** "Send me a test": the real email, to crm@, with links that save nothing. */
export async function sendTestCheckin(origin: string, by: string): Promise<boolean> {
  return sendHtmlEmail({
    to: [CHECKIN_TEST_EMAIL],
    ...checkinEmail({ customerName: "Test Account", managerName: by, managerPhone: "201-487-1313", managerEmail: CHECKIN_TEST_EMAIL, links: links(origin, 0), test: true }),
    log: { type: "Customer check-in (test)", sentBy: by },
  });
}

/* ---------- answers (app/checkin) ---------- */

type AnswerRow = { id: string; account_id: string; account_name: string; manager: string; answer: string; comment: string; photos: string; reach: string };

async function answerRow(id: number): Promise<AnswerRow | null> {
  const reach = (await viewReady()) ? "k.reach" : "''";
  const rows = (await getSql().query(
    `SELECT k.id::text, k.account_id, k.answer, k.comment, k.photos, ${reach} AS reach, COALESCE(a.account_name, '') AS account_name,
            COALESCE(NULLIF(btrim(m.name), ''), a.manager_raw, '') AS manager
     FROM customer_checkins k
     LEFT JOIN accounts a ON a.id = k.account_id
     LEFT JOIN managers m ON m.id = a.manager_id
     WHERE k.id = $1 AND k.status = 'sent'`,
    [id]
  )) as AnswerRow[];
  return rows[0] ?? null;
}

/** The customer's own answer: Activity Log -> Customers, under the account's name with a CUSTOMER badge. */
async function history(accountId: string, detail: string): Promise<void> {
  const rows = (await getSql()`SELECT btrim(account_name) AS name FROM accounts WHERE id = ${accountId} LIMIT 1`.catch(() => [])) as { name: string }[];
  await logCustomerActivity({ accountId, accountName: rows[0]?.name || "Customer", action: "update", detail }).catch(() => undefined);
}

const paperId = (id: number, rating: "attention" | "ok") => `checkin:${id}:${rating}`;

/** A paper in the account manager's square, with a text and a push when it goes up now. */
async function pinForManager(row: AnswerRow, id: number, rating: "attention" | "ok", comment: string, origin: string): Promise<void> {
  const squareOf = await managerSquareFinder();
  const square = squareOf(row.manager);
  const label = rating === "attention" ? "Check-in 😟 Needs attention" : "Check-in 😐 OK";
  const notes = comment ? `"${comment}"` : rating === "attention" ? "The customer says the cleaning needs attention." : "The customer said OK.";
  const itemId = paperId(id, rating);
  const href = `/accounts/${encodeURIComponent(row.account_id)}`;
  const up = await pinOnce({ itemId, title: row.account_name || "Customer check-in", label, notes, href, square, accountId: row.account_id, accountName: row.account_name });
  if (!up || !square) return;
  try {
    await notifyBoardSquare({ square, byStaffId: "", paperId: itemId, title: label, accountName: row.account_name, notes, origin, routeContext: "checkin/answer" });
    await sendPush(square, label, `${row.account_name}: ${notes}`.slice(0, 180), `${origin}${href}`, "checkin/answer");
  } catch (error) {
    console.error("[checkin] notify:", error instanceof Error ? error.message : error);
  }
}

/**
 * The email to the office (crm@): one when the customer taps an answer or
 * changes it, a short one when they send the feedback box afterwards. A
 * Needs attention one starts with "⚠️ Needs attention". Never twice for the
 * same tap: only a change that was really saved sends one.
 */
async function notifyOffice(
  row: AnswerRow,
  rating: CheckinRating | "",
  kind: "answer" | "changed" | "comment",
  fields: { comment: string; reach: string; photos: number },
  origin: string
): Promise<void> {
  const name = row.account_name || row.account_id;
  const answer = ratingText(rating);
  const bad = rating === "attention";
  const what = kind === "comment" ? "Check-in comment" : "Check-in answer";
  const subject = bad ? `⚠️ Needs attention — ${what}: ${name}` : `${what}: ${name} (${answer})`;
  const first =
    kind === "answer"
      ? `${name} answered the check-in: ${answer}.`
      : kind === "changed"
        ? `${name} changed their check-in answer to ${answer}.`
        : `${name} added to their check-in answer (${answer}).`;
  const lines = [
    first,
    "",
    `Account: ${name}`,
    `Answer: ${answer}`,
    `Manager: ${row.manager.trim() || "No manager"}`,
    ...(fields.comment ? [`Comment: "${fields.comment}"`] : []),
    ...(fields.reach ? [`Best way to reach them: ${fields.reach}`] : []),
    ...(fields.photos ? [`Photos: ${fields.photos} (on the account page)`] : []),
    "",
    `Open the account: ${origin.replace(/\/$/, "")}/accounts/${encodeURIComponent(row.account_id)}`,
  ];
  try {
    await sendHtmlEmail({
      to: [CHECKIN_TEST_EMAIL],
      subject,
      text: lines.join("\n"),
      html: linesToHtml(lines),
      log: { type: "Check-in answer", accountId: row.account_id, accountName: row.account_name, sentBy: "System" },
    });
  } catch (error) {
    console.error("[checkin] office email:", error instanceof Error ? error.message : error);
  }
}

const photoList = (value: string) => value.split(",").map(clean).filter(Boolean);

/**
 * Saves a new answer, only when it really changes: the old answer must still
 * be there, so two taps at once save (and email) it once. Moves the manager's
 * paper. true = it changed.
 */
async function setRating(row: AnswerRow, id: number, rating: CheckinRating, origin: string): Promise<boolean> {
  if (ratingOf(row.answer) === rating) return false;
  const opened = (await viewReady()) ? ", opened_at = COALESCE(opened_at, now())" : "";
  const changed = (await getSql().query(`UPDATE customer_checkins SET answer = $2, answered_at = now()${opened} WHERE id = $1 AND answer = $3 RETURNING id`, [id, rating, row.answer])) as unknown[];
  if (changed.length === 0) return false;
  // A changed answer takes the paper of the old one down.
  if (rating !== "attention") await takeDownPapers(paperId(id, "attention"), `Customer changed it to ${ratingText(rating)}`);
  if (rating !== "ok") await takeDownPapers(paperId(id, "ok"), `Customer changed it to ${ratingText(rating)}`);
  if (rating === "attention") await pinForManager(row, id, "attention", clean(row.comment), origin);
  if (rating === "ok" && clean(row.comment)) await pinForManager(row, id, "ok", clean(row.comment), origin);
  await history(row.account_id, `Check-in: the customer ${row.answer ? "changed the answer to" : "answered"} ${ratingText(rating)}.`);
  return true;
}

/** One tap in the email. false when the check-in is not found. */
export async function answerCheckin(id: number, rating: CheckinRating, origin: string): Promise<boolean> {
  if (!(await checkinReady())) return false;
  const row = await answerRow(id);
  if (!row) return false;
  if (await setRating(row, id, rating, origin)) {
    await notifyOffice(row, rating, row.answer ? "changed" : "answer", { comment: clean(row.comment), reach: clean(row.reach), photos: photoList(row.photos).length }, origin);
  }
  return true;
}

/**
 * The feedback box under the answer: maybe a changed answer, the comment,
 * "Best way to reach you" and photos. One email to the office: the answer
 * one when the answer changed, else the short comment one (none when nothing
 * new was sent).
 */
export async function submitFeedback(
  id: number,
  input: { rating: CheckinRating | null; comment: string; reach: string; photos: string[] },
  origin: string
): Promise<boolean> {
  if (!(await checkinReady())) return false;
  const row = await answerRow(id);
  if (!row) return false;
  const changed = input.rating ? await setRating(row, id, input.rating, origin) : false;
  const rating = changed && input.rating ? input.rating : ratingOf(row.answer);
  const text = input.comment.trim().slice(0, 2000);
  const viewed = await viewReady();
  const reach = viewed ? input.reach.trim().slice(0, 200) : "";
  const allPhotos = [...photoList(row.photos), ...input.photos].slice(0, 6);
  const added = (text !== "" && text !== clean(row.comment)) || (reach !== "" && reach !== clean(row.reach)) || input.photos.length > 0;
  const note = text || clean(row.comment);
  const reachNow = reach || clean(row.reach);

  if (added) {
    const sql = getSql();
    if (viewed) {
      await sql`UPDATE customer_checkins SET comment = ${note}, photos = ${allPhotos.join(",")}, reach = ${reachNow}, commented_at = now() WHERE id = ${id}`;
    } else {
      await sql`UPDATE customer_checkins SET comment = ${note}, photos = ${allPhotos.join(",")} WHERE id = ${id}`;
    }
    const notes = [note ? `"${note}"` : "", allPhotos.length ? `${allPhotos.length} photo${allPhotos.length === 1 ? "" : "s"}` : "", reachNow ? `Reach: ${reachNow}` : ""]
      .filter(Boolean)
      .join(" · ");
    if (rating === "attention") await updatePaperNotes(paperId(id, "attention"), notes);
    if (rating === "ok") await pinForManager(row, id, "ok", note, origin).then(() => updatePaperNotes(paperId(id, "ok"), notes));
    await history(
      row.account_id,
      `Check-in feedback: ${text}${input.photos.length ? ` (${input.photos.length} photo${input.photos.length === 1 ? "" : "s"})` : ""}${reach ? ` · Best way to reach: ${reach}` : ""}`
    );
  }

  const fields = { comment: note, reach: reachNow, photos: allPhotos.length };
  if (changed) await notifyOffice(row, rating, row.answer ? "changed" : "answer", fields, origin);
  else if (added) await notifyOffice(row, rating, "comment", fields, origin);
  return true;
}

/** The "Viewed" picture was loaded: the first time, and how many times. Nothing before migration 080, nothing for the test (id 0). */
export async function recordCheckinOpen(id: number): Promise<void> {
  if (id <= 0 || !(await viewReady())) return;
  await getSql()`UPDATE customer_checkins SET opened_at = COALESCE(opened_at, now()), open_count = open_count + 1 WHERE id = ${id} AND status = 'sent'`;
}

/** The answer saved now (the feedback page shows it). "" when none, or the check-in is not found. */
export async function currentRating(id: number): Promise<CheckinRating | ""> {
  const rows = (await getSql()`SELECT answer FROM customer_checkins WHERE id = ${id} AND status = 'sent'`) as { answer: string }[];
  return rows[0] ? ratingOf(rows[0].answer) : "";
}

/** "Stop these emails": this account is skipped from now on. */
export async function optOutCheckin(id: number): Promise<boolean> {
  if (!(await checkinReady())) return false;
  const rows = (await getSql()`SELECT account_id, sent_to FROM customer_checkins WHERE id = ${id}`) as { account_id: string; sent_to: string }[];
  const row = rows[0];
  if (!row) return false;
  await getSql()`INSERT INTO customer_checkin_optouts (account_id, email) VALUES (${row.account_id}, ${row.sent_to}) ON CONFLICT DO NOTHING`;
  await history(row.account_id, "The customer stopped the check-in emails.");
  return true;
}

/** The account the check-in belongs to (where its photos are stored). */
export async function checkinAccountId(id: number): Promise<string> {
  const rows = (await getSql()`SELECT account_id FROM customer_checkins WHERE id = ${id} AND status = 'sent'`) as { account_id: string }[];
  return rows[0]?.account_id ?? "";
}

/** Needs attention (and the old 👎) per account in the last 60 days ("At risk"). Empty before migration 059. */
export async function thumbsDownByAccount(): Promise<Map<string, number>> {
  try {
    const rows = (await getSql()`
      SELECT account_id, count(*)::int AS n FROM customer_checkins
      WHERE answer IN ('down', 'attention') AND answered_at >= now() - interval '60 days' GROUP BY account_id
    `) as { account_id: string; n: number }[];
    return new Map(rows.map((row) => [row.account_id, row.n]));
  } catch {
    return new Map();
  }
}

/* ---------- what the staff pages read ---------- */

type DbRow = {
  id: string;
  account_id: string;
  account_name: string | null;
  created_at: string | Date;
  sent_at: string | Date | null;
  status: CheckinStatus;
  sent_by: string;
  sent_to: string;
  batch_id: string | null;
  kind: string | null;
  list_name: string | null;
  answer: CheckinAnswerValue;
  answered_at: string | Date | null;
  comment: string;
  photos: string;
  reach: string;
  opened_at: string | Date | null;
  open_count: number;
  error: string;
  has_copy: boolean;
};

/** The columns of one check-in row; "Viewed" and "Best way to reach you" only once migration 080 is in. */
async function rowSelect(): Promise<string> {
  const v = await viewReady();
  return `k.id::text, k.account_id, a.account_name, k.created_at, k.sent_at, k.status, k.sent_by, k.sent_to, k.batch_id::text,
  b.kind, b.list_name, k.answer, k.answered_at, k.comment, k.photos, k.error, (k.email_html <> '') AS has_copy,
  ${v ? "k.reach, k.opened_at, k.open_count" : "'' AS reach, NULL::timestamptz AS opened_at, 0 AS open_count"}`;
}
const ROW_FROM = `FROM customer_checkins k LEFT JOIN accounts a ON a.id = k.account_id LEFT JOIN checkin_batches b ON b.id = k.batch_id`;

function toRow(r: DbRow): CheckinRow {
  return {
    id: Number(r.id),
    accountId: r.account_id,
    accountName: clean(r.account_name),
    createdAt: iso(r.created_at),
    sentAt: iso(r.sent_at),
    status: r.status,
    sentBy: clean(r.sent_by),
    sentTo: clean(r.sent_to),
    batchId: r.batch_id ? Number(r.batch_id) : null,
    batchKind: (r.kind as CheckinRow["batchKind"]) ?? "",
    listName: clean(r.list_name),
    answer: r.answer,
    answeredAt: iso(r.answered_at),
    comment: clean(r.comment),
    photos: clean(r.photos).split(",").map(clean).filter(Boolean),
    reach: clean(r.reach),
    openedAt: iso(r.opened_at),
    openCount: Number(r.open_count) || 0,
    error: clean(r.error),
    hasCopy: r.has_copy === true,
  };
}

/** The account page: every check-in, newest first, and whether the customer stopped them. */
export async function accountCheckins(accountId: string): Promise<{ ready: boolean; optedOut: boolean; rows: CheckinRow[] }> {
  if (!(await checkinReady())) return { ready: false, optedOut: false, rows: [] };
  const [rows, out] = await Promise.all([
    getSql().query(`SELECT ${await rowSelect()} ${ROW_FROM} WHERE k.account_id = $1 ORDER BY k.created_at DESC, k.id DESC LIMIT 100`, [accountId]) as unknown as Promise<DbRow[]>,
    getSql()`SELECT 1 FROM customer_checkin_optouts WHERE account_id = ${accountId}` as unknown as Promise<unknown[]>,
  ]);
  const made = await complaintsFromCheckins(accountId).catch(() => new Map<number, string>());
  return { ready: true, optedOut: out.length > 0, rows: rows.map(toRow).map((row) => ({ ...row, complaintKey: made.get(row.id) ?? "" })) };
}

/* ---------- "Turn into complaint" ---------- */

/** Check-in id → the complaint made from it, for one account (or every account). Matched by the Notes line. */
async function complaintsFromCheckins(accountId?: string): Promise<Map<number, string>> {
  const rows = (await getSql().query(
    `SELECT btrim(complaint_id) AS complaint_id, sheet_row, notes FROM complaints
     WHERE notes LIKE '%From customer check-in #%' AND ($1::text IS NULL OR account_ref = $1::text)`,
    [accountId ?? null]
  )) as { complaint_id: string | null; sheet_row: number | null; notes: string }[];
  const out = new Map<number, string>();
  for (const row of rows) {
    for (const match of String(row.notes ?? "").matchAll(/From customer check-in #(\d+)/g)) {
      const key = clean(row.complaint_id) || String(row.sheet_row ?? "");
      if (key && !out.has(Number(match[1]))) out.set(Number(match[1]), key);
    }
  }
  return out;
}

export type CheckinForComplaint = {
  id: number;
  accountId: string;
  accountName: string;
  answer: string;
  answeredAt: string;
  comment: string;
  photos: string[];
  /** Already turned into this complaint, or "". */
  complaintKey: string;
};

/** What the New complaint form fills in from a check-in. Null when there is no such check-in. */
export async function checkinForComplaint(id: number): Promise<CheckinForComplaint | null> {
  if (!(await checkinReady())) return null;
  const rows = (await getSql().query(`SELECT ${await rowSelect()} ${ROW_FROM} WHERE k.id = $1`, [id])) as unknown as DbRow[];
  if (!rows[0]) return null;
  const row = toRow(rows[0]);
  const made = await complaintsFromCheckins(row.accountId).catch(() => new Map<number, string>());
  return { id: row.id, accountId: row.accountId, accountName: row.accountName, answer: row.answer, answeredAt: row.answeredAt, comment: row.comment, photos: row.photos, complaintKey: made.get(row.id) ?? "" };
}

/** A complaint was made from the check-in: its Pin Board paper comes down (the complaint has its own). */
export async function checkinBecameComplaint(input: { checkinId: number; complaintKey: string; by: string }): Promise<void> {
  const why = `Turned into complaint ${input.complaintKey}`.trim();
  await takeDownPapers(`checkin:${input.checkinId}:`, why);
  const rows = (await getSql()`SELECT account_id FROM customer_checkins WHERE id = ${input.checkinId}`.catch(() => [])) as { account_id: string }[];
  await logActivity({
    actorAccountId: null,
    actorRole: "manager",
    actorName: input.by,
    action: "update",
    entityType: "account",
    entityId: rows[0]?.account_id ?? null,
    detail: `Check-in #${input.checkinId} turned into complaint ${input.complaintKey}`,
  }).catch(() => undefined);
}

/** The saved copy of one check-in email ("View email"). */
export async function checkinCopy(id: number): Promise<{ subject: string; html: string; sentTo: string; sentAt: string } | null> {
  if (!(await checkinReady())) return null;
  const rows = (await getSql()`SELECT subject, email_html, sent_to, sent_at FROM customer_checkins WHERE id = ${id}`) as { subject: string; email_html: string; sent_to: string; sent_at: string | Date | null }[];
  const row = rows[0];
  return row && row.email_html ? { subject: row.subject, html: row.email_html, sentTo: row.sent_to, sentAt: iso(row.sent_at) } : null;
}

/** The ids of the accounts a check-in can reach: a good email on the account, or else on its main contact (the same rule as sending). */
async function reachableAccounts(): Promise<string[]> {
  const contacts = await contactsTableReady();
  const rows = (await getSql().query(
    `SELECT a.id, COALESCE(NULLIF(btrim(a.email), ''), ${contacts ? `(SELECT btrim(c.email) FROM account_contacts c WHERE c.account_id = a.id AND c.is_main AND btrim(c.email) <> '' LIMIT 1)` : "NULL"}, '') AS email
     FROM accounts a WHERE a.id IS NOT NULL AND ${accountLive("a")}`
  )) as { id: string; email: string }[];
  return rows.filter((row) => firstEmail(row.email)).map((row) => row.id);
}

/** Each account's last check-in (sent or queued), for the Check-ins page's filters; who stopped them; and who has an email to send to. */
export async function lastCheckins(): Promise<{ last: Record<string, CheckinLast>; optedOut: string[]; withEmail: string[] }> {
  if (!(await checkinReady())) return { last: {}, optedOut: [], withEmail: [] };
  const [rows, outs, withEmail] = await Promise.all([
    getSql()`
      SELECT DISTINCT ON (account_id) account_id, COALESCE(sent_at, created_at) AS at, answer, status, comment
      FROM customer_checkins WHERE status IN ('sent', 'queued')
      ORDER BY account_id, COALESCE(sent_at, created_at) DESC, id DESC
    ` as unknown as Promise<{ account_id: string; at: string | Date; answer: CheckinAnswerValue; status: CheckinStatus; comment: string }[]>,
    getSql()`SELECT account_id FROM customer_checkin_optouts` as unknown as Promise<{ account_id: string }[]>,
    reachableAccounts(),
  ]);
  const last: Record<string, CheckinLast> = {};
  for (const row of rows) last[row.account_id] = { lastSentAt: iso(row.at), lastAnswer: row.answer, lastStatus: row.status, lastComment: clean(row.comment) };
  return { last, optedOut: outs.map((o) => o.account_id), withEmail };
}

type BatchDb = {
  id: string;
  created_at: string | Date;
  created_by: string;
  kind: CheckinBatchKind;
  list_name: string;
  skipped_n: number;
  total: number;
  sent: number;
  queued: number;
  failed: number;
  skipped_rows: number;
  answered: number;
  attention: number;
  viewed: number;
  accounts: { id: string; name: string }[] | null;
  skipped: CheckinSkip[] | null;
};

/** One line per send, with its counts ("Viewed" only once migration 080 is in). */
const batchSelect = async () => `SELECT b.id::text, b.created_at, b.created_by, b.kind, b.list_name, jsonb_array_length(b.skipped)::int AS skipped_n,
    count(k.id)::int AS total,
    count(k.id) FILTER (WHERE k.status = 'sent')::int AS sent,
    count(k.id) FILTER (WHERE k.status = 'queued')::int AS queued,
    count(k.id) FILTER (WHERE k.status = 'failed')::int AS failed,
    count(k.id) FILTER (WHERE k.status = 'skipped')::int AS skipped_rows,
    count(k.id) FILTER (WHERE k.answer <> '')::int AS answered,
    count(k.id) FILTER (WHERE k.answer IN ('attention', 'down'))::int AS attention,
    ${(await viewReady()) ? "count(k.id) FILTER (WHERE k.opened_at IS NOT NULL OR k.answer <> '')::int" : "count(k.id) FILTER (WHERE k.answer <> '')::int"} AS viewed,
    -- The accounts the send went to (History's Account column), A to Z, by their name now.
    (SELECT COALESCE(json_agg(json_build_object('id', x.account_id, 'name', x.name) ORDER BY lower(x.name)), '[]'::json)
       FROM (SELECT DISTINCT r.account_id,
                    COALESCE(NULLIF(btrim((SELECT a.account_name FROM accounts a WHERE a.id = r.account_id LIMIT 1)), ''), r.account_id) AS name
             FROM customer_checkins r WHERE r.batch_id = b.id) x) AS accounts,
    b.skipped
  FROM checkin_batches b LEFT JOIN customer_checkins k ON k.batch_id = b.id`;

function toBatch(b: BatchDb): CheckinBatch {
  return {
    id: Number(b.id),
    createdAt: iso(b.created_at),
    createdBy: clean(b.created_by),
    kind: b.kind,
    listName: clean(b.list_name),
    total: b.total,
    sent: b.sent,
    queued: b.queued,
    failed: b.failed,
    skipped: b.skipped_n + b.skipped_rows,
    answered: b.answered,
    attention: b.attention,
    viewed: b.viewed,
    accounts: batchAccounts(b),
  };
}

/** The send's accounts: the ones it went to (A to Z), then the ones it skipped. */
function batchAccounts(b: BatchDb): { id: string; name: string }[] {
  const list = (b.accounts ?? []).map((a) => ({ id: clean(a.id), name: clean(a.name) || clean(a.id) }));
  const seen = new Set(list.map((a) => a.id));
  for (const skip of b.skipped ?? []) {
    const id = clean(skip.accountId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    list.push({ id, name: clean(skip.accountName) || id });
  }
  return list;
}

/** History: one line per press of Send, newest first. */
export async function listBatches(limit = 200): Promise<CheckinBatch[]> {
  if (!(await checkinReady())) return [];
  const rows = (await getSql().query(`${await batchSelect()} GROUP BY b.id ORDER BY b.created_at DESC LIMIT $1`, [limit])) as BatchDb[];
  return rows.map(toBatch);
}

/** One send: every account in it, and the ones it skipped (and why). */
export async function batchDetail(id: number): Promise<{ batch: CheckinBatch; rows: CheckinRow[]; skipped: CheckinSkip[] } | null> {
  if (!(await checkinReady())) return null;
  const sql = getSql();
  const batches = (await sql.query(`${await batchSelect()} WHERE b.id = $1 GROUP BY b.id`, [id])) as BatchDb[];
  if (!batches[0]) return null;
  const [rows, skippedRows] = await Promise.all([
    sql.query(`SELECT ${await rowSelect()} ${ROW_FROM} WHERE k.batch_id = $1 ORDER BY a.account_name, k.id`, [id]) as unknown as Promise<DbRow[]>,
    sql`SELECT skipped FROM checkin_batches WHERE id = ${id}` as unknown as Promise<{ skipped: CheckinSkip[] }[]>,
  ]);
  return { batch: toBatch(batches[0]), rows: rows.map(toRow), skipped: skippedRows[0]?.skipped ?? [] };
}

/* ---------- saved lists ---------- */

export async function listCheckinLists(): Promise<CheckinList[]> {
  if (!(await checkinReady())) return [];
  const rows = (await getSql()`
    SELECT l.id::text, l.name, l.created_by, l.updated_at, COALESCE(array_agg(la.account_id ORDER BY la.account_id) FILTER (WHERE la.account_id IS NOT NULL), '{}') AS account_ids
    FROM checkin_lists l LEFT JOIN checkin_list_accounts la ON la.list_id = l.id
    GROUP BY l.id ORDER BY lower(l.name)
  `) as { id: string; name: string; created_by: string; updated_at: string | Date; account_ids: string[] }[];
  return rows.map((r) => ({ id: Number(r.id), name: r.name, accountIds: r.account_ids, createdBy: clean(r.created_by), updatedAt: iso(r.updated_at) }));
}

/** New list (no id) or a list's new name and accounts (id). Throws a plain-words error when the name is taken or empty. */
export async function saveCheckinList(input: { id?: number | null; name: string; accountIds: string[]; by: string }): Promise<number> {
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new Error("Give the list a name.");
  const ids = [...new Set(input.accountIds.map(clean).filter(Boolean))];
  const sql = getSql();
  const taken = (await sql`SELECT id::text FROM checkin_lists WHERE lower(btrim(name)) = lower(${name}) AND id <> ${input.id ?? 0}`) as unknown[];
  if (taken.length) throw new Error(`There is already a list called "${name}".`);
  let id = input.id ?? null;
  if (id) {
    const updated = (await sql`UPDATE checkin_lists SET name = ${name}, updated_at = now() WHERE id = ${id} RETURNING id`) as unknown[];
    if (!updated.length) throw new Error("That list is gone.");
    await sql`DELETE FROM checkin_list_accounts WHERE list_id = ${id}`;
  } else {
    const created = (await sql`INSERT INTO checkin_lists (name, created_by) VALUES (${name}, ${input.by}) RETURNING id`) as { id: string }[];
    id = Number(created[0].id);
  }
  if (ids.length) await sql.query(`INSERT INTO checkin_list_accounts (list_id, account_id) SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`, [id, ids]);
  return id;
}

export async function deleteCheckinList(id: number): Promise<void> {
  await getSql()`DELETE FROM checkin_lists WHERE id = ${id}`;
}
