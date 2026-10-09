// Handoffs: the shared rules for "who is this waiting on, and is it late".
// Used by the server (lib/pg/handoffs.ts, app/api/handoffs) and by the
// screens (Dashboard "My work", the New accounts board, Account Updates,
// Supply Orders). Plain TS with no server imports, so client components can
// use it directly.

import { ONBOARDING_CHECKLIST_SECTIONS, type OnboardingChecklistItems } from "@/lib/onboardingChecklist";

export type HandoffKind = "account" | "update" | "order" | "issue" | "extra";
export type OwnerRole = "office" | "manager" | "sub";

export type HandoffItem = {
  kind: HandoffKind;
  itemId: string;
  title: string;
  accountId: string;
  accountName: string;
  manager: string;
  step: string;
  stepSince: string;
  data: Record<string, string>;
  createdBy: string;
  createdAt: string;
  doneAt: string;
  /** The last move: who made it, when, and their note. */
  lastBy: string;
  lastAt: string;
  lastNote: string;
};

export type OnboardingRule = { owner: "office" | "manager"; days: number };

export type HandoffSettings = {
  officeOwners: string[];
  redAfterDays: number;
  /** Per checklist section; filled in with the defaults below. */
  onboarding: Record<string, OnboardingRule>;
};

export type HandoffMe = { name: string; role: "manager" | "owner" | ""; isOffice: boolean };

/* ---------- steps ---------- */

export type StepDef = {
  key: string;
  /** Short name of the step, as on the progress bar. */
  label: string;
  /** Who has to act while the item sits on this step. Empty on the last step. */
  owner: OwnerRole | "";
  /** What that person does, in plain words. */
  todo: string;
  /** The one main button. */
  button: string;
};

// A supply order. The existing Status of the order still moves with it
// (New -> Approved -> Pending / In Progress -> Completed), so every list,
// filter and email that reads Status keeps working.
export const ORDER_STEPS: StepDef[] = [
  { key: "ordered", label: "Ordered", owner: "manager", todo: "The manager checks the order and approves it.", button: "Approve order" },
  { key: "approved", label: "Approved", owner: "office", todo: "The office buys the supplies.", button: "Mark bought" },
  { key: "bought", label: "Bought", owner: "office", todo: "The office gets the supplies to the account.", button: "Mark delivered" },
  { key: "delivered", label: "Delivered", owner: "", todo: "", button: "" },
];

export const ORDER_STATUS_FOR_STEP: Record<string, string> = {
  ordered: "New",
  approved: "Approved",
  bought: "Pending / In Progress",
  delivered: "Completed",
};

/** The step an order is on, read from its existing Status. "" = not in the flow (denied, cancelled). */
export function orderStepFromStatus(status: string): string {
  const clean = String(status ?? "").trim().toLowerCase();
  if (!clean || clean === "new" || clean.includes("review")) return "ordered";
  if (clean.includes("approved")) return "approved";
  if (clean.includes("progress") || clean.includes("pending")) return "bought";
  if (clean.includes("complete") || clean.includes("deliver")) return "delivered";
  return "";
}

export const UPDATE_STEPS: StepDef[] = [
  { key: "to-process", label: "To process", owner: "office", todo: "The office enters this change (billing, schedule, files).", button: "Mark processed" },
  { key: "processed", label: "Processed", owner: "", todo: "", button: "" },
];

// A problem a subcontractor reported from the portal home.
export const ISSUE_STEPS: StepDef[] = [
  { key: "reported", label: "Reported", owner: "manager", todo: "The manager looks at the problem and takes care of it.", button: "Mark handled" },
  { key: "handled", label: "Handled", owner: "", todo: "", button: "" },
];

// An extra job a subcontractor asked for from the portal home.
export const EXTRA_STEPS: StepDef[] = [
  { key: "received", label: "Received", owner: "office", todo: "The office checks the extra job and approves it.", button: "Approve" },
  { key: "approved", label: "Approved", owner: "office", todo: "The office enters it (billing, schedule) and marks it done.", button: "Mark done" },
  { key: "done", label: "Done", owner: "", todo: "", button: "" },
];

// A new account: one step per section of the Onboarding Checklist.
export const ONBOARDING_DEFAULTS: Record<string, OnboardingRule> = {
  sale: { owner: "manager", days: 1 },
  crm: { owner: "office", days: 2 },
  access: { owner: "manager", days: 4 },
  subNotified: { owner: "manager", days: 5 },
  supplies: { owner: "office", days: 7 },
  contact: { owner: "office", days: 7 },
  firstVisit: { owner: "manager", days: 21 },
};

const SECTION_TODO: Record<string, string> = {
  sale: "confirms the sale: signed estimate, service details, price and scope.",
  crm: "enters the account: manager, subcontractor, sub pay and start date.",
  access: "writes down keys, alarm and how to get in.",
  subNotified: "sends the packet to the sub and confirms the first visit.",
  supplies: "sorts out supplies and equipment.",
  contact: "confirms the customer contact, portal access and billing.",
  firstVisit: "checks the first visit and follows up.",
};

export const ACCOUNT_DONE_STEP = "done";

export function onboardingRules(settings: HandoffSettings | null): Record<string, OnboardingRule> {
  const rules: Record<string, OnboardingRule> = {};
  for (const section of ONBOARDING_CHECKLIST_SECTIONS) {
    const saved = settings?.onboarding?.[section.key];
    const fallback = ONBOARDING_DEFAULTS[section.key] ?? { owner: "office", days: 7 };
    rules[section.key] = {
      owner: saved?.owner === "office" || saved?.owner === "manager" ? saved.owner : fallback.owner,
      days: Number.isFinite(Number(saved?.days)) && Number(saved?.days) >= 0 ? Math.round(Number(saved?.days)) : fallback.days,
    };
  }
  return rules;
}

/** "1. Sale Confirmed" -> "Sale Confirmed" */
export function sectionName(sectionKey: string): string {
  const section = ONBOARDING_CHECKLIST_SECTIONS.find((s) => s.key === sectionKey);
  return (section?.title ?? sectionKey).replace(/^\d+\.\s*/, "");
}

export function accountSteps(settings: HandoffSettings | null): StepDef[] {
  const rules = onboardingRules(settings);
  return [
    ...ONBOARDING_CHECKLIST_SECTIONS.map((section) => ({
      key: section.key,
      label: sectionName(section.key),
      owner: rules[section.key].owner as OwnerRole,
      todo: `${rules[section.key].owner === "office" ? "The office" : "The manager"} ${SECTION_TODO[section.key] ?? "finishes this section."}`,
      button: "Open checklist",
    })),
    { key: ACCOUNT_DONE_STEP, label: "Done", owner: "" as const, todo: "", button: "" },
  ];
}

/** The first checklist section that still has an unchecked item, or "done". */
export function currentOnboardingSection(items: OnboardingChecklistItems): string {
  for (const section of ONBOARDING_CHECKLIST_SECTIONS) {
    if (section.items.some((item) => items[item.key]?.checked !== true)) return section.key;
  }
  return ACCOUNT_DONE_STEP;
}

export function stepsFor(kind: HandoffKind, settings: HandoffSettings | null): StepDef[] {
  if (kind === "order") return ORDER_STEPS;
  if (kind === "update") return UPDATE_STEPS;
  if (kind === "issue") return ISSUE_STEPS;
  if (kind === "extra") return EXTRA_STEPS;
  return accountSteps(settings);
}

export function stepOf(item: Pick<HandoffItem, "kind" | "step">, settings: HandoffSettings | null): { steps: StepDef[]; index: number; step: StepDef | null; next: StepDef | null } {
  const steps = stepsFor(item.kind, settings);
  const index = steps.findIndex((s) => s.key === item.step);
  return { steps, index, step: index >= 0 ? steps[index] : null, next: index >= 0 && index + 1 < steps.length ? steps[index + 1] : null };
}

/* ---------- people ---------- */

// Names are typed in different places (Managers list, the account's Manager
// cell, the login name), so accents, capitals and spaces are ignored.
export function sameName(a: string, b: string): boolean {
  const fold = (value: string) =>
    String(value ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  return fold(a) !== "" && fold(a) === fold(b);
}

/** "Office", or the manager's own name, for "Next: ..." lines. */
export function ownerLabel(owner: OwnerRole | "", item: Pick<HandoffItem, "manager">): string {
  if (owner === "office") return "Office";
  if (owner === "manager") return item.manager || "the account's manager";
  if (owner === "sub") return "the subcontractor";
  return "";
}

/**
 * Is this item waiting on the logged-in person?
 * Office steps: the people picked in Settings -> Team (the owner too, while
 * nobody is picked, so nothing is ever waiting on no one). Manager steps: the
 * account's manager (the owner too, when the account has no manager).
 */
export function isMine(item: HandoffItem, settings: HandoffSettings | null, me: HandoffMe): boolean {
  if (item.doneAt) return false;
  const { step } = stepOf(item, settings);
  if (!step || !step.owner) return false;
  if (step.owner === "office") return me.isOffice;
  if (step.owner === "manager") return item.manager ? sameName(item.manager, me.name) : me.role === "owner";
  return false;
}

/* ---------- time ---------- */

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDay(value: string): Date | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const date = iso ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])) : new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Whole days this item has sat on its step. */
export function daysOnStep(item: Pick<HandoffItem, "stepSince">, now = new Date()): number {
  const since = parseDay(item.stepSince);
  if (!since) return 0;
  return Math.max(0, Math.round((startOfDay(now).getTime() - startOfDay(since).getTime()) / DAY_MS));
}

/** A new account: days left until the current section is due (negative = late). null when there is no acceptance date. */
export function accountDaysLeft(item: HandoffItem, settings: HandoffSettings | null, now = new Date()): number | null {
  const accepted = parseDay(item.data.acceptedOn ?? "");
  const rule = onboardingRules(settings)[item.step];
  if (!accepted || !rule) return null;
  const due = startOfDay(accepted).getTime() + rule.days * DAY_MS;
  return Math.round((due - startOfDay(now).getTime()) / DAY_MS);
}

export function isLate(item: HandoffItem, settings: HandoffSettings | null, now = new Date()): boolean {
  if (item.doneAt) return false;
  if (item.kind === "account") {
    const left = accountDaysLeft(item, settings, now);
    return left !== null && left < 0;
  }
  return daysOnStep(item, now) > (settings?.redAfterDays ?? 2);
}

/** "2 days left", "Due today", "3 days late"; for updates and orders "Waiting 3 days". */
export function waitingText(item: HandoffItem, settings: HandoffSettings | null, now = new Date()): string {
  if (item.kind === "account") {
    const left = accountDaysLeft(item, settings, now);
    if (left === null) return "";
    if (left < 0) return `${-left} day${left === -1 ? "" : "s"} late`;
    if (left === 0) return "Due today";
    return `${left} day${left === 1 ? "" : "s"} left`;
  }
  const days = daysOnStep(item, now);
  if (days === 0) return "Since today";
  return `Waiting ${days} day${days === 1 ? "" : "s"}`;
}

/** Red first, then the one that has waited longest. */
export function sortForWork(items: HandoffItem[], settings: HandoffSettings | null, now = new Date()): HandoffItem[] {
  return [...items].sort((a, b) => {
    const late = Number(isLate(b, settings, now)) - Number(isLate(a, settings, now));
    if (late !== 0) return late;
    return new Date(a.stepSince).getTime() - new Date(b.stepSince).getTime();
  });
}

/** Where one tap on a My work card goes. */
export function handoffHref(item: Pick<HandoffItem, "kind" | "itemId" | "accountId">): string {
  if (item.kind === "account") return `/accounts/${encodeURIComponent(item.accountId || item.itemId)}?onboarding=1`;
  if (item.kind === "update" || item.kind === "extra") return `/account-updates?process=${encodeURIComponent(item.itemId)}`;
  // A reported problem is handled right on its My work card.
  if (item.kind === "issue") return "/";
  return `/supply-orders?order=${encodeURIComponent(item.itemId)}`;
}

export const KIND_LABEL: Record<HandoffKind, string> = { account: "New account", update: "Account update", order: "Supply order", issue: "Problem from a sub", extra: "Extra job from a sub" };

/** What a subcontractor sees for one of their requests: Received, Approved or Done. */
export function subStatus(item: Pick<HandoffItem, "kind" | "step" | "doneAt">): "received" | "approved" | "done" {
  if (item.doneAt) return "done";
  if (item.kind === "extra") return item.step === "approved" ? "approved" : "received";
  if (item.kind === "order") return item.step === "ordered" ? "received" : item.step === "delivered" ? "done" : "approved";
  return "received";
}
