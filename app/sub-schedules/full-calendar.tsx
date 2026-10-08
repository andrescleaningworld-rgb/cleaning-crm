"use client";

import { useEffect, useMemo, useState } from "react";
import type { SubSchedule } from "./schedule-modal";
import type { SearchOption } from "./autocomplete";
import {
  generateScheduleDates,
  isScheduleEffectivelyActive,
  todayISO as scheduleTodayISO,
  SCHEDULE_FREQUENCIES,
  type ScheduleFrequency,
} from "@/lib/scheduleRecurrence";
import { BigButton, Card, EmptyState, ErrorBox, FilterChips, SearchBar, Sheet, SkeletonList } from "@/app/ui";

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
    <>
      <BigButton kind="second" onClick={() => setOpen(true)}>
        {selected.size > 0 ? `${label} (${selected.size})` : label}
      </BigButton>

      <Sheet
        open={open}
        title={label}
        text="Tick the ones to show. With none ticked, everything shows."
        onClose={() => setOpen(false)}
        closeLabel="Done"
      >
        {searchable ? <SearchBar value={query} onChange={setQuery} label={`Search ${label}`} placeholder="Search" /> : null}
        {selected.size > 0 ? (
          <div>
            <BigButton kind="quiet" onClick={() => onChange(new Set())}>
              Clear ({selected.size})
            </BigButton>
          </div>
        ) : null}
        {visibleOptions.length === 0 ? (
          <p className="ui-muted">No matches.</p>
        ) : (
          <div className="ui-checks">
            {visibleOptions.map((o) => (
              <label key={o.id} className="ui-check">
                <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
                <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{o.label}</span>
              </label>
            ))}
          </div>
        )}
      </Sheet>
    </>
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
    <button type="button" onClick={() => onJumpToAccount(visit.accountId, accountName)} className="ui-visit">
      <span className="ui-strong">{accountName}</span>
      <span>
        {resolveTeamLeaderName(visit.subId)} · {visit.timeWindow || "No time window"}
      </span>
      <span className="ui-muted">{FREQUENCY_BADGE[visit.frequency] || visit.frequency}</span>
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

  const activeSchedules = useMemo(() => {
    const asOfToday = scheduleTodayISO();
    return schedules.filter((s) => isScheduleEffectivelyActive(s, asOfToday));
  }, [schedules]);

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

  const gridProps = { visitsByDate, resolveAccountName, resolveTeamLeaderName, onJumpToAccount };

  return (
    <>
      <div className="ui-actions-row">
        <MultiSelectFilter label="Subcontractor" options={subFilterOptions} selected={selectedSubIds} onChange={setSelectedSubIds} searchable />
        <MultiSelectFilter label="Account" options={accountFilterOptions} selected={selectedAccountIds} onChange={setSelectedAccountIds} searchable />
        <MultiSelectFilter label="Frequency" options={frequencyFilterOptions} selected={selectedFrequencies} onChange={setSelectedFrequencies} />
        <MultiSelectFilter label="Manager" options={managerOptions} selected={selectedManagers} onChange={setSelectedManagers} />
      </div>

      <FilterChips
        label="Calendar view"
        options={[
          { value: "month", label: "Month" },
          { value: "week", label: "Week" },
          { value: "agenda", label: "Agenda" },
        ]}
        value={viewMode}
        onChange={handleViewChange}
      />

      <div className="ui-actions-row">
        <BigButton kind="second" onClick={viewMode === "week" ? () => setWeekOffset((w) => w - 1) : prevMonth}>
          ‹ Prev
        </BigButton>
        <BigButton kind="second" onClick={goToday}>
          Today
        </BigButton>
        <BigButton kind="second" onClick={viewMode === "week" ? () => setWeekOffset((w) => w + 1) : nextMonth}>
          Next ›
        </BigButton>
      </div>
      <p className="ui-strong" role="status">
        {viewMode === "week"
          ? `${formatDateLabel(toISO(weekDates[0]))} – ${formatDateLabel(toISO(weekDates[6]))}`
          : `${MONTH_NAMES[month]} ${year}`}
      </p>

      {loading ? (
        <SkeletonList rows={3} />
      ) : error ? (
        <ErrorBox title="The calendar did not load." text={error} />
      ) : (
        <>
          {viewMode === "month" && (
            <>
              {/* A 7-column month does not fit a phone: there the same month shows as a day-by-day list. */}
              <div className="ui-wide-only">
                <MonthGrid year={year} month={month} todayISO={todayISO} {...gridProps} />
              </div>
              <div className="ui-narrow-only">
                <AgendaList {...gridProps} />
              </div>
            </>
          )}
          {viewMode === "week" && <WeekGrid weekDates={weekDates} todayISO={todayISO} {...gridProps} />}
          {viewMode === "agenda" && <AgendaList {...gridProps} />}

          {asNeededSchedules.length > 0 && (
            <Card title="As Needed">
              <p className="ui-card-text">No fixed dates. Add visits one at a time with Schedule Exceptions.</p>
              <div className="ui-three" style={{ marginTop: 12 }}>
                {asNeededSchedules.map((s) => (
                  <button key={s.scheduleId} type="button" onClick={() => onJumpToAccount(s.accountId, resolveAccountName(s.accountId))} className="ui-visit">
                    <span className="ui-strong">{resolveAccountName(s.accountId)}</span>
                    <span>{resolveTeamLeaderName(s.subId)}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </>
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
      <div className="ui-cal-grid" aria-hidden="true">
        {DOW_NAMES.map((d) => (
          <div key={d} className="ui-cal-dow">
            {d}
          </div>
        ))}
      </div>
      <div className="ui-cal-grid">
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} />;
          const ds = dateStr(day);
          const isToday = ds === todayISO;
          const visits = visitsByDate[ds] ?? [];
          return (
            <div key={idx} className={isToday ? "ui-cal-cell ui-cal-cell-today" : "ui-cal-cell"}>
              <p className="ui-strong">
                {day}
                {isToday ? " · Today" : ""}
              </p>
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
    <div className="ui-week">
      {weekDates.map((d) => {
        const ds = toISO(d);
        const isToday = ds === todayISO;
        const visits = visitsByDate[ds] ?? [];
        return (
          <div key={ds} className={isToday ? "ui-cal-cell ui-cal-cell-today" : "ui-cal-cell"}>
            <p className="ui-strong">
              {dayName(d)}
              {isToday ? " · Today" : ""}
            </p>
            <p className="ui-muted">{formatDateLabel(ds)}</p>
            {visits.length === 0 ? (
              <p className="ui-muted">No visits</p>
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
    return <EmptyState title="No visits in this range" text="Try another month, or clear the filters." />;
  }

  return (
    <>
      {sortedDates.map((ds) => (
        <div key={ds}>
          <p className="ui-strong">{formatDateLabel(ds)}</p>
          <div className="ui-three" style={{ marginTop: 8, gap: 8 }}>
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
    </>
  );
}
