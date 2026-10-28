// The New Account flow in Postgres (db/migrations/046_new_account_flow.sql).
// The rules and words are in lib/accountFlow.ts.
//
// Only accounts made with the "New Accepted Account" form have a flow.
// account_flows.step is the current step: the first one not done yet. Three
// steps are marked done by themselves when the record already exists, even
// ahead of the current step (syncAutoSteps, run on every read):
//   1 packet     the account's History has "Welcome packet sent to: ..."
//                (written by the Welcome Packet send, app/api/accounts/[id]/welcome-packet)
//   2 sub        the account has a Subcontractor
//   7 startDate  the account has a Start Date
// Any step can also be marked done by a person (markStepDone), and undone
// (undoStep). Step 3 is answered by the sub in their portal, or marked
// Yes / No by the office. Every move is written to account_flow_events:
// who, which step, when. Which steps are done is read from those events
// (doneStepsOf in lib/accountFlow.ts); a step done ahead is skipped when
// the flow gets to it.
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
import { logEmail } from "@/lib/pg/email-log";
import {
  FLOW_STATUS,
  FLOW_STEPS,
  dayAfter,
  doneStepsOf,
  flowIndex,
  flowView,
  isFlowStep,
  nextFlowStep,
  type FlowDetail,
  type FlowEvent,
  type FlowFacts,
  type FlowStep,
  type FlowView,
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

export function factsOf(
  row: Pick<FlowRow, "step" | "step_since" | "manager" | "offer_sub_name" | "follow_up_due" | "stuck_note" | "stuck_note_by" | "stuck_note_at">,
  doneSteps: FlowStep[] = []
): FlowFacts {
  return {
    doneSteps,
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

/** One new account in the 8-step flow, for Accounts Center → New accounts. */
export type OpenFlow = { accountId: string; accountName: string; manager: string; view: FlowView; mine: boolean };

/**
 * Every new account still in the flow (not Live), oldest first, with its
 * tracker. `mine`: its current step is the manager's and that manager is
 * `me` (same first name, the way the board says "with Andrés").
 * Deleted accounts are left out.
 */
export async function listOpenFlows(me: string): Promise<OpenFlow[]> {
  const rows = (await getSql()`
    SELECT f.* FROM account_flows f
    JOIN accounts a ON a.id = f.account_id
    WHERE f.step <> 'live' AND NOT a.is_test AND (to_jsonb(a) ->> 'deleted_at') IS NULL
    ORDER BY f.created_at ASC, f.account_id ASC
  `) as FlowRow[];
  const events = await stepEventsFor(rows.map((row) => row.account_id));
  const myName = clean(me).split(/\s+/)[0]?.toLowerCase() ?? "";
  return rows.map((row) => {
    const view = flowView(factsOf(row, doneStepsOf(events.get(row.account_id) ?? [])));
    const owner = FLOW_STEPS.find((step) => step.key === view.step)?.owner;
    const managerFirst = clean(row.manager).split(/\s+/)[0]?.toLowerCase() ?? "";
    return {
      accountId: row.account_id,
      accountName: clean(row.account_name),
      manager: clean(row.manager),
      view,
      mine: owner === "manager" && myName !== "" && managerFirst === myName,
    };
  });
}

async function flowRow(accountId: string): Promise<FlowRow | null> {
  const rows = (await getSql()`SELECT * FROM account_flows WHERE account_id = ${accountId}`) as FlowRow[];
  return rows[0] ?? null;
}

type StepEvent = { step: string; action: string; at: string };

/** The events that say which steps are done (done, undo, and a sub's No), oldest first, per account. */
async function stepEventsFor(accountIds: string[]): Promise<Map<string, StepEvent[]>> {
  const byAccount = new Map<string, StepEvent[]>();
  if (accountIds.length === 0) return byAccount;
  const rows = (await getSql()`
    SELECT account_id, step, action, at FROM account_flow_events
    WHERE account_id = ANY(${accountIds}) AND action IN ('done', 'undo', 'no', 'back')
    ORDER BY at ASC, id ASC
  `) as { account_id: string; step: string; action: string; at: string | Date }[];
  for (const row of rows) {
    const list = byAccount.get(row.account_id) ?? [];
    list.push({ step: row.step, action: row.action, at: iso(row.at) });
    byAccount.set(row.account_id, list);
  }
  return byAccount;
}

/** The steps of one account marked done in its step history (not counting the ones before the current step). */
async function doneStepsFor(accountId: string): Promise<FlowStep[]> {
  return doneStepsOf((await stepEventsFor([accountId])).get(accountId) ?? []);
}

/** Done: before the current step, or marked done ahead of it. */
function isDoneOn(pointer: FlowStep, done: FlowStep[], step: FlowStep): boolean {
  return step !== "live" && (pointer === "live" || flowIndex(step) < flowIndex(pointer) || done.includes(step));
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
  /** The sub's pay (lib/frequency.ts), from the form's pay boxes. "" when not filled in. */
  frequency?: string;
  monthlySubcontractorPay?: string;
  subPricePerCleaning?: string;
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
    frequency: input.frequency ?? "",
    monthlySubcontractorPay: input.monthlySubcontractorPay ?? "",
    subPricePerCleaning: input.subPricePerCleaning ?? "",
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
 * The steps backed by a record finish by themselves, also ahead of the
 * current step, for every account still in setup (new and old; never a Live,
 * deleted, cancelled, inactive or test account). Safe to call on
 * every read: it only marks a step that is not done yet and whose record
 * says it is. A step someone undid is not marked again from the same record:
 *   packet          only when the packet is newer than the undo
 *   sub, startDate  not again after an undo (or the sub's No); a person marks it
 */
export async function syncAutoSteps(accountId?: string): Promise<void> {
  const sql = getSql();
  const only = accountId ?? null;
  const flows = (await sql`
    SELECT f.account_id, f.step, f.follow_up_due,
           btrim(COALESCE(a.subcontractor_raw, '')) AS account_sub,
           a.start_date,
           p.created_at AS packet_at, p.actor_name AS packet_by
    FROM account_flows f
    LEFT JOIN accounts a ON a.id = f.account_id
    LEFT JOIN LATERAL (
      SELECT created_at, actor_name FROM activity_log
      WHERE entity_type = 'account' AND entity_id = f.account_id AND detail LIKE 'Welcome packet sent to:%' AND created_at >= f.created_at
      ORDER BY created_at DESC LIMIT 1
    ) p ON true
    -- Only accounts still in setup: not Live, and not archived (deleted, cancelled, inactive) or a test account.
    WHERE f.step <> 'live' AND f.done_at IS NULL
      AND a.id IS NOT NULL AND NOT a.is_test AND (to_jsonb(a) ->> 'deleted_at') IS NULL
      AND a.status_key NOT IN ('cancelled', 'canceled', 'inactive')
      AND (${only}::text IS NULL OR f.account_id = ${only})
  `) as {
    account_id: string;
    step: string;
    follow_up_due: string | Date | null;
    account_sub: string;
    start_date: string | Date | null;
    packet_at: string | Date | null;
    packet_by: string | null;
  }[];
  if (flows.length === 0) return;
  const eventsByAccount = await stepEventsFor(flows.map((row) => row.account_id));

  for (const row of flows) {
    if (!isFlowStep(row.step)) continue;
    const pointer = row.step;
    const events = eventsByAccount.get(row.account_id) ?? [];
    const done = doneStepsOf(events);
    const lastUndo = (step: FlowStep) => events.filter((event) => event.step === step && event.action === "undo").reduce((last, event) => (event.at > last ? event.at : last), "");
    const undoneEver = (step: FlowStep) => lastUndo(step) !== "" || (step === "sub" && events.some((event) => event.step === "subOk" && (event.action === "no" || event.action === "back")));
    const open = (step: FlowStep) => !isDoneOn(pointer, done, step);

    const marks: { step: FlowStep; by: string; note: string }[] = [];
    const packetAt = iso(row.packet_at);
    if (packetAt && open("packet") && lastUndo("packet") < packetAt) marks.push({ step: "packet", by: clean(row.packet_by) || "Welcome Packet", note: "" });
    if (clean(row.account_sub) && open("sub") && !undoneEver("sub")) marks.push({ step: "sub", by: "Automatic", note: `Sub on the account: ${clean(row.account_sub)}` });
    const startDate = day(row.start_date);
    if (startDate && open("startDate") && !undoneEver("startDate")) {
      marks.push({ step: "startDate", by: "Automatic", note: `Start date on the account: ${startDate}` });
      // Step 8 is due the day after the start date, as when the date is saved from step 7.
      if (!row.follow_up_due) await sql`UPDATE account_flows SET follow_up_due = ${dayAfter(startDate)}::date WHERE account_id = ${row.account_id} AND follow_up_due IS NULL`;
    }
    if (marks.length === 0) continue;

    // Ahead of the current step: written to the history now, skipped when the flow gets there.
    for (const mark of marks) if (mark.step !== pointer) await addEvent(row.account_id, mark.step, "done", mark.by, mark.note);
    const onCurrent = marks.find((mark) => mark.step === pointer);
    if (onCurrent) await advance(row.account_id, pointer, onCurrent.by, onCurrent.note);
  }
}

export async function getFlowDetail(accountId: string): Promise<FlowDetail | null> {
  await syncAutoSteps(accountId);
  const row = await flowRow(accountId);
  if (!row) return null;
  const sql = getSql();
  const [accounts, events] = await Promise.all([
    // cleaning_time (migration 050) through to_jsonb, so this reads the same before 050 has run.
    sql`SELECT address, city, zip, latitude, longitude, cleaning_days, start_date, start_date_raw, subcontractor_raw, COALESCE(to_jsonb(accounts) ->> 'cleaning_time', '') AS cleaning_time FROM accounts WHERE id = ${accountId} LIMIT 1`,
    sql`SELECT step, action, by_name, note, at FROM account_flow_events WHERE account_id = ${accountId} ORDER BY at ASC, id ASC`,
  ]);
  const account = (accounts as Record<string, unknown>[])[0] ?? {};
  const eventRows = events as { step: string; action: FlowEvent["action"]; by_name: string; note: string; at: string | Date }[];
  const street = clean(account.address);
  const extra = [clean(account.city), clean(account.zip)].filter((part) => part && !street.toLowerCase().includes(part.toLowerCase()));
  const lat = Number(account.latitude);
  const lng = Number(account.longitude);
  return {
    accountId: row.account_id,
    accountName: clean(row.account_name),
    manager: clean(row.manager),
    view: flowView(factsOf(row, doneStepsOf(eventRows))),
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
    accountSub: clean(account.subcontractor_raw),
    events: eventRows.map((event) => ({
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
  const sql = getSql();
  // Steps already done ahead (marked by a person, or from a record like the sub on the
  // account) are skipped: the flow goes on to the first step that is not done yet.
  const doneBefore = new Set<string>(await doneStepsFor(accountId));
  let to = nextFlowStep(from);
  while (to !== "live" && doneBefore.has(to)) to = nextFlowStep(to);
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

/**
 * "Mark done" for any step. The current step: the flow moves on (step 3 with
 * an offer out counts as the sub's Yes). A later step: marked done ahead,
 * and skipped when the flow gets there.
 */
export async function markStepDone(accountId: string, step: FlowStep, by: string): Promise<void> {
  if (step === "live") throw new FlowError("Live comes by itself after the last step.");
  const row = await flowRow(accountId);
  if (!row) throw new FlowError("This account has no new-account steps.");
  if (row.step === "live") throw new FlowError("This account is already live.");
  const pointer = isFlowStep(row.step) ? row.step : "packet";
  if (isDoneOn(pointer, await doneStepsFor(accountId), step)) throw new FlowError("That step is already done. The page shows where it is now.");

  if (step !== pointer) {
    await addEvent(accountId, step, "done", by);
    return;
  }
  if (step === "subOk" && (clean(row.offer_sub_id) || clean(row.offer_sub_name))) {
    // The office says yes for the sub: the same as the sub tapping Yes in their portal.
    await acceptOffer(row, by, `Marked for ${clean(row.offer_sub_name) || "the sub"}`);
    return;
  }
  if (!(await advance(accountId, step, by))) throw new FlowError("That step is already done. The page shows where it is now.");
}

/**
 * The setup wizard's Yes / Not yet on Customer called, Site survey and
 * Walkthrough: the same mark as the pin's tracker (Mark done / Undo), from
 * any step. Nothing happens when the step is already that way.
 */
export async function setTapStep(accountId: string, step: "call" | "survey" | "walkthrough", done: boolean, by: string): Promise<void> {
  const row = await flowRow(accountId);
  if (!row) throw new FlowError("This account has no new-account steps.");
  if (row.step === "live") return;
  const pointer = isFlowStep(row.step) ? row.step : "packet";
  const isDone = isDoneOn(pointer, await doneStepsFor(accountId), step);
  if (done && !isDone) await markStepDone(accountId, step, by);
  if (!done && isDone) await undoStep(accountId, step, by);
}

/**
 * The setup wizard saved the account's Start Date (from any step): step 7 is
 * done, and step 8 is due the day after, as when the date is saved on step 7.
 */
export async function startDateSaved(accountId: string, startDate: string, by: string): Promise<void> {
  const row = await flowRow(accountId);
  if (!row || row.step === "live" || !/^d{4}-d{2}-d{2}$/.test(startDate)) return;
  await getSql()`UPDATE account_flows SET follow_up_due = ${dayAfter(startDate)}::date WHERE account_id = ${accountId}`;
  const pointer = isFlowStep(row.step) ? row.step : "packet";
  if (!isDoneOn(pointer, await doneStepsFor(accountId), "startDate")) await markStepDone(accountId, "startDate", by);
}

/** Step 3 from the office: the sub said no. Back to step 2 to pick another sub (the procedure). */
export async function markSubSaidNo(accountId: string, by: string): Promise<void> {
  const row = await mustBeOn(accountId, "subOk");
  const accounts = (await getSql()`SELECT subcontractor_raw FROM accounts WHERE id = ${accountId} LIMIT 1`) as { subcontractor_raw: string | null }[];
  const subName = clean(row.offer_sub_name) || clean(accounts[0]?.subcontractor_raw);
  await backToPick(accountId);
  await addEvent(accountId, "subOk", "no", by, subName ? `${subName} said no` : "The sub said no");
}

/**
 * "Undo" on a step marked done by mistake. The history keeps both (done, then
 * undone, with who and when). When the step is before the current one, the
 * flow goes back to it. Undoing "Sub picked" undoes "Sub OK" too (a new sub
 * has to say yes), and takes back an offer still waiting in the sub's portal.
 * Not once the account is live (it is Active and its pin is in the Done tray).
 */
export async function undoStep(accountId: string, step: FlowStep, by: string): Promise<void> {
  if (step === "live") throw new FlowError("Live can't be undone here.");
  const row = await flowRow(accountId);
  if (!row) throw new FlowError("This account has no new-account steps.");
  if (row.step === "live") throw new FlowError("This account is already live, so its steps can't be undone.");
  const pointer = isFlowStep(row.step) ? row.step : "packet";
  const done = await doneStepsFor(accountId);
  if (!isDoneOn(pointer, done, step)) throw new FlowError("That step is not done. The page shows where it is now.");

  const steps: FlowStep[] = step === "sub" && isDoneOn(pointer, done, "subOk") ? ["sub", "subOk"] : [step];
  try {
    for (const each of steps) await addEvent(accountId, each, "undo", by, each === step ? "" : "Goes with Sub picked");
  } catch (error) {
    // 23514: the events table does not take "undo" yet (migration 053 not run on this database).
    if ((error as { code?: string })?.code === "23514") throw new FlowError("Undo needs a database update first (migration 053). Ask the office admin.");
    throw error;
  }

  if (flowIndex(step) >= flowIndex(pointer)) return; // done ahead: only the mark is taken back
  const sql = getSql();
  if (step === "sub" || step === "subOk") {
    // Back to picking (or confirming) the sub: an offer still out is taken back, so the sub's portal no longer shows it.
    await sql`
      UPDATE account_flows SET step = ${step}, step_since = now(), stuck_note = '', stuck_note_by = '', stuck_note_at = NULL, done_at = NULL,
        offer_sub_id = '', offer_sub_name = '', offer_sub_email = '', offer_days = '', offer_start = '', offer_minutes = NULL, offer_sent_at = NULL
      WHERE account_id = ${accountId} AND step = ${pointer}
    `;
  } else {
    await sql`
      UPDATE account_flows SET step = ${step}, step_since = now(), stuck_note = '', stuck_note_by = '', stuck_note_at = NULL, done_at = NULL
      WHERE account_id = ${accountId} AND step = ${pointer}
    `;
  }
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
  const texted = await textSubAboutOffer(clean(sub.phone), subName);
  // The Email log: the text (when there was a phone) and the card in the sub's portal.
  const account = (await getFlowDetail(accountId).catch(() => null)) ?? null;
  await logEmail({
    channel: "text",
    type: "New account offer",
    to: [clean(sub.phone) || "(no phone on file: portal only)"],
    subject: `New account offer: ${account?.accountName ?? accountId}`,
    status: texted.ok ? "sent" : "failed",
    error: texted.error,
    text: [
      clean(sub.phone) ? `Text message: ${SUB_OFFER_TEXT}` : "No text (no phone on file).",
      "",
      "In the sub portal: New account for you",
      account?.accountName ?? "",
      account?.address ? `Address: ${account.address}` : "",
      `Days: ${offer.days}`,
      offer.start ? `Time: ${offer.start}` : "",
      offer.minutes ? `Time needed: ${offer.minutes} minutes` : "",
    ].filter((line, index) => line !== "" || index === 1).join("\n"),
    accountId,
    accountName: account?.accountName ?? "",
    subId: sub.id,
    subName,
    sentBy: by,
  });
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
async function textSubAboutOffer(phone: string, subName: string): Promise<{ ok: boolean; error: string }> {
  if (!phone) {
    console.debug(`[sms] skip account-flow/offer: sub "${subName}" has no phone on file`);
    // The offer still waits in the portal; the log says no text went out.
    return { ok: true, error: "" };
  }
  try {
    const result = await sendSms(phone, sanitizeSmsText(SUB_OFFER_TEXT, Infinity), "account-flow/offer");
    return result.success ? { ok: true, error: "" } : { ok: false, error: "The text did not go out (the text provider said no)." };
  } catch (error) {
    console.error("[sms] account-flow/offer failed:", error instanceof Error ? error.message : error);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
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
    await acceptOffer(row, by);
    return;
  }

  await backToPick(input.accountId);
  await addEvent(input.accountId, "subOk", "no", by);
  await textManagerSubSaidNo(row, by, input.origin);
}

/** The sub's Yes (from their portal, or marked by the office): they become the account's subcontractor, the flow moves on, the schedule is added. */
async function acceptOffer(row: FlowRow, by: string, note = ""): Promise<void> {
  await updateAccountFieldsDirect(row.account_id, { subcontractor: row.offer_sub_name });
  await addEvent(row.account_id, "subOk", "yes", by, note);
  await advance(row.account_id, "subOk", by);
  await scheduleForYes(row, by);
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
