"use client";

import { useEffect, useMemo, useState } from "react";
import type { SubSchedule } from "./schedule-modal";
import type { SearchOption } from "./autocomplete";
import { generateScheduleDates, SCHEDULE_FREQUENCIES, type ScheduleFrequency } from "@/lib/scheduleRecurrence";

const FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: "Weekly",
  BIWEEKLY: "Every Other Week",
  MONTHLY_1X: "1x per Month",
  MONTHLY_2X: "2x per Month",
  AS_NEEDED: "As Needed",
};

const FREQUENCY_BADGE: Record<string, string> = {
  WEEKLY: "Weekly",
  BIWEEKLY: "Biweekly",
  MONTHLY_1X: "1x/mo",
  MONTHLY_2X: "2x/mo",
  AS_NEEDED: "As Needed",
};

const TIME_WINDOW_ORDER = ["Morning", "Midday", "Afternoon", "Evening"];
const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_MON_FIRST = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const VIEW_STORAGE_KEY = "cwAdminFullCalendarView";
type ViewMode = "month" | "week" | "agenda";

function getStoredView(): ViewMode {
  if (typeof window === "undefined") return "month";
  const v = window.localStorage.getItem(VIEW_STORAGE_KEY);
  return v === "month" || v === "week" || v === "agenda" ? v : "month";
}

function normalizeForMatch(value: string): string {
  return value.trim().toLowerCase();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function dayName(d: Date): string {
  return DAYS_MON_FIRST[(d.getDay() + 6) % 7];
}
function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}
function getMonday(base: Date): Date {
  const date = new Date(base);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}
function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

type Visit = {
  date: string;
  accountId: string;
  subId: string;
  timeWindow: string;
  frequency: string;
  scheduleId: string;
};

function sortVisits(visits: Visit[], resolveAccountName: (id: string) => string): Visit[] {
  return [...visits].sort((a, b) => {
    const timeDiff = TIME_WINDOW_ORDER.indexOf(a.timeWindow) - TIME_WINDOW_ORDER.indexOf(b.timeWindow);
    if (timeDiff !== 0) return timeDiff;
    return resolveAccountName(a.accountId).localeCompare(resolveAccountName(b.accountId));
  });
}

// ─── Multi-select filter dropdown, shared by all four filters ──────────────

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  searchable,
}: {
  label: string;
  options: { id: string; label: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const visibleOptions =
    searchable && query.trim()
      ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
      : options;

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
          selected.size > 0 ? "border-blue-400 bg-blue-50 text-blue-800" : "border-slate-300 bg-white text-slate-700"
        }`}
      >
        {label}
        {selected.size > 0 ? ` (${selected.size})` : ""}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 max-h-72 w-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
            {searchable && (
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                className="mb-2 w-full rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-blue-600"
              />
            )}
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => onChange(new Set())}
                className="mb-1 text-xs font-semibold text-blue-700 hover:underline"
              >
                Clear
              </button>
            )}
            {visibleOptions.length === 0 ? (
              <p className="px-1 py-1 text-sm text-slate-500">No matches.</p>
            ) : (
              visibleOptions.map((o) => (
                <label key={o.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-slate-50">
                  <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
                  <span className="truncate">{o.label}</span>
                </label>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Visit entry (a single scheduled account/sub pairing on a given day) ───

function VisitEntry({
  visit,
  resolveAccountName,
  resolveTeamLeaderName,
  onJumpToAccount,
}: {
  visit: Visit;
  resolveAccountName: (id: string) => string;
  resolveTeamLeaderName: (id: string) => string;
  onJumpToAccount: (accountId: string, accountLabel: string) => void;
}) {
  const accountName = resolveAccountName(visit.accountId);
  return (
    <button
      type="button"
      onClick={() => onJumpToAccount(visit.accountId, accountName)}
      className="block w-full truncate rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-left transition hover:border-indigo-400 hover:bg-indigo-100"
    >
      <p className="truncate text-xs font-black text-indigo-900">{accountName}</p>
      <p className="truncate text-[11px] text-indigo-700">
        {resolveTeamLeaderName(visit.subId)} · {visit.timeWindow || "—"}
      </p>
      <p className="text-[10px] font-bold uppercase text-indigo-500">
        {FREQUENCY_BADGE[visit.frequency] || visit.frequency}
      </p>
    </button>
  );
}

type Props = {
  accountOptions: SearchOption[];
  resolveAccountName: (accountId: string) => string;
  teamLeaderNamesById: Record<string, string>;
  resolveTeamLeaderName: (subId: string) => string;
  onJumpToAccount: (accountId: string, accountLabel: string) => void;
};

export default function FullCalendar({
  accountOptions,
  resolveAccountName,
  teamLeaderNamesById,
  resolveTeamLeaderName,
  onJumpToAccount,
}: Props) {
  const [schedules, setSchedules] = useState<SubSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [viewMode, setViewMode] = useState<ViewMode>("month");
  useEffect(() => {
    setViewMode(getStoredView());
  }, []);
  function handleViewChange(next: ViewMode) {
    setViewMode(next);
    if (typeof window !== "undefined") window.localStorage.setItem(VIEW_STORAGE_KEY, next);
  }

  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [weekOffset, setWeekOffset] = useState(0);

  const [selectedSubIds, setSelectedSubIds] = useState<Set<string>>(new Set());
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [selectedFrequencies, setSelectedFrequencies] = useState<Set<string>>(new Set());
  const [selectedManagers, setSelectedManagers] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/admin/sub-schedules");
        const data = (await res.json()) as { schedules?: SubSchedule[]; error?: string };
        if (!res.ok) {
          if (!cancelled) setError(data.error ?? "Failed to load schedules.");
          return;
        }
        if (!cancelled) setSchedules(data.schedules ?? []);
      } catch {
        if (!cancelled) setError("Network error loading schedules.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const accountManagerById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const option of accountOptions) map[option.id] = (option.manager || "").trim();
    return map;
  }, [accountOptions]);

  const managerOptions = useMemo(() => {
    const managers = new Set<string>();
    for (const option of accountOptions) {
      if (option.manager) managers.add(option.manager.trim());
    }
    return Array.from(managers).sort().map((m) => ({ id: m, label: m }));
  }, [accountOptions]);

  const subFilterOptions = useMemo(
    () => Object.entries(teamLeaderNamesById).map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label)),
    [teamLeaderNamesById]
  );

  const accountFilterOptions = useMemo(
    () => accountOptions.map((o) => ({ id: o.id, label: o.label })).sort((a, b) => a.label.localeCompare(b.label)),
    [accountOptions]
  );

  const frequencyFilterOptions = useMemo(
    () => SCHEDULE_FREQUENCIES.map((f: ScheduleFrequency) => ({ id: f, label: FREQUENCY_LABELS[f] })),
    []
  );

  const activeSchedules = useMemo(
    () => schedules.filter((s) => s.status.trim().toLowerCase() === "active"),
    [schedules]
  );

  const filteredSchedules = useMemo(() => {
    return activeSchedules.filter((s) => {
      if (selectedSubIds.size > 0 && !selectedSubIds.has(normalizeForMatch(s.subId))) return false;
      if (selectedAccountIds.size > 0 && !selectedAccountIds.has(s.accountId)) return false;
      if (selectedFrequencies.size > 0 && !selectedFrequencies.has(s.frequency)) return false;
      if (selectedManagers.size > 0 && !selectedManagers.has(accountManagerById[s.accountId] || "")) return false;
      return true;
    });
  }, [activeSchedules, selectedSubIds, selectedAccountIds, selectedFrequencies, selectedManagers, accountManagerById]);

  const asNeededSchedules = useMemo(
    () => filteredSchedules.filter((s) => s.frequency === "AS_NEEDED"),
    [filteredSchedules]
  );

  // Month and Agenda share the same calendar-month range; Week has its own
  // Monday-Sunday range, navigated independently (same pattern the
  // subcontractor-facing "My Calendar" week view already uses).
  const monthRangeStart = useMemo(() => new Date(year, month, 1), [year, month]);
  const monthRangeEnd = useMemo(() => new Date(year, month + 1, 0), [year, month]);

  const weekDates = useMemo(() => {
    const monday = addDays(getMonday(new Date()), weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }, [weekOffset]);

  const rangeStart = viewMode === "week" ? weekDates[0] : monthRangeStart;
  const rangeEnd = viewMode === "week" ? weekDates[6] : monthRangeEnd;

  const visitsByDate = useMemo(() => {
    const byDate: Record<string, Visit[]> = {};
    for (const s of filteredSchedules) {
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
      for (const date of dates) {
        if (!byDate[date]) byDate[date] = [];
        byDate[date].push({
          date,
          accountId: s.accountId,
          subId: s.subId,
          timeWindow: s.timeWindow,
          frequency: s.frequency,
          scheduleId: s.scheduleId,
        });
      }
    }
    for (const date of Object.keys(byDate)) {
      byDate[date] = sortVisits(byDate[date], resolveAccountName);
    }
    return byDate;
  }, [filteredSchedules, rangeStart, rangeEnd, resolveAccountName]);

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  }
  function goToday() {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    setWeekOffset(0);
  }

  const todayISO = toISO(new Date());

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <MultiSelectFilter label="Subcontractor" options={subFilterOptions} selected={selectedSubIds} onChange={setSelectedSubIds} searchable />
        <MultiSelectFilter label="Account" options={accountFilterOptions} selected={selectedAccountIds} onChange={setSelectedAccountIds} searchable />
        <MultiSelectFilter label="Frequency" options={frequencyFilterOptions} selected={selectedFrequencies} onChange={setSelectedFrequencies} />
        <MultiSelectFilter label="Manager" options={managerOptions} selected={selectedManagers} onChange={setSelectedManagers} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {([
            { id: "month" as const, label: "Month" },
            { id: "week" as const, label: "Week" },
            { id: "agenda" as const, label: "Agenda" },
          ]).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => handleViewChange(id)}
              className={`rounded-full px-4 py-1.5 text-sm font-black transition ${
                viewMode === id ? "bg-blue-700 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={viewMode === "week" ? () => setWeekOffset((w) => w - 1) : prevMonth}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            ‹ Prev
          </button>
          <button
            type="button"
            onClick={goToday}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-black uppercase text-slate-500 hover:bg-slate-50"
          >
            Today
          </button>
          <button
            type="button"
            onClick={viewMode === "week" ? () => setWeekOffset((w) => w + 1) : nextMonth}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            Next ›
          </button>
          <p className="ml-1 text-sm font-black text-slate-900">
            {viewMode === "week"
              ? `${formatDateLabel(toISO(weekDates[0]))} – ${formatDateLabel(toISO(weekDates[6]))}`
              : `${MONTH_NAMES[month]} ${year}`}
          </p>
        </div>
      </div>

      {loading ? (
        <p className="mt-5 text-sm text-slate-600">Loading calendar...</p>
      ) : error ? (
        <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>
      ) : (
        <>
          <div className="mt-5">
            {viewMode === "month" && (
              <MonthGrid
                year={year}
                month={month}
                todayISO={todayISO}
                visitsByDate={visitsByDate}
                resolveAccountName={resolveAccountName}
                resolveTeamLeaderName={resolveTeamLeaderName}
                onJumpToAccount={onJumpToAccount}
              />
            )}
            {viewMode === "week" && (
              <WeekGrid
                weekDates={weekDates}
                todayISO={todayISO}
                visitsByDate={visitsByDate}
                resolveAccountName={resolveAccountName}
                resolveTeamLeaderName={resolveTeamLeaderName}
                onJumpToAccount={onJumpToAccount}
              />
            )}
            {viewMode === "agenda" && (
              <AgendaList
                visitsByDate={visitsByDate}
                resolveAccountName={resolveAccountName}
                resolveTeamLeaderName={resolveTeamLeaderName}
                onJumpToAccount={onJumpToAccount}
              />
            )}
          </div>

          {asNeededSchedules.length > 0 && (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-amber-700">
                As Needed — no fixed dates, add visits manually via Schedule Exceptions
              </p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {asNeededSchedules.map((s) => (
                  <button
                    key={s.scheduleId}
                    type="button"
                    onClick={() => onJumpToAccount(s.accountId, resolveAccountName(s.accountId))}
                    className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-left text-sm hover:border-amber-500"
                  >
                    <p className="font-black text-slate-900">{resolveAccountName(s.accountId)}</p>
                    <p className="text-xs text-slate-500">{resolveTeamLeaderName(s.subId)}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Month grid ──────────────────────────────────────────────────────────

function MonthGrid({
  year,
  month,
  todayISO,
  visitsByDate,
  resolveAccountName,
  resolveTeamLeaderName,
  onJumpToAccount,
}: {
  year: number;
  month: number;
  todayISO: string;
  visitsByDate: Record<string, Visit[]>;
  resolveAccountName: (id: string) => string;
  resolveTeamLeaderName: (id: string) => string;
  onJumpToAccount: (accountId: string, accountLabel: string) => void;
}) {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstDow + daysInMonth) / 7) * 7;
  const cells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ...Array<null>(totalCells - firstDow - daysInMonth).fill(null),
  ];

  function dateStr(day: number): string {
    return `${year}-${pad(month + 1)}-${pad(day)}`;
  }

  return (
    <div>
      <div className="grid grid-cols-7 gap-1">
        {DOW_NAMES.map((d) => (
          <div key={d} className="py-1 text-center text-[10px] font-black uppercase tracking-wide text-slate-400">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} className="min-h-[6rem] rounded-lg" />;
          const ds = dateStr(day);
          const isToday = ds === todayISO;
          const visits = visitsByDate[ds] ?? [];
          return (
            <div
              key={idx}
              className={`min-h-[6rem] rounded-lg border p-1.5 ${isToday ? "border-blue-400 bg-blue-50/40" : "border-slate-200 bg-white"}`}
            >
              <p className="text-xs font-black text-slate-500">{day}</p>
              <div className="mt-1 space-y-1">
                {visits.map((v, i) => (
                  <VisitEntry
                    key={`${v.scheduleId}-${i}`}
                    visit={v}
                    resolveAccountName={resolveAccountName}
                    resolveTeamLeaderName={resolveTeamLeaderName}
                    onJumpToAccount={onJumpToAccount}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Week grid ───────────────────────────────────────────────────────────

function WeekGrid({
  weekDates,
  todayISO,
  visitsByDate,
  resolveAccountName,
  resolveTeamLeaderName,
  onJumpToAccount,
}: {
  weekDates: Date[];
  todayISO: string;
  visitsByDate: Record<string, Visit[]>;
  resolveAccountName: (id: string) => string;
  resolveTeamLeaderName: (id: string) => string;
  onJumpToAccount: (accountId: string, accountLabel: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-7">
      {weekDates.map((d) => {
        const ds = toISO(d);
        const isToday = ds === todayISO;
        const visits = visitsByDate[ds] ?? [];
        return (
          <div key={ds} className={`rounded-2xl border p-3 ${isToday ? "border-blue-400 bg-blue-50/40" : "border-slate-200 bg-white"}`}>
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">{dayName(d)}</p>
            <p className="text-sm font-bold text-slate-800">{formatDateLabel(ds)}</p>
            <div className="mt-2 space-y-1.5">
              {visits.length === 0 ? (
                <p className="text-xs text-slate-400">No visits</p>
              ) : (
                visits.map((v, i) => (
                  <VisitEntry
                    key={`${v.scheduleId}-${i}`}
                    visit={v}
                    resolveAccountName={resolveAccountName}
                    resolveTeamLeaderName={resolveTeamLeaderName}
                    onJumpToAccount={onJumpToAccount}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Agenda / list view ──────────────────────────────────────────────────

function AgendaList({
  visitsByDate,
  resolveAccountName,
  resolveTeamLeaderName,
  onJumpToAccount,
}: {
  visitsByDate: Record<string, Visit[]>;
  resolveAccountName: (id: string) => string;
  resolveTeamLeaderName: (id: string) => string;
  onJumpToAccount: (accountId: string, accountLabel: string) => void;
}) {
  const sortedDates = Object.keys(visitsByDate).sort();

  if (sortedDates.length === 0) {
    return <p className="text-sm text-slate-600">No visits in this range.</p>;
  }

  return (
    <div className="space-y-4">
      {sortedDates.map((ds) => (
        <div key={ds}>
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">{formatDateLabel(ds)}</p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {visitsByDate[ds].map((v, i) => (
              <VisitEntry
                key={`${v.scheduleId}-${i}`}
                visit={v}
                resolveAccountName={resolveAccountName}
                resolveTeamLeaderName={resolveTeamLeaderName}
                onJumpToAccount={onJumpToAccount}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
