"use client";

import { useMemo, useState } from "react";
import { todayISO } from "@/lib/scheduleRecurrence";
import { AutocompleteField, useDebounce, type SearchOption } from "./autocomplete";
import { BigButton, ErrorBox, SelectField, Sheet } from "@/app/ui";

type TeamLeaderRecord = { id: string; companyName: string; contactName: string };

type Occurrence = { position: string; weekday: string; timeWindow: string };
const EMPTY_OCCURRENCE: Occurrence = { position: "", weekday: "", timeWindow: "" };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const POSITIONS = ["1st", "2nd", "3rd", "4th", "Last"];
const TIME_WINDOWS = [
  { id: "Morning", label: "Morning", hours: "7am – 10am" },
  { id: "Midday", label: "Midday", hours: "10am – 1pm" },
  { id: "Afternoon", label: "Afternoon", hours: "1pm – 5pm" },
  { id: "Evening", label: "Evening", hours: "5pm+" },
] as const;
const FREQUENCIES: { id: string; label: string }[] = [
  { id: "WEEKLY", label: "Weekly" },
  { id: "BIWEEKLY", label: "Every Other Week" },
  { id: "MONTHLY_1X", label: "1x per Month" },
  { id: "MONTHLY_2X", label: "2x per Month" },
  { id: "AS_NEEDED", label: "As Needed" },
];

function yearEndISO(): string {
  return `${todayISO().slice(0, 4)}-12-31`;
}

function formatTeamLeaderLabel(record: TeamLeaderRecord): string {
  return record.contactName && record.companyName
    ? `${record.contactName} — ${record.companyName}`
    : record.contactName || record.companyName;
}

type Props = {
  initialAccount: SearchOption | null;
  initialSub: SearchOption | null;
  allAccountOptions: SearchOption[];
  allTeamLeaders: TeamLeaderRecord[];
  adminName: string;
  onClose: () => void;
  onCreated: (created: { account: SearchOption; sub: SearchOption }) => void;
};

// Admin-side equivalent of AccountScheduleForm in
// app/subcontractor-portal/sub-schedule-tab.tsx — same fields/flow (a sub
// submitting their own schedule looks identical from their end), built as
// its own independent component rather than extracted from that file, so
// the portal's actual submission UI stays untouched.
export default function AddScheduleModal({
  initialAccount,
  initialSub,
  allAccountOptions,
  allTeamLeaders,
  adminName,
  onClose,
  onCreated,
}: Props) {
  const [accountQuery, setAccountQuery] = useState(initialAccount?.label ?? "");
  const [accountSelected, setAccountSelected] = useState<SearchOption | null>(initialAccount);
  const debouncedAccountQuery = useDebounce(accountQuery, 200);
  const accountOptions = useMemo(() => {
    if (accountSelected) return [];
    const q = debouncedAccountQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return allAccountOptions.filter((o) => o.label.toLowerCase().includes(q)).slice(0, 8);
  }, [allAccountOptions, debouncedAccountQuery, accountSelected]);

  const [subQuery, setSubQuery] = useState(initialSub?.label ?? "");
  const [subSelected, setSubSelected] = useState<SearchOption | null>(initialSub);
  const debouncedSubQuery = useDebounce(subQuery, 200);
  const subOptions = useMemo(() => {
    if (subSelected) return [];
    const q = debouncedSubQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return allTeamLeaders
      .filter((r) => r.companyName.toLowerCase().includes(q) || r.contactName.toLowerCase().includes(q))
      .slice(0, 8)
      .map((r) => ({ id: r.id, label: formatTeamLeaderLabel(r) }));
  }, [allTeamLeaders, debouncedSubQuery, subSelected]);

  const [frequency, setFrequency] = useState("");
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [dayWindows, setDayWindows] = useState<Record<string, string>>({});
  const [occurrence1, setOccurrence1] = useState<Occurrence>(EMPTY_OCCURRENCE);
  const [occurrence2, setOccurrence2] = useState<Occurrence>(EMPTY_OCCURRENCE);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function handleFrequencyChange(next: string) {
    setFrequency(next);
    setSelectedDays([]);
    setDayWindows({});
    setOccurrence1(EMPTY_OCCURRENCE);
    setOccurrence2(EMPTY_OCCURRENCE);
    setError("");
  }

  function toggleDay(day: string) {
    setSelectedDays((prev) => {
      if (prev.includes(day)) {
        setDayWindows((w) => {
          const next = { ...w };
          delete next[day];
          return next;
        });
        return prev.filter((d) => d !== day);
      }
      return [...prev, day];
    });
  }

  function setWindowForDay(day: string, windowId: string) {
    setDayWindows((prev) => ({ ...prev, [day]: windowId }));
  }

  const allDaysHaveWindows = selectedDays.length > 0 && selectedDays.every((day) => Boolean(dayWindows[day]));
  const occurrence1Complete = Boolean(occurrence1.position && occurrence1.weekday && occurrence1.timeWindow);
  const occurrence2Complete = Boolean(occurrence2.position && occurrence2.weekday && occurrence2.timeWindow);

  function computeCanSubmit(): boolean {
    if (submitting) return false;
    if (!accountSelected || !subSelected || !adminName.trim()) return false;
    if (frequency === "WEEKLY" || frequency === "BIWEEKLY") return allDaysHaveWindows;
    if (frequency === "MONTHLY_1X") return occurrence1Complete;
    if (frequency === "MONTHLY_2X") return occurrence1Complete && occurrence2Complete;
    if (frequency === "AS_NEEDED") return true;
    return false;
  }
  const canSubmit = computeCanSubmit();

  async function handleSubmit() {
    if (!canSubmit || !accountSelected || !subSelected) return;
    setSubmitting(true);
    setError("");

    const effectiveStart = frequency === "AS_NEEDED" ? "" : todayISO();
    const effectiveEnd = frequency === "AS_NEEDED" ? "" : yearEndISO();

    type SubmitEntry = { dayOfWeek?: string; timeWindow?: string; monthlyOccurrence?: string };
    let entries: SubmitEntry[];
    if (frequency === "WEEKLY" || frequency === "BIWEEKLY") {
      entries = selectedDays.map((day) => ({ dayOfWeek: day, timeWindow: dayWindows[day] }));
    } else if (frequency === "MONTHLY_1X") {
      entries = [{ monthlyOccurrence: `${occurrence1.position}:${occurrence1.weekday}`, timeWindow: occurrence1.timeWindow }];
    } else if (frequency === "MONTHLY_2X") {
      entries = [
        { monthlyOccurrence: `${occurrence1.position}:${occurrence1.weekday}`, timeWindow: occurrence1.timeWindow },
        { monthlyOccurrence: `${occurrence2.position}:${occurrence2.weekday}`, timeWindow: occurrence2.timeWindow },
      ];
    } else {
      entries = [];
    }

    try {
      const res = await fetch("/api/admin/sub-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createSchedule",
          accountId: accountSelected.id,
          accountName: accountSelected.label,
          subId: subSelected.id,
          submittedBy: adminName.trim(),
          frequency,
          effectiveStart,
          effectiveEnd,
          entries,
        }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        setError(data.error ?? "Failed to create schedule. Please try again.");
        return;
      }
      onCreated({ account: accountSelected, sub: subSelected });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open
      title="Add schedule"
      text="Creates a recurring schedule on behalf of a subcontractor. They'll be emailed and can update it from their own portal later."
      onClose={onClose}
      busy={submitting}
      actions={
        <BigButton busy={submitting} busyLabel="Saving…" disabled={!canSubmit} onClick={() => void handleSubmit()}>
          Create schedule
        </BigButton>
      }
    >
      <AutocompleteField
        label="Customer"
        placeholder="Search customer name"
        query={accountQuery}
        onQueryChange={setAccountQuery}
        options={accountOptions}
        loading={false}
        selected={accountSelected}
        onSelect={(o) => {
          setAccountSelected(o);
          setAccountQuery(o.label);
        }}
        onClear={() => {
          setAccountSelected(null);
          setAccountQuery("");
        }}
      />
      <AutocompleteField
        label="Subcontractor"
        placeholder="Search subcontractor name"
        query={subQuery}
        onQueryChange={setSubQuery}
        options={subOptions}
        loading={false}
        selected={subSelected}
        onSelect={(o) => {
          setSubSelected(o);
          setSubQuery(o.label);
        }}
        onClear={() => {
          setSubSelected(null);
          setSubQuery("");
        }}
      />

      <SelectField label="How often does this sub service this account?" value={frequency} onChange={(e) => handleFrequencyChange(e.target.value)}>
        <option value="">Select a frequency...</option>
        {FREQUENCIES.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </SelectField>

      {(frequency === "WEEKLY" || frequency === "BIWEEKLY") && (
        <>
          <div>
            <p className="ui-label">Which day(s)?</p>
            <div className="ui-chips" role="group" aria-label="Days of the week">
              {DAYS.map((day) => (
                <button key={day} type="button" onClick={() => toggleDay(day)} className="ui-chip" aria-pressed={selectedDays.includes(day)} aria-label={day}>
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          {selectedDays.map((day) => (
            <div key={day}>
              <p className="ui-label">Time window for {day}</p>
              <TimeWindowChips label={`Time window for ${day}`} value={dayWindows[day] ?? ""} onChange={(id) => setWindowForDay(day, id)} />
            </div>
          ))}
        </>
      )}

      {(frequency === "MONTHLY_1X" || frequency === "MONTHLY_2X") && (
        <>
          <OccurrencePicker label={frequency === "MONTHLY_2X" ? "First visit" : "Which week and day?"} value={occurrence1} onChange={setOccurrence1} />
          {frequency === "MONTHLY_2X" && <OccurrencePicker label="Second visit" value={occurrence2} onChange={setOccurrence2} />}
        </>
      )}

      {frequency === "AS_NEEDED" && <p className="ui-hint">No recurring days needed. Visits will be added one at a time as they come up.</p>}

      {!adminName.trim() ? <p className="ui-field-error">Enter your name at the top of the page before creating a schedule.</p> : null}

      {error ? <ErrorBox title="The schedule was not created." text={error} /> : null}
    </Sheet>
  );
}

// The four time windows as big chips; each shows its hours.
function TimeWindowChips({ label, value, onChange }: { label: string; value: string; onChange: (id: string) => void }) {
  return (
    <div className="ui-chips" role="group" aria-label={label}>
      {TIME_WINDOWS.map((w) => (
        <button key={w.id} type="button" onClick={() => onChange(w.id)} className="ui-chip" aria-pressed={value === w.id}>
          {w.label} <span style={{ fontWeight: 500 }}>({w.hours})</span>
        </button>
      ))}
    </div>
  );
}

function OccurrencePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Occurrence;
  onChange: (next: Occurrence) => void;
}) {
  return (
    <fieldset className="ui-checks" style={{ gap: 12 }}>
      <legend className="ui-label">{label}</legend>
      <SelectField label="Which week" value={value.position} onChange={(e) => onChange({ ...value, position: e.target.value })}>
        <option value="">Which week...</option>
        {POSITIONS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </SelectField>
      <SelectField label="Weekday" value={value.weekday} onChange={(e) => onChange({ ...value, weekday: e.target.value })}>
        <option value="">Weekday...</option>
        {DAYS.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </SelectField>
      <TimeWindowChips label={`Time window, ${label}`} value={value.timeWindow} onChange={(id) => onChange({ ...value, timeWindow: id })} />
    </fieldset>
  );
}
