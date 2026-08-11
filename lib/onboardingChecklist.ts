// Shared onboarding-checklist domain definitions — imported by both the
// client-side checklist component (app/components/OnboardingChecklist.tsx)
// and the server-side storage layer (lib/googleSheets.ts) / API route
// (app/api/onboarding-checklist/route.ts), so the section/item shape and
// item keys can never drift between what's rendered and what's stored.
// Deliberately plain TS with no server-only imports (no googleapis, no env
// reads) so client components can import it directly.

export type OnboardingItemDef = {
  key: string;
  label: string;
};

export type OnboardingSectionDef = {
  key: string;
  title: string;
  items: OnboardingItemDef[];
};

// Mirrors the 7 sections of the "New Account Onboarding Checklist" PDF.
// Keys are stable identifiers persisted in the ItemsJson column — renaming a
// label here is safe, changing a key is not (it would orphan any already-
// saved progress for that item).
export const ONBOARDING_CHECKLIST_SECTIONS: OnboardingSectionDef[] = [
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
      { key: "supplies.specialEquipment", label: "Special equipment needs communicated" },
    ],
  },
  {
    key: "contact",
    title: "6. Customer Contact Confirmed",
    items: [
      { key: "contact.primaryContactConfirmed", label: "Primary contact name/phone/email confirmed and saved" },
      { key: "contact.portalAccessSetup", label: "Customer portal access set up/login shared (if applicable)" },
      { key: "contact.billingConfirmed", label: "Billing/invoicing details confirmed" },
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

export const ONBOARDING_ITEM_KEYS: string[] = ONBOARDING_CHECKLIST_SECTIONS.flatMap((section) =>
  section.items.map((item) => item.key)
);

const ITEM_LABEL_BY_KEY: Record<string, string> = Object.fromEntries(
  ONBOARDING_CHECKLIST_SECTIONS.flatMap((section) => section.items.map((item) => [item.key, item.label]))
);

export function getOnboardingItemLabel(itemKey: string): string {
  return ITEM_LABEL_BY_KEY[itemKey] ?? itemKey;
}

export type OnboardingItemState = {
  checked: boolean;
  note: string;
  completedAt: string | null;
};

export type OnboardingChecklistItems = Record<string, OnboardingItemState>;

export function createEmptyChecklistItems(): OnboardingChecklistItems {
  const items: OnboardingChecklistItems = {};
  for (const key of ONBOARDING_ITEM_KEYS) {
    items[key] = { checked: false, note: "", completedAt: null };
  }
  return items;
}

export function isChecklistComplete(items: OnboardingChecklistItems): boolean {
  return ONBOARDING_ITEM_KEYS.every((key) => items[key]?.checked === true);
}

export function countChecklistProgress(items: OnboardingChecklistItems): { done: number; total: number } {
  const total = ONBOARDING_ITEM_KEYS.length;
  const done = ONBOARDING_ITEM_KEYS.filter((key) => items[key]?.checked === true).length;
  return { done, total };
}

// One consolidated, section-grouped summary of every non-empty note —
// written to the account's update history exactly once, at full checklist
// completion, rather than per note-save. Per-save history logging was
// removed after the live smoke test showed the account-updates endpoint
// emails info@/crm@ on every call regardless of the notifyEmail flag; a
// completion-only summary keeps a real audit trail without an email per
// keystroke/checkbox. Returns "" when no item has a note (caller should
// skip appending an empty section list in that case).
export function buildOnboardingNotesSummary(items: OnboardingChecklistItems): string {
  const sectionBlocks: string[] = [];

  for (const section of ONBOARDING_CHECKLIST_SECTIONS) {
    const lines = section.items
      .filter((item) => items[item.key]?.note.trim())
      .map((item) => `  - ${item.label}: ${items[item.key].note.trim()}`);

    if (lines.length > 0) {
      sectionBlocks.push(`${section.title}\n${lines.join("\n")}`);
    }
  }

  return sectionBlocks.join("\n\n");
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
