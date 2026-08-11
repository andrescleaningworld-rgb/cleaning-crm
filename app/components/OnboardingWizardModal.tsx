"use client";

import OnboardingChecklist, { type OnboardingChecklistProps } from "./OnboardingChecklist";

type OnboardingWizardModalProps = Omit<OnboardingChecklistProps, "variant"> & {
  onClose: () => void;
};

// Modal chrome only — the checklist itself (progress, autosave, notes) is
// the same OnboardingChecklist component the account detail page's
// persistent "Onboarding" section renders inline. Closing this modal never
// loses progress: every change is already autosaved server-side, so "close"
// doubles as "minimize and resume later" with no separate state to reconcile.
export default function OnboardingWizardModal({ onClose, ...checklistProps }: OnboardingWizardModalProps) {
  function handleOverlayClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  function handleOverlayKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      onClick={handleOverlayClick}
      onKeyDown={handleOverlayKeyDown}
      role="presentation"
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">Onboarding Checklist</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">{checklistProps.accountName || "Onboarding"}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close onboarding checklist"
            className="rounded-full bg-slate-100 px-3 py-2 text-sm font-black text-slate-600 hover:bg-slate-200"
          >
            X
          </button>
        </div>

        <div className="mt-6">
          <OnboardingChecklist {...checklistProps} variant="modal" />
        </div>
      </div>
    </div>
  );
}
