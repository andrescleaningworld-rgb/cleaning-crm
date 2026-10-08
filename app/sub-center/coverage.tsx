"use client";

import { useEffect, useMemo, useState } from "react";

import CoverageMap from "./coverage-map";
import { Card, EmptyState, ErrorBox, FilterChips, Screen, SearchBar, SkeletonList, StatusPill } from "@/app/ui";

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
      <p className="ui-label">{title}</p>
      {areas.length === 0 ? (
        <p className="ui-muted">{emptyLabel}</p>
      ) : (
        <ul className="ui-taglist">
          {areas.map((area) => {
            const isMatch = searchQuery.length > 0 && normalizeLower(area.name).includes(searchQuery);
            return (
              <li key={area.name} className={isMatch ? "ui-tag ui-tag-match" : "ui-tag"}>
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
  const [viewMode, setViewMode] = useState<"bySub" | "byTown" | "map">("bySub");

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

  const accountsWord = (n: number) => `${n} account${n === 1 ? "" : "s"}`;

  return (
    <Screen title="Coverage" subtitle="Towns/cities and zip codes serviced by each subcontractor, based on currently active accounts.">
      {error ? (
        <ErrorBox title="The coverage did not load." text={error} />
      ) : loading ? (
        <SkeletonList rows={3} />
      ) : coverage.length === 0 ? (
        <EmptyState title="No active accounts found" text="Coverage is built from active accounts." />
      ) : (
        <>
          <FilterChips
            label="Show coverage"
            options={[
              { value: "bySub", label: "By Sub" },
              { value: "byTown", label: "By Town" },
              { value: "map", label: "Map" },
            ]}
            value={viewMode}
            onChange={setViewMode}
          />
          {viewMode === "map" ? (
            <CoverageMap />
          ) : (
            <>
              <SearchBar value={searchTerm} onChange={setSearchTerm} label="Search coverage" placeholder="Search town, zip, or sub name" />
              {viewMode === "bySub"
                ? coverage.map((entry) => {
                    const nameMatches = searchQuery.length > 0 && normalizeLower(entry.subcontractor).includes(searchQuery);
                    const cityMatches = entry.cities.some((city) => normalizeLower(city.name).includes(searchQuery));
                    const zipMatches = entry.zips.some((zip) => normalizeLower(zip.name).includes(searchQuery));
                    const hasAnyMatch = nameMatches || cityMatches || zipMatches;
                    const shouldDim = searchQuery.length >= 2 && !hasAnyMatch;

                    return (
                      <div key={entry.subcontractor} style={shouldDim ? { opacity: 0.4 } : undefined}>
                        <Card
                          title={entry.subcontractor}
                          right={<StatusPill kind={nameMatches ? "done" : "off"}>{accountsWord(entry.totalAccounts)}</StatusPill>}
                        >
                          <div className="ui-two" style={{ marginTop: 12 }}>
                            <AreaList title="Towns / Cities" areas={entry.cities} emptyLabel="No city data." searchQuery={searchQuery} />
                            <AreaList title="Zip Codes" areas={entry.zips} emptyLabel="No zip data." searchQuery={searchQuery} />
                          </div>
                        </Card>
                      </div>
                    );
                  })
                : townCoverage.map((entry) => {
                    const townMatches = searchQuery.length > 0 && normalizeLower(entry.town).includes(searchQuery);
                    const subNameMatches = entry.subs.some((sub) => normalizeLower(sub.subcontractor).includes(searchQuery));
                    const zipMatches = entry.subs.some((sub) => sub.zips.some((zip) => normalizeLower(zip).includes(searchQuery)));
                    const hasAnyMatch = townMatches || subNameMatches || zipMatches;
                    const shouldDim = searchQuery.length >= 2 && !hasAnyMatch;

                    return (
                      <div key={entry.isZipOnly ? `zip:${entry.town}` : `city:${entry.town}`} style={shouldDim ? { opacity: 0.4 } : undefined}>
                        <Card
                          title={entry.isZipOnly ? `${entry.town} (zip only)` : entry.town}
                          right={<StatusPill kind={townMatches ? "done" : "off"}>{accountsWord(entry.totalAccounts)}</StatusPill>}
                        >
                          <p className="ui-label" style={{ marginTop: 12 }}>
                            Subs Covering This {entry.isZipOnly ? "Zip" : "Town"}
                          </p>
                          <ul className="ui-list-plain" style={{ gap: 8 }}>
                            {entry.subs.map((sub) => {
                              const subMatches = searchQuery.length > 0 && normalizeLower(sub.subcontractor).includes(searchQuery);
                              return (
                                <li key={sub.subcontractor} className="ui-stat">
                                  <span className={subMatches ? "ui-strong ui-match" : "ui-strong"}>{sub.subcontractor}</span>{" "}
                                  <span className="ui-muted">({accountsWord(sub.count)})</span>
                                  {sub.zips.length > 0 ? (
                                    <span className="ui-taglist" style={{ marginTop: 6 }}>
                                      {sub.zips.map((zip) => {
                                        const zipIsMatch = searchQuery.length > 0 && normalizeLower(zip).includes(searchQuery);
                                        return (
                                          <span key={zip} className={zipIsMatch ? "ui-tag ui-tag-match" : "ui-tag"}>
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
                        </Card>
                      </div>
                    );
                  })}
            </>
          )}
        </>
      )}
    </Screen>
  );
}
