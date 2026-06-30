"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Visit = {
  id?: string;
  accountId?: string;
  accountName?: string;
  date?: string;
  visitType?: string;
  manager?: string;
  subcontractor?: string;
  condition?: string | number;
  followUpNeeded?: string;
  followUpDate?: string;
  notes?: string;
};

type VisitsApiResponse = {
  success?: boolean;
  error?: string;
  visits?: Visit[];
  data?: Visit[];
};

const DOW_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function toISODate(value: unknown): string {
  const text = clean(value);
  if (!text) return "";
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDate(value: unknown): string {
  const text = clean(value);
  if (!text) return "-";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateShort(value: unknown): string {
  const text = clean(value);
  if (!text) return "-";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function deriveStatus(visit: Visit): "Visited" | "Scheduled" | "Missed" {
  const iso = toISODate(visit.date);
  if (!iso) return "Visited";
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  if (iso > todayStr) return "Scheduled";
  if (clean(visit.condition)) return "Visited";
  return "Missed";
}

function getConditionClass(value: unknown): string {
  const score = Number(value);
  if (Number.isNaN(score))
    return "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600";
  if (score >= 9) return "rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700";
  if (score >= 8) return "rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700";
  if (score >= 7) return "rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-bold text-yellow-800";
  return "rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700";
}

function getStatusClass(status: string): string {
  if (status === "Visited")   return "rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700";
  if (status === "Scheduled") return "rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700";
  return "rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700";
}

function getLoadedVisits(data: VisitsApiResponse | Visit[]): Visit[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.visits)) return data.visits;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

export default function SchedulePage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Calendar display state — init client-side to avoid SSR mismatch
  const [calYear, setCalYear] = useState(0);
  const [calMonth, setCalMonth] = useState(0);
  const [todayStr, setTodayStr] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [filterSub, setFilterSub] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // Selected day for the side panel / modal
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    setCalYear(now.getFullYear());
    setCalMonth(now.getMonth());
    setTodayStr(
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    );
  }, []);

  useEffect(() => {
    async function loadVisits() {
      try {
        setLoading(true);
        setError("");
        const response = await fetch("/api/visits", { method: "GET", cache: "no-store" });
        const text = await response.text();
        let data: VisitsApiResponse | Visit[];
        try {
          data = JSON.parse(text) as VisitsApiResponse | Visit[];
        } catch {
          throw new Error("Visits API did not return valid JSON.");
        }
        if (!response.ok || (!Array.isArray(data) && data.success === false)) {
          throw new Error(
            !Array.isArray(data) && data.error ? data.error : "Failed to load visits."
          );
        }
        setVisits(getLoadedVisits(data));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error loading visits.");
      } finally {
        setLoading(false);
      }
    }
    void loadVisits();
  }, []);

  const uniqueSubs = useMemo(
    () => [...new Set(visits.map((v) => clean(v.subcontractor)).filter(Boolean))].sort(),
    [visits]
  );

  const monthStr = calYear ? `${calYear}-${pad(calMonth + 1)}` : "";

  // Count visits per day for the current month, respecting filters
  const visitCountByDay = useMemo(() => {
    const counts = new Map<string, number>();
    const term = search.toLowerCase().trim();
    visits.forEach((v) => {
      if (term && !clean(v.accountName).toLowerCase().includes(term)) return;
      if (filterSub && clean(v.subcontractor) !== filterSub) return;
      if (filterStatus && deriveStatus(v) !== filterStatus) return;
      const iso = toISODate(v.date);
      if (monthStr && iso.startsWith(monthStr)) {
        counts.set(iso, (counts.get(iso) ?? 0) + 1);
      }
    });
    return counts;
  }, [visits, monthStr, search, filterSub, filterStatus]);

  // Build calendar grid
  const firstDow = calYear ? new Date(calYear, calMonth, 1).getDay() : 0;
  const daysInMonth = calYear ? new Date(calYear, calMonth + 1, 0).getDate() : 31;
  const totalCells = Math.ceil((firstDow + daysInMonth) / 7) * 7;
  const calCells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ...Array<null>(totalCells - firstDow - daysInMonth).fill(null),
  ];

  function dayStr(day: number) {
    return `${calYear}-${pad(calMonth + 1)}-${pad(day)}`;
  }

  function prevMonth() {
    if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11); }
    else setCalMonth((m) => m - 1);
    setSelectedDay(null);
  }

  function nextMonth() {
    if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0); }
    else setCalMonth((m) => m + 1);
    setSelectedDay(null);
  }

  function goToToday() {
    const now = new Date();
    setCalYear(now.getFullYear());
    setCalMonth(now.getMonth());
    setSelectedDay(null);
  }

  // Visits for the currently selected day
  const selectedDayVisits = useMemo(() => {
    if (!selectedDay) return [];
    const term = search.toLowerCase().trim();
    return visits.filter((v) => {
      if (toISODate(v.date) !== selectedDay) return false;
      if (term && !clean(v.accountName).toLowerCase().includes(term)) return false;
      if (filterSub && clean(v.subcontractor) !== filterSub) return false;
      if (filterStatus && deriveStatus(v) !== filterStatus) return false;
      return true;
    });
  }, [visits, selectedDay, search, filterSub, filterStatus]);

  // Total visits this month (filtered)
  const monthTotal = useMemo(
    () => [...visitCountByDay.values()].reduce((a, b) => a + b, 0),
    [visitCountByDay]
  );

  const hasFilters = !!(search || filterSub || filterStatus);

  function clearFilters() {
    setSearch("");
    setFilterSub("");
    setFilterStatus("");
  }

  const isCurrentMonth =
    calYear === new Date().getFullYear() && calMonth === new Date().getMonth();

  // Day-panel visit card
  function VisitCard({ visit }: { visit: Visit }) {
    const status = deriveStatus(visit);
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-black text-slate-900">
              {clean(visit.accountName) || "—"}
            </p>
            {clean(visit.visitType) ? (
              <p className="mt-0.5 text-xs font-semibold text-slate-500">
                {clean(visit.visitType)}
              </p>
            ) : null}
          </div>
          <span className={getStatusClass(status)}>{status}</span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {clean(visit.subcontractor) ? (
            <span className="rounded-full bg-white border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700">
              {clean(visit.subcontractor)}
            </span>
          ) : null}
          {clean(visit.manager) ? (
            <span className="rounded-full bg-white border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600">
              Mgr: {clean(visit.manager)}
            </span>
          ) : null}
          {clean(visit.condition) ? (
            <span className={getConditionClass(visit.condition)}>
              Score: {clean(visit.condition)}
            </span>
          ) : null}
        </div>

        {clean(visit.notes) ? (
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
            {clean(visit.notes)}
          </p>
        ) : null}
      </div>
    );
  }

  // Side panel / modal content
  function DayPanelContent() {
    const dowIdx = selectedDay ? new Date(selectedDay + "T12:00:00").getDay() : 0;
    return (
      <div className="flex h-full flex-col">
        {/* Panel header */}
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-blue-700">
                {selectedDay ? DOW_LONG[dowIdx] : ""}
              </p>
              <p className="mt-1 text-lg font-black text-slate-950">
                {selectedDay ? formatDateShort(selectedDay) : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDay(null)}
              className="rounded-full bg-slate-100 p-1.5 text-slate-500 hover:bg-slate-200"
              aria-label="Close"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            {selectedDayVisits.length} visit{selectedDayVisits.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Visit list */}
        <div className="flex-1 overflow-y-auto p-4">
          {selectedDayVisits.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <p className="text-3xl">📋</p>
              <p className="mt-2 text-sm font-semibold text-slate-500">No visits on this day</p>
              <Link
                href="/visits/new"
                className="mt-4 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
              >
                + Schedule a Visit
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {selectedDayVisits.map((visit, i) => (
                <VisitCard key={visit.id ?? i} visit={visit} />
              ))}
            </div>
          )}
        </div>

        {selectedDayVisits.length > 0 ? (
          <div className="border-t border-slate-100 px-5 py-3">
            <Link
              href="/visits/new"
              className="block w-full rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-bold text-white hover:bg-blue-700"
            >
              + Add Visit for This Day
            </Link>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-6">
      {/* Page header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-blue-700">
            Cleaning World
          </p>
          <h1 className="mt-1 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
            Schedule
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Monthly visit calendar — click any day to see that day&apos;s visits.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 sm:flex-shrink-0">
          {!isCurrentMonth && (
            <button
              type="button"
              onClick={goToToday}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Today
            </button>
          )}
          <Link
            href="/visits/new"
            className="rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-bold text-white shadow-sm hover:bg-blue-700 no-underline"
          >
            + Add Visit
          </Link>
          <Link
            href="/visits"
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 no-underline"
          >
            List View →
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Loading schedule…</p>
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-6 font-bold text-red-700 shadow-sm">
          {error}
        </div>
      ) : (
        <>
          {/* Month stat pill */}
          <div className="mb-4 flex flex-wrap gap-3">
            <div className="rounded-2xl border border-blue-100 bg-white px-5 py-3 shadow-sm">
              <span className="text-xs font-black uppercase tracking-wide text-blue-700">
                {calYear ? `${MONTHS[calMonth]} ${calYear}` : "…"}
              </span>
              <span className="ml-3 text-lg font-black text-slate-950">{monthTotal}</span>
              <span className="ml-1 text-xs font-semibold text-slate-500">
                visit{monthTotal !== 1 ? "s" : ""}
                {hasFilters ? " (filtered)" : ""}
              </span>
            </div>
          </div>

          {/* Calendar + day panel */}
          <div className="flex gap-5 lg:items-start">
            {/* ── Calendar card ── */}
            <section className="min-w-0 flex-1 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              {/* Month navigation */}
              <div className="border-b border-slate-100 px-6 py-5">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={prevMonth}
                    className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 transition"
                  >
                    ‹ Prev
                  </button>

                  <div className="text-center">
                    <p className="text-2xl font-black text-slate-950 sm:text-3xl">
                      {calYear ? MONTHS[calMonth] : "…"}
                    </p>
                    <p className="mt-0.5 text-sm font-bold text-blue-700">
                      {calYear || ""}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={nextMonth}
                    className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 transition"
                  >
                    Next ›
                  </button>
                </div>
              </div>

              {/* Filter toolbar */}
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-6 py-3">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search accounts…"
                  className="min-h-[38px] rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                />

                <select
                  value={filterSub}
                  onChange={(e) => { setFilterSub(e.target.value); setSelectedDay(null); }}
                  className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500"
                >
                  <option value="">All Subcontractors</option>
                  {uniqueSubs.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>

                <select
                  value={filterStatus}
                  onChange={(e) => { setFilterStatus(e.target.value); setSelectedDay(null); }}
                  className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500"
                >
                  <option value="">All Statuses</option>
                  <option value="Visited">Visited</option>
                  <option value="Scheduled">Scheduled</option>
                  <option value="Missed">Missed</option>
                </select>

                {hasFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-500 hover:bg-slate-50"
                  >
                    Clear ×
                  </button>
                )}
              </div>

              {/* Grid */}
              <div className="p-4 sm:p-6">
                {/* Day-of-week headers */}
                <div className="mb-2 grid grid-cols-7">
                  {DOW_SHORT.map((d) => (
                    <div
                      key={d}
                      className="py-1 text-center text-[11px] font-black uppercase tracking-widest text-slate-400"
                    >
                      {d}
                    </div>
                  ))}
                </div>

                {/* Day cells */}
                <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                  {calCells.map((day, idx) => {
                    if (!day)
                      return (
                        <div
                          key={`empty-${idx}`}
                          className="h-12 rounded-xl sm:h-16"
                        />
                      );

                    const ds = dayStr(day);
                    const count = visitCountByDay.get(ds) ?? 0;
                    const isSelected = selectedDay === ds;
                    const isToday = ds === todayStr;

                    return (
                      <button
                        key={`day-${idx}`}
                        type="button"
                        onClick={() => setSelectedDay((prev) => (prev === ds ? null : ds))}
                        className={[
                          "relative flex h-12 flex-col items-start justify-between rounded-xl p-1.5 text-left transition sm:h-16 sm:rounded-2xl sm:p-2",
                          isSelected
                            ? "bg-blue-600 shadow-md shadow-blue-200 ring-2 ring-blue-400 ring-offset-1"
                            : count > 0
                              ? "bg-green-50 hover:bg-green-100 hover:shadow-sm"
                              : "hover:bg-slate-100 hover:shadow-sm",
                          isToday && !isSelected
                            ? "ring-2 ring-blue-400 ring-offset-1"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {/* Day number */}
                        <span
                          className={[
                            "text-sm font-black leading-none",
                            isSelected
                              ? "text-white"
                              : isToday
                                ? "text-blue-600"
                                : count > 0
                                  ? "text-green-800"
                                  : "text-slate-600",
                          ].join(" ")}
                        >
                          {day}
                        </span>

                        {/* Visit count badge */}
                        {count > 0 && (
                          <span
                            className={[
                              "inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-black leading-none sm:text-[10px]",
                              isSelected
                                ? "bg-white text-blue-700"
                                : "bg-green-600 text-white",
                            ].join(" ")}
                          >
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4 text-xs font-semibold text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-green-500" />
                    Has visits
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-full ring-2 ring-blue-400" />
                    Today
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-blue-600" />
                    Selected
                  </span>
                </div>
              </div>
            </section>

            {/* ── Desktop side panel ── */}
            {selectedDay && (
              <aside className="hidden w-80 flex-shrink-0 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:flex lg:flex-col xl:w-96">
                <DayPanelContent />
              </aside>
            )}
          </div>

          {/* ── Mobile modal ── */}
          {selectedDay && (
            <div
              className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-4 lg:hidden"
              onClick={() => setSelectedDay(null)}
            >
              <div
                className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <DayPanelContent />
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
