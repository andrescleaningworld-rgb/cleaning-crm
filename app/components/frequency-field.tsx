"use client";

// The account's Frequency: a short list, or "Other" with a box to type it in
// (lib/frequency.ts). The value handed back is what is saved: the list text,
// or the typed words for Other.

import { useState } from "react";
import { Field, SelectField } from "@/app/ui";
import { FREQUENCY_OPTIONS, frequencyChoice } from "@/lib/frequency";

export default function FrequencyField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  // "Other" with nothing typed yet is still Other, so it is remembered here.
  const [otherOpen, setOtherOpen] = useState(frequencyChoice(value) === "Other");
  const choice = otherOpen ? "Other" : frequencyChoice(value);

  return (
    <>
      <SelectField
        label="Frequency"
        optional
        value={choice}
        onChange={(event) => {
          const next = event.target.value;
          if (next === "Other") {
            setOtherOpen(true);
            // Keep words already typed for Other; a list value is not carried over.
            if (frequencyChoice(value) !== "Other") onChange("");
            return;
          }
          setOtherOpen(false);
          onChange(next);
        }}
      >
        <option value="">Select frequency</option>
        {FREQUENCY_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        <option value="Other">Other (type it in)</option>
      </SelectField>
      {choice === "Other" ? (
        <Field
          label="Frequency (Other)"
          hint="Write it the way the office says it, e.g. 2x per week office, 1x per month floors."
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : null}
    </>
  );
}
