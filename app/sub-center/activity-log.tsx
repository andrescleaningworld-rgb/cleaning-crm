"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BigButton,
  Card,
  CardList,
  EmptyState,
  ErrorBox,
  Field,
  Screen,
  SelectField,
  Sheet,
  SkeletonList,
} from "@/app/ui";

// The list shows this many lines at a time; "Show more" adds another batch.
const PAGE_SIZE = 100;

type ActivityLogEntry = {
  timestamp?: string;
  subcontractorEmail?: string;
  subcontractorName?: string;
  actionType?: string;
  details?: string;
};

type ActivityLogApiResponse = {
  success?: boolean;
  error?: string;
  logs?: ActivityLogEntry[];
  data?: ActivityLogEntry[];
};

type SubcontractorRow = {
  subcontractorName?: string;
  companyName?: string;
  contactName?: string;
  name?: string;
  email?: string;
};

type SubcontractorsApiResponse = {
  success?: boolean;
  error?: string;
  subcontractors?: SubcontractorRow[];
  subs?: SubcontractorRow[];
  data?: SubcontractorRow[];
};

type ActionCategory =
  | "All"
  | "Login"
  | "Viewed Tab"
  | "Reported Issue"
  | "Ordered Supplies"
  | "Transfer Proposal Response"
  | "Other";

const ACTION_CATEGORY_OPTIONS: { value: ActionCategory; label: string }[] = [
  { value: "All", label: "Action: All" },
  { value: "Login", label: "Action: Login" },
  { value: "Viewed Tab", label: "Action: Viewed [Tab]" },
  { value: "Reported Issue", label: "Action: Reported Issue" },
  { value: "Ordered Supplies", label: "Action: Ordered Supplies" },
  { value: "Transfer Proposal Response", label: "Action: Transfer Proposal Response" },
  { value: "Other", label: "Action: Other" },
];

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

// Groups the free-text Action Type values actually written by the portal
// logging into the categories this filter offers. "Transfer Proposal
// Response" has no writer yet (that logging lives in Apps Script, not this
// app) but is included here so the filter is ready once it's added.
function getActionCategory(actionType: unknown): ActionCategory {
  const value = clean(actionType);

  if (value === "Login") return "Login";
  if (value.startsWith("Viewed ")) return "Viewed Tab";
  if (/transfer proposal/i.test(value)) return "Transfer Proposal Response";
  if (/issue/i.test(value)) return "Reported Issue";
  if (/supply|supplies/i.test(value)) return "Ordered Supplies";

  return "Other";
}

function formatDateTime(value: unknown): string {
  const text = clean(value);
  if (!text) return "No time";

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;

  // "Tue, Oct 6, 6:28 PM" (with the year when it is not this year).
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
  });
}

function getDateTimeValue(value: unknown): number {
  const text = clean(value);
  if (!text) return 0;

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function toIsoDate(value: unknown): string {
  const text = clean(value);
  if (!text) return "";

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

// Matches subcontractor-portal/page.tsx's own getSubcontractorDisplayName —
// the function that produced the "Subcontractor Name" string actually
// written into each log row — so filter options match logged values exactly.
function getSubcontractorDisplayName(subcontractor: SubcontractorRow): string {
  return (
    clean(subcontractor.subcontractorName) ||
    clean(subcontractor.companyName) ||
    clean(subcontractor.contactName) ||
    clean(subcontractor.name) ||
    "Subcontractor"
  );
}

function getLoadedLogs(data: ActivityLogApiResponse | ActivityLogEntry[]) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.logs)) return data.logs;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

function getLoadedSubcontractors(
  data: SubcontractorsApiResponse | SubcontractorRow[]
) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.subcontractors)) return data.subcontractors;
  if (Array.isArray(data.subs)) return data.subs;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

// Moved here from app/activity-log/page.tsx (now just a redirect into this
// tab — see that file's comment) since this data is subcontractor-specific
// and belongs alongside the rest of Sub Center. Logic/content unchanged.
export default function SubCenterActivityLog() {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [subcontractorNames, setSubcontractorNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [subcontractorFilter, setSubcontractorFilter] = useState("All");
  const [actionFilter, setActionFilter] = useState<ActionCategory>("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [shownCount, setShownCount] = useState(PAGE_SIZE);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    async function loadLogs() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch("/api/activity-log", { cache: "no-store" });
        const text = await response.text();

        let data: ActivityLogApiResponse | ActivityLogEntry[];
        try {
          data = JSON.parse(text) as ActivityLogApiResponse | ActivityLogEntry[];
        } catch {
          throw new Error("Activity log API did not return valid JSON.");
        }

        if (!response.ok || (!Array.isArray(data) && data.success === false)) {
          throw new Error(
            !Array.isArray(data) && data.error
              ? data.error
              : "Failed to load activity log."
          );
        }

        setLogs(getLoadedLogs(data));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Unknown error loading activity log."
        );
        setLogs([]);
      } finally {
        setLoading(false);
      }
    }

    async function loadSubcontractors() {
      try {
        const response = await fetch("/api/subcontractors", { cache: "no-store" });
        const data = (await response.json()) as
          | SubcontractorsApiResponse
          | SubcontractorRow[];

        const names = getLoadedSubcontractors(data)
          .map(getSubcontractorDisplayName)
          .filter(Boolean);

        setSubcontractorNames(
          Array.from(new Set(names)).sort((a, b) => a.localeCompare(b))
        );
      } catch {
        setSubcontractorNames([]);
      }
    }

    void loadLogs();
    void loadSubcontractors();
    // `attempt` changes when "Try again" is tapped.
  }, [attempt]);

  const filteredLogs = useMemo(() => {
    return logs
      .filter((entry) => {
        if (
          subcontractorFilter !== "All" &&
          clean(entry.subcontractorName).toLowerCase() !==
            subcontractorFilter.toLowerCase()
        ) {
          return false;
        }

        if (
          actionFilter !== "All" &&
          getActionCategory(entry.actionType) !== actionFilter
        ) {
          return false;
        }

        const entryDate = toIsoDate(entry.timestamp);

        if (dateFrom && entryDate && entryDate < dateFrom) return false;
        if (dateTo && entryDate && entryDate > dateTo) return false;

        return true;
      })
      .sort((a, b) => getDateTimeValue(b.timestamp) - getDateTimeValue(a.timestamp));
  }, [logs, subcontractorFilter, actionFilter, dateFrom, dateTo]);

  function clearFilters() {
    setSubcontractorFilter("All");
    setActionFilter("All");
    setDateFrom("");
    setDateTo("");
  }

  const filtersOn = [subcontractorFilter !== "All", actionFilter !== "All", Boolean(dateFrom), Boolean(dateTo)].filter(Boolean).length;
  const shownLogs = filteredLogs.slice(0, shownCount);

  return (
    <Screen
      title="Activity Log"
      subtitle="Subcontractor portal logins, tab views, and submissions, most recent first"
    >
      <div className="ui-actions-row">
        <BigButton kind="second" onClick={() => setShowFilters(true)}>
          {filtersOn ? `Filter (${filtersOn} on)` : "Filter"}
        </BigButton>
        {filtersOn ? (
          <BigButton kind="quiet" onClick={clearFilters}>
            Clear filters
          </BigButton>
        ) : null}
        {!loading && !error ? (
          <span className="ui-muted" role="status">
            {filteredLogs.length} of {logs.length}
          </span>
        ) : null}
      </div>

      {loading ? (
        <SkeletonList rows={4} />
      ) : error ? (
        <ErrorBox title="We could not load the activity log." text={error} onRetry={() => setAttempt((n) => n + 1)} />
      ) : filteredLogs.length === 0 ? (
        logs.length === 0 ? (
          <EmptyState title="No activity yet" text="Logins and views from the subcontractor portal show up here." />
        ) : (
          <EmptyState
            title="No activity matches"
            text="Try other dates, or clear the filters."
            action={
              <BigButton kind="second" onClick={clearFilters}>
                Clear filters
              </BigButton>
            }
          />
        )
      ) : (
        <>
          <CardList
            label="Activity"
            items={shownLogs.map((entry, index) => ({ entry, index }))}
            getKey={({ entry, index }) => `${entry.timestamp || "entry"}-${index}`}
            renderCard={({ entry }) => (
              <Card title={clean(entry.subcontractorName) || "Unknown"}>
                <p className="ui-card-text">
                  <span className="ui-strong">{clean(entry.actionType) || "No action"}</span> · {formatDateTime(entry.timestamp)}
                </p>
                {clean(entry.details) ? <p className="ui-card-text">{clean(entry.details)}</p> : null}
              </Card>
            )}
            columns={[
              { header: "Timestamp", cell: ({ entry }) => <span className="ui-nowrap">{formatDateTime(entry.timestamp)}</span> },
              { header: "Subcontractor Name", cell: ({ entry }) => <span className="ui-strong">{clean(entry.subcontractorName) || "Unknown"}</span> },
              { header: "Action Type", cell: ({ entry }) => clean(entry.actionType) || "No action" },
              { header: "Details", cell: ({ entry }) => clean(entry.details) || "None" },
            ]}
          />
          {filteredLogs.length > shownCount ? (
            <div>
              <BigButton kind="second" onClick={() => setShownCount((n) => n + PAGE_SIZE)}>
                Show {Math.min(PAGE_SIZE, filteredLogs.length - shownCount)} more
              </BigButton>
            </div>
          ) : null}
        </>
      )}

      <Sheet open={showFilters} title="Filter" onClose={() => setShowFilters(false)} closeLabel="Done">
        <SelectField label="Subcontractor" value={subcontractorFilter} onChange={(e) => setSubcontractorFilter(e.target.value)}>
          <option value="All">All</option>
          {subcontractorNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Action" value={actionFilter} onChange={(e) => setActionFilter(e.target.value as ActionCategory)}>
          {ACTION_CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label.replace(/^Action: /, "")}
            </option>
          ))}
        </SelectField>
        <Field label="From" type="date" optional value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <Field label="To" type="date" optional value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <p className="ui-muted" role="status">
          {filteredLogs.length} of {logs.length}
        </p>
        {filtersOn ? (
          <div>
            <BigButton kind="quiet" onClick={clearFilters}>
              Clear filters
            </BigButton>
          </div>
        ) : null}
      </Sheet>
    </Screen>
  );
}
