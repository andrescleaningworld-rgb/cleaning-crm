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
  createdAt?: string;
  updatedAt?: string;
};

type VisitsApiResponse = {
  success?: boolean;
  error?: string;
  visits?: Visit[];
  data?: Visit[];
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function formatDate(value: unknown): string {
  const text = clean(value);

  if (!text) return "-";

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) return text;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getVisitTime(visit: Visit): number {
  const possibleDates = [
    visit.date,
    visit.createdAt,
    visit.updatedAt,
    visit.followUpDate,
  ];

  for (const value of possibleDates) {
    const text = clean(value);
    if (!text) continue;

    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) {
      return date.getTime();
    }
  }

  return 0;
}

function getConditionClass(value: unknown): string {
  const score = Number(value);

  if (Number.isNaN(score)) {
    return "rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700";
  }

  if (score >= 9) {
    return "rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700";
  }

  if (score >= 8) {
    return "rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700";
  }

  if (score >= 7) {
    return "rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold text-yellow-800";
  }

  return "rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700";
}

function getLoadedVisits(data: VisitsApiResponse | Visit[]): Visit[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.visits)) return data.visits;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

export default function VisitsPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");

  useEffect(() => {
    async function loadVisits() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch("/api/visits", {
          method: "GET",
        });

        const text = await response.text();

        let data: VisitsApiResponse | Visit[];

        try {
          data = JSON.parse(text) as VisitsApiResponse | Visit[];
        } catch {
          throw new Error("Visits API did not return valid JSON.");
        }

        if (!response.ok || (!Array.isArray(data) && data.success === false)) {
          throw new Error(
            !Array.isArray(data) && data.error
              ? data.error
              : "Failed to load visits."
          );
        }

        setVisits(getLoadedVisits(data));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Unknown error loading visits."
        );
        setVisits([]);
      } finally {
        setLoading(false);
      }
    }

    loadVisits();
  }, []);

  const sortedVisits = useMemo(() => {
    return [...visits].sort((a, b) => {
      return getVisitTime(b) - getVisitTime(a);
    });
  }, [visits]);

  const filteredVisits = useMemo(() => {
    const term = search.toLowerCase().trim();

    if (!term) return sortedVisits;

    return sortedVisits.filter((visit) => {
      return (
        clean(visit.accountName).toLowerCase().includes(term) ||
        clean(visit.accountId).toLowerCase().includes(term) ||
        clean(visit.manager).toLowerCase().includes(term) ||
        clean(visit.subcontractor).toLowerCase().includes(term) ||
        clean(visit.visitType).toLowerCase().includes(term) ||
        clean(visit.notes).toLowerCase().includes(term)
      );
    });
  }, [sortedVisits, search]);

  const followUpsNeeded = useMemo(() => {
    return visits.filter((visit) => {
      const value = clean(visit.followUpNeeded).toLowerCase();
      return value === "yes" || value === "true" || value === "needed";
    }).length;
  }, [visits]);

  return (
    <main className="min-h-screen bg-gray-50 p-4 text-gray-900 sm:p-6">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
            Cleaning World
          </p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Visits</h1>
          <p className="mt-2 text-sm leading-6 text-gray-500 sm:text-base">
            Track account visits, conditions, follow-ups, managers, and notes.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
          <Link
            href="/visits/new"
            className="rounded-xl bg-blue-600 px-4 py-3 text-center font-bold text-white no-underline"
          >
            + Add Visit
          </Link>

          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-xl bg-gray-900 px-4 py-3 font-bold text-white"
          >
            Print
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          Loading visits...
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 font-bold text-red-700">
          {error}
        </div>
      ) : (
        <>
          <section className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Total Visits
              </p>
              <h2 className="mt-2 text-3xl font-bold">{visits.length}</h2>
              <p className="mt-2 text-sm text-gray-500">
                Loaded from Google Sheets
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Showing
              </p>
              <h2 className="mt-2 text-3xl font-bold">
                {filteredVisits.length}
              </h2>
              <p className="mt-2 text-sm text-gray-500">
                After search filter
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Follow-Ups Needed
              </p>
              <h2 className="mt-2 text-3xl font-bold">{followUpsNeeded}</h2>
              <p className="mt-2 text-sm text-gray-500">Marked Yes</p>
            </div>
          </section>

          <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search visits..."
              className="min-h-[48px] w-full rounded-xl border border-gray-300 px-4 py-3 text-base font-semibold outline-none focus:border-blue-500"
            />
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-bold">Visit List</h2>
              <span className="font-bold text-gray-500">
                {filteredVisits.length} visits
              </span>
            </div>

            {filteredVisits.length === 0 ? (
              <p className="text-gray-500">No visits found.</p>
            ) : (
              <>
                <div className="space-y-4 md:hidden">
                  {filteredVisits.map((visit, index) => (
                    <div
                      key={`${visit.id || "visit"}-${index}-mobile`}
                      className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                            {formatDate(visit.date)}
                          </p>
                          <h3 className="mt-1 text-lg font-black text-blue-900">
                            {clean(visit.accountName) || "-"}
                          </h3>
                          {clean(visit.accountId) ? (
                            <p className="mt-1 text-xs font-bold text-gray-400">
                              ID: {clean(visit.accountId)}
                            </p>
                          ) : null}
                        </div>

                        <span className={getConditionClass(visit.condition)}>
                          {clean(visit.condition) || "-"}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-gray-50 p-3">
                          <p className="text-[11px] font-black uppercase tracking-wide text-gray-400">
                            Type
                          </p>
                          <p className="mt-1 font-bold">
                            {clean(visit.visitType) || "-"}
                          </p>
                        </div>

                        <div className="rounded-xl bg-gray-50 p-3">
                          <p className="text-[11px] font-black uppercase tracking-wide text-gray-400">
                            Manager
                          </p>
                          <p className="mt-1 font-bold">
                            {clean(visit.manager) || "-"}
                          </p>
                        </div>

                        <div className="rounded-xl bg-gray-50 p-3">
                          <p className="text-[11px] font-black uppercase tracking-wide text-gray-400">
                            Sub
                          </p>
                          <p className="mt-1 font-bold">
                            {clean(visit.subcontractor) || "-"}
                          </p>
                        </div>

                        <div className="rounded-xl bg-gray-50 p-3">
                          <p className="text-[11px] font-black uppercase tracking-wide text-gray-400">
                            Follow-Up
                          </p>
                          <p className="mt-1 font-bold">
                            {clean(visit.followUpNeeded) || "-"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 rounded-xl bg-gray-50 p-3">
                        <p className="text-[11px] font-black uppercase tracking-wide text-gray-400">
                          Follow-Up Date
                        </p>
                        <p className="mt-1 font-bold">
                          {formatDate(visit.followUpDate)}
                        </p>
                      </div>

                      <div className="mt-3 rounded-xl bg-gray-50 p-3">
                        <p className="text-[11px] font-black uppercase tracking-wide text-gray-400">
                          Notes
                        </p>
                        <p className="mt-1 text-sm leading-6 text-gray-700">
                          {clean(visit.notes) || "-"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                        <th className="p-3">Date</th>
                        <th className="p-3">Account</th>
                        <th className="p-3">Visit Type</th>
                        <th className="p-3">Completed By</th>
                        <th className="p-3">Subcontractor</th>
                        <th className="p-3">Condition</th>
                        <th className="p-3">Follow-Up</th>
                        <th className="p-3">Follow-Up Date</th>
                        <th className="p-3">Notes</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredVisits.map((visit, index) => (
                        <tr
                          key={`${visit.id || "visit"}-${index}`}
                          className="border-b last:border-b-0"
                        >
                          <td className="whitespace-nowrap p-3">
                            {formatDate(visit.date)}
                          </td>

                          <td className="p-3">
                            <div className="font-bold">
                              {clean(visit.accountName) || "-"}
                            </div>
                            {clean(visit.accountId) ? (
                              <div className="text-xs text-gray-500">
                                {clean(visit.accountId)}
                              </div>
                            ) : null}
                          </td>

                          <td className="p-3">
                            {clean(visit.visitType) || "-"}
                          </td>

                          <td className="p-3">
                            {clean(visit.manager) || "-"}
                          </td>

                          <td className="p-3">
                            {clean(visit.subcontractor) || "-"}
                          </td>

                          <td className="p-3">
                            <span className={getConditionClass(visit.condition)}>
                              {clean(visit.condition) || "-"}
                            </span>
                          </td>

                          <td className="p-3">
                            {clean(visit.followUpNeeded) || "-"}
                          </td>

                          <td className="whitespace-nowrap p-3">
                            {formatDate(visit.followUpDate)}
                          </td>

                          <td className="min-w-[320px] p-3">
                            {clean(visit.notes) || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </main>
  );
}