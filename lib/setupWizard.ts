// The one setup wizard for a new account: the Onboarding Checklist
// (app/components/OnboardingChecklist.tsx), one question per screen. Plain
// TS with no server imports, so the wizard, the pin on the board, the TV and
// the account page all count the same way. The server side is
// lib/pg/setup-wizard.ts.
//
// Where each answer is kept (one place each, nothing copied):
//   call, survey, walkthrough   the new-account steps (account_flow_events), the
//                               same mark the pin's tracker sets; an account with
//                               no steps (older ones): a tick in its checklist
//   photos                      photo_index, kind "Site survey" (the Photos page)
//   frequency ... contact       the account's own fields (Edit Account's)
//   billing contact             the account's Contacts, role "Billing"
//   supplies                    supply_account_modes (the account page's choice)
//   special equipment           a note in the checklist
//   start date                  the account's Start Date (also ticks the step)

import type { FlowStep } from "@/lib/accountFlow";

export type SupplyMode = "included" | "billed" | "customer";

export const SUPPLY_CHOICES: { mode: SupplyMode; label: string }[] = [
  { mode: "included", label: "Supplies included" },
  { mode: "billed", label: "Supplies billed to customer" },
  { mode: "customer", label: "Provided by customer (not included)" },
];

export type SetupScreenKey =
  | "call"
  | "survey"
  | "photos"
  | "frequency"
  | "days"
  | "time"
  | "pay"
  | "scope"
  | "access"
  | "contact"
  | "supplies"
  | "walkthrough"
  | "startDate";

export type SetupScreenDef = {
  key: SetupScreenKey;
  /** The question, big, at the top of the screen. */
  title: string;
  /** The short name on the last screen's "Still missing" list. */
  short: string;
  /** Needed for "Ready to start". */
  required: boolean;
};

export const SETUP_SCREENS: SetupScreenDef[] = [
  { key: "call", title: "Did you call the customer?", short: "Customer called", required: true },
  { key: "survey", title: "Is the site survey done?", short: "Site survey", required: true },
  { key: "photos", title: "Take pictures", short: "Pictures", required: false },
  { key: "frequency", title: "How often?", short: "How often", required: true },
  { key: "days", title: "Which days?", short: "Cleaning days", required: true },
  { key: "time", title: "What time?", short: "Cleaning time", required: false },
  { key: "pay", title: "Sub pay", short: "Sub pay", required: true },
  { key: "scope", title: "What do they clean?", short: "Scope of work", required: true },
  { key: "access", title: "Key, alarm, access", short: "Key / alarm / access", required: true },
  { key: "contact", title: "Who do we call?", short: "Contact phone", required: true },
  { key: "supplies", title: "Supplies", short: "Supplies", required: true },
  { key: "walkthrough", title: "Is the crew walkthrough done?", short: "Walkthrough", required: true },
  { key: "startDate", title: "Start date", short: "Start date", required: true },
];

/** The three screens that are new-account steps on the pin's tracker. */
export const TAP_STEPS = ["call", "survey", "walkthrough"] as const;
export type TapStep = (typeof TAP_STEPS)[number];

/** The checklist tick for an account with no new-account steps (lib/onboardingChecklist.ts). */
export const TICK_KEY: Record<TapStep, string> = {
  call: "setup.call",
  survey: "setup.survey",
  walkthrough: "setup.walkthrough",
};

/** The shot list a Settings change has not replaced (Settings -> Site survey photos). */
export const DEFAULT_SURVEY_SHOTS = [
  "Entrance / front door",
  "Key box / lock",
  "Alarm panel",
  "Supply closet",
  "Bathrooms",
  "Kitchen / break room",
  "Main work area",
];

/** The last tile, always there: as many photos as you want. */
export const ANYTHING_ELSE_SHOT = "Anything else";

/** What the wizard needs to know about one account to count it. */
export type SetupFacts = {
  /** The new-account steps; null for an account that has none (older ones). */
  flow: { step: FlowStep; done: FlowStep[] } | null;
  /** Ticks in the checklist, for an account with no steps. */
  ticks: Record<TapStep, boolean>;
  frequency: string;
  cleaningDays: string;
  cleaningTime: string;
  subPay: string;
  scopeOfWork: string;
  access: string;
  phone: string;
  startDate: string;
  /** "" = nobody picked yet (the account page shows "included" until then). */
  supplyMode: SupplyMode | "";
  surveyPhotos: number;
};

const filled = (value: string) => String(value ?? "").trim() !== "";
const money = (value: string) => Number(String(value ?? "").replace(/[$,\s]/g, "")) || 0;

/** A step is done: before the current step, or marked done ahead of it. Live: all done. */
export function stepDone(flow: SetupFacts["flow"], step: FlowStep): boolean {
  if (!flow) return false;
  return flow.step === "live" || flow.done.includes(step);
}

export function screenDone(key: SetupScreenKey, facts: SetupFacts): boolean {
  switch (key) {
    case "call":
    case "survey":
    case "walkthrough":
      return facts.flow ? stepDone(facts.flow, key) : facts.ticks[key];
    case "photos":
      return facts.surveyPhotos > 0;
    case "frequency":
      return filled(facts.frequency);
    case "days":
      return filled(facts.cleaningDays);
    case "time":
      return filled(facts.cleaningTime);
    case "pay":
      return money(facts.subPay) > 0;
    case "scope":
      return filled(facts.scopeOfWork);
    case "access":
      return filled(facts.access);
    case "contact":
      return filled(facts.phone);
    case "supplies":
      return facts.supplyMode !== "";
    case "startDate":
      return /^\d{4}-\d{2}-\d{2}$/.test(String(facts.startDate ?? "").slice(0, 10));
  }
}

export type SetupProgress = {
  /** "X of Y done" on the pin. Pictures count only once at least one is added. */
  done: number;
  total: number;
  /** Screens not done yet, in wizard order (pictures and time included: they can be done too). */
  open: SetupScreenKey[];
  /** The required screens not done yet. */
  missingRequired: SetupScreenKey[];
};

export function setupProgress(facts: SetupFacts): SetupProgress {
  const counted = SETUP_SCREENS.filter((screen) => screen.key !== "photos" || facts.surveyPhotos > 0);
  const doneKeys = counted.filter((screen) => screenDone(screen.key, facts));
  const open = SETUP_SCREENS.filter((screen) => !screenDone(screen.key, facts)).map((screen) => screen.key);
  return {
    done: doneKeys.length,
    total: counted.length,
    open,
    missingRequired: SETUP_SCREENS.filter((screen) => screen.required && !screenDone(screen.key, facts)).map((screen) => screen.key),
  };
}

/** The pin steps that stay on the pin (their own buttons there) and are needed to start. */
const PIN_STEPS_TO_START: FlowStep[] = ["packet", "sub", "subOk"];

/**
 * "Ready to start" (the gold badge): THE rule, in one place.
 * A new account in the steps, not Live yet, with:
 *   - Packet, Sub picked, Sub OK done on the pin,
 *   - Customer called, Site survey, Walkthrough done,
 *   - every required wizard screen filled in (how often, days, sub pay,
 *     scope, access, contact phone, supplies),
 *   - and a start date.
 * Cleaning time and pictures are not needed.
 */
export function isReadyToStart(facts: SetupFacts): boolean {
  const flow = facts.flow;
  if (!flow || flow.step === "live") return false;
  if (!PIN_STEPS_TO_START.every((step) => flow.done.includes(step))) return false;
  return setupProgress(facts).missingRequired.length === 0;
}

/** What a pin carries: its "X of Y done" and the badge. */
export type SetupSummary = { done: number; total: number; ready: boolean };

export function setupSummary(facts: SetupFacts): SetupSummary {
  const progress = setupProgress(facts);
  return { done: progress.done, total: progress.total, ready: isReadyToStart(facts) };
}

/** One site survey photo: the small copy for the screen, the full photo on a tap. */
export type SurveyPhoto = { id: number; url: string; thumbUrl: string; label: string };

/** Everything the wizard shows for one account (app/api/setup-wizard GET). */
export type SetupWizardData = {
  accountId: string;
  accountName: string;
  facts: SetupFacts;
  /** The values in the boxes (the facts only say what is filled in). */
  values: {
    monthlyRevenue: string;
    subPricePerCleaning: string;
    hasKey: string;
    contactName: string;
    email: string;
    specialEquipment: string;
    billingName: string;
    billingEmail: string;
  };
  /** Cleaning time can be saved (migration 050). */
  cleaningTimeReady: boolean;
  photosReady: boolean;
  photos: SurveyPhoto[];
  /** The shot list from Settings, then "Anything else". */
  shots: string[];
};

/** The short words for "Still missing" (what keeps the account from "Ready to start"). */
export function readyBlockers(facts: SetupFacts): string[] {
  const out: string[] = [];
  if (facts.flow) {
    const words: Record<string, string> = { packet: "Packet", sub: "Sub picked", subOk: "Sub OK" };
    for (const step of PIN_STEPS_TO_START) if (!facts.flow.done.includes(step) && facts.flow.step !== "live") out.push(`${words[step]} (on the pin)`);
  }
  return out;
}
