"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { parseISO, toISO } from "@/lib/dateUtils";
import {
  BigButton,
  Card,
  CardList,
  Counts,
  EmptyState,
  ErrorBox,
  Field,
  LABELS,
  MoreMenu,
  Screen,
  SearchBar,
  SelectField,
  Sheet,
  SkeletonList,
  StatusPill,
  Tips,
  type StatusKind,
} from "@/app/ui";

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

function pad(n: number) { return String(n).padStart(2, "0"); }

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

// visit.date / visit.followUpDate come back as plain "YYYY-MM-DD" strings —
// parsed via the shared parseISO() (local Date components) rather than
// new Date(str), which JS treats as UTC midnight and would shift the date
// back a day for anyone in a US timezone. Any other format (unexpected, but
// defensive) falls back to generic Date parsing rather than failing outright.
function toISODate(value: unknown): string {
  const text = clean(value);
  if (!text) return "";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(text) ? parseISO(text) : new Date(text);
  return Number.isNaN(d.getTime()) ? "" : toISO(d);
}

function formatDate(value: unknown): string {
  const text = clean(value);
  if (!text) return "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? parseISO(text) : new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function conditionKind(value: unknown): StatusKind {
  const text = clean(value);
  const score = Number(text);
  if (!text || Number.isNaN(score)) return "off";
  if (score >= 8) return "done";
  if (score >= 7) return "waiting";
  return "needs-you";
}

const PAGE_SIZE = 50;

function deriveStatus(visit: Visit): "Visited" | "Scheduled" | "Missed" {
  const iso = toISODate(visit.date);
  if (!iso) return "Visited";
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  if (iso > todayStr) return "Scheduled";
  if (clean(visit.condition)) return "Visited";
  return "Missed";
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
  // Redesign: the big counts are filters.
  const [quick, setQuick] = useState<"all" | "month" | "follow-up">("all");
  const [filterAccount, setFilterAccount] = useState("");
  const [filterSub, setFilterSub] = useState("");
  const [filterManager, setFilterManager] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "account">("recent");
  // Layout only: filters open in a sheet, and the list shows 50 at a time.
  const [showFilters, setShowFilters] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

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
        setVisits([]);
      } finally {
        setLoading(false);
      }
    }
    loadVisits();
  }, []);

  const uniqueAccounts = useMemo(
    () => [...new Set(visits.map((v) => clean(v.accountName)).filter(Boolean))].sort(),
    [visits],
  );
  const uniqueSubs = useMemo(
    () => [...new Set(visits.map((v) => clean(v.subcontractor)).filter(Boolean))].sort(),
    [visits],
  );
  const uniqueManagers = useMemo(
    () => [...new Set(visits.map((v) => clean(v.manager)).filter(Boolean))].sort(),
    [visits],
  );

  const thisMonthPrefix = toISO(new Date()).slice(0, 7);
  const needsFollowUp = (visit: Visit) => {
    const val = clean(visit.followUpNeeded).toLowerCase();
    return val === "yes" || val === "true" || val === "needed";
  };

  const filteredVisits = useMemo(() => {
    const term = search.toLowerCase().trim();
    const filtered = visits.filter((visit) => {
      const iso = toISODate(visit.date);
      if (quick === "month" && !iso.startsWith(thisMonthPrefix)) return false;
      if (quick === "follow-up" && !needsFollowUp(visit)) return false;
      if (filterAccount && clean(visit.accountName) !== filterAccount) return false;
      if (filterSub && clean(visit.subcontractor) !== filterSub) return false;
      if (filterManager && clean(visit.manager) !== filterManager) return false;
      if (filterStatus && deriveStatus(visit) !== filterStatus) return false;
      if (dateFrom && iso && iso < dateFrom) return false;
      if (dateTo && iso && iso > dateTo) return false;
      if (term) {
        return (
          clean(visit.accountName).toLowerCase().includes(term) ||
          clean(visit.accountId).toLowerCase().includes(term) ||
          clean(visit.manager).toLowerCase().includes(term) ||
          clean(visit.subcontractor).toLowerCase().includes(term) ||
          clean(visit.visitType).toLowerCase().includes(term) ||
          clean(visit.notes).toLowerCase().includes(term)
        );
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "account") {
        return clean(a.accountName).localeCompare(clean(b.accountName));
      }
      const da = toISODate(a.date);
      const db = toISODate(b.date);
      if (da === db) return 0;
      return da > db ? -1 : 1;
    });
  }, [visits, search, filterAccount, filterSub, filterManager, filterStatus, dateFrom, dateTo, sortBy, quick, thisMonthPrefix]);

  const visitsThisMonth = useMemo(() => visits.filter((v) => toISODate(v.date).startsWith(thisMonthPrefix)).length, [visits, thisMonthPrefix]);
  const followUpsNeeded = useMemo(
    () =>
      visits.filter((v) => {
        const val = clean(v.followUpNeeded).toLowerCase();
        return val === "yes" || val === "true" || val === "needed";
      }).length,
    [visits],
  );

  const hasActiveFilters = !!(
    search || filterAccount || filterSub || filterManager || filterStatus || dateFrom || dateTo
  );

  function clearFilters() {
    setQuick("all");
    setSearch("");
    setFilterAccount("");
    setFilterSub("");
    setFilterManager("");
    setFilterStatus("");
    setDateFrom("");
    setDateTo("");
  }

  const filtersOn =
    [filterAccount, filterSub, filterManager, filterStatus, dateFrom, dateTo].filter(Boolean).length + (sortBy !== "recent" ? 1 : 0);
  const visibleVisits = filteredVisits.slice(0, visibleCount);

  // Printing puts every matching visit on paper, not only the first 50.
  function printAll() {
    setVisibleCount(filteredVisits.length || PAGE_SIZE);
    window.setTimeout(() => window.print(), 100);
  }

  const conditionPill = (visit: Visit) => (
    <StatusPill kind={conditionKind(visit.condition)}>{clean(visit.condition) ? `Condition ${clean(visit.condition)}` : "No score"}</StatusPill>
  );
  const visitHref = (visit: Visit) => `/visits/${encodeURIComponent(visit.id ?? "")}`;
  const followUpText = (visit: Visit) =>
    `${clean(visit.followUpNeeded) || "Not set"}${formatDate(visit.followUpDate) ? `, ${formatDate(visit.followUpDate)}` : ""}`;

  return (
    <Screen
      title="Visits"
      backHref="/"
      headerRight={<MoreMenu items={[{ label: LABELS.print, onSelect: printAll }]} />}
    >
      {/* At the top, above the list, so it is seen without scrolling (it was
          in the bar at the bottom of the screen and was being missed). */}
      <Tips
        id="visits"
        ready={!loading}
        steps={[
          { target: '[data-tip="counts"]', text: "Tap a number to see only those visits." },
          { target: '[data-tip="add"]', text: "Tap Add visit after you check an account." },
          { target: '[data-tip="open"]', text: "Tap Open to read a visit." },
        ]}
      />
      <div className="print:hidden" data-tip="add">
        <BigButton icon="plus" href="/visits/new" className="w-full">
          Add visit
        </BigButton>
      </div>
      {loading ? (
        <SkeletonList rows={4} />
      ) : error ? (
        <ErrorBox title="The visits did not load." text={error} />
      ) : (
        <div className="ui-print-view ui-screen-body">
          {/* At a glance: tap a number to see those visits. */}
          <div className="print:hidden">
            <Counts
              data-tip="counts"
              items={[
                { label: "This month", value: visitsThisMonth, tone: "info", pressed: quick === "month", onClick: () => setQuick(quick === "month" ? "all" : "month") },
                { label: "Need follow-up", value: followUpsNeeded, tone: followUpsNeeded > 0 ? "bad" : "good", pressed: quick === "follow-up", onClick: () => setQuick(quick === "follow-up" ? "all" : "follow-up") },
                { label: "All visits", value: visits.length, tone: "off", pressed: quick === "all", onClick: () => setQuick("all") },
              ]}
            />
          </div>

          <SearchBar value={search} onChange={setSearch} label="Find a visit" placeholder="Find a visit" />

          <div className="ui-actions-row">
            <BigButton kind="second" onClick={() => setShowFilters(true)}>
              {filtersOn ? `Filter and sort (${filtersOn} on)` : "Filter and sort"}
            </BigButton>
            {hasActiveFilters ? (
              <BigButton kind="quiet" onClick={clearFilters}>
                Clear filters
              </BigButton>
            ) : null}
          </div>

          <p className="ui-muted" role="status">
            Showing {filteredVisits.length} of {visits.length} visits
          </p>

          {filteredVisits.length === 0 ? (
            <EmptyState icon="search" title="No visits here" text="Tap All visits to see every visit, or Add visit to log one." />
          ) : (
            <>
              <CardList
                label="Visits"
                items={visibleVisits.map((visit, index) => ({ visit, index }))}
                getKey={({ visit, index }) => `${visit.id || "visit"}-${index}`}
                renderCard={({ visit }) => (
                  <Card title={clean(visit.accountName) || "No account name"} right={conditionPill(visit)}>
                    <p className="ui-card-text">
                      {formatDate(visit.date) || "No date"} · {clean(visit.visitType) || "No type"} · {clean(visit.manager) || "No manager"}
                    </p>
                    {clean(visit.subcontractor) ? <p className="ui-card-text">Sub: {clean(visit.subcontractor)}</p> : null}
                    <p className="ui-card-text">Follow-up: {followUpText(visit)}</p>
                    {clean(visit.notes) ? <p className="ui-card-text ui-clamp">{clean(visit.notes)}</p> : null}
                    {visit.id ? (
                      <div style={{ marginTop: 12 }}>
                        <BigButton href={visitHref(visit)} data-tip="open" aria-label={`Open the visit to ${clean(visit.accountName) || "this account"} on ${formatDate(visit.date) || "an unknown date"}`}>
                          {LABELS.open}
                        </BigButton>
                      </div>
                    ) : null}
                  </Card>
                )}
                columns={[
                  { header: "Date", cell: ({ visit }) => <span className="ui-nowrap">{formatDate(visit.date) || "No date"}</span> },
                  {
                    header: "Account",
                    cell: ({ visit }) =>
                      visit.id ? (
                        <Link href={visitHref(visit)} className="ui-table-rowlink">
                          {clean(visit.accountName) || "No account name"}
                        </Link>
                      ) : (
                        <span className="ui-strong">{clean(visit.accountName) || "No account name"}</span>
                      ),
                  },
                  { header: "Visit Type", cell: ({ visit }) => clean(visit.visitType) || "None" },
                  { header: "Completed By", cell: ({ visit }) => clean(visit.manager) || "None" },
                  { header: "Subcontractor", cell: ({ visit }) => clean(visit.subcontractor) || "None" },
                  { header: "Condition", cell: ({ visit }) => conditionPill(visit) },
                  { header: "Follow-Up", cell: ({ visit }) => clean(visit.followUpNeeded) || "Not set" },
                  { header: "Follow-Up Date", cell: ({ visit }) => <span className="ui-nowrap">{formatDate(visit.followUpDate) || "None"}</span> },
                  { header: "Notes", cell: ({ visit }) => <span className="ui-clamp">{clean(visit.notes) || "None"}</span> },
                ]}
              />

              {visibleCount < filteredVisits.length ? (
                <div>
                  <BigButton kind="second" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
                    Show {Math.min(PAGE_SIZE, filteredVisits.length - visibleCount)} more
                  </BigButton>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}

      <Sheet open={showFilters} title="Filter and sort" onClose={() => setShowFilters(false)} closeLabel="Done">
        <SelectField label="Account" value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)}>
          <option value="">All Accounts</option>
          {uniqueAccounts.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </SelectField>
        <SelectField label="Subcontractor" value={filterSub} onChange={(e) => setFilterSub(e.target.value)}>
          <option value="">All Subs</option>
          {uniqueSubs.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </SelectField>
        <SelectField label="Completed by" value={filterManager} onChange={(e) => setFilterManager(e.target.value)}>
          <option value="">All Managers</option>
          {uniqueManagers.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </SelectField>
        <SelectField label="Status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="Visited">Visited</option>
          <option value="Scheduled">Scheduled</option>
          <option value="Missed">Missed</option>
        </SelectField>
        <Field label="From date" optional type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <Field label="To date" optional type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <SelectField label="Sort" value={sortBy} onChange={(e) => setSortBy(e.target.value as "recent" | "account")}>
          <option value="recent">Most Recent</option>
          <option value="account">Account A–Z</option>
        </SelectField>
        <p className="ui-muted" role="status">
          {filteredVisits.length} visit{filteredVisits.length === 1 ? "" : "s"}
        </p>
        <div>
          <BigButton kind="quiet" onClick={clearFilters}>
            Clear filters
          </BigButton>
        </div>
      </Sheet>
    </Screen>
  );
}
