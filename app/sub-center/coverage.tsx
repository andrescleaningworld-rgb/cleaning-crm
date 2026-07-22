"use client";

import { useEffect, useMemo, useState } from "react";

type RawAccount = {
  subcontractor?: string;
  city?: string;
  zip?: string;
  status?: string;
};

type AreaCount = { name: string; count: number };

type SubcontractorCoverage = {
  subcontractor: string;
  totalAccounts: number;
  cities: AreaCount[];
  zips: AreaCount[];
};

type CoverageRecord = {
  subcontractor: string;
  city: string;
  zip: string;
};

type TownSubBreakdown = {
  subcontractor: string;
  count: number;
  zips: string[];
};

type TownCoverage = {
  town: string;
  isZipOnly: boolean;
  totalAccounts: number;
  subs: TownSubBreakdown[];
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeLower(value: unknown): string {
  return clean(value).toLowerCase();
}

// Mirrors app/accounts/page.tsx's getStatusCategory: cancelled/paused/over-90
// accounts aren't counted as areas currently being serviced.
function isServicedStatus(status: unknown): boolean {
  const value = normalizeLower(status);
  if (!value) return true;
  if (value.includes("cancel") || value.includes("lost") || value.includes("terminated") || value.includes("closed")) {
    return false;
  }
  if (value.includes("pause") || value.includes("hold") || value.includes("suspended")) return false;
  if (value.includes("90") || value.includes("over ninety") || value.includes("old")) return false;
  return true;
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

function sortAreas(counts: Map<string, number>): AreaCount[] {
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// No existing fetch hook covers this: app/sub-schedules/autocomplete.tsx's
// useAllAccountOptions() is the only reusable account hook, but it only maps
// id/label/manager — not subcontractor, city, or zip — so it can't drive
// coverage grouping without being extended. Fetching /api/accounts directly
// here (same endpoint, no new route) keeps that shared hook's shape intact
// for its other consumers (Sub Schedules search, Exceptions modal).
async function fetchCoverageRecords(): Promise<CoverageRecord[]> {
  const response = await fetch("/api/accounts", { cache: "no-store" });
  const data = await readJson<{ success?: boolean; accounts?: RawAccount[]; data?: RawAccount[] }>(response);
  if (!response.ok || data.success === false) return [];

  const accounts = (data.accounts ?? data.data ?? []).filter((account) => isServicedStatus(account.status));

  return accounts.map((account) => ({
    subcontractor: clean(account.subcontractor) || "Unassigned",
    city: clean(account.city),
    zip: clean(account.zip),
  }));
}

// Same record set as buildTownCoverage below, grouped by subcontractor
// instead of by town — this is the "By Sub" view's data source.
function buildBySubCoverage(records: CoverageRecord[]): SubcontractorCoverage[] {
  const bySubcontractor = new Map<string, { cities: Map<string, number>; zips: Map<string, number>; total: number }>();

  for (const record of records) {
    const entry = bySubcontractor.get(record.subcontractor) ?? {
      cities: new Map<string, number>(),
      zips: new Map<string, number>(),
      total: 0,
    };
    entry.total += 1;

    if (record.city) entry.cities.set(record.city, (entry.cities.get(record.city) ?? 0) + 1);
    if (record.zip) entry.zips.set(record.zip, (entry.zips.get(record.zip) ?? 0) + 1);

    bySubcontractor.set(record.subcontractor, entry);
  }

  return Array.from(bySubcontractor.entries())
    .map(([subcontractor, entry]) => ({
      subcontractor,
      totalAccounts: entry.total,
      cities: sortAreas(entry.cities),
      zips: sortAreas(entry.zips),
    }))
    .sort((a, b) => {
      if (a.subcontractor === "Unassigned") return 1;
      if (b.subcontractor === "Unassigned") return -1;
      return a.subcontractor.localeCompare(b.subcontractor);
    });
}

// Same record set as buildBySubCoverage above, grouped by town instead of
// by subcontractor — this is the "By Town" view's data source. Records with
// a zip but no city name still get their own card, keyed by zip. Records
// with neither city nor zip carry no location info and are skipped, same as
// they're skipped from AreaList's chips in the "By Sub" view today.
function buildTownCoverage(records: CoverageRecord[]): TownCoverage[] {
  const byTown = new Map<
    string,
    { town: string; isZipOnly: boolean; total: number; subs: Map<string, { count: number; zips: Set<string> }> }
  >();

  for (const record of records) {
    if (!record.city && !record.zip) continue;

    const key = record.city ? `city:${record.city}` : `zip:${record.zip}`;
    const entry = byTown.get(key) ?? {
      town: record.city || record.zip,
      isZipOnly: !record.city,
      total: 0,
      subs: new Map<string, { count: number; zips: Set<string> }>(),
    };
    entry.total += 1;

    const subEntry = entry.subs.get(record.subcontractor) ?? { count: 0, zips: new Set<string>() };
    subEntry.count += 1;
    if (record.zip) subEntry.zips.add(record.zip);
    entry.subs.set(record.subcontractor, subEntry);

    byTown.set(key, entry);
  }

  return Array.from(byTown.values())
    .map((entry) => ({
      town: entry.town,
      isZipOnly: entry.isZipOnly,
      totalAccounts: entry.total,
      subs: Array.from(entry.subs.entries())
        .map(([subcontractor, sub]) => ({
          subcontractor,
          count: sub.count,
          zips: Array.from(sub.zips.values()).sort(),
        }))
        .sort((a, b) => b.count - a.count || a.subcontractor.localeCompare(b.subcontractor)),
    }))
    .sort((a, b) => b.totalAccounts - a.totalAccounts || a.town.localeCompare(b.town));
}

function AreaList({
  title,
  areas,
  emptyLabel,
  searchQuery,
}: {
  title: string;
  areas: AreaCount[];
  emptyLabel: string;
  searchQuery: string;
}) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{title}</p>
      {areas.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{emptyLabel}</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-2">
          {areas.map((area) => {
            const isMatch = searchQuery.length > 0 && normalizeLower(area.name).includes(searchQuery);
            return (
              <li
                key={area.name}
                className={`rounded-full border px-3 py-1 text-xs ${
                  isMatch
                    ? "border-blue-400 bg-blue-100 font-black text-blue-900"
                    : "border-slate-200 bg-slate-50 font-semibold text-slate-700"
                }`}
              >
                {area.name} ({area.count} account{area.count === 1 ? "" : "s"})
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function SubCenterCoverage() {
  const [records, setRecords] = useState<CoverageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"bySub" | "byTown">("bySub");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const result = await fetchCoverageRecords();
        if (!cancelled) setRecords(result);
      } catch {
        if (!cancelled) setError("Could not load coverage data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const searchQuery = normalizeLower(searchTerm);
  const coverage = useMemo(() => buildBySubCoverage(records), [records]);
  const townCoverage = useMemo(() => buildTownCoverage(records), [records]);

  return (
    <main className="min-h-screen bg-gray-50 p-4 text-gray-900 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Cleaning World</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Coverage</h1>
          <p className="mt-2 text-sm leading-6 text-gray-500 sm:text-base">
            Towns/cities and zip codes serviced by each subcontractor, based on currently active accounts.
          </p>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 font-bold text-red-700">{error}</div>
        ) : loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">Loading coverage...</div>
        ) : coverage.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-gray-500 shadow-sm">
            No active accounts found.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setViewMode("bySub")}
                className={`rounded-lg px-4 py-1.5 text-sm font-bold transition ${
                  viewMode === "bySub" ? "bg-blue-700 text-white" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                By Sub
              </button>
              <button
                type="button"
                onClick={() => setViewMode("byTown")}
                className={`rounded-lg px-4 py-1.5 text-sm font-bold transition ${
                  viewMode === "byTown" ? "bg-blue-700 text-white" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                By Town
              </button>
            </div>
            <div className="relative max-w-md">
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search town, zip, or sub name"
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 pr-9 text-sm shadow-sm focus:border-blue-400 focus:outline-none"
              />
              {searchTerm ? (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              ) : null}
            </div>
            {viewMode === "bySub"
              ? coverage.map((entry) => {
                  const nameMatches =
                    searchQuery.length > 0 && normalizeLower(entry.subcontractor).includes(searchQuery);
                  const cityMatches = entry.cities.some((city) => normalizeLower(city.name).includes(searchQuery));
                  const zipMatches = entry.zips.some((zip) => normalizeLower(zip.name).includes(searchQuery));
                  const hasAnyMatch = nameMatches || cityMatches || zipMatches;
                  const shouldDim = searchQuery.length >= 2 && !hasAnyMatch;

                  return (
                    <section
                      key={entry.subcontractor}
                      className={`rounded-2xl border border-gray-200 bg-white p-5 shadow-sm ${
                        shouldDim ? "opacity-40" : ""
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className={`text-lg font-bold ${nameMatches ? "text-blue-700" : ""}`}>
                          {entry.subcontractor}
                        </h2>
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                          {entry.totalAccounts} account{entry.totalAccounts === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <AreaList title="Towns / Cities" areas={entry.cities} emptyLabel="No city data." searchQuery={searchQuery} />
                        <AreaList title="Zip Codes" areas={entry.zips} emptyLabel="No zip data." searchQuery={searchQuery} />
                      </div>
                    </section>
                  );
                })
              : townCoverage.map((entry) => {
                  const townMatches = searchQuery.length > 0 && normalizeLower(entry.town).includes(searchQuery);
                  const subNameMatches = entry.subs.some((sub) => normalizeLower(sub.subcontractor).includes(searchQuery));
                  const zipMatches = entry.subs.some((sub) =>
                    sub.zips.some((zip) => normalizeLower(zip).includes(searchQuery))
                  );
                  const hasAnyMatch = townMatches || subNameMatches || zipMatches;
                  const shouldDim = searchQuery.length >= 2 && !hasAnyMatch;

                  return (
                    <section
                      key={entry.isZipOnly ? `zip:${entry.town}` : `city:${entry.town}`}
                      className={`rounded-2xl border border-gray-200 bg-white p-5 shadow-sm ${
                        shouldDim ? "opacity-40" : ""
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className={`text-lg font-bold ${townMatches ? "text-blue-700" : ""}`}>
                          {entry.town}
                          {entry.isZipOnly ? (
                            <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                              Zip only
                            </span>
                          ) : null}
                        </h2>
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                          {entry.totalAccounts} account{entry.totalAccounts === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="mt-4">
                        <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                          Subs Covering This {entry.isZipOnly ? "Zip" : "Town"}
                        </p>
                        <ul className="mt-2 space-y-2">
                          {entry.subs.map((sub) => {
                            const subMatches =
                              searchQuery.length > 0 && normalizeLower(sub.subcontractor).includes(searchQuery);
                            return (
                              <li
                                key={sub.subcontractor}
                                className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                              >
                                <span className={`text-sm font-bold ${subMatches ? "text-blue-700" : "text-slate-800"}`}>
                                  {sub.subcontractor}
                                </span>
                                <span className="text-xs text-slate-500">
                                  ({sub.count} account{sub.count === 1 ? "" : "s"})
                                </span>
                                {sub.zips.length > 0 ? (
                                  <span className="flex flex-wrap gap-1">
                                    {sub.zips.map((zip) => {
                                      const zipIsMatch = searchQuery.length > 0 && normalizeLower(zip).includes(searchQuery);
                                      return (
                                        <span
                                          key={zip}
                                          className={`rounded-full border px-2 py-0.5 text-xs ${
                                            zipIsMatch
                                              ? "border-blue-400 bg-blue-100 font-black text-blue-900"
                                              : "border-slate-200 bg-white font-semibold text-slate-600"
                                          }`}
                                        >
                                          {zip}
                                        </span>
                                      );
                                    })}
                                  </span>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </section>
                  );
                })}
          </div>
        )}
      </div>
    </main>
  );
}
