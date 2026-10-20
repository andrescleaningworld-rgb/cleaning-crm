// The New Account flow in Postgres (db/migrations/046_new_account_flow.sql).
// The rules and words are in lib/accountFlow.ts.
//
// Only accounts made with the "New Accepted Account" form have a flow. Two
// steps finish by themselves, from records that already exist:
//   1 packet  the account's History has "Welcome packet sent to: ..."
//             (written by the Welcome Packet send, app/api/accounts/[id]/welcome-packet)
//   5 survey  the account's Onboarding Checklist is complete
// The others are tapped by a person, or answered by the sub in their portal.
// Every move is written to account_flow_events: who, which step, when.
//
// The pin is the board's usual new-account paper (handoff_items, kind
// 'account') with data.flow = '1'. The old checklist-driven steps leave it
// alone (lib/pg/handoffs.ts syncAccountStep, lib/pg/board.ts runSync).

import { getSql } from "@/lib/db";
import { logActivity } from "@/lib/activityLog";
import { addAccount, accountsOnPostgres, updateAccountFieldsDirect } from "@/lib/data/accounts";
import { sameName } from "@/lib/handoffs";
import { finishPaper, listBoardManagers, pinPaper } from "@/lib/pg/board";
import { appendSubSchedule } from "@/lib/data/scheduling";
import { weekdaysIn } from "@/lib/availability";
import { parseClock, toClock, windowForStartTime } from "@/lib/schedule-time";
import { sanitizeSmsText, sendSms, smsLastLine } from "@/lib/sms";
import {
  FLOW_STATUS,
  dayAfter,
  flowView,
  isFlowStep,
  nextFlowStep,
  type FlowDetail,
  type FlowEvent,
  type FlowFacts,
  type FlowStep,
  type SubOffer,
} from "@/lib/accountFlow";

const clean = (value: unknown) => String(value ?? "").trim();
const iso = (value: string | Date | null | undefined) => (value ? new Date(value).toISOString() : "");
const day = (value: string | Date | null | undefined) => (value ? (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)) : "");

let ready: boolean | null = null;

/** The flow tables are in this database (migration 046) and accounts live in Postgres. */
export async function flowsReady(): Promise<boolean> {
  if (!accountsOnPostgres()) return false;
  if (ready === true) return true;
  try {
    const rows = (await getSql()`SELECT to_regclass('public.account_flows') IS NOT NULL AS ok`) as { ok: boolean }[];
    ready = rows[0]?.ok === true;
  } catch {
    ready = false;
  }
  return ready === true;
}

type FlowRow = {
  account_id: string;
  account_name: string;
  manager: string;
  step: string;
  step_since: string | Date;
  estimate_url: string;
  estimate_name: string;
  offer_sub_id: string;
  offer_sub_name: string;
  offer_sub_email: string;
  offer_days: string;
  offer_start: string;
  offer_minutes: number | null;
  offer_sent_at: string | Date | null;
  follow_up_due: string | Date | null;
  stuck_note: string;
  stuck_note_by: string;
  stuck_note_at: string | Date | null;
  created_at: string | Date;
  done_at: string | Date | null;
};

export function factsOf(row: Pick<FlowRow, "step" | "step_since" | "manager" | "offer_sub_name" | "follow_up_due" | "stuck_note" | "stuck_note_by" | "stuck_note_at">): FlowFacts {
  return {
    step: isFlowStep(row.step) ? row.step : "packet",
    stepSince: iso(row.step_since),
    manager: clean(row.manager),
    offerSubName: clean(row.offer_sub_name),
    followUpDue: day(row.follow_up_due),
    stuckNote: clean(row.stuck_note),
    stuckNoteBy: clean(row.stuck_note_by),
    stuckNoteAt: iso(row.stuck_note_at),
  };
}

async function flowRow(accountId: string): Promise<FlowRow | null> {
  const rows = (await getSql()`SELECT * FROM account_flows WHERE account_id = ${accountId}`) as FlowRow[];
  return rows[0] ?? null;
}

async function addEvent(accountId: string, step: FlowStep, action: FlowEvent["action"], by: string, note = ""): Promise<void> {
  await getSql()`
    INSERT INTO account_flow_events (account_id, step, action, by_name, note)
    VALUES (${accountId}, ${step}, ${action}, ${by.slice(0, 120)}, ${note.trim().slice(0, 1000)})
  `;
}

/* ---------- 1. the office form: a new accepted account ---------- */

export type NewAcceptedAccount = {
  accountName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  latitude: string;
  longitude: string;
  monthlyRevenue: string;
  contactName: string;
  /** The main contact's phone ("" when none). */
  phone?: string;
  /** The customer's email: the Welcome Packet's To (step 1) reads it from the account. */
  email: string;
  manager: string;
  estimateUrl: string;
  estimateName: string;
};

/**
 * Makes the account (Status "New - setting up"), starts its flow on step 1,
 * and pins it in the manager's square. Returns the square the pin went into,
 * so the caller can send the usual board text after the response.
 */
export async function createAcceptedAccount(input: NewAcceptedAccount, by: string): Promise<{ accountId: string; square: string }> {
  const { accountId } = await addAccount({
    accountName: input.accountName,
    address: input.address,
    city: input.city,
    state: input.state,
    zip: input.zip,
    latitude: input.latitude,
    longitude: input.longitude,
    monthlyRevenue: input.monthlyRevenue,
    contactName: input.contactName,
    phone: input.phone ?? "",
    email: input.email,
    manager: input.manager,
    status: FLOW_STATUS,
  });

  const sql = getSql();
  await sql`
    INSERT INTO account_flows (account_id, account_name, manager, step, estimate_url, estimate_name, created_by)
    VALUES (${accountId}, ${input.accountName}, ${input.manager}, 'packet', ${input.estimateUrl}, ${input.estimateName}, ${by})
    ON CONFLICT (account_id) DO NOTHING
  `;
  await addEvent(accountId, "packet", "start", by);

  // The pin: in the manager's square when they have one on the board, else the shared "New accepted" square.
  const square = (await listBoardManagers()).find((manager) => sameName(manager.name, input.manager))?.id ?? "";
  const data = { flow: "1", acceptedOn: new Date().toISOString().slice(0, 10), estimateUrl: input.estimateUrl, estimateName: input.estimateName };
  await sql`
    INSERT INTO handoff_items (kind, item_id, title, account_id, account_name, manager, step, data, created_by, board_pinned_at, board_square)
    VALUES ('account', ${accountId}, ${input.accountName}, ${accountId}, ${input.accountName}, ${input.manager}, 'flow', ${JSON.stringify(data)}::jsonb, ${by}, now(), ${square})
    ON CONFLICT (kind, item_id) DO NOTHING
  `;

  await logActivity({
    actorAccountId: null,
    actorRole: "manager",
    actorName: by,
    action: "create",
    entityType: "account",
    entityId: accountId,
    detail: `New accepted account: ${input.accountName}. Status ${FLOW_STATUS}.`,
  });
  return { accountId, square };
}

/* ---------- reading ---------- */

/**
 * The two steps that finish by themselves. Safe to call on every read: it
 * only moves a flow that is still on step 1 or 5 and whose record says done.
 */
export async function syncAutoSteps(accountId?: string): Promise<void> {
  const sql = getSql();
  const only = accountId ?? null;
  // 1: the Welcome Packet was sent after the flow started (History, newest first).
  const sent = (await sql`
    SELECT f.account_id, l.actor_name
    FROM account_flows f
    JOIN LATERAL (
      SELECT actor_name FROM activity_log
      WHERE entity_type = 'account' AND entity_id = f.account_id AND detail LIKE 'Welcome packet sent to:%' AND created_at >= f.created_at
      ORDER BY created_at DESC LIMIT 1
    ) l ON true
    WHERE f.step = 'packet' AND (${only}::text IS NULL OR f.account_id = ${only})
  `) as { account_id: string; actor_name: string }[];
  for (const row of sent) await advance(row.account_id, "packet", clean(row.actor_name) || "Welcome Packet");

  // 5: the Onboarding Checklist is complete.
  const surveyed = (await sql`
    SELECT f.account_id FROM account_flows f
    JOIN onboarding_checklists c ON c.account_id = f.account_id
    WHERE f.step = 'survey' AND c.completed_at IS NOT NULL AND (${only}::text IS NULL OR f.account_id = ${only})
  `) as { account_id: string }[];
  for (const row of surveyed) await advance(row.account_id, "survey", "Onboarding Checklist");
}

export async function getFlowDetail(accountId: string): Promise<FlowDetail | null> {
  await syncAutoSteps(accountId);
  const row = await flowRow(accountId);
  if (!row) return null;
  const sql = getSql();
  const [accounts, events] = await Promise.all([
    // cleaning_time (migration 050) through to_jsonb, so this reads the same before 050 has run.
    sql`SELECT address, city, zip, latitude, longitude, cleaning_days, start_date, start_date_raw, COALESCE(to_jsonb(accounts) ->> 'cleaning_time', '') AS cleaning_time FROM accounts WHERE id = ${accountId} LIMIT 1`,
    sql`SELECT step, action, by_name, note, at FROM account_flow_events WHERE account_id = ${accountId} ORDER BY at ASC, id ASC`,
  ]);
  const account = (accounts as Record<string, unknown>[])[0] ?? {};
  const street = clean(account.address);
  const extra = [clean(account.city), clean(account.zip)].filter((part) => part && !street.toLowerCase().includes(part.toLowerCase()));
  const lat = Number(account.latitude);
  const lng = Number(account.longitude);
  return {
    accountId: row.account_id,
    accountName: clean(row.account_name),
    manager: clean(row.manager),
    view: flowView(factsOf(row)),
    estimateUrl: clean(row.estimate_url),
    estimateName: clean(row.estimate_name),
    offer: row.offer_sub_id || row.offer_sub_name
      ? { subId: row.offer_sub_id, subName: row.offer_sub_name, days: row.offer_days, start: row.offer_start, minutes: row.offer_minutes, sentAt: iso(row.offer_sent_at) }
      : null,
    address: [street, ...extra].filter(Boolean).join(", "),
    latitude: account.latitude === null || !Number.isFinite(lat) ? null : lat,
    longitude: account.longitude === null || !Number.isFinite(lng) ? null : lng,
    cleaningDays: clean(account.cleaning_days),
    cleaningTime: clean(account.cleaning_time),
    startDate: day(account.start_date as string | Date | null) || clean(account.start_date_raw),
    events: (events as { step: string; action: FlowEvent["action"]; by_name: string; note: string; at: string | Date }[]).map((event) => ({
      step: isFlowStep(event.step) ? event.step : "packet",
      action: event.action,
      by: clean(event.by_name),
      note: clean(event.note),
      at: iso(event.at),
    })),
  };
}

/* ---------- moving ---------- */

/**
 * Finishes the step the flow is on. `from` must be the step it is on now, so
 * two taps (or a tap and an automatic finish) never skip a step.
 * Returns false when the flow was not on that step.
 */
async function advance(accountId: string, from: FlowStep, by: string, note = ""): Promise<boolean> {
  const to = nextFlowStep(from);
  const sql = getSql();
  const moved = (await sql`
    UPDATE account_flows SET step = ${to}, step_since = now(), stuck_note = '', stuck_note_by = '', stuck_note_at = NULL,
      done_at = CASE WHEN ${to} = 'live' THEN now() ELSE NULL END
    WHERE account_id = ${accountId} AND step = ${from}
    RETURNING account_id
  `) as unknown[];
  if (moved.length === 0) return false;
  await addEvent(accountId, from, "done", by, note);
  if (to === "live") await goLive(accountId, by);
  return true;
}

/** The end: status Active, the pin goes to the Done tray. */
async function goLive(accountId: string, by: string): Promise<void> {
  await updateAccountFieldsDirect(accountId, { status: "Active" });
  const sql = getSql();
  await sql`UPDATE handoff_items SET done_at = now() WHERE kind = 'account' AND item_id = ${accountId} AND done_at IS NULL`;
  await finishPaper("account", accountId, `${by} (account is live)`, true);
}

export class FlowError extends Error {}

async function mustBeOn(accountId: string, step: FlowStep): Promise<FlowRow> {
  const row = await flowRow(accountId);
  if (!row) throw new FlowError("This account has no new-account steps.");
  if (row.step !== step) throw new FlowError("This step was already done. The page shows where it is now.");
  return row;
}

/** Steps 4 and 6: the manager taps Done. */
export async function tapDone(accountId: string, step: "call" | "walkthrough", by: string): Promise<void> {
  await mustBeOn(accountId, step);
  await advance(accountId, step, by);
}

/** Step 2: the offer goes to one sub; the flow waits on step 3 for their answer. */
export async function sendOffer(accountId: string, offer: { subId: string; days: string; start: string; minutes: number }, by: string): Promise<{ subName: string }> {
  await mustBeOn(accountId, "sub");
  const sql = getSql();
  const subs = (await sql`SELECT id, contact_name, company_name, email, phone FROM subcontractors WHERE id = ${offer.subId} LIMIT 1`) as { id: string; contact_name: string; company_name: string; email: string; phone: string }[];
  const sub = subs[0];
  if (!sub) throw new FlowError("That subcontractor was not found.");
  // The Accounts "Subcontractor" cell holds the person's name (app/accounts/new: getSubcontractorSubmitName).
  const subName = clean(sub.contact_name) || clean(sub.company_name);
  const moved = (await sql`
    UPDATE account_flows SET step = 'subOk', step_since = now(), stuck_note = '', stuck_note_by = '', stuck_note_at = NULL,
      offer_sub_id = ${sub.id}, offer_sub_name = ${subName}, offer_sub_email = ${clean(sub.email).toLowerCase()},
      offer_days = ${offer.days.slice(0, 200)}, offer_start = ${offer.start.slice(0, 10)}, offer_minutes = ${Math.round(offer.minutes) || null}, offer_sent_at = now()
    WHERE account_id = ${accountId} AND step = 'sub'
    RETURNING account_id
  `) as unknown[];
  if (moved.length === 0) throw new FlowError("This step was already done. The page shows where it is now.");
  await addEvent(accountId, "sub", "done", by, subName);
  await addEvent(accountId, "subOk", "offer", by, subName);
  await textSubAboutOffer(clean(sub.phone), subName);
  return { subName };
}

// No link: Textbelt refuses texts that carry one.
export const SUB_OFFER_TEXT = "Cleaning World has a new account for you. Open your sub portal to say yes or no.";

/** "Preview before sending" for step 2: who the offer goes to and the exact text. Nothing is sent or saved. */
export async function previewOffer(accountId: string, subId: string): Promise<{ subName: string; phone: string; email: string; text: string }> {
  await mustBeOn(accountId, "sub");
  const subs = (await getSql()`SELECT contact_name, company_name, email, phone FROM subcontractors WHERE id = ${subId} LIMIT 1`) as { contact_name: string; company_name: string; email: string; phone: string }[];
  const sub = subs[0];
  if (!sub) throw new FlowError("That subcontractor was not found.");
  return {
    subName: clean(sub.contact_name) || clean(sub.company_name),
    phone: clean(sub.phone),
    email: clean(sub.email),
    text: sanitizeSmsText(SUB_OFFER_TEXT, Infinity),
  };
}

/** The sub hears that an offer is waiting in their portal. Never throws. */
async function textSubAboutOffer(phone: string, subName: string): Promise<void> {
  if (!phone) {
    console.debug(`[sms] skip account-flow/offer: sub "${subName}" has no phone on file`);
    return;
  }
  try {
    await sendSms(phone, sanitizeSmsText(SUB_OFFER_TEXT, Infinity), "account-flow/offer");
  } catch (error) {
    console.error("[sms] account-flow/offer failed:", error instanceof Error ? error.message : error);
  }
}

/** Step 3, from the office: take the offer back and pick someone else. */
export async function takeOfferBack(accountId: string, by: string): Promise<void> {
  await mustBeOn(accountId, "subOk");
  await backToPick(accountId);
  await addEvent(accountId, "subOk", "back", by);
}

async function backToPick(accountId: string): Promise<void> {
  await getSql()`
    UPDATE account_flows SET step = 'sub', step_since = now(), stuck_note = '', stuck_note_by = '', stuck_note_at = NULL,
      offer_sub_id = '', offer_sub_name = '', offer_sub_email = '', offer_days = '', offer_start = '', offer_minutes = NULL, offer_sent_at = NULL
    WHERE account_id = ${accountId} AND step = 'subOk'
  `;
}

/** Step 7: saves the account's Start Date, checks it really saved, then moves on. Step 8 is due the next day. */
export async function confirmStartDate(accountId: string, startDate: string, by: string): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new FlowError("Pick the start date.");
  await mustBeOn(accountId, "startDate");
  // "startDate" is the field's own name; accountStartDate is only an alias for it (lib/pg/accounts.ts).
  await updateAccountFieldsDirect(accountId, { startDate });
  const rows = (await getSql()`SELECT start_date FROM accounts WHERE id = ${accountId} LIMIT 1`) as { start_date: string | Date | null }[];
  if (day(rows[0]?.start_date ?? null) !== startDate) throw new Error("The start date did not save on the account. Try again.");
  await getSql()`UPDATE account_flows SET follow_up_due = ${dayAfter(startDate)}::date WHERE account_id = ${accountId}`;
  await advance(accountId, "startDate", by, startDate);
}

/** Step 8: the manager followed up after the first cleaning. The note is required. The account goes live. */
export async function followUpDone(accountId: string, note: string, by: string): Promise<void> {
  if (!note.trim()) throw new FlowError("Write a few words about how the first cleaning went.");
  await mustBeOn(accountId, "followUp");
  await advance(accountId, "followUp", by, note);
}

/** "Why is it stuck?": one note on the current step, shown on the pin. Empty clears it. */
export async function setStuckNote(accountId: string, note: string, by: string): Promise<void> {
  const row = await flowRow(accountId);
  if (!row) throw new FlowError("This account has no new-account steps.");
  if (row.step === "live") throw new FlowError("This account is already live.");
  const text = note.trim().slice(0, 500);
  await getSql()`
    UPDATE account_flows SET stuck_note = ${text}, stuck_note_by = ${text ? by : ""}, stuck_note_at = ${text ? new Date().toISOString() : null}
    WHERE account_id = ${accountId}
  `;
  if (text) await addEvent(accountId, row.step as FlowStep, "note", by, text);
}

/* ---------- the sub's side (their portal) ---------- */

/** The offers waiting for this sub's answer. Matched by sub ID, or by email when the login only has that. */
export async function offersForSub(subId: string, email: string): Promise<SubOffer[]> {
  if (!(await flowsReady())) return [];
  const rows = (await getSql()`
    SELECT f.account_id, f.account_name, f.offer_days, f.offer_start, f.offer_minutes, f.offer_sent_at, a.address, a.city, a.zip
    FROM account_flows f
    LEFT JOIN accounts a ON a.id = f.account_id
    WHERE f.step = 'subOk'
      AND ((${subId} <> '' AND f.offer_sub_id = ${subId}) OR (${email} <> '' AND f.offer_sub_email = lower(${email})))
    ORDER BY f.offer_sent_at ASC
  `) as { account_id: string; account_name: string; offer_days: string; offer_start: string; offer_minutes: number | null; offer_sent_at: string | Date | null; address: string | null; city: string | null; zip: string | null }[];
  return rows.map((row) => {
    const street = clean(row.address);
    const extra = [clean(row.city), clean(row.zip)].filter((part) => part && !street.toLowerCase().includes(part.toLowerCase()));
    return {
      accountId: row.account_id,
      accountName: clean(row.account_name),
      address: [street, ...extra].filter(Boolean).join(", "),
      days: clean(row.offer_days),
      start: clean(row.offer_start),
      minutes: row.offer_minutes,
      sentAt: iso(row.offer_sent_at),
    };
  });
}

/**
 * The sub answers. Yes: they become the account's subcontractor and the flow
 * goes to step 4. No: back to step 2, and the manager gets a text.
 */
export async function answerOffer(input: { accountId: string; subId: string; email: string; subName: string; yes: boolean; origin: string }): Promise<void> {
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM account_flows
    WHERE account_id = ${input.accountId} AND step = 'subOk'
      AND ((${input.subId} <> '' AND offer_sub_id = ${input.subId}) OR (${input.email} <> '' AND offer_sub_email = lower(${input.email})))
    LIMIT 1
  `) as FlowRow[];
  const row = rows[0];
  if (!row) throw new FlowError("This offer is not waiting for you any more.");
  const by = clean(row.offer_sub_name) || clean(input.subName) || "The sub";

  if (input.yes) {
    await updateAccountFieldsDirect(input.accountId, { subcontractor: row.offer_sub_name });
    await addEvent(input.accountId, "subOk", "yes", by);
    await advance(input.accountId, "subOk", by);
    await scheduleForYes(row, by);
    return;
  }

  await backToPick(input.accountId);
  await addEvent(input.accountId, "subOk", "no", by);
  await textManagerSubSaidNo(row, by, input.origin);
}

/**
 * After a Yes: the Sub Schedule, so Coverage, the sub's account list and the
 * checklists see the account. One weekly row per cleaning day (the account's
 * Cleaning Days; the days on the offer when the account has none), at the
 * offer's start time, the same shape the office's Sub Schedules page saves.
 * When there are no days, no time or no sub email, a note goes in the Office
 * box instead: "Add schedule for <account>". Never throws: the Yes is saved.
 */
async function scheduleForYes(row: FlowRow, by: string): Promise<void> {
  const accountName = clean(row.account_name) || "the new account";
  try {
    const sql = getSql();
    const accounts = (await sql`SELECT cleaning_days, frequency FROM accounts WHERE id = ${row.account_id} LIMIT 1`) as { cleaning_days: string; frequency: string }[];
    const account = accounts[0];
    // Already scheduled (someone set it up by hand): nothing to add.
    const existing = (await sql`
      SELECT 1 FROM sub_schedules WHERE btrim(account_id) = ${row.account_id} AND lower(btrim(status)) = 'active' AND (effective_end IS NULL OR effective_end >= current_date) LIMIT 1
    `) as unknown[];
    if (existing.length > 0) return;

    const fromAccount = weekdaysIn(clean(account?.cleaning_days));
    const days = fromAccount.length > 0 ? fromAccount : weekdaysIn(clean(row.offer_days));
    const start = parseClock(row.offer_start);
    const subEmail = clean(row.offer_sub_email);
    if (days.length === 0 || start === null || !subEmail) {
      await pinPaper({ text: `Add schedule for ${accountName}`, accountId: row.account_id, accountName, square: "", by: "New account steps" });
      return;
    }

    const frequency = /bi.?week|every other/i.test(clean(account?.frequency)) ? "BIWEEKLY" : "WEEKLY";
    const today = new Date().toISOString().slice(0, 10);
    for (const day of days) {
      await appendSubSchedule({
        accountId: row.account_id,
        subId: subEmail,
        dayOfWeek: day,
        timeWindow: windowForStartTime(start),
        recurring: "Y",
        effectiveStart: today,
        effectiveEnd: "",
        status: "Active",
        submittedBy: by,
        submittedVia: "Admin",
        frequency,
        scheduleType: "appointment",
        startTime: toClock(start),
      });
    }
  } catch (error) {
    console.error("[account-flow] schedule after yes failed:", error instanceof Error ? error.message : error);
    await pinPaper({ text: `Add schedule for ${accountName}`, accountId: row.account_id, accountName, square: "", by: "New account steps" }).catch(() => undefined);
  }
}

/** "Maria can't take Acme. Pick another sub." to the account's manager. Never throws. */
async function textManagerSubSaidNo(row: FlowRow, subName: string, origin: string): Promise<void> {
  try {
    const manager = clean(row.manager);
    if (!manager) return;
    const phones = (await getSql()`SELECT name, phone FROM managers WHERE btrim(phone) <> ''`) as { name: string; phone: string }[];
    const phone = clean(phones.find((entry) => sameName(entry.name, manager))?.phone);
    if (!phone) {
      console.debug(`[sms] skip account-flow/sub-said-no: manager "${manager}" has no phone on file`);
      return;
    }
    const message = [`${subName} can't take ${clean(row.account_name) || "the new account"}. Pick another sub.`, smsLastLine(`${origin}/accounts/${encodeURIComponent(row.account_id)}`, "staff")].join("\n");
    await sendSms(phone, sanitizeSmsText(message, Infinity), "account-flow/sub-said-no");
  } catch (error) {
    console.error("[sms] account-flow/sub-said-no failed:", error instanceof Error ? error.message : error);
  }
}
