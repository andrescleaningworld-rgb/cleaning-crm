// The checklist's own saved ticks and notes (onboarding_checklists.items,
// one row per account). Shared by the setup wizard
// (app/components/OnboardingChecklist.tsx), the storage layer
// (lib/pg/accounts.ts, lib/googleSheets.ts) and the API route
// (app/api/onboarding-checklist/route.ts). Plain TS with no server-only
// imports so client components can import it directly.
//
// Since the one setup wizard (lib/setupWizard.ts) most answers live in the
// account's own fields, not here. What is kept here:
//   setup.call / setup.survey / setup.walkthrough
//                              the wizard's Yes taps for an account with no
//                              new-account steps (older accounts)
//   supplies.specialEquipment  the "Special equipment?" note (Supplies screen)
//   contact.welcomePacketSent  ticked by itself when the Welcome Packet is sent
// The 24 items of the old 7-section checklist are still read and kept, so no
// saved tick or note is ever lost; they are no longer shown. Their sections
// still name the steps of old new-account papers on the board (lib/handoffs.ts).

export type OnboardingItemDef = {
  key: string;
  label: string;
};

export type OnboardingSectionDef = {
  key: string;
  title: string;
  items: OnboardingItemDef[];
};

/** "Welcome packet sent to customer": ticked by app/api/accounts/[id]/welcome-packet. */
export const WELCOME_PACKET_ITEM = "contact.welcomePacketSent";

/** The Supplies screen's "Special equipment?" note. */
export const SPECIAL_EQUIPMENT_ITEM = "supplies.specialEquipment";

/** The setup wizard's own ticks (keys match TICK_KEY in lib/setupWizard.ts). */
export const SETUP_TICK_ITEMS: OnboardingItemDef[] = [
  { key: "setup.call", label: "Customer called" },
  { key: "setup.survey", label: "Site survey" },
  { key: "setup.walkthrough", label: "Walkthrough" },
];

// The old 7-section checklist (the "New Account Onboarding Checklist" PDF).
// Not shown any more. Keys are stable identifiers in the saved JSON: never
// rename one (it would orphan saved progress).
export const LEGACY_ONBOARDING_SECTIONS: OnboardingSectionDef[] = [
  {
    key: "sale",
    title: "1. Sale Confirmed",
    items: [
      { key: "sale.estimateSigned", label: "Estimate/proposal signed" },
      { key: "sale.serviceDetailsConfirmed", label: "Service type/frequency/days confirmed" },
      { key: "sale.monthlyRevenueFinalized", label: "Monthly revenue finalized" },
      { key: "sale.scopeDocumented", label: "Scope of work documented" },
    ],
  },
  {
    key: "crm",
    title: "2. Account Created in CRM",
    items: [
      { key: "crm.accountAdded", label: "New account added with full details" },
      { key: "crm.managerAssigned", label: "Manager assigned" },
      { key: "crm.subcontractorAssigned", label: "Subcontractor assigned" },
      { key: "crm.subPaySet", label: "Monthly Subcontractor Pay set (defaults to 70%, adjust if needed)" },
      { key: "crm.startDateSet", label: "Account Start Date set" },
    ],
  },
  {
    key: "access",
    title: "3. Access and Safety Information",
    items: [
      { key: "access.keyArranged", label: "Key needed/handoff arranged" },
      { key: "access.alarmDocumented", label: "Alarm code needed/documented" },
      { key: "access.specialAccessNotes", label: "Special building access notes documented" },
    ],
  },
  {
    key: "subNotified",
    title: "4. Subcontractor Notified",
    items: [
      { key: "subNotified.packetSent", label: "New account packet sent" },
      { key: "subNotified.subConfirmed", label: "Subcontractor confirms receipt/scope" },
      { key: "subNotified.firstVisitConfirmed", label: "First visit date/time confirmed" },
    ],
  },
  {
    key: "supplies",
    title: "5. Supplies and Equipment",
    items: [
      { key: "supplies.provisionConfirmed", label: "Confirm what Cleaning World vs. customer provides" },
      { key: SPECIAL_EQUIPMENT_ITEM, label: "Special equipment needs communicated" },
    ],
  },
  {
    key: "contact",
    title: "6. Customer Contact Confirmed",
    items: [
      { key: "contact.primaryContactConfirmed", label: "Primary contact name/phone/email confirmed and saved" },
      { key: "contact.portalAccessSetup", label: "Customer portal access set up/login shared (if applicable)" },
      { key: "contact.billingConfirmed", label: "Billing/invoicing details confirmed" },
      { key: WELCOME_PACKET_ITEM, label: "Welcome packet sent to customer" },
    ],
  },
  {
    key: "firstVisit",
    title: "7. First Visit and Follow-Up",
    items: [
      { key: "firstVisit.visitCompleted", label: "First cleaning visit completed" },
      { key: "firstVisit.followUpScheduled", label: "Follow-up call/visit scheduled within 1-2 weeks" },
      { key: "firstVisit.issuesResolved", label: "Any issues from first visit logged and resolved" },
      { key: "firstVisit.markedStable", label: "Account marked Stable once onboarding complete" },
    ],
  },
];

/** Every key that may be saved: the wizard's ticks, then the old checklist's (kept, not shown). */
export const ONBOARDING_ITEM_KEYS: string[] = [
  ...SETUP_TICK_ITEMS.map((item) => item.key),
  ...LEGACY_ONBOARDING_SECTIONS.flatMap((section) => section.items.map((item) => item.key)),
];

export type OnboardingItemState = {
  checked: boolean;
  note: string;
  completedAt: string | null;
  /** From the old checklist's field sync: a field it overwrote. Kept as saved. */
  fieldOverwriteNote?: string | null;
};

export type OnboardingChecklistItems = Record<string, OnboardingItemState>;

export function createEmptyChecklistItems(): OnboardingChecklistItems {
  const items: OnboardingChecklistItems = {};
  for (const key of ONBOARDING_ITEM_KEYS) {
    items[key] = { checked: false, note: "", completedAt: null };
  }
  return items;
}

/** The checklist's own part is done: the wizard's three ticks (an account with no new-account steps). */
export function isChecklistComplete(items: OnboardingChecklistItems): boolean {
  return SETUP_TICK_ITEMS.every((item) => items[item.key]?.checked === true);
}

export type OnboardingChecklistState = {
  accountId: string;
  accountName: string;
  items: OnboardingChecklistItems;
  startedAt: string;
  lastUpdatedAt: string;
  completedAt: string;
  autoStableAppliedAt: string;
};
