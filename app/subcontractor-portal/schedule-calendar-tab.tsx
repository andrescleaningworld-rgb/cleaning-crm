"use client";

import { useEffect, useMemo, useState } from "react";
import { generateScheduleDates } from "@/lib/scheduleRecurrence";

type ScheduleAccount = {
  id?: string;
  accountId?: string;
  accountName?: string;
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

type SubSchedule = {
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
  frequency: string;
  monthlyOccurrence: string;
};

type ScheduleException = {
  sheetRow: number;
  exceptionId: string;
  accountId: string;
  originalDate: string;
  type: string;
  newDate: string;
  newTimeWindow: string;
  reason: string;
};

type Occurrence = {
  accountId: string;
  timeWindow: string;
  kind: "recurring" | "oneoff" | "rescheduled-in";
  note?: string;
};

type Props = {
  accounts: ScheduleAccount[];
  subcontractor: ScheduleSubcontractor | null;
};

const DAYS_MON_FIRST = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TIME_WINDOW_ORDER = ["Morning", "Midday", "Afternoon", "Evening"];

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function getAccountId(account: ScheduleAccount): string {
  return cleanText(account.accountId || account.id || account.accountName);
}

function getAccountName(account: ScheduleAccount): string {
  return cleanText(account.accountName) || "Unnamed Account";
}

function getSubId(sub: ScheduleSubcontractor | null): string {
  if (!sub) return "";
  return cleanText(sub.email || sub.id || sub.subcontractorId);
}

function getMonday(base: Date): Date {
  const date = new Date(base);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(base: Date, n: number): Date {
  const date = new Date(base);
  date.setDate(date.getDate() + n);
  return date;
}

function toISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayName(d: Date): string {
  return DAYS_MON_FIRST[(d.getDay() + 6) % 7];
}

function formatDateLabel(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const KIND_STYLE: Record<Occurrence["kind"], string> = {
  recurring: "border-indigo-200 bg-indigo-50 text-indigo-900",
  oneoff: "border-amber-200 bg-amber-50 text-amber-900",
  "rescheduled-in": "border-purple-200 bg-purple-50 text-purple-900",
};

export default function ScheduleCalendarTab({ accounts, subcontractor }: Props) {
  const [schedules, setSchedules] = useState<SubSchedule[]>([]);
  const [exceptions, setExceptions] = useState<ScheduleException[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [weekOffset, setWeekOffset] = useState(0);

  const subId = getSubId(subcontractor);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [scheduleRes, exceptionRes] = await Promise.all([
          fetch("/api/subcontractor-schedules"),
          fetch("/api/subcontractor-schedule-exceptions"),
        ]);
        const scheduleData = (await scheduleRes.json()) as { schedules?: SubSchedule[]; error?: string };
        const exceptionData = (await exceptionRes.json()) as { exceptions?: ScheduleException[]; error?: string };

        if (!scheduleRes.ok || !exceptionRes.ok) {
          if (!cancelled) {
            setError(scheduleData.error ?? exceptionData.error ?? "Failed to load calendar.");
          }
          return;
        }
        if (!cancelled) {
          setSchedules(scheduleData.schedules ?? []);
          setExceptions(exceptionData.exceptions ?? []);
        }
      } catch {
        if (!cancelled) setError("Network error loading calendar.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const accountNameById = useMemo(() => {
    const map = new Map<string, string>();
    accounts.forEach((a) => map.set(getAccountId(a), getAccountName(a)));
    return map;
  }, [accounts]);

  function nameFor(accountId: string): string {
    return accountNameById.get(accountId) || accountId || "Unknown Account";
  }

  const mySchedules = useMemo(() => {
    const subIdLower = subId.trim().toLowerCase();
    return schedules.filter(
      (s) => s.subId.trim().toLowerCase() === subIdLower && s.status.trim().toLowerCase() === "active"
    );
  }, [schedules, subId]);

  const myExceptions = useMemo(() => {
    const myAccountIds = new Set(mySchedules.map((s) => s.accountId));
    return exceptions.filter((e) => myAccountIds.has(e.accountId));
  }, [exceptions, mySchedules]);

  const weekDates = useMemo(() => {
    const monday = addDays(getMonday(new Date()), weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }, [weekOffset]);

  const todayISO = toISO(new Date());

  const { occurrencesByDate, notesByDate } = useMemo(() => {
    const occByDate: Record<string, Occurrence[]> = {};
    const notes: Record<string, string[]> = {};
    weekDates.forEach((d) => {
      occByDate[toISO(d)] = [];
      notes[toISO(d)] = [];
    });

    function findException(accountId: string, date: string) {
      return myExceptions.find((e) => e.accountId === accountId && e.originalDate === date);
    }

    function handleCandidate(schedule: SubSchedule, date: string, kind: "recurring" | "oneoff") {
      const ex = findException(schedule.accountId, date);
      if (ex && ex.type === "Skip") {
        notes[date].push(`Skipped: ${nameFor(schedule.accountId)}${ex.reason ? ` — ${ex.reason}` : ""}`);
      } else if (ex && ex.type === "Reschedule") {
        notes[date].push(`Moved: ${nameFor(schedule.accountId)} → ${formatDateLabel(ex.newDate)}`);
      } else {
        occByDate[date].push({ accountId: schedule.accountId, timeWindow: schedule.timeWindow, kind });
      }
    }

    const rangeStart = weekDates[0];
    const rangeEnd = weekDates[weekDates.length - 1];

    mySchedules.forEach((s) => {
      const dates = generateScheduleDates(
        {
          frequency: s.frequency,
          dayOfWeek: s.dayOfWeek,
          monthlyOccurrence: s.monthlyOccurrence,
          effectiveStart: s.effectiveStart,
          effectiveEnd: s.effectiveEnd,
        },
        rangeStart,
        rangeEnd
      );
      dates.forEach((iso) => handleCandidate(s, iso, "recurring"));
    });

    // Backward-compat: rows migrated from the old "One Time" option
    // (Frequency=AS_NEEDED but still carrying a legacy DayOfWeek from
    // before ScheduleExceptions existed for that account) show as an
    // informational one-off badge for the current week only, same as
    // before this migration. New AS_NEEDED submissions never set
    // DayOfWeek, so this fades out naturally as those rows get replaced
    // by real exceptions.
    if (weekOffset === 0) {
      mySchedules
        .filter((s) => s.frequency === "AS_NEEDED" && s.dayOfWeek)
        .forEach((s) => {
          weekDates.forEach((d) => {
            if (dayName(d) !== s.dayOfWeek) return;
            handleCandidate(s, toISO(d), "oneoff");
          });
        });
    }

    myExceptions
      .filter((e) => e.type === "Reschedule" && e.newDate && occByDate[e.newDate] !== undefined)
      .forEach((e) => {
        occByDate[e.newDate].push({
          accountId: e.accountId,
          timeWindow: e.newTimeWindow || "Unspecified",
          kind: "rescheduled-in",
          note: `from ${formatDateLabel(e.originalDate)}`,
        });
      });

    Object.values(occByDate).forEach((list) => {
      list.sort((a, b) => TIME_WINDOW_ORDER.indexOf(a.timeWindow) - TIME_WINDOW_ORDER.indexOf(b.timeWindow));
    });

    return { occurrencesByDate: occByDate, notesByDate: notes };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekDates, mySchedules, myExceptions, weekOffset, todayISO]);

  const weekLabel = `${formatDateLabel(toISO(weekDates[0]))} – ${formatDateLabel(toISO(weekDates[6]))}`;

  return (
    <section className="mt-5 rounded-3xl border border-indigo-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900">My Calendar</h2>
          <p className="mt-1 text-sm leading-5 text-slate-600">
            Read-only view of your accounts by day. Contact the office for any changes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w - 1)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
          >
            ← Prev
          </button>
          <button
            type="button"
            onClick={() => setWeekOffset(0)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase text-slate-500 hover:bg-slate-50"
          >
            This Week
          </button>
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w + 1)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
          >
            Next →
          </button>
        </div>
      </div>

      <p className="mt-3 text-sm font-bold text-slate-700">Week of {weekLabel}</p>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading your calendar...</p>
      ) : error ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-7">
          {weekDates.map((d) => {
            const dateKey = toISO(d);
            const isToday = dateKey === todayISO;
            const occurrences = occurrencesByDate[dateKey] ?? [];
            const notes = notesByDate[dateKey] ?? [];

            return (
              <div
                key={dateKey}
                className={`rounded-2xl border p-3 ${
                  isToday ? "border-indigo-400 bg-indigo-50/40" : "border-slate-200 bg-white"
                }`}
              >
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">{dayName(d)}</p>
                <p className="text-sm font-bold text-slate-800">{formatDateLabel(dateKey)}</p>

                <div className="mt-2 space-y-1.5">
                  {occurrences.length === 0 ? (
                    <p className="text-xs text-slate-400">No accounts</p>
                  ) : (
                    occurrences.map((occ, i) => (
                      <div key={i} className={`rounded-xl border px-2 py-1.5 ${KIND_STYLE[occ.kind]}`}>
                        <p className="text-xs font-black">{nameFor(occ.accountId)}</p>
                        <p className="text-[11px] font-semibold">{occ.timeWindow}</p>
                        {occ.kind === "oneoff" && (
                          <p className="mt-0.5 text-[10px] font-bold uppercase text-amber-700">
                            One-off, unconfirmed — check with admin
                          </p>
                        )}
                        {occ.kind === "rescheduled-in" && (
                          <p className="mt-0.5 text-[10px] font-bold uppercase text-purple-700">
                            Rescheduled {occ.note}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {notes.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                    {notes.map((note, i) => (
                      <p key={i} className="text-[11px] text-slate-500">
                        {note}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
