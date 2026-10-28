"use client";

import OnboardingChecklist from "./OnboardingChecklist";

type OnboardingWizardModalProps = {
  accountId: string;
  accountName: string;
  onClose: () => void;
  /** After any answer is saved. */
  onChanged?: () => void;
};

// The setup wizard, full screen on a phone and a big centred card on a
// computer. Only the frame: the wizard is the same OnboardingChecklist the
// account page's Setup card opens. Every answer is already saved, so Close
// never loses anything, and it opens again where it was left.
export default function OnboardingWizardModal({ accountId, accountName, onClose, onChanged }: OnboardingWizardModalProps) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-stretch justify-center bg-slate-950/50 sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      role="presentation"
    >
      <div role="dialog" aria-modal="true" aria-label={`Set up ${accountName}`} className="h-full w-full max-w-xl overflow-y-auto bg-slate-50 p-4 shadow-2xl sm:h-auto sm:max-h-[94vh] sm:rounded-3xl sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="truncate text-lg font-black text-slate-700">{accountName || "Setup"}</p>
          <button type="button" onClick={onClose} className="min-h-[48px] rounded-full bg-slate-200 px-5 text-lg font-black text-slate-700 active:bg-slate-300">
            Close
          </button>
        </div>
        <OnboardingChecklist accountId={accountId} accountName={accountName} variant="modal" onChanged={onChanged} />
      </div>
    </div>
  );
}
