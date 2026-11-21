"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  BigButton,
  Card,
  CardList,
  EmptyState,
  ErrorBox,
  Field,
  LABELS,
  MoreMenu,
  SaveStatus,
  Screen,
  SelectField,
  Sheet,
  showToast,
  SkeletonList,
  StatusPill,
  TextAreaField,
  useSaveAction,
  type StatusKind,
} from "@/app/ui";
import { accountsOfSub, complaintsOfSub } from "@/lib/complaintsBySub";
import { DATE_PRESETS, inRange, presetRange, reviewComplaintOf, validityCounts, type DatePreset } from "@/lib/complaintReview";
import ComplaintReviewPrint from "@/app/components/complaint-review-print";
import InviteToPortal from "./invite-to-portal";
import CrewsDetail from "./crews";
import { shareOfRevenue } from "@/lib/payShare";
import { CREW_LANGS, isCrewLang } from "@/lib/crewLinkPeople";
import EmailLogList from "@/app/components/email-log-list";
import { SubInsuranceCard } from "@/app/components/sub-insurance";

type AnyRow = Record<string, unknown>;

type Subcontractor = {
  id?: string;
  ID?: string;
  subcontractorId?: string;
  "Subcontractor ID"?: string;

  companyName?: string;
  CompanyName?: string;
  "Company Name"?: string;
  company?: string;
  Company?: string;
  name?: string;
  Name?: string;

  contactName?: string;
  ContactName?: string;
  "Contact Name"?: string;

  phone?: string;
  Phone?: string;
  /** en / es / pt (migration 087). */
  language?: string;

  email?: string;
  Email?: string;

  address?: string;
  Address?: string;

  areasServiced?: string;
  AreasServiced?: string;
  "Areas Serviced"?: string;

  servicesProvided?: string;
  ServicesProvided?: string;
  "Services Provided"?: string;

  employeeCapacity?: string;
  EmployeeCapacity?: string;
  "Employee Capacity"?: string;

  insuranceExpiration?: string;
  InsuranceExpiration?: string;
  "Insurance Expiration"?: string;

  status?: string;
  Status?: string;

  score?: string;
  Score?: string;

  scoreStatus?: string;
  /** "Yes" / "No" (migration 071). */
  excludeFromScore?: string;
  ExcludeFromScore?: string;
  ScoreStatus?: string;
  "Score Status"?: string;

  complaints?: string;
  Complaints?: string;

  avgCondition?: string;
  AvgCondition?: string;
  "Avg Condition"?: string;

  accountsAssigned?: string;
  AccountsAssigned?: string;
  "Accounts Assigned"?: string;

  lastReview?: string;
  LastReview?: string;
  "Last Review"?: string;

  notes?: string;
  Notes?: string;
};

type ApiResponse = {
  success?: boolean;
  error?: string;
  subcontractors?: Subcontractor[];
  accounts?: AnyRow[];
  complaints?: AnyRow[];
  data?: AnyRow[];
};

type SaveResponse = {
  success?: boolean;
  error?: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function getAnyValue(row: AnyRow, possibleKeys: string[]) {
  for (const key of possibleKeys) {
    const value = row[key];

    if (value !== undefined && value !== null && value !== "") {
      return clean(value);
    }
  }

  return "";
}

function subcontractorToRow(sub: Subcontractor): AnyRow {
  return sub as AnyRow;
}

function getSubId(sub: Subcontractor) {
  return getAnyValue(subcontractorToRow(sub), [
    "id",
    "ID",
    "subcontractorId",
    "Subcontractor ID",
  ]);
}

function getCompanyName(sub: Subcontractor) {
  return (
    getAnyValue(subcontractorToRow(sub), [
      "companyName",
      "CompanyName",
      "Company Name",
      "company",
      "Company",
      "name",
      "Name",
    ]) || "Unnamed Subcontractor"
  );
}

function getValue(
  sub: Subcontractor,
  camelKey: keyof Subcontractor,
  capsKey: keyof Subcontractor,
  spacedKey?: keyof Subcontractor
) {
  return clean(
    sub[camelKey] || sub[capsKey] || (spacedKey ? sub[spacedKey] : "") || ""
  );
}

function money(value: unknown) {
  const number = Number(clean(value).replace(/[$,]/g, "") || 0);

  return number.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function numberValue(value: unknown) {
  return Number(clean(value).replace(/[$,% ,]/g, "") || 0);
}

// "Tue, Oct 7" (with the year when it is not this year). Text that is not a
// date is shown as typed; blank stays blank.
function niceDate(value: unknown) {
  const text = clean(value);
  if (!text) return "";

  // A bare YYYY-MM-DD is a calendar day: build it in local time so it never
  // shows as the day before.
  const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const date = dayOnly ? new Date(Number(dayOnly[1]), Number(dayOnly[2]) - 1, Number(dayOnly[3])) : new Date(text);
  if (Number.isNaN(date.getTime())) return text;

  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

// Same score bands as before; `kind` is the pill color + icon.
function getScoreStatus(scoreValue: string, existingStatus?: string): { label: string; kind: StatusKind } {
  if (existingStatus) {
    return { label: existingStatus, kind: scoreStatusKind(existingStatus) };
  }

  const score = Number(scoreValue);

  if (!scoreValue || Number.isNaN(score)) return { label: "Not Scored", kind: "off" };
  if (score >= 9) return { label: "Excellent", kind: "done" };
  if (score >= 8) return { label: "Good", kind: "done" };
  if (score >= 7) return { label: "Needs Attention", kind: "waiting" };
  return { label: "High Risk", kind: "needs-you" };
}

function scoreStatusKind(status: string): StatusKind {
  const cleanStatus = status.toLowerCase();

  if (cleanStatus === "excellent" || cleanStatus === "good") return "done";
  if (cleanStatus === "needs attention") return "waiting";
  if (cleanStatus === "high risk") return "needs-you";

  return "off";
}

// Same order of checks as before ("inactive" contains "active").
function statusKind(statusValue: string): StatusKind {
  const status = statusValue.toLowerCase();

  if (status.includes("active") && !status.includes("inactive")) return "done";
  if (status.includes("cancel")) return "needs-you";
  if (status.includes("paused")) return "waiting";

  return "off";
}

function getInsuranceStatus(expirationValue: string): { label: string; kind: StatusKind } {
  if (!expirationValue) return { label: "No Date", kind: "off" };

  const expiration = new Date(expirationValue);

  if (Number.isNaN(expiration.getTime())) return { label: "Check Date", kind: "waiting" };

  const today = new Date();
  const soon = new Date();
  soon.setDate(today.getDate() + 30);

  if (expiration < today) return { label: "Expired", kind: "needs-you" };
  if (expiration <= soon) return { label: "Expiring Soon", kind: "waiting" };

  return { label: "Current", kind: "done" };
}

function getAccountId(account: AnyRow) {
  return getAnyValue(account, ["id", "ID", "accountId", "Account ID"]);
}

function getAccountName(account: AnyRow) {
  return (
    getAnyValue(account, [
      "accountName",
      "Account Name",
      "account",
      "Account",
      "customer",
      "Customer",
      "name",
      "Name",
    ]) || "-"
  );
}

function getAccountManager(account: AnyRow) {
  return getAnyValue(account, [
    "manager",
    "Manager",
    "accountManager",
    "Account Manager",
  ]);
}


function getAccountStatus(account: AnyRow) {
  return getAnyValue(account, [
    "status",
    "Status",
    "accountStatus",
    "Account Status",
  ]);
}

function getFrequency(account: AnyRow) {
  return getAnyValue(account, ["frequency", "Frequency"]);
}

function getCleaningDays(account: AnyRow) {
  return getAnyValue(account, ["cleaningDays", "Cleaning Days"]);
}

function getStartDate(account: AnyRow) {
  return getAnyValue(account, [
    "accountStartDate",
    "Account Start Date",
    "startDate",
    "Start Date",
    "serviceStartDate",
    "Service Start Date",
    "dateStarted",
    "Date Started",
  ]);
}

function getCancelledDate(account: AnyRow) {
  return getAnyValue(account, [
    "cancelledDate",
    "Cancelled Date",
    "canceledDate",
    "Canceled Date",
    "dateCancelled",
    "Date Cancelled",
    "cancellationDate",
    "Cancellation Date",
  ]);
}

function getMonthlyRevenue(account: AnyRow) {
  return numberValue(
    getAnyValue(account, [
      "monthlyRevenue",
      "Monthly Revenue",
      "whatCleaningWorldGetsPaid",
      "What Cleaning World Gets Paid",
      "cleaningWorldGetsPaid",
      "Cleaning World Gets Paid",
      "monthlyAmount",
      "Monthly Amount",
      "price",
      "Price",
    ])
  );
}

function getMonthlySubPay(account: AnyRow) {
  return numberValue(
    getAnyValue(account, [
      "monthlySubcontractorPay",
      "Monthly Subcontractor Pay",
      "subcontractorPay",
      "Subcontractor Pay",
      "subPay",
      "Sub Pay",
      "cleanerPay",
      "Cleaner Pay",
    ])
  );
}

function getGrossMargin(account: AnyRow) {
  return getMonthlyRevenue(account) - getMonthlySubPay(account);
}


function getAccountHealth(account: AnyRow) {
  return getAnyValue(account, [
    "accountHealth",
    "Account Health",
    "health",
    "Health",
  ]);
}

function getAccountNotes(account: AnyRow) {
  return getAnyValue(account, [
    "notes",
    "Notes",
    "cancelReason",
    "Cancel Reason",
    "cancellationReason",
    "Cancellation Reason",
    "reason",
    "Reason",
  ]);
}

/** The Complaint Detail page (app/complaints/[id]); "" when the complaint has no ID or row number. */
function complaintHref(complaint: AnyRow): string {
  const key = String(complaint.id ?? "").trim() || String(complaint.rowNumber ?? "").trim();
  return key ? `/complaints/${encodeURIComponent(key)}` : "";
}

function getComplaintAccountName(complaint: AnyRow) {
  return getAnyValue(complaint, [
    "account",
    "Account",
    "accountName",
    "Account Name",
  ]);
}

function getComplaintStatus(complaint: AnyRow) {
  return getAnyValue(complaint, [
    "status",
    "Status",
    "complaintStatus",
    "Complaint Status",
  ]);
}

function getComplaintDate(complaint: AnyRow) {
  return getAnyValue(complaint, [
    "date",
    "Date",
    "complaintDate",
    "Complaint Date",
  ]);
}

function getComplaintIssue(complaint: AnyRow) {
  return getAnyValue(complaint, [
    "issue",
    "Issue",
    "complaint",
    "Complaint",
    "description",
    "Description",
  ]);
}

function getComplaintValidity(complaint: AnyRow) {
  return getAnyValue(complaint, [
    "validity",
    "Validity",
    "complaintValidity",
    "Complaint Validity",
  ]);
}

function normalize(value: unknown) {
  return clean(value).toLowerCase();
}

function createIdFromName(name: string) {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, "-");
}

async function readResult(
  result: PromiseSettledResult<Response>,
  type: "subcontractors" | "accounts" | "complaints"
): Promise<Subcontractor[] | AnyRow[]> {
  if (result.status !== "fulfilled") return [];

  const data = (await result.value.json()) as ApiResponse | AnyRow[];

  if (Array.isArray(data)) return data;

  if (type === "subcontractors" && Array.isArray(data.subcontractors)) {
    return data.subcontractors;
  }

  if (type === "accounts" && Array.isArray(data.accounts)) {
    return data.accounts;
  }

  if (type === "complaints" && Array.isArray(data.complaints)) {
    return data.complaints;
  }

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
  notes: "",
  /** "Yes" / "No": in-house crews and placeholder subs are not scored. */
  excludeFromScore: "No",
  /** en / es / pt: the sub's CW Now to-do texts and screen. */
  language: "en",
};

type SubForm = typeof EMPTY_FORM;

function formFromSubcontractor(subcontractor: Subcontractor): SubForm {
  return {
    companyName:
      getAnyValue(subcontractorToRow(subcontractor), [
        "companyName",
        "CompanyName",
        "Company Name",
        "company",
        "Company",
      ]) || "",
    contactName: getValue(subcontractor, "contactName", "ContactName", "Contact Name"),
    phone: getValue(subcontractor, "phone", "Phone"),
    email: getValue(subcontractor, "email", "Email"),
    address: getValue(subcontractor, "address", "Address"),
    areasServiced: getValue(subcontractor, "areasServiced", "AreasServiced", "Areas Serviced"),
    servicesProvided: getValue(subcontractor, "servicesProvided", "ServicesProvided", "Services Provided"),
    employeeCapacity: getValue(subcontractor, "employeeCapacity", "EmployeeCapacity", "Employee Capacity"),
    insuranceExpiration: getValue(subcontractor, "insuranceExpiration", "InsuranceExpiration", "Insurance Expiration"),
    status: subcontractor.status || subcontractor.Status || "Active",
    notes: getValue(subcontractor, "notes", "Notes"),
    excludeFromScore: getValue(subcontractor, "excludeFromScore", "ExcludeFromScore") === "Yes" ? "Yes" : "No",
    language: isCrewLang(subcontractor.language) ? subcontractor.language : "en",
  };
}

function EditSubcontractorSheet({
  pageId,
  initial,
  onClose,
  onSaved,
}: {
  pageId: string;
  initial: SubForm;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<SubForm>(initial);
  const [nameError, setNameError] = useState("");

  function updateForm(field: keyof SubForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const save = useSaveAction(
    async (values: SubForm) => {
      let res: Response;
      try {
        res = await fetch("/api/subcontractors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "updateSubcontractor",
            id: pageId,
            companyName: values.companyName,
            contactName: values.contactName,
            phone: values.phone,
            email: values.email,
            address: values.address,
            areasServiced: values.areasServiced,
            servicesProvided: values.servicesProvided,
            employeeCapacity: values.employeeCapacity,
            insuranceExpiration: values.insuranceExpiration,
            status: values.status,
            notes: values.notes,
            excludeFromScore: values.excludeFromScore,
            language: values.language,
          }),
        });
      } catch {
        throw new Error("The internet dropped. Check your connection and try again.");
      }
      const data = (await res.json().catch(() => ({}))) as SaveResponse;
      if (!res.ok || data.success === false) {
        throw new Error(data.error || "Your changes were not saved.");
      }
      await onSaved();
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
      title="Change details"
      text="The performance score is automatic and cannot be changed here. It updates from this sub's complaints and the size of its work (active accounts and monthly sub pay)."
      onClose={onClose}
      busy={save.saving}
      actions={
        <BigButton busy={save.saving} busyLabel="Saving…" onClick={handleSave}>
          Save changes
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
      <SelectField label="Language for CW Now to-dos" value={form.language} onChange={(e) => updateForm("language", e.target.value)} disabled={disabled}>
        {CREW_LANGS.map((entry) => (
          <option key={entry.value} value={entry.value}>
            {entry.label}
          </option>
        ))}
      </SelectField>
      <Field label="Address" optional value={form.address} onChange={(e) => updateForm("address", e.target.value)} disabled={disabled} />
      <Field label="Areas serviced" optional value={form.areasServiced} onChange={(e) => updateForm("areasServiced", e.target.value)} disabled={disabled} />
      <Field label="Services provided" optional value={form.servicesProvided} onChange={(e) => updateForm("servicesProvided", e.target.value)} disabled={disabled} />
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
      <SelectField
        label="Exclude from sub score"
        hint="Yes for in-house crews and placeholder subs: no score (Not scored), no ⚠ alert, no score emails."
        value={form.excludeFromScore}
        onChange={(e) => updateForm("excludeFromScore", e.target.value)}
        disabled={disabled}
      >
        <option value="No">No</option>
        <option value="Yes">Yes</option>
      </SelectField>
      <TextAreaField label="Notes" optional rows={4} value={form.notes} onChange={(e) => updateForm("notes", e.target.value)} disabled={disabled} />
      {save.state === "error" ? <SaveStatus action={save} /> : null}
    </Sheet>
  );
}

export default function SubcontractorDetailPage() {
  const params = useParams();

  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const pageId = decodeURIComponent(clean(rawId));

  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [accounts, setAccounts] = useState<AnyRow[]>([]);
  const [complaintsData, setComplaintsData] = useState<AnyRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");

  function handlePrint() {
    window.print();
  }

  // The first load shows placeholders; later reloads (Refresh, after a save)
  // keep the page on screen and swap the data in when it arrives.
  const loadData = useCallback(async () => {
    try {
      setError("");

      const [subcontractorsRes, accountsRes, complaintsRes] =
        await Promise.allSettled([
          fetch("/api/subcontractors", { cache: "no-store" }),
          fetch("/api/accounts", { cache: "no-store" }),
          fetch("/api/complaints", { cache: "no-store" }),
        ]);

      const loadedSubcontractors = await readResult(
        subcontractorsRes,
        "subcontractors"
      );
      const loadedAccounts = await readResult(accountsRes, "accounts");
      const loadedComplaints = await readResult(complaintsRes, "complaints");

      setSubcontractors(loadedSubcontractors as Subcontractor[]);
      setAccounts(loadedAccounts as AnyRow[]);
      setComplaintsData(loadedComplaints as AnyRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
    showToast("Up to date");
  }

  const subcontractor = useMemo(() => {
    return subcontractors.find((sub) => {
      const subId = getSubId(sub);
      return clean(subId) === clean(pageId);
    });
  }, [subcontractors, pageId]);

  const form = useMemo(() => (subcontractor ? formFromSubcontractor(subcontractor) : EMPTY_FORM), [subcontractor]);

  const score = subcontractor ? getValue(subcontractor, "score", "Score") : "";
  const scoreStatusValue = subcontractor
    ? getValue(subcontractor, "scoreStatus", "ScoreStatus", "Score Status")
    : "";
  const avgCondition = subcontractor
    ? getValue(subcontractor, "avgCondition", "AvgCondition", "Avg Condition")
    : "";
  const lastReview = subcontractor
    ? getValue(subcontractor, "lastReview", "LastReview", "Last Review")
    : "";

  const scoreStatus = getScoreStatus(score, scoreStatusValue);
  const insuranceStatus = getInsuranceStatus(form.insuranceExpiration);

  // Ambiguity-safe: each account's Subcontractor resolves to at most one sub,
  // checked against ALL loaded subs (lib/complaintsBySub.ts, shared with the
  // Complaints page's Sub filter).
  const subcontractorAccounts = useMemo(
    () => accountsOfSub(accounts, subcontractors as AnyRow[], subcontractor as AnyRow | undefined),
    [accounts, subcontractors, subcontractor]
  );

  const currentAccounts = useMemo(() => {
    return subcontractorAccounts.filter((account) => {
      const status = normalize(getAccountStatus(account));
      return !status.includes("cancel");
    });
  }, [subcontractorAccounts]);

  // Money and the Active count: only accounts whose status is Active (the
  // same words the Accounts list treats as Active). Paused and Suspended stay
  // in the current list but are not money coming in.
  const activeAccounts = useMemo(
    () => currentAccounts.filter((account) => ["active", "active account", "current"].includes(normalize(getAccountStatus(account)))),
    [currentAccounts]
  );

  const pastAccounts = useMemo(() => {
    return subcontractorAccounts.filter((account) => {
      const status = normalize(getAccountStatus(account));
      return status.includes("cancel");
    });
  }, [subcontractorAccounts]);

  // The same rule as the score: a complaint that has its sub saved belongs
  // to the sub who had the account when it was filed, not to whoever has
  // the account now. One without it counts for the account's sub of today.
  // Shared with the Complaints page's Sub filter (lib/complaintsBySub.ts).
  const relatedComplaints = useMemo(
    () => complaintsOfSub(complaintsData, subcontractorAccounts, subcontractors as AnyRow[], subcontractor as AnyRow | undefined),
    [complaintsData, subcontractorAccounts, subcontractors, subcontractor]
  );

  // "Print for review": ALL of this sub's complaints (not only the 25 on the
  // card) in the picked days, Valid only unless Needs Review / Subjective are
  // asked for. Merged ones never count, so they are left out.
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewPreset, setReviewPreset] = useState<DatePreset>("90");
  const [reviewFrom, setReviewFrom] = useState("");
  const [reviewTo, setReviewTo] = useState("");
  const [reviewUnsure, setReviewUnsure] = useState(false);
  const [reviewPrinting, setReviewPrinting] = useState(false);
  const doneReviewPrinting = useCallback(() => setReviewPrinting(false), []);
  const reviewRange = presetRange(reviewPreset, reviewFrom, reviewTo);
  const reviewRows = useMemo(
    () =>
      relatedComplaints
        .map((complaint) => reviewComplaintOf(complaint))
        .filter((c) => !c.status.toLowerCase().startsWith("merged") && validityCounts(c.validity, reviewUnsure) && inRange(c.date, reviewRange.from, reviewRange.to)),
    [relatedComplaints, reviewUnsure, reviewRange.from, reviewRange.to]
  );

  const openComplaints = relatedComplaints.filter((complaint) => {
    const status = normalize(getComplaintStatus(complaint));

    return (
      status.includes("open") ||
      status.includes("pending") ||
      status.includes("needs") ||
      status === ""
    );
  });

  const validComplaints = relatedComplaints.filter((complaint) => {
    const validity = normalize(getComplaintValidity(complaint));
    return validity.includes("valid") && !validity.includes("not");
  });

  const totals = useMemo(() => {
    const activeRevenue = activeAccounts.reduce(
      (sum, account) => sum + getMonthlyRevenue(account),
      0
    );

    const activeSubPay = activeAccounts.reduce(
      (sum, account) => sum + getMonthlySubPay(account),
      0
    );

    const lostRevenue = pastAccounts.reduce(
      (sum, account) => sum + getMonthlyRevenue(account),
      0
    );

    const lostSubPay = pastAccounts.reduce(
      (sum, account) => sum + getMonthlySubPay(account),
      0
    );

    const grossMargin = activeRevenue - activeSubPay;
    const grossMarginPercent = activeRevenue
      ? (grossMargin / activeRevenue) * 100
      : 0;

    return {
      activeRevenue,
      activeSubPay,
      grossMargin,
      grossMarginPercent,
      lostRevenue,
      lostSubPay,
      lostMargin: lostRevenue - lostSubPay,
    };
  }, [activeAccounts, pastAccounts]);

  if (loading) {
    return (
      <Screen title="Subcontractor" backHref="/subcontractors">
        <SkeletonList rows={4} />
      </Screen>
    );
  }

  if (!subcontractor) {
    return (
      <Screen title="Subcontractor not found" backHref="/subcontractors">
        {error ? <ErrorBox title="We could not load this subcontractor." text={error} onRetry={() => void loadData()} /> : null}
        <EmptyState
          title="We could not find this subcontractor"
          text="It may have been removed, or the link is old."
          action={
            <BigButton kind="second" href="/subcontractors">
              Back to subcontractors
            </BigButton>
          }
        />
      </Screen>
    );
  }

  return (
    <div className="sub-detail-print-page sub-detail-print">
      <Screen
        title={getCompanyName(subcontractor)}
        subtitle={form.contactName || undefined}
        backHref="/subcontractors"
        headerRight={
          <MoreMenu
            items={[
              { label: "Edit", onSelect: () => setEditing(true) },
              { label: LABELS.print, onSelect: handlePrint },
              { label: refreshing ? "Refreshing…" : "Refresh", icon: "clock", onSelect: () => void handleRefresh() },
            ]}
          />
        }
        onEdit={() => setEditing(true)}
      >
        <div className="ui-actions-row">
          <StatusPill kind={statusKind(form.status || "Active")}>{form.status || "Active"}</StatusPill>
          <StatusPill kind={scoreStatus.kind}>{scoreStatus.label}</StatusPill>
          <StatusPill kind={insuranceStatus.kind}>Insurance: {insuranceStatus.label}</StatusPill>
        </div>

        {error ? <ErrorBox title="Some of this page did not load." text={error} onRetry={() => void loadData()} /> : null}

        <div className="sub-detail-print-hide">
          <InviteToPortal subId={getSubId(subcontractor)} subName={getCompanyName(subcontractor)} email={form.email} onEditSub={() => setEditing(true)} />
        </div>

        {/* The COI: its date, the file, Upload COI, and Approve / Reject for one sent from the portal. */}
        <div className="sub-detail-print-hide">
          <SubInsuranceCard subId={pageId} onChanged={() => void loadData()} />
        </div>

        <div className="sub-detail-print-hide ui-stats">
          <StatCard label="Active Accounts" value={String(activeAccounts.length)} />
          <StatCard label="Past Accounts" value={String(pastAccounts.length)} />
          <StatCard label="Monthly Revenue" value={money(totals.activeRevenue)} />
          <StatCard label="Monthly Sub Pay" value={`${money(totals.activeSubPay)} (${shareOfRevenue(totals.activeSubPay, totals.activeRevenue)})`} />
          <StatCard label="We keep (Gross Margin)" value={`${money(totals.grossMargin)} (${shareOfRevenue(totals.grossMargin, totals.activeRevenue)})`} />
          <StatCard label="Open Complaints" value={String(openComplaints.length)} />
          <StatCard label="Valid Complaints" value={String(validComplaints.length)} />
        </div>

        <div className="sub-detail-print-hide">
          <Card title="Automatic Performance Score" right={<StatusPill kind={scoreStatus.kind}>{scoreStatus.label}</StatusPill>}>
            <p className="ui-card-text">This score is calculated from complaints and the size of this subcontractor’s work.</p>
            <dl className="ui-details">
              <Detail label="Score" value={score ? `${score} / 10` : scoreStatus.label === "Not scored" ? "Not scored" : ""} />
              <Detail label="Performance" value={scoreStatus.label} />
              <Detail label="Open Complaints" value={String(openComplaints.length)} />
              <Detail label="Avg Visit Condition" value={avgCondition} />
              <Detail label="Accounts Assigned" value={String(currentAccounts.length)} />
              <Detail label="Last Activity" value={lastReview} />
            </dl>
            {/* The rules in plain words (lib/googleSheets.ts computeSubcontractorScore, lib/complaintWeights.ts). Keep in step with them. */}
            <div className="ui-card-text ui-stack">
              <p className="ui-strong">How the score works</p>
              <p>Every sub starts at 10 (scores began Aug 11, 2026). A complaint counts for the sub who had the account when it was filed.</p>
              <p>
                <strong>Each complaint takes off:</strong> priority points × size factor × validity.
              </p>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                <li>Priority points: Low 0.5, Medium 1, High 2, Urgent 2.5.</li>
                <li>
                  Size factor: 30 ÷ workload points (active accounts + monthly sub pay ÷ $500), kept between 0.4 and 2.0. A bigger sub loses less per
                  complaint.
                </li>
                <li>Validity: Valid 100%, Needs Review 100%, Subjective 50%, Not Valid 0% (does not count). Merged complaints never count.</li>
              </ul>
              <p>
                <strong>Fast fix bonus:</strong> fixed with proof (an after photo, or the office&apos;s &quot;No photo needed&quot;) within 1 business day of the sub being notified, half of that complaint&apos;s points
                come back. Within 3 business days, a quarter comes back. Business days are Monday to Friday, 8 am to 5 pm. Never notified: counted from when it
                was filed.
              </p>
              <p>
                <strong>Monthly recovery:</strong> each month with no new complaint adds 1 point back (0.5 a month after a complaint is closed), up to 10.
              </p>
              <p>
                Visit condition is shown but does not change the score. Status: 9–10 Excellent, 8–8.9 Good, 7–7.9 Needs Attention, below 7 High Risk. Below 6
                the office gets an alert.
              </p>
            </div>
          </Card>
        </div>

        <Card title="Subcontractor Details">
          <dl className="ui-details">
            <Detail label="Company Name" value={form.companyName} />
            <Detail label="Contact Name" value={form.contactName} />
            <Detail label="Phone" value={form.phone} />
            <Detail label="Email" value={form.email} />
            <Detail label="Address" value={form.address} />
            <Detail label="Areas Serviced" value={form.areasServiced} />
            <Detail label="Services Provided" value={form.servicesProvided} />
            <Detail label="Employee Capacity" value={form.employeeCapacity} />
            <CrewsDetail subId={pageId} />
            <Detail label="Insurance Expiration" value={niceDate(form.insuranceExpiration)} />
            <Detail label="Status" value={form.status} />
            <Detail label="Notes" value={form.notes} full />
          </dl>
        </Card>

        <AccountsList
          title="Current Accounts"
          description="Accounts currently assigned to this subcontractor."
          accounts={currentAccounts}
          emptyText="No current accounts found."
          showCancelledDate={false}
        />

        <AccountsList
          title="Past / Cancelled Accounts"
          description="Accounts this subcontractor had before."
          accounts={pastAccounts}
          emptyText="No past accounts found."
          showCancelledDate
        />

        <Card
          title="Recent Complaints"
          right={
            <span className="sub-detail-print-hide">
              <BigButton kind="second" disabled={reviewPrinting} onClick={() => setReviewOpen(true)}>
                🖨 Print for review
              </BigButton>
            </span>
          }
        >
          <p className="ui-card-text">Complaints filed while this subcontractor had the account.</p>
          <div style={{ marginTop: 12 }}>
            {relatedComplaints.length === 0 ? (
              <p className="ui-muted">No complaints found for this subcontractor.</p>
            ) : (
              <CardList
                label="Recent complaints"
                items={relatedComplaints.slice(0, 25).map((complaint, index) => ({ complaint, index }))}
                getKey={({ index }) => String(index)}
                // A tap anywhere on a row opens the complaint.
                rowHref={({ complaint }) => complaintHref(complaint)}
                renderCard={({ complaint }) => (
                  <Card title={getComplaintAccountName(complaint) || "No account"}>
                    <p className="ui-card-text">{niceDate(getComplaintDate(complaint)) || "No date"}</p>
                    <p className="ui-card-text">{getComplaintIssue(complaint) || "No details"}</p>
                    <p className="ui-card-text">
                      Validity: {getComplaintValidity(complaint) || "Not set"} · Status: {getComplaintStatus(complaint) || "Pending"}
                    </p>
                    {complaintHref(complaint) ? (
                      <div style={{ marginTop: 8 }}>
                        <BigButton kind="second" href={complaintHref(complaint)}>
                          Open complaint
                        </BigButton>
                      </div>
                    ) : null}
                  </Card>
                )}
                columns={[
                  { header: "Date", cell: ({ complaint }) => niceDate(getComplaintDate(complaint)) || "No date" },
                  { header: "Account", cell: ({ complaint }) => <span className="ui-strong">{getComplaintAccountName(complaint) || "No account"}</span> },
                  {
                    header: "Issue",
                    cell: ({ complaint }) =>
                      complaintHref(complaint) ? (
                        <Link href={complaintHref(complaint)} className="ui-link">
                          {getComplaintIssue(complaint) || "No details"}
                        </Link>
                      ) : (
                        getComplaintIssue(complaint) || "No details"
                      ),
                  },
                  { header: "Validity", cell: ({ complaint }) => getComplaintValidity(complaint) || "Not set" },
                  { header: "Status", cell: ({ complaint }) => getComplaintStatus(complaint) || "Pending" },
                ]}
              />
            )}
          </div>
        </Card>

        {/* Every email the app sent this sub (by its database ID, or its email for the old rows). */}
        <div className="sub-detail-print-hide">
          <Card title="Email log">
            <EmailLogList subId={clean(String((subcontractor as unknown as Record<string, unknown>).subId ?? ""))} subEmail={form.email} showSubFilter={false} />
          </Card>
        </div>

        <Sheet
          open={reviewOpen}
          title="🖨 Print for review"
          text="A Complaint Review to hand to this sub: no notes, money or score on it."
          onClose={() => setReviewOpen(false)}
          actions={
            <BigButton
              disabled={reviewRows.length === 0}
              onClick={() => {
                setReviewOpen(false);
                setReviewPrinting(true);
              }}
            >
              🖨 Print
            </BigButton>
          }
        >
          <SelectField label="Date range" value={reviewPreset} onChange={(e) => setReviewPreset(e.target.value as DatePreset)}>
            {DATE_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </SelectField>
          {reviewPreset === "custom" ? (
            <>
              <Field label="From date" optional type="date" value={reviewFrom} onChange={(e) => setReviewFrom(e.target.value)} />
              <Field label="To date" optional type="date" value={reviewTo} onChange={(e) => setReviewTo(e.target.value)} />
            </>
          ) : null}
          <label className={`flex min-h-[56px] cursor-pointer items-center gap-3 rounded-2xl px-4 text-lg font-bold ${reviewUnsure ? "bg-blue-50 ring-2 ring-blue-600" : "bg-white ring-1 ring-slate-300"}`}>
            <input type="checkbox" className="h-7 w-7 shrink-0" checked={reviewUnsure} onChange={(e) => setReviewUnsure(e.target.checked)} />
            <span>Include Needs Review / Subjective</span>
          </label>
          <p className="ui-muted" role="status">
            {reviewRows.length} complaint{reviewRows.length === 1 ? "" : "s"} will print{reviewUnsure ? "" : " (Valid only)"}.
          </p>
        </Sheet>

        <ComplaintReviewPrint
          active={reviewPrinting}
          onDone={doneReviewPrinting}
          subName={getCompanyName(subcontractor)}
          from={reviewRange.from}
          to={reviewRange.to}
          complaints={reviewRows}
          note={reviewUnsure ? "Valid, Needs Review and Subjective complaints" : "Valid complaints only"}
        />

        {editing ? (
          <EditSubcontractorSheet pageId={pageId} initial={form} onClose={() => setEditing(false)} onSaved={loadData} />
        ) : null}
      </Screen>

      {/* Scoped to this page only via the .sub-detail-print/.sub-detail-print-hide
          class names (see the matching additive exception in app/globals.css) —
          <style jsx global> is the established pattern for page-local print CSS
          in this codebase (see app/to-do/page.tsx, app/account-updates/[id]/page.tsx).
          Nothing here can affect Accounts, To-Do, or any other page's print output. */}
      <style jsx global>{`
        @media print {
          .sub-detail-print-hide,
          .sub-detail-print .ui-actionbar,
          .sub-detail-print .ui-more,
          .sub-detail-print .ui-screen-header a,
          .sub-detail-print .ui-toast-region {
            display: none !important;
          }

          .sub-detail-print .ui-screen-header {
            position: static;
          }

          /* Paper is narrower than the width where tables appear on screen,
             but tables are what should print: show them, hide the cards. */
          .sub-detail-print .ui-cardlist-has-table {
            display: none !important;
          }

          .sub-detail-print .ui-table-wrap {
            display: block !important;
          }

          .sub-detail-print table {
            width: 100%;
            font-size: 10px;
          }

          .sub-detail-print th,
          .sub-detail-print td {
            padding: 4px 6px !important;
            white-space: normal !important;
            word-break: break-word;
          }

          .sub-detail-print .ui-screen,
          .sub-detail-print .ui-card {
            font-size: 12px;
            box-shadow: none;
          }

          /* Long field values (address, notes, areas serviced) must wrap
             instead of being cut off. */
          .sub-detail-print p,
          .sub-detail-print dd {
            white-space: normal !important;
            word-break: break-word;
          }
        }
      `}</style>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="ui-stat">
      <p className="ui-stat-label">{label}</p>
      <p className="ui-stat-value">{value}</p>
    </div>
  );
}

function AccountsList({
  title,
  description,
  accounts,
  emptyText,
  showCancelledDate,
}: {
  title: string;
  description: string;
  accounts: AnyRow[];
  emptyText: string;
  showCancelledDate: boolean;
}) {
  const revenueTotal = accounts.reduce(
    (sum, account) => sum + getMonthlyRevenue(account),
    0
  );

  const subPayTotal = accounts.reduce(
    (sum, account) => sum + getMonthlySubPay(account),
    0
  );

  const linkFor = (account: AnyRow) => {
    const accountName = getAccountName(account);
    return `/accounts/${encodeURIComponent(getAccountId(account) || createIdFromName(accountName))}`;
  };
  const schedule = (account: AnyRow) =>
    [getFrequency(account), getCleaningDays(account)].filter(Boolean).join(" / ") || "Not set";
  const status = (account: AnyRow) => {
    const text = getAccountStatus(account) || "Active";
    return <StatusPill kind={statusKind(text)}>{text}</StatusPill>;
  };

  type Column = { header: string; cell: (account: AnyRow) => React.ReactNode };
  const columns: Column[] = [
    {
      header: "Account",
      cell: (account) => (
        <>
          <Link href={linkFor(account)} className="ui-table-rowlink">
            {getAccountName(account)}
          </Link>
          <p className="ui-muted">Manager: {getAccountManager(account) || "Not set"}</p>
        </>
      ),
    },
    {
      header: showCancelledDate ? "Started / Cancelled" : "Start Date",
      cell: (account) => (
        <>
          <p className="ui-muted ui-nowrap">{niceDate(getStartDate(account)) || "Not set"}</p>
          {showCancelledDate ? <p className="ui-muted ui-nowrap">{niceDate(getCancelledDate(account)) || "Not set"}</p> : null}
        </>
      ),
    },
    { header: "Schedule", cell: schedule },
    {
      header: "Revenue / Sub Pay",
      cell: (account) => (
        <>
          <p className="ui-muted ui-nowrap">{money(getMonthlyRevenue(account))}</p>
          <p className="ui-muted ui-nowrap">
            {money(getMonthlySubPay(account))} ({shareOfRevenue(getMonthlySubPay(account), getMonthlyRevenue(account))})
          </p>
        </>
      ),
    },
    {
      header: "Margin / GM %",
      cell: (account) => (
        <>
          <p className="ui-muted ui-nowrap">{money(getGrossMargin(account))}</p>
          <p className="ui-muted ui-nowrap">{shareOfRevenue(getGrossMargin(account), getMonthlyRevenue(account))}</p>
        </>
      ),
    },
    { header: "Health", cell: (account) => getAccountHealth(account) || "Not set" },
    { header: "Status", cell: status },
    ...(showCancelledDate ? [{ header: "Notes", cell: (account: AnyRow) => getAccountNotes(account) || "None" }] : []),
  ];

  return (
    <Card title={title}>
      <p className="ui-card-text">{description}</p>
      <p className="ui-strong" style={{ marginTop: 8 }}>
        Revenue: {money(revenueTotal)} | Sub Pay: {money(subPayTotal)} ({shareOfRevenue(subPayTotal, revenueTotal)}) | We keep:{" "}
        {money(revenueTotal - subPayTotal)} ({shareOfRevenue(revenueTotal - subPayTotal, revenueTotal)})
      </p>
      <div style={{ marginTop: 12 }}>
        {accounts.length === 0 ? (
          <p className="ui-muted">{emptyText}</p>
        ) : (
          <CardList
            label={title}
            items={accounts.map((account, index) => ({ account, index }))}
            getKey={({ account, index }) => `${getAccountId(account) || createIdFromName(getAccountName(account))}-${index}`}
            renderCard={({ account }) => (
              <Card title={getAccountName(account)} right={status(account)} href={linkFor(account)}>
                <p className="ui-card-text">Manager: {getAccountManager(account) || "Not set"}</p>
                <p className="ui-card-text">
                  Started {niceDate(getStartDate(account)) || "not set"}
                  {showCancelledDate ? ` · Cancelled ${niceDate(getCancelledDate(account)) || "not set"}` : ""}
                </p>
                <p className="ui-card-text">Schedule: {schedule(account)}</p>
                <p className="ui-card-text">
                  Revenue {money(getMonthlyRevenue(account))} · Sub Pay {money(getMonthlySubPay(account))} (
                  {shareOfRevenue(getMonthlySubPay(account), getMonthlyRevenue(account))})
                </p>
                <p className="ui-card-text">
                  We keep {money(getGrossMargin(account))} ({shareOfRevenue(getGrossMargin(account), getMonthlyRevenue(account))})
                </p>
                <p className="ui-card-text">Health: {getAccountHealth(account) || "Not set"}</p>
                {showCancelledDate ? <p className="ui-card-text">Notes: {getAccountNotes(account) || "None"}</p> : null}
              </Card>
            )}
            columns={columns.map((column) => ({ header: column.header, cell: ({ account }: { account: AnyRow }) => column.cell(account) }))}
          />
        )}
      </div>
    </Card>
  );
}

function Detail({
  label,
  value,
  full,
}: {
  label: string;
  value: string;
  full?: boolean;
}) {
  return (
    <div className={full ? "ui-detail ui-detail-full" : "ui-detail"}>
      <dt>{label}</dt>
      <dd>{value || "Not set"}</dd>
    </div>
  );
}
