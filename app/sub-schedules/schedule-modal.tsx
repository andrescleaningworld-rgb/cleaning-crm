"use client";

// Sub Center → Sub Schedules → Edit: one schedule (all its days) in the
// shared schedule form (app/components/schedule-editor.tsx).
//   Days or times changed → saved as a new schedule from "Starts on"; the old
//                           days end the day before (same as every form).
//   Only the dates changed → each day's start / end date is updated.

import { useState } from "react";
import { BigButton, ErrorBox, Field, Sheet, showToast } from "@/app/ui";
import ScheduleEditor from "@/app/components/schedule-editor";
import { saveSchedule } from "@/app/components/account-schedule";
import { planProblems, rowsToPlan, samePlan, type SchedulePlan } from "@/lib/schedule-plan";
import { todayISO } from "@/lib/dateUtils";

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
  /** On a cancelled account's schedule: the end date really stored (effectiveEnd is then the account's last cleaning day). */
  storedEffectiveEnd?: string;
  /** "appointment" with an exact startTime ("19:00"), else a time window. */
  scheduleType?: string;
  startTime?: string;
  /** The day's own "Anytime between" times (migration 068); "" = the named window. */
  windowStart?: string;
  windowEnd?: string;
  /** The day's time on site in minutes; null = not set. */
  minutesOnSite?: number | null;
};

type Props = {
  /** Every day of the schedule. */
  rows: SubSchedule[];
  accountName: string;
  subName: string;
  adminName: string;
  onClose: () => void;
  onSaved: () => void;
};

export default function ScheduleModal({ rows, accountName, subName, adminName, onClose, onSaved }: Props) {
  const first = rows[0];
  const [initial] = useState(() => rowsToPlan(rows));
  const [plan, setPlan] = useState<SchedulePlan>(initial);
  const [startDate, setStartDate] = useState(todayISO());
  // A cancelled account's schedule reads as ending on its last cleaning day;
  // these are the dates really stored, so saving never ends it for good.
  const endedByCancellation = first.storedEffectiveEnd !== undefined;
  const [effectiveStart, setEffectiveStart] = useState(first.effectiveStart);
  const [effectiveEnd, setEffectiveEnd] = useState(first.storedEffectiveEnd ?? first.effectiveEnd);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const changed = !samePlan(plan, initial);
  const datesChanged = effectiveStart !== first.effectiveStart || effectiveEnd !== (first.storedEffectiveEnd ?? first.effectiveEnd);

  async function save() {
    setTried(true);
    setError("");
    if (changed && planProblems(plan).length > 0) return;
    if (!changed && !datesChanged) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      if (changed) {
        const result = await saveSchedule({
          accountId: first.accountId,
          accountName,
          subId: first.subId,
          plan,
          closeScheduleIds: rows.map((row) => row.scheduleId),
          startDate,
          submittedBy: adminName.trim(),
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
      } else {
        for (const row of rows) {
          const response = await fetch("/api/admin/sub-schedules", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sheetRow: row.sheetRow, lastEditedBy: adminName.trim() || "Staff", fields: { effectiveStart, effectiveEnd } }),
          });
          const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
          if (!response.ok || !data.success) {
            setError(data.error ?? "The dates were not saved.");
            return;
          }
        }
      }
      showToast("Schedule saved ✓");
      onSaved();
      onClose();
    } catch {
      setError("No connection. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      title="Change schedule"
      text={`${accountName} · ${subName || "no sub"}`}
      onClose={() => {
        if (!saving) onClose();
      }}
      busy={saving}
      actions={
        <BigButton busy={saving} busyLabel="Saving…" onClick={() => void save()}>
          Save schedule
        </BigButton>
      }
    >
      <ScheduleEditor value={plan} onChange={setPlan} showProblems={tried} disabled={saving} />

      {changed ? (
        <Field
          label="Starts on"
          hint="Cleanings before this day stay as they were."
          type="date"
          min={todayISO()}
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
        />
      ) : (
        <details>
          <summary className="ui-label" style={{ cursor: "pointer" }}>
            Start and end dates
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
            <Field label="Start date" type="date" optional value={effectiveStart} onChange={(event) => setEffectiveStart(event.target.value)} />
            <Field
              label="End date"
              optional
              hint={endedByCancellation ? `This account is cancelled, so its calendar stops on ${first.effectiveEnd}. This date is kept for when the account is active again.` : undefined}
              type="date"
              value={effectiveEnd}
              onChange={(event) => setEffectiveEnd(event.target.value)}
            />
          </div>
        </details>
      )}

      <p className="ui-muted">
        Added by {first.submittedBy || "someone not recorded"} on {first.submittedDate || "a date not recorded"}
        {first.submittedVia ? ` via ${first.submittedVia}` : ""}
        {first.lastEditedBy ? ` · last changed by ${first.lastEditedBy} on ${first.lastEditedDate}` : ""}
      </p>

      {error ? <ErrorBox title="The schedule was not saved." text={error} /> : null}
    </Sheet>
  );
}
