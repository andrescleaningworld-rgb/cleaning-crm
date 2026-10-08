"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { isScheduleEffectivelyActive } from "@/lib/scheduleRecurrence";
import {
  BigButton,
  Card,
  CardList,
  EmptyState,
  ErrorBox,
  Field,
  LABELS,
  SaveStatus,
  Screen,
  SearchBar,
  SelectField,
  Sheet,
  SkeletonList,
  StatusPill,
  Tabs,
  TextAreaField,
  useSaveAction,
  type StatusKind,
} from "@/app/ui";

const SubVisitLog = dynamic(() => import("../visits/sub-visit-log"), { ssr: false });

type SubScheduleForJoin = { subId: string; status: string; effectiveEnd: string };

type Subcontractor = {
  id?: string;
  ID?: string;
  subcontractorId?: string;

  companyName?: string;
  CompanyName?: string;
  company?: string;

  contactName?: string;
  ContactName?: string;

  phone?: string;
  Phone?: string;

  email?: string;
  Email?: string;

  address?: string;
  Address?: string;

  areasServiced?: string;
  AreasServiced?: string;

  servicesProvided?: string;
  ServicesProvided?: string;

  employeeCapacity?: string;
  EmployeeCapacity?: string;

  insuranceExpiration?: string;
  InsuranceExpiration?: string;

  status?: string;
  Status?: string;

  score?: string;
  Score?: string;

  complaints?: string;
  Complaints?: string;

  avgCondition?: string;
  AvgCondition?: string;
  "Avg Condition"?: string;

  accountsAssigned?: string;
  AccountsAssigned?: string;
  "Accounts Assigned"?: string;

  subRevenue?: string;
  SubRevenue?: string;
  "Sub Revenue"?: string;
  monthlySubRevenue?: string;
  MonthlySubRevenue?: string;
  "Monthly Sub Revenue"?: string;

  cleaningWorldRevenue?: string;
  CleaningWorldRevenue?: string;
  "Cleaning World Revenue"?: string;
  monthlyRevenue?: string;
  MonthlyRevenue?: string;
  "Monthly Revenue"?: string;

  lastReview?: string;
  LastReview?: string;
  "Last Review"?: string;

  notes?: string;
  Notes?: string;
};

type SubcontractorsApiResponse = {
  success?: boolean;
  error?: string;
  subcontractors?: Subcontractor[];
  data?: Subcontractor[];
};

function getSubId(sub: Subcontractor) {
  return sub.id || sub.ID || sub.subcontractorId || "";
}

function getCompanyName(sub: Subcontractor) {
  return sub.companyName || sub.CompanyName || sub.company || "Unnamed Subcontractor";
}

function getContactName(sub: Subcontractor) {
  return sub.contactName || sub.ContactName || "";
}

function getPhone(sub: Subcontractor) {
  return sub.phone || sub.Phone || "";
}

function getEmail(sub: Subcontractor) {
  return sub.email || sub.Email || "";
}

function getStatus(sub: Subcontractor) {
  return sub.status || sub.Status || "Active";
}

function getScore(sub: Subcontractor) {
  return sub.score || sub.Score || "";
}

function getComplaints(sub: Subcontractor) {
  return sub.complaints || sub.Complaints || "";
}

function getAvgCondition(sub: Subcontractor) {
  return sub.avgCondition || sub.AvgCondition || sub["Avg Condition"] || "";
}

function getAccountsAssigned(sub: Subcontractor) {
  return (
    sub.accountsAssigned ||
    sub.AccountsAssigned ||
    sub["Accounts Assigned"] ||
    ""
  );
}

function getSubRevenue(sub: Subcontractor) {
  return (
    sub.subRevenue ||
    sub.SubRevenue ||
    sub["Sub Revenue"] ||
    sub.monthlySubRevenue ||
    sub.MonthlySubRevenue ||
    sub["Monthly Sub Revenue"] ||
    ""
  );
}

function getCleaningWorldRevenue(sub: Subcontractor) {
  return (
    sub.cleaningWorldRevenue ||
    sub.CleaningWorldRevenue ||
    sub["Cleaning World Revenue"] ||
    sub.monthlyRevenue ||
    sub.MonthlyRevenue ||
    sub["Monthly Revenue"] ||
    ""
  );
}

function getNumberValue(value: string) {
  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? 0 : numberValue;
}

function getMoneyValue(value: string) {
  const cleaned = String(value || "").replace(/[$,]/g, "").trim();
  const numberValue = Number(cleaned);
  return Number.isNaN(numberValue) ? 0 : numberValue;
}

function formatMoney(value: string) {
  const numberValue = getMoneyValue(value);

  if (!numberValue) return "None";

  return numberValue.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

// Same score bands as before; `kind` is the pill color + icon.
function getScoreStatus(scoreValue: string): { label: string; value: string; kind: StatusKind } {
  const score = Number(scoreValue);

  if (!scoreValue || Number.isNaN(score)) {
    return { label: "Not Scored", value: "notScored", kind: "off" };
  }
  if (score >= 9) return { label: "Excellent", value: "excellent", kind: "done" };
  if (score >= 8) return { label: "Good", value: "good", kind: "done" };
  if (score >= 7) return { label: "Needs Attention", value: "needsAttention", kind: "waiting" };
  return { label: "High Risk", value: "highRisk", kind: "needs-you" };
}

function getLoadedSubcontractors(
  data: SubcontractorsApiResponse | Subcontractor[]
) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.subcontractors)) return data.subcontractors;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

const EMPTY_FORM = {
  companyName: "",
  contactName: "",
  phone: "",
  email: "",
  address: "",
  areasServiced: "",
  servicesProvided: "",
  employeeCapacity: "",
  insuranceExpiration: "",
  status: "Active",
  score: "",
  complaints: "",
  avgCondition: "",
  accountsAssigned: "",
  lastReview: "",
  notes: "",
};

const SORT_OPTIONS: [string, string][] = [
  ["nameAsc", "Name A-Z"],
  ["nameDesc", "Name Z-A"],
  ["scoreHigh", "Highest score"],
  ["scoreLow", "Lowest score"],
  ["conditionHigh", "Best avg condition"],
  ["conditionLow", "Worst avg condition"],
  ["accountsHigh", "Most accounts"],
  ["accountsLow", "Least accounts"],
  ["subRevenueHigh", "Most sub revenue"],
  ["subRevenueLow", "Least sub revenue"],
  ["cleaningWorldRevenueHigh", "Most CW revenue"],
  ["cleaningWorldRevenueLow", "Least CW revenue"],
  ["complaintsHigh", "Most complaints"],
  ["complaintsLow", "Least complaints"],
];

function AddSubcontractorSheet({ onClose, onAdded }: { onClose: () => void; onAdded: () => Promise<void> }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [nameError, setNameError] = useState("");

  function updateForm(field: keyof typeof EMPTY_FORM, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const save = useSaveAction(
    async (values: typeof EMPTY_FORM) => {
      let res: Response;
      try {
        res = await fetch("/api/subcontractors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "addSubcontractor", ...values }),
        });
      } catch {
        throw new Error("The internet dropped. Check your connection and try again.");
      }
      const data = (await res.json().catch(() => ({}))) as SubcontractorsApiResponse;
      if (!res.ok || data.success === false) {
        throw new Error(data.error || "The subcontractor was not saved.");
      }
      await onAdded();
    },
    { savedMessage: "Subcontractor saved", onSaved: onClose }
  );

  function handleSave() {
    if (!form.companyName.trim()) {
      setNameError("Type the company name.");
      return;
    }
    setNameError("");
    void save.run(form);
  }

  const disabled = save.saving;

  return (
    <Sheet
      open
      title="Add a subcontractor"
      onClose={onClose}
      busy={save.saving}
      actions={
        <BigButton busy={save.saving} busyLabel="Saving…" onClick={handleSave}>
          Save subcontractor
        </BigButton>
      }
    >
      <Field
        label="Company name"
        value={form.companyName}
        onChange={(e) => {
          updateForm("companyName", e.target.value);
          setNameError("");
        }}
        error={nameError}
        disabled={disabled}
      />
      <Field label="Contact name" optional value={form.contactName} onChange={(e) => updateForm("contactName", e.target.value)} disabled={disabled} />
      <Field label="Phone" optional type="tel" inputMode="tel" value={form.phone} onChange={(e) => updateForm("phone", e.target.value)} disabled={disabled} />
      <Field label="Email" optional type="email" inputMode="email" value={form.email} onChange={(e) => updateForm("email", e.target.value)} disabled={disabled} />
      <Field label="Address" optional value={form.address} onChange={(e) => updateForm("address", e.target.value)} disabled={disabled} />
      <Field
        label="Areas serviced"
        optional
        placeholder="Bergen, Essex, Hudson"
        value={form.areasServiced}
        onChange={(e) => updateForm("areasServiced", e.target.value)}
        disabled={disabled}
      />
      <Field
        label="Services provided"
        optional
        placeholder="Janitorial, floor work, carpet"
        value={form.servicesProvided}
        onChange={(e) => updateForm("servicesProvided", e.target.value)}
        disabled={disabled}
      />
      <Field label="Employee capacity" optional value={form.employeeCapacity} onChange={(e) => updateForm("employeeCapacity", e.target.value)} disabled={disabled} />
      <Field
        label="Insurance expiration"
        optional
        type="date"
        value={form.insuranceExpiration}
        onChange={(e) => updateForm("insuranceExpiration", e.target.value)}
        disabled={disabled}
      />
      <SelectField label="Status" value={form.status} onChange={(e) => updateForm("status", e.target.value)} disabled={disabled}>
        <option value="Active">Active</option>
        <option value="Paused">Paused</option>
        <option value="Inactive">Inactive</option>
      </SelectField>

      <Card title="Performance score">
        <p className="ui-card-text">Use a simple 0–10 score to track subcontractor performance.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 12 }}>
          <Field label="Score" optional type="number" min="0" max="10" step="0.1" placeholder="8.5" value={form.score} onChange={(e) => updateForm("score", e.target.value)} disabled={disabled} />
          <Field label="Complaints" optional type="number" min="0" placeholder="0" value={form.complaints} onChange={(e) => updateForm("complaints", e.target.value)} disabled={disabled} />
          <Field label="Avg condition" optional type="number" min="0" max="10" step="0.1" placeholder="8.0" value={form.avgCondition} onChange={(e) => updateForm("avgCondition", e.target.value)} disabled={disabled} />
          <Field label="Accounts assigned" optional type="number" min="0" placeholder="12" value={form.accountsAssigned} onChange={(e) => updateForm("accountsAssigned", e.target.value)} disabled={disabled} />
          <Field label="Last review" optional type="date" value={form.lastReview} onChange={(e) => updateForm("lastReview", e.target.value)} disabled={disabled} />
        </div>
      </Card>

      <TextAreaField label="Notes" optional rows={4} value={form.notes} onChange={(e) => updateForm("notes", e.target.value)} disabled={disabled} />
      {save.state === "error" ? <SaveStatus action={save} /> : null}
    </Sheet>
  );
}

export default function SubcontractorsPage() {
  const [adminTab, setAdminTab] = useState<"subs" | "log">("subs");
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [performanceFilter, setPerformanceFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [scheduleFilter, setScheduleFilter] = useState("all");
  const [sortBy, setSortBy] = useState("nameAsc");
  // Emails (SubID in the SubSchedules sheet is the subcontractor's email —
  // same convention app/sub-schedules/page.tsx relies on) with at least one
  // effectively-active schedule. Loaded once, best-effort — a failure here
  // just means the "No Schedule" filter/badge can't tell, not a page error.
  const [scheduledSubEmails, setScheduledSubEmails] = useState<Set<string> | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const loadSubcontractors = useCallback(async () => {
    try {
      const res = await fetch("/api/subcontractors", {
        cache: "no-store",
      });

      const data = (await res.json()) as
        | SubcontractorsApiResponse
        | Subcontractor[];

      if (!res.ok || (!Array.isArray(data) && data.success === false)) {
        throw new Error(
          !Array.isArray(data) && data.error
            ? data.error
            : "We could not load the subcontractors."
        );
      }

      setError("");
      setSubcontractors(getLoadedSubcontractors(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSubcontractors();
  }, [loadSubcontractors]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/sub-schedules");
        const data = (await res.json()) as { schedules?: SubScheduleForJoin[] };
        if (cancelled || !res.ok) return;
        const emails = new Set(
          (data.schedules ?? [])
            .filter((s) => isScheduleEffectivelyActive(s))
            .map((s) => s.subId.trim().toLowerCase())
            .filter(Boolean)
        );
        setScheduledSubEmails(emails);
      } catch {
        // Best-effort — leave scheduledSubEmails null, which the filter/badge
        // below treat as "unknown" rather than "no schedule".
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasSchedule = useCallback((sub: Subcontractor): boolean | null => {
    if (!scheduledSubEmails) return null;
    const email = getEmail(sub).trim().toLowerCase();
    if (!email) return null;
    return scheduledSubEmails.has(email);
  }, [scheduledSubEmails]);

  const filteredSubcontractors = useMemo(() => {
    const q = search.toLowerCase().trim();

    const filtered = subcontractors.filter((sub) => {
      const status = getStatus(sub).toLowerCase().trim();
      const scoreStatus = getScoreStatus(getScore(sub));
      const accountsAssigned = getNumberValue(getAccountsAssigned(sub));

      const matchesSearch =
        !q ||
        [
          getCompanyName(sub),
          getContactName(sub),
          getPhone(sub),
          getEmail(sub),
          getStatus(sub),
          getScore(sub),
          getAvgCondition(sub),
          getScoreStatus(getScore(sub)).label,
          getAccountsAssigned(sub),
          getSubRevenue(sub),
          getCleaningWorldRevenue(sub),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);

      const matchesStatus =
        statusFilter === "all" || status === statusFilter.toLowerCase();

      const matchesPerformance =
        performanceFilter === "all" || scoreStatus.value === performanceFilter;

      const matchesAccountFilter =
        accountFilter === "all" ||
        (accountFilter === "hasAccounts" && accountsAssigned > 0) ||
        (accountFilter === "noAccounts" && accountsAssigned <= 0);

      const subHasSchedule = hasSchedule(sub);
      const matchesScheduleFilter =
        scheduleFilter === "all" ||
        (scheduleFilter === "hasSchedule" && subHasSchedule === true) ||
        (scheduleFilter === "noSchedule" && subHasSchedule === false);

      return (
        matchesSearch &&
        matchesStatus &&
        matchesPerformance &&
        matchesAccountFilter &&
        matchesScheduleFilter
      );
    });

    return [...filtered].sort((a, b) => {
      const companyA = getCompanyName(a).toLowerCase();
      const companyB = getCompanyName(b).toLowerCase();

      const scoreA = getNumberValue(getScore(a));
      const scoreB = getNumberValue(getScore(b));

      const conditionA = getNumberValue(getAvgCondition(a));
      const conditionB = getNumberValue(getAvgCondition(b));

      const accountsA = getNumberValue(getAccountsAssigned(a));
      const accountsB = getNumberValue(getAccountsAssigned(b));

      const complaintsA = getNumberValue(getComplaints(a));
      const complaintsB = getNumberValue(getComplaints(b));

      const subRevenueA = getMoneyValue(getSubRevenue(a));
      const subRevenueB = getMoneyValue(getSubRevenue(b));

      const cleaningWorldRevenueA = getMoneyValue(getCleaningWorldRevenue(a));
      const cleaningWorldRevenueB = getMoneyValue(getCleaningWorldRevenue(b));

      switch (sortBy) {
        case "nameDesc":
          return companyB.localeCompare(companyA);

        case "scoreHigh":
          return scoreB - scoreA;

        case "scoreLow":
          return scoreA - scoreB;

        case "conditionHigh":
          return conditionB - conditionA;

        case "conditionLow":
          return conditionA - conditionB;

        case "accountsHigh":
          return accountsB - accountsA;

        case "accountsLow":
          return accountsA - accountsB;

        case "complaintsHigh":
          return complaintsB - complaintsA;

        case "complaintsLow":
          return complaintsA - complaintsB;

        case "subRevenueHigh":
          return subRevenueB - subRevenueA;

        case "subRevenueLow":
          return subRevenueA - subRevenueB;

        case "cleaningWorldRevenueHigh":
          return cleaningWorldRevenueB - cleaningWorldRevenueA;

        case "cleaningWorldRevenueLow":
          return cleaningWorldRevenueA - cleaningWorldRevenueB;

        case "nameAsc":
        default:
          return companyA.localeCompare(companyB);
      }
    });
  }, [
    subcontractors,
    search,
    statusFilter,
    performanceFilter,
    accountFilter,
    scheduleFilter,
    hasSchedule,
    sortBy,
  ]);

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
    setPerformanceFilter("all");
    setAccountFilter("all");
    setScheduleFilter("all");
    setSortBy("nameAsc");
  }

  const activeFilters =
    [statusFilter, performanceFilter, accountFilter, scheduleFilter].filter((f) => f !== "all").length +
    (sortBy !== "nameAsc" ? 1 : 0);

  const scorePill = (sub: Subcontractor) => {
    const status = getScoreStatus(getScore(sub));
    return <StatusPill kind={status.kind}>{status.label}</StatusPill>;
  };

  const schedulePill = (sub: Subcontractor) => {
    const subHasSchedule = hasSchedule(sub);
    if (subHasSchedule === null) return <span className="ui-muted">Not known</span>;
    return subHasSchedule ? (
      <StatusPill kind="done">Has Schedule</StatusPill>
    ) : (
      <StatusPill kind="waiting">No Schedule</StatusPill>
    );
  };

  const scoreText = (sub: Subcontractor) => (getScore(sub) ? `${getScore(sub)} / 10` : "No score");
  const countsText = (sub: Subcontractor) =>
    `${getAccountsAssigned(sub) || "0"} accounts · ${getComplaints(sub) || "0"} complaints`;

  const actions = (sub: Subcontractor) => {
    const id = getSubId(sub);
    return (
      <div className="ui-actions-row">
        {id ? (
          <BigButton kind="second" href={`/subcontractors/${encodeURIComponent(id)}`}>
            {LABELS.open}
          </BigButton>
        ) : (
          <span className="ui-field-error">This row has no ID, so it cannot be opened.</span>
        )}
        {hasSchedule(sub) === false && getEmail(sub) ? (
          <BigButton kind="second" href={`/sub-schedules?subId=${encodeURIComponent(getEmail(sub))}&addSchedule=1`}>
            Add schedule
          </BigButton>
        ) : null}
      </div>
    );
  };

  const nameLink = (sub: Subcontractor) => {
    const id = getSubId(sub);
    return id ? (
      <Link href={`/subcontractors/${encodeURIComponent(id)}`} className="ui-table-rowlink">
        {getCompanyName(sub)}
      </Link>
    ) : (
      <span className="ui-strong">{getCompanyName(sub)}</span>
    );
  };

  return (
    <Screen
      title="Subcontractors"
      subtitle="View, score, add, and manage Cleaning World subcontractors"
      action={
        adminTab === "subs" ? (
          <BigButton icon="plus" onClick={() => setShowForm(true)}>
            Add subcontractor
          </BigButton>
        ) : undefined
      }
    >
      <Tabs
        label="Subcontractor sections"
        value={adminTab}
        onChange={setAdminTab}
        tabs={[
          { value: "subs", label: "Subcontractors" },
          { value: "log", label: "Service Log" },
        ]}
      />

      {adminTab === "subs" ? (
        <>
          <SearchBar value={search} onChange={setSearch} label="Search subcontractors" placeholder="Search name, phone, email" />

          <div className="ui-actions-row">
            <BigButton kind="second" onClick={() => setShowFilters(true)}>
              {activeFilters ? `Filter and sort (${activeFilters} on)` : "Filter and sort"}
            </BigButton>
            {activeFilters || search ? (
              <BigButton kind="quiet" onClick={clearFilters}>
                Clear filters
              </BigButton>
            ) : null}
            {!loading && !error ? (
              <span className="ui-muted" role="status">
                Showing {filteredSubcontractors.length} of {subcontractors.length} subcontractors
              </span>
            ) : null}
          </div>

          {loading ? (
            <SkeletonList rows={4} />
          ) : error ? (
            <ErrorBox
              title="We could not load the subcontractors."
              text={error}
              onRetry={() => {
                setLoading(true);
                void loadSubcontractors();
              }}
            />
          ) : filteredSubcontractors.length === 0 ? (
            subcontractors.length === 0 ? (
              <EmptyState
                title="No subcontractors yet"
                text="Add the first cleaning company you work with."
                action={
                  <BigButton kind="second" icon="plus" onClick={() => setShowForm(true)}>
                    Add subcontractor
                  </BigButton>
                }
              />
            ) : (
              <EmptyState
                title="No subcontractors match"
                text="Try a shorter search, or clear the filters."
                action={
                  <BigButton kind="second" onClick={clearFilters}>
                    Clear filters
                  </BigButton>
                }
              />
            )
          ) : (
            <CardList
              label="Subcontractors"
              items={filteredSubcontractors}
              getKey={(sub) => getSubId(sub) || `${getCompanyName(sub)}-${getContactName(sub)}-${getEmail(sub)}`}
              renderCard={(sub) => (
                <Card title={getCompanyName(sub)} right={scorePill(sub)}>
                  {getContactName(sub) ? <p className="ui-card-text">{getContactName(sub)}</p> : null}
                  <p className="ui-card-text">
                    {scoreText(sub)} · {countsText(sub)}
                  </p>
                  <p className="ui-card-text">
                    Sub revenue {formatMoney(getSubRevenue(sub))} · CW revenue {formatMoney(getCleaningWorldRevenue(sub))}
                  </p>
                  <div className="ui-actions-row" style={{ marginTop: 8 }}>
                    {schedulePill(sub)}
                    <span className="ui-muted">Status: {getStatus(sub)}</span>
                  </div>
                  <div style={{ marginTop: 12 }}>{actions(sub)}</div>
                </Card>
              )}
              columns={[
                {
                  header: "Company",
                  cell: (sub) => (
                    <>
                      {nameLink(sub)}
                      {getContactName(sub) ? <p className="ui-muted">{getContactName(sub)}</p> : null}
                    </>
                  ),
                },
                {
                  header: "Score",
                  cell: (sub) => (
                    <>
                      <p className="ui-strong">{scoreText(sub)}</p>
                      {scorePill(sub)}
                    </>
                  ),
                },
                {
                  header: "Revenue",
                  cell: (sub) => (
                    <>
                      <p className="ui-muted ui-nowrap">Sub {formatMoney(getSubRevenue(sub))}</p>
                      <p className="ui-muted ui-nowrap">CW {formatMoney(getCleaningWorldRevenue(sub))}</p>
                    </>
                  ),
                },
                {
                  header: "Accounts and complaints",
                  cell: (sub) => (
                    <>
                      <p className="ui-muted">{getAccountsAssigned(sub) || "0"} accounts</p>
                      <p className="ui-muted">{getComplaints(sub) || "0"} complaints</p>
                    </>
                  ),
                },
                { header: "Schedule", cell: schedulePill },
                { header: "Status", cell: (sub) => getStatus(sub) },
                { header: "Action", cell: actions },
              ]}
            />
          )}
        </>
      ) : (
        <SubVisitLog />
      )}

      <Sheet open={showFilters} title="Filter and sort" onClose={() => setShowFilters(false)} closeLabel="Done">
        <SelectField label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="inactive">Inactive</option>
        </SelectField>
        <SelectField label="Performance" value={performanceFilter} onChange={(e) => setPerformanceFilter(e.target.value)}>
          <option value="all">All performance</option>
          <option value="excellent">Excellent</option>
          <option value="good">Good</option>
          <option value="needsAttention">Needs Attention</option>
          <option value="highRisk">High Risk</option>
          <option value="notScored">Not Scored</option>
        </SelectField>
        <SelectField label="Accounts" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
          <option value="all">All accounts</option>
          <option value="hasAccounts">Has accounts</option>
          <option value="noAccounts">No accounts</option>
        </SelectField>
        <SelectField label="Schedule" value={scheduleFilter} onChange={(e) => setScheduleFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="hasSchedule">Has schedule</option>
          <option value="noSchedule">No schedule</option>
        </SelectField>
        <SelectField label="Sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          {SORT_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        <p className="ui-muted" role="status">
          Showing {filteredSubcontractors.length} of {subcontractors.length} subcontractors
        </p>
        {activeFilters ? (
          <div>
            <BigButton kind="quiet" onClick={clearFilters}>
              Clear filters
            </BigButton>
          </div>
        ) : null}
      </Sheet>

      {showForm ? <AddSubcontractorSheet onClose={() => setShowForm(false)} onAdded={loadSubcontractors} /> : null}
    </Screen>
  );
}
