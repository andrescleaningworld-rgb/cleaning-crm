"use client";

// The two extra questions the "Change status" sheet asks when the new status
// is Cancelled: the last day the account is cleaned, and why it is leaving.
// Shown above the notes box on the accounts list and on the account page.
// The list of reasons and the rules are in lib/cancellation.ts.

import { Field, SelectField } from "@/app/ui";
import { CANCELLATION_REASONS } from "@/lib/cancellation";

export default function CancellationFields({
  finalCleaningDate,
  reason,
  disabled,
  onFinalCleaningDate,
  onReason,
}: {
  finalCleaningDate: string;
  reason: string;
  disabled?: boolean;
  onFinalCleaningDate: (value: string) => void;
  onReason: (value: string) => void;
}) {
  return (
    <>
      <Field
        label="Final cleaning date"
        hint="The last day we clean this account. No cleanings show after it."
        type="date"
        value={finalCleaningDate}
        onChange={(event) => onFinalCleaningDate(event.target.value)}
        disabled={disabled}
      />
      <SelectField label="Reason" value={reason} onChange={(event) => onReason(event.target.value)} disabled={disabled}>
        <option value="">Choose a reason</option>
        {CANCELLATION_REASONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </SelectField>
    </>
  );
}
