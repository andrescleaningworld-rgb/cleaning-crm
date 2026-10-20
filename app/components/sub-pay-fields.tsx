"use client";

// The sub's pay on every account form (Add Account, New Accepted Account,
// Edit Account, Finish setting up), the same everywhere:
//   - a grey reminder above: "CW gets $495 / month · We keep $155 (31%)", live;
//   - Frequency asked right here when the account has none (the price per
//     cleaning needs it), unless the form shows Frequency just above;
//   - Subcontractor pay (monthly) starts at the suggestion (70% of what CW
//     gets, whole dollars) when it is empty, and follows what CW gets until
//     someone types a pay or a price;
//   - Sub price per cleaning and the monthly pay stay in step as you type,
//     and a new Frequency keeps the monthly pay and works the price out again.
// lib/frequency.ts does the cleanings-a-month sums.

import { useEffect, useRef, useState } from "react";
import { Field } from "@/app/ui";
import FrequencyField from "./frequency-field";
import { afterFrequencyChange, monthlyPayText, perCleaningHint, perCleaningText } from "@/lib/frequency";
import { shareOfRevenue } from "@/lib/payShare";

const amount = (text: string) => Number(String(text ?? "").replace(/[$,\s]/g, "")) || 0;
const money0 = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** The suggested monthly sub pay: 70% of what CW gets, in whole dollars ("" with no revenue). */
export function suggestedSubPay(revenueText: string): string {
  const revenue = amount(revenueText);
  return revenue > 0 ? String(Math.round(revenue * 0.7)) : "";
}

export default function SubPayFields({
  revenue,
  frequency,
  onFrequency,
  pay,
  per,
  onPay,
  frequencyAbove = false,
  disabled = false,
}: {
  /** What CW gets a month, as typed. */
  revenue: string;
  frequency: string;
  onFrequency: (frequency: string) => void;
  pay: string;
  per: string;
  /** Both values together, so the two boxes never disagree. */
  onPay: (next: { pay: string; per: string }) => void;
  /** The form shows Frequency right above this already: do not ask again. */
  frequencyAbove?: boolean;
  disabled?: boolean;
}) {
  // A pay already on the account is the office's own number: the suggestion never replaces it.
  const touched = useRef(amount(pay) > 0);
  // Once asked here, Frequency stays here while it is being filled in (Other has a box to type in).
  const [askFrequency] = useState(!frequency.trim());

  // Empty pay: start at the suggestion. Untouched: follow what CW gets.
  useEffect(() => {
    if (touched.current) return;
    const suggested = suggestedSubPay(revenue);
    if (suggested && suggested !== pay) onPay({ pay: suggested, per: perCleaningText(suggested, frequency) });
    // Only a new revenue (or Frequency) moves the suggestion; typing in the boxes sets `touched`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revenue, frequency]);

  const cw = amount(revenue);
  const keep = cw - amount(pay);

  return (
    <>
      <p className="ui-muted" aria-live="polite">
        {cw > 0 ? `CW gets ${money0(cw)} / month · We keep ${money0(keep)} (${shareOfRevenue(keep, cw)})` : "Fill in what CW gets a month to see what we keep."}
      </p>
      {askFrequency && !frequencyAbove ? (
        <FrequencyField
          value={frequency}
          onChange={(next) => {
            onFrequency(next);
            const after = afterFrequencyChange(next, pay, per);
            onPay(after);
          }}
        />
      ) : null}
      {!frequency.trim() ? <p className="ui-field-error">Pick the Frequency first: the price per cleaning needs it.</p> : null}
      <Field
        label="Sub price per cleaning"
        optional
        hint={perCleaningHint(frequency)}
        inputMode="decimal"
        placeholder="50"
        value={per}
        disabled={disabled}
        onChange={(event) => {
          touched.current = true;
          const nextPer = event.target.value;
          const nextPay = monthlyPayText(nextPer, frequency);
          onPay({ pay: nextPay ?? pay, per: nextPer });
        }}
      />
      <Field
        label="Subcontractor pay (monthly)"
        optional
        hint="Starts at 70% of what CW gets. Type your own number, or a price per cleaning above."
        inputMode="decimal"
        value={pay}
        disabled={disabled}
        onChange={(event) => {
          touched.current = true;
          const nextPay = event.target.value;
          onPay({ pay: nextPay, per: perCleaningText(nextPay, frequency) });
        }}
      />
    </>
  );
}
