"use client";

// The account's cleaning time: a time window (from - to) or an exact
// appointment time (lib/cleaningTime.ts). Hands back the text to save:
// "18:00-21:00", "19:00", or "" for none.

import { useState } from "react";
import { Field, SelectField } from "@/app/ui";
import { cleaningTimeText, parseCleaningTime } from "@/lib/cleaningTime";
import { parseClock, toClock } from "@/lib/schedule-time";

type Kind = "" | "window" | "exact";

export default function CleaningTimeField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const saved = parseCleaningTime(value);
  // Remembered here so a half-filled window (only "from" so far) keeps its kind.
  const [kind, setKind] = useState<Kind>(saved?.kind ?? "");
  const [from, setFrom] = useState(saved?.kind === "window" ? toClock(saved.from) : "");
  const [to, setTo] = useState(saved?.kind === "window" ? toClock(saved.to) : "");
  const [at, setAt] = useState(saved?.kind === "exact" ? toClock(saved.at) : "");

  function hand(nextKind: Kind, nextFrom: string, nextTo: string, nextAt: string) {
    if (nextKind === "window") {
      const a = parseClock(nextFrom);
      const b = parseClock(nextTo);
      onChange(a !== null && b !== null ? cleaningTimeText({ kind: "window", from: a, to: b }) : "");
    } else if (nextKind === "exact") {
      const a = parseClock(nextAt);
      onChange(a !== null ? cleaningTimeText({ kind: "exact", at: a }) : "");
    } else {
      onChange("");
    }
  }

  return (
    <>
      <SelectField
        label="Cleaning time"
        optional
        value={kind}
        onChange={(event) => {
          const next = event.target.value as Kind;
          setKind(next);
          hand(next, from, to, at);
        }}
      >
        <option value="">Not set</option>
        <option value="window">A time window (from - to)</option>
        <option value="exact">An exact appointment time</option>
      </SelectField>
      {kind === "window" ? (
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <Field
            label="From"
            type="time"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              hand(kind, event.target.value, to, at);
            }}
          />
          <Field
            label="To"
            type="time"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              hand(kind, from, event.target.value, at);
            }}
          />
        </div>
      ) : null}
      {kind === "exact" ? (
        <Field
          label="Appointment time"
          type="time"
          value={at}
          onChange={(event) => {
            setAt(event.target.value);
            hand(kind, from, to, event.target.value);
          }}
        />
      ) : null}
    </>
  );
}
