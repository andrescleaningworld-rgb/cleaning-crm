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
  // Set only when this item feeds a real Accounts-sheet field (see
  // ONBOARDING_FIELD_WRITES / ONBOARDING_COMBINED_FIELD below) and that
  // field already held a different, non-empty value at write time —
  // surfaces the overwrite in the eventual completion summary instead of
  // silently discarding whatever was there before. Null/absent otherwise.
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

export function isChecklistComplete(items: OnboardingChecklistItems): boolean {
  return ONBOARDING_ITEM_KEYS.every((key) => items[key]?.checked === true);
}

export function countChecklistProgress(items: OnboardingChecklistItems): { done: number; total: number } {
  const total = ONBOARDING_ITEM_KEYS.length;
  const done = ONBOARDING_ITEM_KEYS.filter((key) => items[key]?.checked === true).length;
  return { done, total };
}

// One consolidated, section-grouped summary of every non-empty note (plus
// any field-overwrite notices — see OnboardingItemState.fieldOverwriteNote)
// — written to the account's update history exactly once, at full checklist
// completion, rather than per note-save. Per-save history logging was
// removed after the live smoke test showed the account-updates endpoint
// emails info@/crm@ on every call regardless of the notifyEmail flag; a
// completion-only summary keeps a real audit trail without an email per
// keystroke/checkbox. Returns "" when there's nothing to report (caller
// should skip appending an empty section list in that case).
export function buildOnboardingNotesSummary(items: OnboardingChecklistItems): string {
  const sectionBlocks: string[] = [];
  const overwriteLines: string[] = [];

  for (const section of ONBOARDING_CHECKLIST_SECTIONS) {
    const lines = section.items
      .filter((item) => items[item.key]?.note.trim())
      .map((item) => `  - ${item.label}: ${items[item.key].note.trim()}`);

    if (lines.length > 0) {
      sectionBlocks.push(`${section.title}\n${lines.join("\n")}`);
    }

    for (const item of section.items) {
      const overwrite = items[item.key]?.fieldOverwriteNote;
      if (overwrite) overwriteLines.push(`  - ${item.label}: ${overwrite}`);
    }
  }

  const blocks = [...sectionBlocks];
  if (overwriteLines.length > 0) {
    blocks.push(`Field updates\n${overwriteLines.join("\n")}`);
  }

  return blocks.join("\n\n");
}

// ─── Checklist item -> real Accounts-sheet field mapping ────────────────────
//
// Confirmed by reading the live "Accounts" tab header row directly
// (GOOGLE_MAIN_SHEET_ID) rather than guessing from app-side field names —
// column G is literally titled "Key / Alarm / Access Info", a single
// free-text column covering keys, alarm codes, AND access notes together
// (there is no separate "alarm code" column feeding that same UI label; the
// app's own "Has Key" (Yes/No/N/A) and "Alarm Code" fields are separate
// columns entirely — see ONBOARDING_COMBINED_FIELD's comment for why those
// two are deliberately NOT auto-written here).
//
// Of the 24 checklist items, only these 4 have a clean, direct 1:1 match to
// a single free-text field where the note IS the field's content (not a
// description of a separate action). Every other item either has no
// matching field at all (e.g. "New account packet sent") or maps to a field
// expecting a specific format — a bare name, a dollar figure, a date — that
// a free-text confirmation note can't reliably supply (e.g. "Manager
// assigned" -> Manager is a name field, but the note is more likely "Greg
// confirmed by phone" than just "Greg"). Those stay checklist/summary-only
// rather than risking a bad write, per this feature's guardrails.

export type OnboardingFieldWriteConfig = {
  // Written redundantly under every alias the app's own Account types read,
  // matching this codebase's established redundant-key-name convention
  // (see app/accounts-center/keys.tsx's getKeyCode/getHasCopy comments).
  fieldNames: string[];
  fieldLabel: string;
};

export const ONBOARDING_FIELD_WRITES: Record<string, OnboardingFieldWriteConfig> = {
  "sale.scopeDocumented": { fieldNames: ["scopeOfWork", "scope"], fieldLabel: "Scope of Work" },
};

// Three checklist items compose into this ONE shared field rather than each
// having its own, matching the sheet's actual schema.
export const ONBOARDING_COMBINED_FIELD: {
  fieldNames: string[];
  fieldLabel: string;
  items: { key: string; composeLabel: string }[];
} = {
  fieldNames: ["keyAlarmAccessInfo", "alarmInfo"],
  fieldLabel: "Key / Alarm / Access Info",
  items: [
    { key: "access.keyArranged", composeLabel: "Key" },
    { key: "access.alarmDocumented", composeLabel: "Alarm" },
    { key: "access.specialAccessNotes", composeLabel: "Access" },
  ],
};

// Recomputed from ALL THREE items' current notes every time any one of them
// saves, in fixed (Key, Alarm, Access) order — not save order — so the
// composed value is deterministic regardless of which item was edited last.
// Empty items are omitted rather than written as blank lines.
export function composeOnboardingFieldValue(items: OnboardingChecklistItems): string {
  return ONBOARDING_COMBINED_FIELD.items
    .filter((entry) => items[entry.key]?.note.trim())
    .map((entry) => `${entry.composeLabel}: ${items[entry.key].note.trim()}`)
    .join("\n");
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
