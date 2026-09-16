"use client";

import { useMemo, useState } from "react";
import { todayISO } from "@/lib/scheduleRecurrence";
import { AutocompleteField, useDebounce, type SearchOption } from "./autocomplete";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-950">Add Schedule</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close">
            ×
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Creates a recurring schedule on behalf of a subcontractor. They&apos;ll be emailed and can update it
          from their own portal later.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <AutocompleteField
            label="Customer"
            placeholder="Search customer name..."
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
            className="sm:w-full"
          />
          <AutocompleteField
            label="Subcontractor"
            placeholder="Search subcontractor name..."
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
            className="sm:w-full"
          />
        </div>

        <div className="mt-4">
          <p className="text-sm font-bold text-slate-700">How often does this sub service this account?</p>
          <select
            value={frequency}
            onChange={(e) => handleFrequencyChange(e.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-600"
          >
            <option value="">Select a frequency...</option>
            {FREQUENCIES.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        </div>

        {(frequency === "WEEKLY" || frequency === "BIWEEKLY") && (
          <>
            <div className="mt-4">
              <p className="text-sm font-bold text-slate-700">Which day(s)?</p>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-7">
                {DAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`rounded-2xl border px-2 py-3 text-center text-xs font-black transition ${
                      selectedDays.includes(day)
                        ? "border-indigo-500 bg-indigo-600 text-white ring-2 ring-indigo-200"
                        : "border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-100"
                    }`}
                  >
                    {day.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>

            {selectedDays.length > 0 && (
              <div className="mt-4 space-y-3">
                {selectedDays.map((day) => (
                  <div key={day}>
                    <p className="text-sm font-bold text-slate-700">Time window for {day}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {TIME_WINDOWS.map((w) => (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => setWindowForDay(day, w.id)}
                          className={`rounded-2xl border px-3 py-2 text-left transition ${
                            dayWindows[day] === w.id
                              ? "border-indigo-500 bg-white ring-2 ring-indigo-200"
                              : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-100"
                          }`}
                        >
                          <p className="text-sm font-black text-slate-900">{w.label}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{w.hours}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {(frequency === "MONTHLY_1X" || frequency === "MONTHLY_2X") && (
          <div className="mt-4 space-y-3">
            <OccurrencePicker label={frequency === "MONTHLY_2X" ? "First visit" : "Which week and day?"} value={occurrence1} onChange={setOccurrence1} />
            {frequency === "MONTHLY_2X" && (
              <OccurrencePicker label="Second visit" value={occurrence2} onChange={setOccurrence2} />
            )}
          </div>
        )}

        {frequency === "AS_NEEDED" && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
            No recurring days needed — visits will be added one at a time as they come up.
          </div>
        )}

        {!adminName.trim() ? (
          <p className="mt-4 text-xs font-semibold text-red-600">
            Enter your name at the top of the page before creating a schedule.
          </p>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 rounded-2xl bg-indigo-700 px-5 py-3 text-base font-black text-white shadow-sm hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Saving..." : "Create Schedule"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
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
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <p className="text-sm font-bold text-slate-700">{label}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <select
          value={value.position}
          onChange={(e) => onChange({ ...value, position: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-600"
        >
          <option value="">Which week...</option>
          {POSITIONS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select
          value={value.weekday}
          onChange={(e) => onChange({ ...value, weekday: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-600"
        >
          <option value="">Weekday...</option>
          {DAYS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TIME_WINDOWS.map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => onChange({ ...value, timeWindow: w.id })}
            className={`rounded-2xl border px-3 py-2 text-left transition ${
              value.timeWindow === w.id
                ? "border-indigo-500 bg-white ring-2 ring-indigo-200"
                : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-100"
            }`}
          >
            <p className="text-sm font-black text-slate-900">{w.label}</p>
            <p className="mt-0.5 text-xs text-slate-500">{w.hours}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
