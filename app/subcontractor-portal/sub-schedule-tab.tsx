"use client";

import { useEffect, useMemo, useState } from "react";

type ScheduleAccount = {
  id?: string;
  accountId?: string;
  accountName?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
};

type ScheduleSubcontractor = {
  id?: string;
  subcontractorId?: string;
  name?: string;
  subcontractorName?: string;
  companyName?: string;
  contactName?: string;
  email?: string;
};

type SubScheduleRecord = {
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
};

type Occurrence = { position: string; weekday: string; timeWindow: string };

const EMPTY_OCCURRENCE: Occurrence = { position: "", weekday: "", timeWindow: "" };

const POSITIONS = ["1st", "2nd", "3rd", "4th", "Last"];

const FREQUENCIES: { id: string; label: string }[] = [
  { id: "WEEKLY", label: "Weekly" },
  { id: "BIWEEKLY", label: "Every Other Week" },
  { id: "MONTHLY_1X", label: "1x per Month" },
  { id: "MONTHLY_2X", label: "2x per Month" },
  { id: "AS_NEEDED", label: "As Needed" },
];

function describeScheduleRecord(record: SubScheduleRecord): string {
  switch (record.frequency) {
    case "WEEKLY":
      return `${record.dayOfWeek} — ${record.timeWindow} (weekly)`;
    case "BIWEEKLY":
      return `${record.dayOfWeek} — ${record.timeWindow} (every other week)`;
    case "MONTHLY_1X":
      return `${record.monthlyOccurrence.replace(":", " ")} — ${record.timeWindow} (1x per month)`;
    case "MONTHLY_2X":
      return `${record.monthlyOccurrence.replace(":", " ")} — ${record.timeWindow} (2x per month)`;
    case "AS_NEEDED":
      return "As needed — visits added manually";
    default:
      // Pre-migration rows without a Frequency value shouldn't exist after
      // the SubSchedules backfill, but keep them readable just in case.
      return `${record.dayOfWeek} — ${record.timeWindow}${record.recurring === "Y" ? " (every week)" : " (one-time)"}`;
  }
}

type Props = {
  accounts: ScheduleAccount[];
  subcontractor: ScheduleSubcontractor | null;
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const TIME_WINDOWS = [
  { id: "Morning", label: "Morning", hours: "7am – 10am" },
  { id: "Midday", label: "Midday", hours: "10am – 1pm" },
  { id: "Afternoon", label: "Afternoon", hours: "1pm – 5pm" },
  { id: "Evening", label: "Evening", hours: "5pm+" },
] as const;

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function getAccountId(account: ScheduleAccount): string {
  return cleanText(account.accountId || account.id || account.accountName);
}

function getAccountName(account: ScheduleAccount): string {
  return cleanText(account.accountName) || "Unnamed Account";
}

function getFullAddress(account: ScheduleAccount): string {
  return [account.address, account.city, account.state, account.zip]
    .map(cleanText)
    .filter(Boolean)
    .join(", ");
}

function getSubDisplayName(sub: ScheduleSubcontractor | null): string {
  if (!sub) return "";
  return cleanText(
    sub.name || sub.subcontractorName || sub.companyName || sub.contactName || sub.email
  );
}

function getSubId(sub: ScheduleSubcontractor | null): string {
  if (!sub) return "";
  return cleanText(sub.email || sub.id || sub.subcontractorId);
}

// This runs in the browser, but Date#toISOString() always returns the UTC
// calendar date — in the evening (US Eastern), UTC has already rolled to the
// next day, which would save effectiveStart as tomorrow and hide the
// schedule from the calendar's "todayISO >= effectiveStart" gate check.
// Matches the same Intl.DateTimeFormat approach used server-side in
// app/api/portal/schedule-visit/route.ts's getEasternToday().
function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function yearEndISO(): string {
  // Derived from the same Eastern-time reference as todayISO() (rather than
  // new Date().getFullYear(), which reads the browser's local system
  // timezone) so the two can never disagree at a year boundary.
  const year = todayISO().slice(0, 4);
  return `${year}-12-31`;
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

function AccountScheduleForm({
  account,
  subId,
  submittedBy,
  onSaved,
}: {
  account: ScheduleAccount;
  subId: string;
  submittedBy: string;
  onSaved: (accountId: string, records: SubScheduleRecord[]) => void;
}) {
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

  const allDaysHaveWindows =
    selectedDays.length > 0 && selectedDays.every((day) => Boolean(dayWindows[day]));
  const occurrence1Complete = Boolean(occurrence1.position && occurrence1.weekday && occurrence1.timeWindow);
  const occurrence2Complete = Boolean(occurrence2.position && occurrence2.weekday && occurrence2.timeWindow);

  function computeCanSubmit(): boolean {
    if (submitting) return false;
    if (frequency === "WEEKLY" || frequency === "BIWEEKLY") return allDaysHaveWindows;
    if (frequency === "MONTHLY_1X") return occurrence1Complete;
    if (frequency === "MONTHLY_2X") return occurrence1Complete && occurrence2Complete;
    if (frequency === "AS_NEEDED") return true;
    return false;
  }
  const canSubmit = computeCanSubmit();

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");

    const accountId = getAccountId(account);
    const recurring = frequency === "AS_NEEDED" ? "N" : "Y";
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
      const res = await fetch("/api/subcontractor-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          subId,
          submittedBy,
          frequency,
          effectiveStart,
          effectiveEnd,
          entries,
        }),
      });
      const data = (await res.json()) as { success?: boolean; scheduleIds?: string[]; error?: string };
      if (!res.ok || !data.success) {
        setError(data.error ?? "Failed to save schedule. Please try again.");
        return;
      }

      const now = new Date().toISOString();
      const baseRecord = {
        accountId,
        subId,
        recurring,
        effectiveStart,
        effectiveEnd,
        status: "Active",
        submittedBy,
        submittedDate: now,
        lastEditedBy: "",
        lastEditedDate: "",
        frequency,
      };
      const records: SubScheduleRecord[] =
        frequency === "AS_NEEDED"
          ? [
              {
                ...baseRecord,
                sheetRow: -1,
                scheduleId: data.scheduleIds?.[0] ?? "",
                dayOfWeek: "",
                timeWindow: "",
                monthlyOccurrence: "",
              },
            ]
          : entries.map((entry, i) => ({
              ...baseRecord,
              sheetRow: -1,
              scheduleId: data.scheduleIds?.[i] ?? "",
              dayOfWeek: entry.dayOfWeek ?? "",
              timeWindow: entry.timeWindow ?? "",
              monthlyOccurrence: entry.monthlyOccurrence ?? "",
            }));
      onSaved(accountId, records);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
      <div>
        <p className="text-sm font-bold text-slate-700">How often do you service this account?</p>
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
            <p className="text-sm font-bold text-slate-700">
              Which day(s) do you service this account?
            </p>
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

      {frequency === "MONTHLY_1X" && (
        <div className="mt-4">
          <OccurrencePicker label="Which week and day?" value={occurrence1} onChange={setOccurrence1} />
        </div>
      )}

      {frequency === "MONTHLY_2X" && (
        <div className="mt-4 space-y-3">
          <OccurrencePicker label="First visit" value={occurrence1} onChange={setOccurrence1} />
          <OccurrencePicker label="Second visit" value={occurrence2} onChange={setOccurrence2} />
        </div>
      )}

      {frequency === "AS_NEEDED" && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
          No recurring days needed — the office will add visits for this account one at a time as they come up.
        </div>
      )}

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      {frequency ? (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="mt-4 w-full rounded-2xl bg-indigo-700 px-5 py-3 text-base font-black text-white shadow-sm hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Saving..." : "Submit Schedule"}
        </button>
      ) : null}
    </div>
  );
}

export default function SubScheduleTab({ accounts, subcontractor }: Props) {
  const [schedulesByAccount, setSchedulesByAccount] = useState<Record<string, SubScheduleRecord[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [expandedAccountId, setExpandedAccountId] = useState("");

  const subId = getSubId(subcontractor);
  const submittedBy = getSubDisplayName(subcontractor) || subId;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const res = await fetch("/api/subcontractor-schedules");
        const data = (await res.json()) as { schedules?: SubScheduleRecord[]; error?: string };
        if (!res.ok) {
          if (!cancelled) setLoadError(data.error ?? "Failed to load schedules.");
          return;
        }
        const grouped: Record<string, SubScheduleRecord[]> = {};
        for (const record of data.schedules ?? []) {
          const key = record.accountId.trim();
          if (!key) continue;
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(record);
        }
        if (!cancelled) setSchedulesByAccount(grouped);
      } catch {
        if (!cancelled) setLoadError("Network error loading schedules.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedAccounts = useMemo(() => {
    return [...accounts].sort((a, b) => getAccountName(a).localeCompare(getAccountName(b)));
  }, [accounts]);

  function handleSaved(accountId: string, records: SubScheduleRecord[]) {
    setSchedulesByAccount((prev) => ({ ...prev, [accountId]: records }));
    setExpandedAccountId("");
  }

  return (
    <section className="mt-5 rounded-3xl border border-indigo-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-black text-slate-900">My Schedule</h2>
      <p className="mt-1 text-sm leading-5 text-slate-600">
        Set up the recurring service schedule for each account you&apos;re assigned to. Once
        submitted, contact the office if anything needs to change.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading your schedules...</p>
      ) : null}

      {loadError ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {loadError}
        </div>
      ) : null}

      {!loading && !loadError && sortedAccounts.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No assigned accounts found.</p>
      ) : null}

      <div className="mt-4 space-y-3">
        {sortedAccounts.map((account) => {
          const accountId = getAccountId(account);
          const existing = schedulesByAccount[accountId];
          const hasSchedule = Boolean(existing && existing.length > 0);

          return (
            <div key={accountId || getAccountName(account)} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-base font-black text-slate-900">{getAccountName(account)}</p>
                  {getFullAddress(account) ? (
                    <p className="text-sm text-slate-500">{getFullAddress(account)}</p>
                  ) : null}
                </div>

                {hasSchedule ? (
                  <span className="inline-flex w-fit items-center rounded-full bg-green-100 px-3 py-1 text-xs font-black uppercase text-green-800">
                    Submitted
                  </span>
                ) : (
                  <span className="inline-flex w-fit items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase text-amber-800">
                    Not set
                  </span>
                )}
              </div>

              {hasSchedule ? (
                <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                    Submitted — contact admin for changes
                  </p>
                  <div className="mt-2 space-y-1">
                    {existing!.map((record, i) => (
                      <p key={i} className="text-sm text-slate-700">
                        {describeScheduleRecord(record)}
                      </p>
                    ))}
                  </div>
                </div>
              ) : expandedAccountId === accountId ? (
                <AccountScheduleForm
                  account={account}
                  subId={subId}
                  submittedBy={submittedBy}
                  onSaved={handleSaved}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setExpandedAccountId(accountId)}
                  className="mt-3 w-full rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-black text-indigo-800 hover:border-indigo-400 hover:bg-indigo-100"
                >
                  Set Your Schedule
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
