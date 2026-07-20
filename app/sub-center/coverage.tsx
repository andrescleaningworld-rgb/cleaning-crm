"use client";

import { useEffect, useState } from "react";

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
async function fetchCoverage(): Promise<SubcontractorCoverage[]> {
  const response = await fetch("/api/accounts", { cache: "no-store" });
  const data = await readJson<{ success?: boolean; accounts?: RawAccount[]; data?: RawAccount[] }>(response);
  if (!response.ok || data.success === false) return [];

  const accounts = (data.accounts ?? data.data ?? []).filter((account) => isServicedStatus(account.status));

  const bySubcontractor = new Map<string, { cities: Map<string, number>; zips: Map<string, number>; total: number }>();

  for (const account of accounts) {
    const subcontractor = clean(account.subcontractor) || "Unassigned";
    const entry = bySubcontractor.get(subcontractor) ?? {
      cities: new Map<string, number>(),
      zips: new Map<string, number>(),
      total: 0,
    };
    entry.total += 1;

    const city = clean(account.city);
    if (city) entry.cities.set(city, (entry.cities.get(city) ?? 0) + 1);

    const zip = clean(account.zip);
    if (zip) entry.zips.set(zip, (entry.zips.get(zip) ?? 0) + 1);

    bySubcontractor.set(subcontractor, entry);
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

function AreaList({ title, areas, emptyLabel }: { title: string; areas: AreaCount[]; emptyLabel: string }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{title}</p>
      {areas.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{emptyLabel}</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-2">
          {areas.map((area) => (
            <li
              key={area.name}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700"
            >
              {area.name} ({area.count} account{area.count === 1 ? "" : "s"})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function SubCenterCoverage() {
  const [coverage, setCoverage] = useState<SubcontractorCoverage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const result = await fetchCoverage();
        if (!cancelled) setCoverage(result);
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
            {coverage.map((entry) => (
              <section key={entry.subcontractor} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-bold">{entry.subcontractor}</h2>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                    {entry.totalAccounts} account{entry.totalAccounts === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <AreaList title="Towns / Cities" areas={entry.cities} emptyLabel="No city data." />
                  <AreaList title="Zip Codes" areas={entry.zips} emptyLabel="No zip data." />
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
