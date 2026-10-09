"use client";

import { FormEvent, useState } from "react";
import { parseMonthlyOccurrence } from "@/lib/scheduleRecurrence";
import { todayISO } from "@/lib/dateUtils";
import { BigButton, ErrorBox, Field, SelectField, Sheet } from "@/app/ui";

export type SubSchedule = {
  sheetRow: number;
  scheduleId: string;
  accountId: string;
  subId: string;
  dayOfWeek: string;
  timeWindow: string;
  recurring: string;
  effectiveStart: string;
  effectiveEnd: string;
  status: string;
  submittedBy: string;
  submittedDate: string;
  lastEditedBy: string;
  lastEditedDate: string;
  frequency: string;
  monthlyOccurrence: string;
  submittedVia: string;
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TIME_WINDOWS = ["Morning", "Midday", "Afternoon", "Evening"];
const POSITIONS = ["1st", "2nd", "3rd", "4th", "Last"];
const FREQUENCIES: { id: string; label: string }[] = [
  { id: "WEEKLY", label: "Weekly" },
  { id: "BIWEEKLY", label: "Every Other Week" },
  { id: "MONTHLY_1X", label: "1x per Month" },
  { id: "MONTHLY_2X", label: "2x per Month" },
  { id: "AS_NEEDED", label: "As Needed" },
];

type Props = {
  target: SubSchedule;
  accountName: string;
  adminName: string;
  onClose: () => void;
  onSaved: () => void;
};

export default function ScheduleModal({ target, accountName, adminName, onClose, onSaved }: Props) {
  const targetOccurrence = parseMonthlyOccurrence(target.monthlyOccurrence);

  const [frequency, setFrequency] = useState(target.frequency);
  const [dayOfWeek, setDayOfWeek] = useState(target.dayOfWeek);
  const [timeWindow, setTimeWindow] = useState(target.timeWindow);
  const [occurrencePosition, setOccurrencePosition] = useState(targetOccurrence?.position ?? "");
  const [occurrenceWeekday, setOccurrenceWeekday] = useState(targetOccurrence?.weekday ?? "");
  const [effectiveStart, setEffectiveStart] = useState(target.effectiveStart);
  const [effectiveEnd, setEffectiveEnd] = useState(target.effectiveEnd);
  const [effectiveDate, setEffectiveDate] = useState(todayISO());
  const [status, setStatus] = useState(target.status || "Active");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const monthlyOccurrence =
    frequency === "MONTHLY_1X" || frequency === "MONTHLY_2X"
      ? occurrencePosition && occurrenceWeekday
        ? `${occurrencePosition}:${occurrenceWeekday}`
        : ""
      : "";

  // Any change to the pattern itself (as opposed to Status or a manual
  // Effective window tweak) is versioned rather than patched in place — see
  // applySchedulePatternChange in lib/googleSheets.ts.
  const patternChanged =
    frequency !== target.frequency ||
    dayOfWeek !== target.dayOfWeek ||
    timeWindow !== target.timeWindow ||
    monthlyOccurrence !== target.monthlyOccurrence;

  async function handleSubmit(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    if (!adminName.trim()) {
      setError("Enter your name above before saving.");
      return;
    }

    if (patternChanged) {
      if (!effectiveDate) {
        setError("Choose an effective date for this pattern change.");
        return;
      }
      if ((frequency === "WEEKLY" || frequency === "BIWEEKLY") && (!dayOfWeek || !timeWindow)) {
        setError("Choose a day of week and time window.");
        return;
      }
      if (
        (frequency === "MONTHLY_1X" || frequency === "MONTHLY_2X") &&
        (!occurrencePosition || !occurrenceWeekday || !timeWindow)
      ) {
        setError("Choose a week position, weekday, and time window.");
        return;
      }
    }

    setSubmitting(true);
    setError("");

    try {
      if (patternChanged) {
        const res = await fetch("/api/admin/sub-schedules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scheduleId: target.scheduleId,
            accountName,
            lastEditedBy: adminName.trim(),
            effectiveDate,
            newPattern: {
              frequency,
              dayOfWeek: frequency === "WEEKLY" || frequency === "BIWEEKLY" ? dayOfWeek : "",
              timeWindow: frequency === "AS_NEEDED" ? "" : timeWindow,
              monthlyOccurrence,
              status,
            },
          }),
        });
        const data = (await res.json()) as { success?: boolean; error?: string };
        if (!res.ok || !data.success) {
          setError(data.error ?? "Failed to apply schedule pattern change.");
          return;
        }
      } else {
        const res = await fetch("/api/admin/sub-schedules", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sheetRow: target.sheetRow,
            lastEditedBy: adminName.trim(),
            fields: { status, effectiveStart, effectiveEnd },
          }),
        });
        const data = (await res.json()) as { success?: boolean; error?: string };
        if (!res.ok || !data.success) {
          setError(data.error ?? "Failed to update schedule.");
          return;
        }
      }
      onSaved();
      onClose();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open
      title="Edit schedule"
      text={`${accountName} · ${target.subId}`}
      onClose={onClose}
      busy={submitting}
      actions={
        <BigButton busy={submitting} busyLabel="Saving…" onClick={() => void handleSubmit()}>
          Save
        </BigButton>
      }
    >
      <SelectField label="Frequency" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
        {FREQUENCIES.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </SelectField>

      {(frequency === "WEEKLY" || frequency === "BIWEEKLY") && (
        <>
          <SelectField label="Day of week" value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)}>
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </SelectField>
          <SelectField label="Time window" value={timeWindow} onChange={(e) => setTimeWindow(e.target.value)}>
            {TIME_WINDOWS.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </SelectField>
        </>
      )}

      {(frequency === "MONTHLY_1X" || frequency === "MONTHLY_2X") && (
        <>
          <SelectField label="Which week" value={occurrencePosition} onChange={(e) => setOccurrencePosition(e.target.value)}>
            <option value="">Select...</option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </SelectField>
          <SelectField label="Weekday" value={occurrenceWeekday} onChange={(e) => setOccurrenceWeekday(e.target.value)}>
            <option value="">Select...</option>
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </SelectField>
          <SelectField label="Time window" value={timeWindow} onChange={(e) => setTimeWindow(e.target.value)}>
            <option value="">Select...</option>
            {TIME_WINDOWS.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </SelectField>
        </>
      )}

      {frequency === "AS_NEEDED" && (
        <p className="ui-hint">No recurring day needed. Visits for this account are added one at a time via Schedule Exceptions.</p>
      )}

      <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="Active">Active</option>
        <option value="Inactive">Inactive</option>
      </SelectField>

      {patternChanged ? (
        <Field
          label="Effective date"
          hint={`This pattern change takes effect on this date. Visits before it keep the current pattern: this schedule is closed out and a new one starts on ${effectiveDate || "this date"}.`}
          type="date"
          value={effectiveDate}
          onChange={(e) => setEffectiveDate(e.target.value)}
        />
      ) : (
        <>
          <Field label="Effective start" type="date" value={effectiveStart} onChange={(e) => setEffectiveStart(e.target.value)} />
          <Field label="Effective end" type="date" value={effectiveEnd} onChange={(e) => setEffectiveEnd(e.target.value)} />
        </>
      )}

      <p className="ui-muted">
        Submitted by {target.submittedBy || "someone not recorded"} on {target.submittedDate || "a date not recorded"}
        {target.submittedVia ? ` via ${target.submittedVia}` : ""}
        {target.lastEditedBy ? ` · last edited by ${target.lastEditedBy} on ${target.lastEditedDate}` : ""}
      </p>

      {error ? <ErrorBox title="The schedule was not saved." text={error} /> : null}
    </Sheet>
  );
}
