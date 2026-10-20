// The New Account flow (Part B of the New Account procedure): 8 steps from
// "accepted" to "live", and the pizza tracker that shows them. Plain TS with
// no server imports, so the board, the TV, the account page and the server
// share it. The database side is lib/pg/account-flow.ts; the table is
// db/migrations/046_new_account_flow.sql.

export type FlowStep = "packet" | "sub" | "subOk" | "call" | "survey" | "walkthrough" | "startDate" | "followUp" | "live";

export type FlowStepDef = {
  key: FlowStep;
  /** The step as the big button and the "now" line say it. */
  action: string;
  /** The tracker's word once it is done. */
  tracker: string;
  /** Who it is with: the account's manager, or the sub who has the offer. */
  owner: "manager" | "sub" | "";
};

export const FLOW_STEPS: FlowStepDef[] = [
  { key: "packet", action: "Send welcome packet", tracker: "Packet", owner: "manager" },
  { key: "sub", action: "Choose subcontractor", tracker: "Sub picked", owner: "manager" },
  { key: "subOk", action: "Confirm availability", tracker: "Sub OK", owner: "sub" },
  { key: "call", action: "Contact customer", tracker: "Customer called", owner: "manager" },
  { key: "survey", action: "Site survey + onboarding", tracker: "Site survey", owner: "manager" },
  { key: "walkthrough", action: "Crew walkthrough", tracker: "Walkthrough", owner: "manager" },
  { key: "startDate", action: "Confirm start date", tracker: "Start date", owner: "manager" },
  { key: "followUp", action: "Follow up after first cleaning", tracker: "First-clean follow-up", owner: "manager" },
  { key: "live", action: "Live", tracker: "Live", owner: "" },
];

/** The account's Status while the flow runs; it becomes Active at the end. */
export const FLOW_STATUS = "New - setting up";

/** Days with no progress on one step before the pin turns red. Weekends do not count. */
export const FLOW_RED_BUSINESS_DAYS = 2;

export function isFlowStep(value: string): value is FlowStep {
  return FLOW_STEPS.some((step) => step.key === value);
}

export function flowIndex(step: FlowStep): number {
  return FLOW_STEPS.findIndex((def) => def.key === step);
}

export function nextFlowStep(step: FlowStep): FlowStep {
  const index = flowIndex(step);
  return FLOW_STEPS[Math.min(index + 1, FLOW_STEPS.length - 1)].key;
}

/** What one flow row has to say for the tracker. */
export type FlowFacts = {
  step: FlowStep;
  stepSince: string;
  manager: string;
  offerSubName: string;
  /** YYYY-MM-DD; step 8 only. */
  followUpDue: string;
  stuckNote: string;
  stuckNoteBy: string;
  stuckNoteAt: string;
};

/** The tracker as every screen draws it. */
export type FlowView = {
  step: FlowStep;
  /** 0-based; FLOW_STEPS.length - 1 = live. */
  index: number;
  /** "Contact customer - with Greg"; "Live" at the end. */
  now: string;
  /** "with Greg", "with the sub", "" when live. */
  withWho: string;
  /** No progress for 2 business days. */
  red: boolean;
  /** Step 8: due on this day (YYYY-MM-DD), "" otherwise. */
  dueDate: string;
  stuckNote: string;
  stuckNoteBy: string;
  stuckNoteAt: string;
};

/** "Greg" from "Greg Smith". */
export function firstName(name: string): string {
  return String(name ?? "").trim().split(/\s+/)[0] ?? "";
}

/** YYYY-MM-DD of a moment, in office (New York) time. */
export function officeDay(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date).map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Weekdays after `fromDay` up to and including `toDay` (both YYYY-MM-DD). Holidays count as work days. */
export function businessDaysBetween(fromDay: string, toDay: string): number {
  const toUtc = (day: string) => {
    const [y, m, d] = day.split("-").map(Number);
    return Date.UTC(y, (m || 1) - 1, d || 1);
  };
  if (!fromDay || !toDay) return 0;
  let count = 0;
  for (let t = toUtc(fromDay) + 86_400_000; t <= toUtc(toDay); t += 86_400_000) {
    const weekday = new Date(t).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count++;
  }
  return count;
}

/** The day after a YYYY-MM-DD day. */
export function dayAfter(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return "";
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}

export function flowView(facts: FlowFacts, now = new Date()): FlowView {
  const index = flowIndex(facts.step);
  const def = FLOW_STEPS[index] ?? FLOW_STEPS[0];
  const withWho = def.owner === "sub" ? "with the sub" : def.owner === "manager" ? (firstName(facts.manager) ? `with ${firstName(facts.manager)}` : "with the office") : "";
  // Step 8 waits for its due day; before that it is not late.
  const dueDate = facts.step === "followUp" ? facts.followUpDue : "";
  const fromDay = dueDate && dueDate > officeDay(facts.stepSince) ? dueDate : officeDay(facts.stepSince);
  const red = facts.step !== "live" && businessDaysBetween(fromDay, officeDay(now)) >= FLOW_RED_BUSINESS_DAYS;
  return {
    step: def.key,
    index: Math.max(0, index),
    now: def.key === "live" ? "Live" : `${def.action} - ${withWho}`,
    withWho,
    red,
    dueDate,
    stuckNote: facts.stuckNote,
    stuckNoteBy: facts.stuckNoteBy,
    stuckNoteAt: facts.stuckNoteAt,
  };
}

/** One step's line in the "who did what" list. */
export type FlowEvent = { step: FlowStep; action: "start" | "done" | "offer" | "yes" | "no" | "back" | "note"; by: string; note: string; at: string };

/** Everything the account page needs. */
export type FlowDetail = {
  accountId: string;
  accountName: string;
  manager: string;
  view: FlowView;
  estimateUrl: string;
  estimateName: string;
  offer: { subId: string; subName: string; days: string; start: string; minutes: number | null; sentAt: string } | null;
  /** The account, for step 2's suggestions and step 7's date. */
  address: string;
  latitude: number | null;
  longitude: number | null;
  cleaningDays: string;
  /** The account cleaning time (lib/cleaningTime.ts): the offer start time is filled in from it. */
  cleaningTime: string;
  startDate: string;
  events: FlowEvent[];
};

/** The sub's view of an offer in their portal. No money and no customer contact. */
export type SubOffer = { accountId: string; accountName: string; address: string; days: string; start: string; minutes: number | null; sentAt: string };
