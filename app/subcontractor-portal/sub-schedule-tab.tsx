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
};

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

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function yearEndISO(): string {
  return `${new Date().getFullYear()}-12-31`;
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
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [dayWindows, setDayWindows] = useState<Record<string, string>>({});
  const [recurringChoice, setRecurringChoice] = useState<"Y" | "N" | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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
    setRecurringChoice("");
  }

  function setWindowForDay(day: string, windowId: string) {
    setDayWindows((prev) => ({ ...prev, [day]: windowId }));
  }

  const allDaysHaveWindows =
    selectedDays.length > 0 && selectedDays.every((day) => Boolean(dayWindows[day]));

  const canSubmit = allDaysHaveWindows && recurringChoice !== "" && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");

    const accountId = getAccountId(account);
    const effectiveStart = recurringChoice === "Y" ? todayISO() : "";
    const effectiveEnd = recurringChoice === "Y" ? yearEndISO() : "";

    try {
      const res = await fetch("/api/subcontractor-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          subId,
          submittedBy,
          recurring: recurringChoice,
          effectiveStart,
          effectiveEnd,
          entries: selectedDays.map((day) => ({ dayOfWeek: day, timeWindow: dayWindows[day] })),
        }),
      });
      const data = (await res.json()) as { success?: boolean; scheduleIds?: string[]; error?: string };
      if (!res.ok || !data.success) {
        setError(data.error ?? "Failed to save schedule. Please try again.");
        return;
      }

      const now = new Date().toISOString();
      const records: SubScheduleRecord[] = selectedDays.map((day, i) => ({
        sheetRow: -1,
        scheduleId: data.scheduleIds?.[i] ?? "",
        accountId,
        subId,
        dayOfWeek: day,
        timeWindow: dayWindows[day],
        recurring: recurringChoice,
        effectiveStart,
        effectiveEnd,
        status: "Active",
        submittedBy,
        submittedDate: now,
        lastEditedBy: "",
        lastEditedDate: "",
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

      {allDaysHaveWindows && (
        <div className="mt-4">
          <p className="text-sm font-bold text-slate-700">
            Do you service this account on these days every week?
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRecurringChoice("Y")}
              className={`rounded-2xl border px-4 py-3 text-center text-sm font-black transition ${
                recurringChoice === "Y"
                  ? "border-indigo-500 bg-indigo-600 text-white ring-2 ring-indigo-200"
                  : "border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-100"
              }`}
            >
              Yes, every week
            </button>
            <button
              type="button"
              onClick={() => setRecurringChoice("N")}
              className={`rounded-2xl border px-4 py-3 text-center text-sm font-black transition ${
                recurringChoice === "N"
                  ? "border-indigo-500 bg-indigo-600 text-white ring-2 ring-indigo-200"
                  : "border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-100"
              }`}
            >
              No, just this time
            </button>
          </div>
        </div>
      )}

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="mt-4 w-full rounded-2xl bg-indigo-700 px-5 py-3 text-base font-black text-white shadow-sm hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Saving..." : "Submit Schedule"}
      </button>
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
                        <span className="font-bold">{record.dayOfWeek}</span> — {record.timeWindow}
                        {record.recurring === "Y" ? " (every week)" : " (one-time)"}
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
