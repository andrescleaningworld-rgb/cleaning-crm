"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BigButton,
  Card,
  CardList,
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
  TextAreaField,
  type StatusKind,
} from "@/app/ui";
import { getGoogleMapsUrl } from "../lib/backend";
import { distanceInMiles, formatMiles } from "../lib/distance";
import { useCustomerSearch, AutocompleteField } from "../sub-schedules/autocomplete";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Account = {
  id?: string;
  accountId?: string;
  rowNumber?: number;
  accountName?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  latitude?: string | number;
  longitude?: string | number;
  manager?: string;
  subcontractor?: string;
  status?: string;
  accountHealth?: string;
  accountStartDate?: string;
  monthlyRevenue?: string | number;
  monthlySubcontractorPay?: string | number;
  subcontractorPay?: string | number;
  grossMargin?: string;
  grossMarginPercent?: string;
  hasKey?: string;
  alarmCode?: string;
  keyAlarmAccessInfo?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  serviceType?: string;
  frequency?: string;
  cleaningDays?: string;
  scopeOfWork?: string;
  notes?: string;
  cancelledDate?: string;
  // Pre-normalized fields added at load time
  _searchBlob?: string;
  _statusCategory?: StatusFilter;
  _monthlyRevenueNum?: number;
  _subPayNum?: number;
  _grossMarginNum?: number;
  _grossMarginPercent?: number;
  _revenuePercent?: number;
  _frequencyText?: string;
  _startDateTime?: number;
  _subDisplay?: SubcontractorDisplay;
  _latitudeNum?: number | null;
  _longitudeNum?: number | null;
  // Set only while the "Near Account" filter is active, to the distance in
  // miles from the selected reference account.
  _distanceMiles?: number | null;
};

type Subcontractor = {
  id?: string;
  subcontractorId?: string;
  name?: string;
  subcontractor?: string;
  subcontractorName?: string;
  companyName?: string;
  contactName?: string;
  displayName?: string;
  dropdownLabel?: string;
  email?: string;
  status?: string;
};

type SubcontractorDisplay = {
  contactName: string;
  companyName: string;
  fallback: string;
};

type Manager = {
  name?: string;
  status?: string;
};

// Mirrors app/to-do/page.tsx's taskTypes — kept as a separate local copy
// since that file doesn't export it, same as this file's other small
// cross-page duplications (e.g. the Manager fetch/filter pattern above).
const BULK_TODO_TASK_TYPES = [
  "Visit",
  "Complaint Follow-Up",
  "Account Follow-Up",
  "New Account Onboarding",
  "Customer Call",
  "Subcontractor Follow-Up",
  "Reminder",
  "Other",
];

type SubcontractorFilterOption = {
  value: string;
  label: string;
};

type StatusFilter =
  | "Active"
  | "Cancelled"
  | "Paused"
  | "Over 90 Days"
  | "Other"
  | "All";

type SortOption =
  | "Account Name"
  | "Start Date - Newest First"
  | "Start Date - Oldest First"
  | "Monthly Revenue - Highest First"
  | "Monthly Revenue - Lowest First"
  | "Sub Pay - Highest First"
  | "Sub Pay - Lowest First";

type QuickStatusOption =
  | "Active"
  | "Cancelled"
  | "Paused"
  | "Over 90 Days"
  | "Inactive"
  | "Needs Review"
  | "Other";

type ApiResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  data?: Account[];
  accounts?: Account[];
};

type SubcontractorsApiResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  data?: Subcontractor[];
  subcontractors?: Subcontractor[];
  subs?: Subcontractor[];
};


type TransferProposalsApiResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  data?: StoredTransferProposal[];
  proposals?: StoredTransferProposal[];
  transferProposals?: StoredTransferProposal[];
  subTransferProposals?: StoredTransferProposal[];
};

type TransferProposalPayload = {
  proposalId?: string;
  newSubcontractor: string;
  newSubcontractorEmail: string;
  subcontractorName: string;
  subcontractorEmail: string;
  email: string;
  proposedMonthlyPay: number;
  notes: string;
  accounts: {
    accountId: string;
    accountName: string;
    address: string;
    cleaningDays: string;
    scope: string;
    keysAlarm: string;
    proposedMonthlyPay: number;
    monthlyRevenue: number;
  }[];
};


type StoredTransferProposalAccount = {
  accountId?: string;
  id?: string;
  accountName?: string;
  name?: string;
  address?: string;
  cleaningDays?: string;
  frequency?: string;
  scope?: string;
  scopeOfWork?: string;
  keysAlarm?: string;
  hasKey?: string;
  alarmCode?: string;
  proposedMonthlyPay?: string | number;
  proposedPay?: string | number;
  monthlySubcontractorPay?: string | number;
  subcontractorPay?: string | number;
  pay?: string | number;
  monthlyRevenue?: string | number;
  revenue?: string | number;
};

type StoredTransferProposal = {
  proposalId?: string;
  id?: string;
  date?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: string;
  newSubcontractor?: string;
  newSubcontractorEmail?: string;
  subcontractorName?: string;
  subcontractorEmail?: string;
  email?: string;
  proposedMonthlyPay?: string | number;
  totalProposedPay?: string | number;
  monthlyRevenue?: string | number;
  totalMonthlyRevenue?: string | number;
  notes?: string;
  accounts?: StoredTransferProposalAccount[];
  accountCount?: string | number;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INITIAL_VISIBLE_COUNT = 15;
const LOAD_MORE_COUNT = 15;
const SEARCH_DEBOUNCE_MS = 200;

const STATUS_CATEGORY_MAP: Record<string, StatusFilter> = {
  active: "Active",
  "active account": "Active",
  current: "Active",
};

const quickStatusOptions: QuickStatusOption[] = [
  "Active",
  "Cancelled",
  "Paused",
  "Over 90 Days",
  "Inactive",
  "Needs Review",
  "Other",
];

const statusOptions: StatusFilter[] = [
  "Active",
  "Cancelled",
  "Paused",
  "Over 90 Days",
  "Other",
  "All",
];

const sortOptions: SortOption[] = [
  "Account Name",
  "Start Date - Newest First",
  "Start Date - Oldest First",
  "Monthly Revenue - Highest First",
  "Monthly Revenue - Lowest First",
  "Sub Pay - Highest First",
  "Sub Pay - Lowest First",
];

const NEAR_ACCOUNT_RADIUS_OPTIONS = [5, 10, 25, 50] as const;
const DEFAULT_NEAR_ACCOUNT_RADIUS_MILES = 10;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeLower(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

/** Strips punctuation/symbols for fuzzy subcontractor matching. */
function normalizeForMatch(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function getAccountId(account: Account): string {
  return normalizeText(
    account.accountId ?? account.id ?? account.rowNumber ?? account.accountName
  );
}

type NonLocationFilterParams = {
  cleanSearch: string;
  statusFilter: StatusFilter;
  managerFilter: string;
  subcontractorFilter: string;
  minRevenue: number;
  maxRevenue: number;
  minSubPay: number;
  maxSubPay: number;
};

// Every filter except "Near Account" — factored out so the main filtered
// list and the "N accounts hidden, no location data" count below apply
// identical criteria without duplicating each check.
function accountMatchesNonLocationFilters(
  account: Account,
  params: NonLocationFilterParams
): boolean {
  const revenue = account._monthlyRevenueNum ?? 0;
  const subPay = account._subPayNum ?? 0;

  const matchesSearch =
    !params.cleanSearch || (account._searchBlob ?? "").includes(params.cleanSearch);

  const matchesStatus =
    params.statusFilter === "All" || account._statusCategory === params.statusFilter;

  const matchesManager =
    params.managerFilter === "All" || normalizeText(account.manager) === params.managerFilter;

  const matchesSubcontractor =
    params.subcontractorFilter === "All" ||
    normalizeText(account.subcontractor) === params.subcontractorFilter;

  const matchesMinRevenue = params.minRevenue <= 0 || revenue >= params.minRevenue;
  const matchesMaxRevenue = params.maxRevenue <= 0 || revenue <= params.maxRevenue;

  const matchesMinSubPay = params.minSubPay <= 0 || subPay >= params.minSubPay;
  const matchesMaxSubPay = params.maxSubPay <= 0 || subPay <= params.maxSubPay;

  return (
    matchesSearch &&
    matchesStatus &&
    matchesManager &&
    matchesSubcontractor &&
    matchesMinRevenue &&
    matchesMaxRevenue &&
    matchesMinSubPay &&
    matchesMaxSubPay
  );
}

function getStatusCategory(status: string | undefined): StatusFilter {
  const clean = normalizeLower(status);
  if (!clean) return "Other";

  // Exact-match lookup first
  if (STATUS_CATEGORY_MAP[clean]) return STATUS_CATEGORY_MAP[clean];

  // Substring checks — ordered by specificity
  if (clean.includes("cancel") || clean.includes("lost") || clean.includes("terminated") || clean.includes("closed")) return "Cancelled";
  if (clean.includes("pause") || clean.includes("hold") || clean.includes("suspended")) return "Paused";
  if (clean.includes("90") || clean.includes("over 90") || clean.includes("over ninety") || clean.includes("old")) return "Over 90 Days";

  return "Other";
}

function moneyToNumber(value: string | number | undefined): number {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value === "number") return Number.isNaN(value) ? 0 : value;
  const parsed = Number(String(value).replace(/\$/g, "").replace(/,/g, "").trim());
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseCoordinate(value: string | number | undefined): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isNaN(parsed) ? null : parsed;
}

function formatMoney(value: string | number | undefined): string {
  const number = moneyToNumber(value);
  if (!number) return "N/A";
  return number.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function getDateTime(value: string | undefined): number {
  if (!value) return 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function formatDate(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}


function getStoredProposalId(proposal: StoredTransferProposal): string {
  return normalizeText(proposal.proposalId ?? proposal.id);
}

function getStoredProposalDate(proposal: StoredTransferProposal): string {
  return formatDate(proposal.date ?? proposal.createdAt ?? proposal.updatedAt) || "N/A";
}

function getStoredProposalSubcontractor(proposal: StoredTransferProposal): string {
  return (
    normalizeText(proposal.newSubcontractor ?? proposal.subcontractorName) ||
    normalizeText(proposal.newSubcontractorEmail ?? proposal.subcontractorEmail ?? proposal.email) ||
    "N/A"
  );
}

function getStoredProposalEmail(proposal: StoredTransferProposal): string {
  return normalizeText(proposal.newSubcontractorEmail ?? proposal.subcontractorEmail ?? proposal.email);
}

function getStoredProposalStatus(proposal: StoredTransferProposal): string {
  return normalizeText(proposal.status) || "Draft";
}

function getStoredProposalAccountCount(proposal: StoredTransferProposal): number {
  if (Array.isArray(proposal.accounts)) return proposal.accounts.length;
  return moneyToNumber(proposal.accountCount);
}

function getStoredProposalRevenue(proposal: StoredTransferProposal): number {
  const direct = moneyToNumber(proposal.totalMonthlyRevenue ?? proposal.monthlyRevenue);
  if (direct > 0) return direct;

  return (proposal.accounts ?? []).reduce(
    (sum, account) => sum + getStoredProposalAccountRevenue(account),
    0
  );
}

function getStoredProposalAccountPay(
  account: StoredTransferProposalAccount
): number {
  return moneyToNumber(
    account.proposedMonthlyPay ??
      account.proposedPay ??
      account.monthlySubcontractorPay ??
      account.subcontractorPay ??
      account.pay
  );
}

function getStoredProposalAccountRevenue(
  account: StoredTransferProposalAccount
): number {
  return moneyToNumber(account.monthlyRevenue ?? account.revenue);
}

function getStoredProposalAccountName(
  account: StoredTransferProposalAccount
): string {
  return normalizeText(account.accountName ?? account.name) || "Unnamed Account";
}

function getStoredProposalAccountDays(
  account: StoredTransferProposalAccount
): string {
  return normalizeText(account.cleaningDays ?? account.frequency) || "N/A";
}

function getStoredProposalAccountScope(
  account: StoredTransferProposalAccount
): string {
  return normalizeText(account.scope ?? account.scopeOfWork) || "N/A";
}

function getStoredProposalAccountKeysAlarm(
  account: StoredTransferProposalAccount
): string {
  return normalizeText(account.keysAlarm) ||
    (hasSensitiveAccessValue(account.hasKey) ||
    hasSensitiveAccessValue(account.alarmCode)
      ? "Yes"
      : "No");
}

function getStoredProposalPay(proposal: StoredTransferProposal): number {
  const direct = moneyToNumber(
    proposal.proposedMonthlyPay ?? proposal.totalProposedPay
  );

  if (direct > 0) return direct;

  return (proposal.accounts ?? []).reduce(
    (sum, account) => sum + getStoredProposalAccountPay(account),
    0
  );
}

function getStoredProposalStatusClass(status: string): string {
  const clean = normalizeLower(status);
  if (clean.includes("accept")) return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (clean.includes("sent")) return "border-blue-200 bg-blue-50 text-blue-800";
  if (clean.includes("declin") || clean.includes("cancel")) return "border-red-200 bg-red-50 text-red-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function hasSensitiveAccessValue(value: unknown): boolean {
  const clean = normalizeLower(value);
  if (!clean) return false;
  return !["no", "none", "n/a", "na", "0", "false"].includes(clean);
}

function getKeysAlarmRequired(account: Account): "Yes" | "No" {
  return hasSensitiveAccessValue(account.hasKey) ||
    hasSensitiveAccessValue(account.alarmCode) ||
    hasSensitiveAccessValue(account.keyAlarmAccessInfo)
    ? "Yes"
    : "No";
}

function getProposalAddress(account: Account): string {
  return [account.address, account.city, account.state, account.zip]
    .map((part) => normalizeText(part))
    .filter(Boolean)
    .join(", ");
}

function getProposalCleaningDays(account: Account): string {
  return normalizeText(account.cleaningDays ?? account.frequency) || "N/A";
}

function getProposalScope(account: Account): string {
  return normalizeText(account.scopeOfWork ?? account.serviceType) || "N/A";
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Subcontractor helpers
// ---------------------------------------------------------------------------

function getSubcontractorContactName(sub: Subcontractor): string {
  return normalizeText(sub.contactName ?? sub.name ?? sub.subcontractorName);
}

function getSubcontractorCompanyName(sub: Subcontractor): string {
  return normalizeText(sub.companyName ?? sub.subcontractor);
}

function getSubcontractorLabel(sub: Subcontractor): string {
  const contact = getSubcontractorContactName(sub);
  const company = getSubcontractorCompanyName(sub);
  if (contact && company) return `${contact} — ${company}`;
  return normalizeText(sub.displayName) || normalizeText(sub.dropdownLabel) || contact || company || normalizeText(sub.email);
}

function findMatchingSubcontractor(
  accountSubcontractor: unknown,
  subcontractors: Subcontractor[]
): Subcontractor | null {
  const accountValue = normalizeForMatch(accountSubcontractor);
  if (!accountValue) return null;

  return (
    subcontractors.find((sub) => {
      const candidates = [
        sub.companyName,
        sub.subcontractor,
        sub.displayName,
        sub.dropdownLabel,
        sub.contactName,
        sub.name,
        sub.subcontractorName,
      ];
      return candidates.some((c) => normalizeForMatch(c) === accountValue);
    }) ?? null
  );
}

function buildSubDisplay(
  account: Account,
  subcontractors: Subcontractor[]
): SubcontractorDisplay {
  const matched = findMatchingSubcontractor(account.subcontractor, subcontractors);
  return {
    contactName: normalizeText(matched?.contactName ?? matched?.name ?? matched?.subcontractorName),
    companyName: normalizeText(matched?.companyName ?? matched?.subcontractor ?? account.subcontractor),
    fallback: normalizeText(account.subcontractor) || "Unassigned",
  };
}

function getSubDisplayLabel(display: SubcontractorDisplay | undefined): string {
  const contactName = normalizeText(display?.contactName);
  const companyName = normalizeText(display?.companyName);
  const fallback = normalizeText(display?.fallback);

  if (
    contactName &&
    companyName &&
    normalizeForMatch(contactName) !== normalizeForMatch(companyName)
  ) {
    return `${contactName} — ${companyName}`;
  }

  return contactName || companyName || fallback || "Unassigned";
}

// ---------------------------------------------------------------------------
// API helpers (single generic implementation)
// ---------------------------------------------------------------------------

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("The server did not return valid JSON.");
  }
}

// ---------------------------------------------------------------------------
// Pre-normalization — runs once when accounts + subcontractors are loaded
// ---------------------------------------------------------------------------

function enrichAccounts(accounts: Account[], subcontractors: Subcontractor[]): Account[] {
  return accounts.map((account) => {
    const subDisplay = buildSubDisplay(account, subcontractors);
    const searchBlob = [
      account.accountName,
      account.address,
      account.city,
      account.state,
      account.zip,
      account.manager,
      account.subcontractor,
      subDisplay.contactName,
      subDisplay.companyName,
      account.status,
      account.accountHealth,
      account.accountStartDate,
      account.frequency,
      account.cleaningDays,
      account.monthlyRevenue,
      account.monthlySubcontractorPay,
      account.subcontractorPay,
      account.contactName,
      account.phone,
      account.email,
      account.notes,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const revenueNum = moneyToNumber(account.monthlyRevenue);
    const subPayNum = moneyToNumber(
      account.monthlySubcontractorPay ?? account.subcontractorPay
    );

    return {
      ...account,
      _searchBlob: searchBlob,
      _statusCategory: getStatusCategory(account.status),
      _monthlyRevenueNum: revenueNum,
      _subPayNum: subPayNum,
      _grossMarginNum: revenueNum - subPayNum,
      _grossMarginPercent: revenueNum > 0 ? Math.round(((revenueNum - subPayNum) / revenueNum) * 100) : 0,
      _frequencyText: normalizeText(account.frequency ?? account.cleaningDays),
      _startDateTime: getDateTime(account.accountStartDate),
      _subDisplay: subDisplay,
      _latitudeNum: parseCoordinate(account.latitude),
      _longitudeNum: parseCoordinate(account.longitude),
    };
  });
}

// ---------------------------------------------------------------------------
// useDebounce hook
// ---------------------------------------------------------------------------

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

// ---------------------------------------------------------------------------
// useFocusTrap hook — keeps keyboard focus inside a modal
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  // Full account list used only to build the Manager/Subcontractor filter
  // dropdown options — kept separate from `accounts` (which narrows to a
  // search result once the user searches) so those dropdowns keep every
  // option even after a search narrows the visible list. See fetchAccounts
  // below, which populates this from its own empty-query result.
  const [filterOptionAccounts, setFilterOptionAccounts] = useState<Account[]>([]);
  const [allSubcontractors, setAllSubcontractors] = useState<Subcontractor[]>([]);
  const [loadingSubcontractors, setLoadingSubcontractors] = useState(true);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [subcontractorWarning, setSubcontractorWarning] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Active");
  const [managerFilter, setManagerFilter] = useState("All");
  const [subcontractorFilter, setSubcontractorFilter] = useState("All");
  const nearAccountSearch = useCustomerSearch();
  const [nearAccountRadius, setNearAccountRadius] = useState(DEFAULT_NEAR_ACCOUNT_RADIUS_MILES);
  const [minRevenueFilter, setMinRevenueFilter] = useState("");
  const [maxRevenueFilter, setMaxRevenueFilter] = useState("");
  const [minSubPayFilter, setMinSubPayFilter] = useState("");
  const [maxSubPayFilter, setMaxSubPayFilter] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("Account Name");

  const [transferMode, setTransferMode] = useState(false);
  const [selectedTransferAccountIds, setSelectedTransferAccountIds] = useState<string[]>([]);
  const [transferSourceSubcontractorFilter, setTransferSourceSubcontractorFilter] = useState("All");
  const [transferAccountSearch, setTransferAccountSearch] = useState("");
  const [transferSubcontractorEmail, setTransferSubcontractorEmail] = useState("");
  const [transferNewSubcontractorMode, setTransferNewSubcontractorMode] = useState<"existing" | "new">("existing");
  const [manualTransferSubcontractorName, setManualTransferSubcontractorName] = useState("");
  const [manualTransferSubcontractorEmail, setManualTransferSubcontractorEmail] = useState("");
  const [transferPayByAccountId, setTransferPayByAccountId] = useState<Record<string, string>>({});
  const [transferNotes, setTransferNotes] = useState("");
  const [transferProposalId, setTransferProposalId] = useState("");
  const [transferSaving, setTransferSaving] = useState(false);
  const [transferMessage, setTransferMessage] = useState("");
  const [transferError, setTransferError] = useState("");
  const [storedTransferProposals, setStoredTransferProposals] = useState<StoredTransferProposal[]>([]);
  const [transferProposalsLoading, setTransferProposalsLoading] = useState(false);
  const [transferProposalsError, setTransferProposalsError] = useState("");
  const [transferAllAccounts, setTransferAllAccounts] = useState<Account[]>([]);
  const [loadingTransferAccounts, setLoadingTransferAccounts] = useState(false);
  const [transferAccountsError, setTransferAccountsError] = useState("");
  const [viewedStoredProposal, setViewedStoredProposal] =
  useState<StoredTransferProposal | null>(null);

  const debouncedSearch = useDebounce(searchText, SEARCH_DEBOUNCE_MS);

  const [statusModalAccount, setStatusModalAccount] = useState<Account | null>(null);
  const [newStatus, setNewStatus] = useState<QuickStatusOption>("Active");
  const [statusReason, setStatusReason] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState("");

  // Bulk to-do creation: select N accounts here, then fire one addToDos
  // batch request (see app/api/to-do/route.ts) instead of the one-at-a-time
  // flow on the To-Do page itself.
  const [bulkToDoMode, setBulkToDoMode] = useState(false);
  const [selectedBulkToDoIds, setSelectedBulkToDoIds] = useState<Set<string>>(new Set());
  const [showBulkToDoForm, setShowBulkToDoForm] = useState(false);
  const [bulkToDoManagers, setBulkToDoManagers] = useState<string[]>([]);
  const [bulkToDoForm, setBulkToDoForm] = useState({
    assignedTo: "",
    taskType: "Visit",
    dueDate: "",
    why: "",
    notes: "",
  });
  const [bulkToDoSaving, setBulkToDoSaving] = useState(false);
  const [bulkToDoError, setBulkToDoError] = useState("");
  const [bulkToDoSuccess, setBulkToDoSuccess] = useState("");

  // Per-row "+ To-Do" quick add: same addToDos endpoint/field set as the
  // bulk form above, just scoped to a single pre-filled account instead of
  // a multi-select. Kept as its own state/modal rather than reusing the
  // bulk form's so opening it doesn't disturb bulkToDoMode selection state.
  const [quickToDoAccount, setQuickToDoAccount] = useState<Account | null>(null);
  const [quickToDoForm, setQuickToDoForm] = useState({
    assignedTo: "",
    taskType: "Visit",
    dueDate: "",
    why: "",
    notes: "",
  });
  const [quickToDoSaving, setQuickToDoSaving] = useState(false);
  const [quickToDoError, setQuickToDoError] = useState("");

  // Minimal self-contained toast — no shared toast component exists
  // elsewhere in the app yet, so this stays local to this page.
  const [toast, setToast] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // Team Hub Phase 6: red "open problems" badge per account row. Best-effort
  // — a failed load just shows no badges.
  const [openTeamHubProblems, setOpenTeamHubProblems] = useState<Record<string, number>>({});
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/team-hub/open-counts", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { countsByAccountId?: Record<string, number> }) => {
        if (!cancelled) setOpenTeamHubProblems(data.countsByAccountId ?? {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function showToast(message: string) {
    setToast(message);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(""), 4000);
  }


  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  const subcontractorsRef = useRef<Subcontractor[]>([]);

  // Subcontractor data (used by the New Subcontractor dropdown in the
  // Transfer panel) loads independently on mount — it must not depend on
  // whether a main account search has been performed.
  const fetchSubcontractors = useCallback(async () => {
    setLoadingSubcontractors(true);
    try {
      const response = await fetch("/api/subcontractors");
      const data = await readJson<SubcontractorsApiResponse>(response);
      if (!response.ok || data.success === false) {
        setSubcontractorWarning("Subcontractor names may not display correctly — check the subcontractors API.");
        return;
      }
      const subcontractors = data.subcontractors ?? data.subs ?? data.data ?? [];
      subcontractorsRef.current = subcontractors;
      setAllSubcontractors(subcontractors);
    } catch {
      setSubcontractorWarning("Subcontractor names may not display correctly — the subcontractors API returned an unexpected response.");
    } finally {
      setLoadingSubcontractors(false);
    }
  }, []);

  // Populates the Manager/Subcontractor/Frequency filter dropdowns from the
  // full account list, decoupled from the search-scoped `accounts` state so
  // those dropdowns aren't empty until the user has already searched — see
  // fetchAccounts below, which derives this from its own empty-query result
  // instead of firing a second /api/accounts request for the same data
  // (/api/accounts treats a blank "q" as "return everything," so the
  // mount-time fetchAccounts("") call already has the full list in hand).

  const fetchAccounts = useCallback(async (q: string) => {
    setLoading(true);
    setError("");
    setHasSearched(true);
    try {
      const accountsResponse = await fetch(`/api/accounts?q=${encodeURIComponent(q)}`, { cache: "no-store" });

      const accountsData = await readJson<ApiResponse>(accountsResponse);
      if (!accountsResponse.ok || accountsData.success === false) {
        throw new Error(accountsData.error ?? "Could not load accounts.");
      }

      const rawAccounts: Account[] = accountsData.accounts ?? accountsData.data ?? [];
      const enriched = enrichAccounts(rawAccounts, subcontractorsRef.current);
      setAccounts(enriched);

      // Only an empty query is the full, unfiltered list — reuse it for the
      // filter dropdowns too. A real text search (non-empty q) narrows
      // `accounts` server-side and must not also narrow what options the
      // dropdowns offer, so filterOptionAccounts is left untouched then.
      if (!q.trim()) {
        setFilterOptionAccounts(enriched);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong loading accounts.");
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);


  async function loadTransferProposals() {
    try {
      setTransferProposalsLoading(true);
      setTransferProposalsError("");

      const response = await fetch(
        "/api/sub-transfer-proposals?action=getSubTransferProposals"
      );

      const data = await readJson<TransferProposalsApiResponse>(response);
      if (!response.ok || data.success === false) {
        throw new Error(data.error ?? data.message ?? "Could not load stored transfer proposals.");
      }

      const proposals =
        data.proposals ??
        data.transferProposals ??
        data.subTransferProposals ??
        data.data ??
        [];

      setStoredTransferProposals(
        [...proposals].sort((a, b) => {
          const bDate = getDateTime(b.createdAt ?? b.date ?? b.updatedAt);
          const aDate = getDateTime(a.createdAt ?? a.date ?? a.updatedAt);
          return bDate - aDate;
        })
      );
    } catch (err) {
      setTransferProposalsError(
        err instanceof Error
          ? err.message
          : "Something went wrong loading stored transfer proposals."
      );
    } finally {
      setTransferProposalsLoading(false);
    }
  }

  // The Transfer panel's own account picker (Search Accounts / Current
  // Subcontractor) needs its own full account list — it must not depend on
  // whether the main top-of-page search has been used.
  async function fetchTransferAccounts() {
    setLoadingTransferAccounts(true);
    setTransferAccountsError("");

    try {
      const response = await fetch("/api/accounts", { cache: "no-store" });
      const data = await readJson<ApiResponse>(response);

      if (!response.ok || data.success === false) {
        throw new Error(data.error ?? "Could not load accounts for transfer.");
      }

      const rawAccounts: Account[] = data.accounts ?? data.data ?? [];
      setTransferAllAccounts(enrichAccounts(rawAccounts, subcontractorsRef.current));
    } catch (err) {
      setTransferAccountsError(
        err instanceof Error
          ? err.message
          : "Something went wrong loading accounts for transfer."
      );
    } finally {
      setLoadingTransferAccounts(false);
    }
  }

  useEffect(() => {
    void fetchSubcontractors();
    void loadBulkToDoManagers();
    // Auto-load with the default filters (Status: Active, etc.) immediately
    // on mount — same request handleSearch's empty-text Search click would
    // make, so the page arrives with data/metrics already populated instead
    // of the old "click Search to get started" placeholder. This same
    // empty-query call also populates the filter dropdowns — see
    // fetchAccounts above.
    void fetchAccounts("");
  }, [fetchSubcontractors, fetchAccounts]);

  // Search only runs when the user explicitly asks for it (Search button or
  // Enter key) — not on every keystroke or filter-dropdown change. An empty
  // search box still works: /api/accounts treats a blank "q" as "return
  // everything," so clicking Search with no text browses the full list.
  function handleSearch() {
    void fetchAccounts(searchText.trim());
  }


  useEffect(() => {
    if (transferMode) {
      loadTransferProposals();
      fetchTransferAccounts();
    }
  }, [transferMode]);

  // -------------------------------------------------------------------------
  // Derived filter options (managers + subcontractors)
  // -------------------------------------------------------------------------

  const managers = useMemo(() => {
    const unique = Array.from(
      new Set(filterOptionAccounts.map((a) => normalizeText(a.manager)).filter(Boolean))
    );
    return ["All", ...unique.sort()];
  }, [filterOptionAccounts]);

  const subcontractors = useMemo<SubcontractorFilterOption[]>(() => {
    const unique = Array.from(
      new Set(filterOptionAccounts.map((a) => normalizeText(a.subcontractor)).filter(Boolean))
    );

    const options = unique.map((storedSub) => {
      const matchingAccount = filterOptionAccounts.find(
        (a) => normalizeText(a.subcontractor) === storedSub
      );

      return {
        value: storedSub,
        label: getSubDisplayLabel(matchingAccount?._subDisplay),
      };
    });

    return [
      { value: "All", label: "All Subcontractors" },
      ...options.sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [filterOptionAccounts]);

  // Reference account for the "Near Account" filter, resolved from the
  // shared account list so it has the same _latitudeNum/_longitudeNum this
  // page computes (the autocomplete's own fetch doesn't carry those).
  const nearAccountRef = useMemo(() => {
    if (!nearAccountSearch.selected) return null;
    return accounts.find((a) => getAccountId(a) === nearAccountSearch.selected!.id) ?? null;
  }, [accounts, nearAccountSearch.selected]);

  const nearAccountCoords = useMemo(() => {
    if (
      !nearAccountRef ||
      nearAccountRef._latitudeNum == null ||
      nearAccountRef._longitudeNum == null
    ) {
      return null;
    }
    return { latitude: nearAccountRef._latitudeNum, longitude: nearAccountRef._longitudeNum };
  }, [nearAccountRef]);

  // Reset visible count whenever filters change
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [
    debouncedSearch,
    statusFilter,
    managerFilter,
    subcontractorFilter,
    nearAccountRef,
    nearAccountRadius,
    minRevenueFilter,
    maxRevenueFilter,
    minSubPayFilter,
    maxSubPayFilter,
    sortOption,
  ]);

  // -------------------------------------------------------------------------
  // Filtering + sorting — uses pre-normalized fields for speed
  // -------------------------------------------------------------------------

  const nonLocationFilterParams = useMemo<NonLocationFilterParams>(
    () => ({
      cleanSearch: debouncedSearch.toLowerCase().trim(),
      statusFilter,
      managerFilter,
      subcontractorFilter,
      minRevenue: moneyToNumber(minRevenueFilter),
      maxRevenue: moneyToNumber(maxRevenueFilter),
      minSubPay: moneyToNumber(minSubPayFilter),
      maxSubPay: moneyToNumber(maxSubPayFilter),
    }),
    [
      debouncedSearch,
      statusFilter,
      managerFilter,
      subcontractorFilter,
      minRevenueFilter,
      maxRevenueFilter,
      minSubPayFilter,
      maxSubPayFilter,
    ]
  );

  const filteredAccounts = useMemo(() => {
    const filtered = accounts.filter((account) => {
      if (!accountMatchesNonLocationFilters(account, nonLocationFilterParams)) {
        return false;
      }

      if (nearAccountRef) {
        if (getAccountId(account) === getAccountId(nearAccountRef)) return false;
        if (!nearAccountCoords) return false;

        const distance = distanceInMiles(nearAccountCoords, {
          latitude: account._latitudeNum ?? null,
          longitude: account._longitudeNum ?? null,
        });

        if (distance === null || distance > nearAccountRadius) return false;
      }

      return true;
    });

    if (nearAccountRef && nearAccountCoords) {
      return filtered
        .map((account) => ({
          ...account,
          _distanceMiles: distanceInMiles(nearAccountCoords, {
            latitude: account._latitudeNum ?? null,
            longitude: account._longitudeNum ?? null,
          }),
        }))
        .sort((a, b) => (a._distanceMiles ?? Infinity) - (b._distanceMiles ?? Infinity));
    }

    return [...filtered].sort((a, b) => {
      if (sortOption === "Start Date - Newest First") {
        return (b._startDateTime ?? 0) - (a._startDateTime ?? 0);
      }

      if (sortOption === "Start Date - Oldest First") {
        return (a._startDateTime ?? 0) - (b._startDateTime ?? 0);
      }

      if (sortOption === "Monthly Revenue - Highest First") {
        return (b._monthlyRevenueNum ?? 0) - (a._monthlyRevenueNum ?? 0);
      }

      if (sortOption === "Monthly Revenue - Lowest First") {
        return (a._monthlyRevenueNum ?? 0) - (b._monthlyRevenueNum ?? 0);
      }

      if (sortOption === "Sub Pay - Highest First") {
        return (b._subPayNum ?? 0) - (a._subPayNum ?? 0);
      }

      if (sortOption === "Sub Pay - Lowest First") {
        return (a._subPayNum ?? 0) - (b._subPayNum ?? 0);
      }

      return normalizeText(a.accountName).localeCompare(
        normalizeText(b.accountName)
      );
    });
  }, [accounts, nonLocationFilterParams, nearAccountRef, nearAccountCoords, nearAccountRadius, sortOption]);

  // Accounts that would otherwise match the current filters but are hidden
  // from Near Account results only because they have no stored coordinates —
  // surfaced as a count so staff know results aren't necessarily complete,
  // without this page doing any live geocoding of its own.
  const nearAccountMissingCoordsCount = useMemo(() => {
    if (!nearAccountRef) return 0;

    return accounts.filter((account) => {
      if (getAccountId(account) === getAccountId(nearAccountRef)) return false;
      if (!accountMatchesNonLocationFilters(account, nonLocationFilterParams)) return false;
      return account._latitudeNum == null || account._longitudeNum == null;
    }).length;
  }, [accounts, nearAccountRef, nonLocationFilterParams]);

  const filteredRevenue = useMemo(() => filteredAccounts.reduce((sum, a) => sum + (a._monthlyRevenueNum ?? 0), 0), [filteredAccounts]);

  const visibleAccounts = useMemo(() => {
    const sliced = filteredAccounts.slice(0, visibleCount);
    return sliced.map((account) => {
      const revNum = account._monthlyRevenueNum ?? 0;
      const pct = filteredRevenue > 0 ? Math.round((revNum / filteredRevenue) * 100) : 0;
      return {
        ...account,
        _revenuePercent: pct,
      };
    });
  }, [filteredAccounts, visibleCount, filteredRevenue]);

  // -------------------------------------------------------------------------
  // Summary stats
  // -------------------------------------------------------------------------

  const activeCount = useMemo(() => accounts.filter((a) => a._statusCategory === "Active").length, [accounts]);
  const cancelledCount = useMemo(() => accounts.filter((a) => a._statusCategory === "Cancelled").length, [accounts]);
  const highRiskCount = useMemo(() => accounts.filter((a) => normalizeLower(a.accountHealth).includes("high risk")).length, [accounts]);

  const filteredSubPay = useMemo(
    () => filteredAccounts.reduce((sum, account) => sum + (account._subPayNum ?? 0), 0),
    [filteredAccounts]
  );
  const filteredGrossMargin = useMemo(
    () => filteredAccounts.reduce((sum, a) => sum + ((a._grossMarginNum ?? 0)), 0),
    [filteredAccounts]
  );
  const filteredMarginPercent = filteredRevenue > 0
    ? Math.round((filteredGrossMargin / filteredRevenue) * 100)
    : 0;

  const activeSubcontractors = useMemo(() => {
    return allSubcontractors
      .filter((sub) => {
        const status = normalizeLower(sub.status);
        return !status || status.includes("active");
      })
      .sort((a, b) => getSubcontractorLabel(a).localeCompare(getSubcontractorLabel(b)));
  }, [allSubcontractors]);

  const selectedTransferSubcontractor = useMemo(() => {
    if (!transferSubcontractorEmail) return null;
    return (
      activeSubcontractors.find((sub) => normalizeText(sub.email) === transferSubcontractorEmail) ??
      null
    );
  }, [activeSubcontractors, transferSubcontractorEmail]);

  const selectedTransferAccounts = useMemo(() => {
    const selected = new Set(selectedTransferAccountIds);
    return transferAllAccounts.filter((account) => selected.has(getAccountId(account)));
  }, [transferAllAccounts, selectedTransferAccountIds]);

  const transferSourceSubcontractorOptions = useMemo<SubcontractorFilterOption[]>(() => {
    const unique = Array.from(
      new Set(transferAllAccounts.map((a) => normalizeText(a.subcontractor)).filter(Boolean))
    );

    const options = unique.map((storedSub) => {
      const matchingAccount = transferAllAccounts.find(
        (a) => normalizeText(a.subcontractor) === storedSub
      );

      return {
        value: storedSub,
        label: getSubDisplayLabel(matchingAccount?._subDisplay),
      };
    });

    return [
      { value: "All", label: "All Subcontractors" },
      ...options.sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [transferAllAccounts]);

  const transferCandidateAccounts = useMemo(() => {
    const cleanSearch = transferAccountSearch.toLowerCase().trim();
    const hasSearchOrSubFilter =
      Boolean(cleanSearch) || transferSourceSubcontractorFilter !== "All";

    if (!hasSearchOrSubFilter) return [];

    return transferAllAccounts
      .filter((account) => {
        const isActive = account._statusCategory === "Active";
        const matchesSourceSub =
          transferSourceSubcontractorFilter === "All" ||
          normalizeText(account.subcontractor) === transferSourceSubcontractorFilter;
        const searchBlob = [
          account.accountName,
          account.address,
          account.city,
          account.state,
          account.zip,
          account.manager,
          account.subcontractor,
          account._subDisplay?.contactName,
          account._subDisplay?.companyName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        const matchesSearch = !cleanSearch || searchBlob.includes(cleanSearch);

        return isActive && matchesSourceSub && matchesSearch;
      })
      .sort((a, b) => normalizeText(a.accountName).localeCompare(normalizeText(b.accountName)));
  }, [transferAllAccounts, transferAccountSearch, transferSourceSubcontractorFilter]);

  const transferTotalProposedPay = useMemo(() => {
    return selectedTransferAccounts.reduce((sum, account) => {
      return sum + moneyToNumber(transferPayByAccountId[getAccountId(account)]);
    }, 0);
  }, [selectedTransferAccounts, transferPayByAccountId]);

  // -------------------------------------------------------------------------
  // Transfer proposal helpers
  // -------------------------------------------------------------------------

  function toggleTransferMode() {
    setTransferMode((current) => !current);
    setTransferMessage("");
    setTransferError("");
    // Mutually exclusive with bulk-to-do selection — both repurpose the
    // same row-checkbox UI for a different bulk action.
    setBulkToDoMode(false);
    setSelectedBulkToDoIds(new Set());
  }

  function toggleBulkToDoMode() {
    setBulkToDoMode((current) => !current);
    setSelectedBulkToDoIds(new Set());
    setShowBulkToDoForm(false);
    setBulkToDoError("");
    setBulkToDoSuccess("");
    setTransferMode(false);
  }

  function toggleBulkToDoAccount(account: Account) {
    const accountId = getAccountId(account);
    if (!accountId) return;

    setSelectedBulkToDoIds((current) => {
      const next = new Set(current);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  }

  // Mirrors app/to-do/page.tsx's loadManagers(): missing/blank status is
  // treated as Active so a manager row that predates the Status column
  // still shows up here rather than silently disappearing from the dropdown.
  async function loadBulkToDoManagers() {
    try {
      const response = await fetch("/api/admin/managers", { cache: "no-store" });
      const data = await readJson<{ managers?: Manager[]; data?: Manager[] } | Manager[]>(response);
      const rows: Manager[] = Array.isArray(data) ? data : data.managers ?? data.data ?? [];

      const activeNames = Array.from(
        new Set(
          rows
            .filter((row) => !row.status || row.status === "Active")
            .map((row) => (row.name ?? "").trim())
            .filter(Boolean)
        )
      ).sort();

      setBulkToDoManagers(activeNames);
    } catch {
      setBulkToDoManagers([]);
    }
  }

  async function submitBulkToDos() {
    setBulkToDoError("");
    setBulkToDoSuccess("");

    if (!bulkToDoForm.assignedTo.trim()) {
      setBulkToDoError("Assigned To is required.");
      return;
    }
    if (!bulkToDoForm.why.trim()) {
      setBulkToDoError("Why is required.");
      return;
    }
    if (selectedBulkToDoIds.size === 0) {
      setBulkToDoError("Select at least one account.");
      return;
    }

    const accountNames = accounts
      .filter((account) => selectedBulkToDoIds.has(getAccountId(account)))
      .map((account) => normalizeText(account.accountName) || "Unnamed Account");

    setBulkToDoSaving(true);
    try {
      const response = await fetch("/api/to-do", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addToDos",
          accountNames,
          dueDate: bulkToDoForm.dueDate,
          assignedTo: bulkToDoForm.assignedTo,
          taskType: bulkToDoForm.taskType,
          why: bulkToDoForm.why,
          notes: bulkToDoForm.notes,
          status: "Open",
        }),
      });

      const data = await readJson<{ success?: boolean; message?: string; calendarSyncFailed?: boolean }>(response);
      if (!data.success) {
        throw new Error(data.message ?? "Could not create to-dos.");
      }

      setBulkToDoSuccess(
        `Created ${accountNames.length} to-do${accountNames.length === 1 ? "" : "s"}${
          data.calendarSyncFailed ? " (Calendar sync failed for at least one — check the To-Do page)" : ""
        }.`
      );
      setShowBulkToDoForm(false);
      setBulkToDoMode(false);
      setSelectedBulkToDoIds(new Set());
      setBulkToDoForm({ assignedTo: "", taskType: "Visit", dueDate: "", why: "", notes: "" });
    } catch (err) {
      setBulkToDoError(err instanceof Error ? err.message : "Could not create to-dos.");
    } finally {
      setBulkToDoSaving(false);
    }
  }

  // -------------------------------------------------------------------------
  // Quick to-do modal (per-row "+ To-Do")
  // -------------------------------------------------------------------------

  function openQuickToDoModal(account: Account) {
    // Accounts and the managers list don't always agree on accents (e.g.
    // "Andres" vs "Andrés"), so strip diacritics before comparing.
    const foldAccents = (value: string) =>
      value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const managerName = foldAccents(normalizeText(account.manager));
    const matchedManager = bulkToDoManagers.find(
      (name) => foldAccents(name) === managerName
    );
    setQuickToDoAccount(account);
    setQuickToDoForm({
      assignedTo: matchedManager ?? "",
      taskType: "Visit",
      dueDate: "",
      why: "",
      notes: "",
    });
    setQuickToDoError("");
  }

  function closeQuickToDoModal() {
    if (quickToDoSaving) return;
    setQuickToDoAccount(null);
    setQuickToDoError("");
  }


  async function submitQuickToDo() {
    if (!quickToDoAccount) return;
    setQuickToDoError("");

    if (!quickToDoForm.assignedTo.trim()) {
      setQuickToDoError("Assigned To is required.");
      return;
    }
    if (!quickToDoForm.why.trim()) {
      setQuickToDoError("Why is required.");
      return;
    }

    const accountName = normalizeText(quickToDoAccount.accountName) || "Unnamed Account";

    setQuickToDoSaving(true);
    try {
      const response = await fetch("/api/to-do", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addToDos",
          accountNames: [accountName],
          accountIds: [getAccountId(quickToDoAccount)],
          dueDate: quickToDoForm.dueDate,
          assignedTo: quickToDoForm.assignedTo,
          taskType: quickToDoForm.taskType,
          why: quickToDoForm.why,
          notes: quickToDoForm.notes,
          status: "Open",
        }),
      });

      const data = await readJson<{ success?: boolean; message?: string; calendarSyncFailed?: boolean }>(response);
      if (!data.success) {
        throw new Error(data.message ?? "Could not create to-do.");
      }

      closeQuickToDoModal();
      showToast(
        `To-do created for ${accountName}.${
          data.calendarSyncFailed ? " (Calendar sync failed — check the To-Do page.)" : ""
        }`
      );
    } catch (err) {
      setQuickToDoError(err instanceof Error ? err.message : "Could not create to-do.");
    } finally {
      setQuickToDoSaving(false);
    }
  }

  function toggleTransferAccount(account: Account) {
    const accountId = getAccountId(account);
    if (!accountId) return;

    setTransferMessage("");
    setTransferError("");
    setTransferProposalId("");

    setSelectedTransferAccountIds((current) => {
      if (current.includes(accountId)) {
        setTransferPayByAccountId((payCurrent) => {
          const copy = { ...payCurrent };
          delete copy[accountId];
          return copy;
        });

        return current.filter((id) => id !== accountId);
      }

      const defaultPay = moneyToNumber(
        account.monthlySubcontractorPay ?? account.subcontractorPay
      );

      setTransferPayByAccountId((payCurrent) => ({
        ...payCurrent,
        [accountId]: defaultPay > 0 ? String(defaultPay) : "",
      }));

      return [...current, accountId];
    });
  }

  function updateTransferPay(accountId: string, value: string) {
    setTransferPayByAccountId((current) => ({ ...current, [accountId]: value }));
    setTransferProposalId("");
    setTransferMessage("");
    setTransferError("");
  }

  function clearTransferProposal() {
    setSelectedTransferAccountIds([]);
    setTransferSourceSubcontractorFilter("All");
    setTransferAccountSearch("");
    setTransferSubcontractorEmail("");
    setTransferNewSubcontractorMode("existing");
    setManualTransferSubcontractorName("");
    setManualTransferSubcontractorEmail("");
    setTransferPayByAccountId({});
    setTransferNotes("");
    setTransferProposalId("");
    setTransferMessage("");
    setTransferError("");
  }

  function cancelTransferProposal() {
    clearTransferProposal();
    setTransferMode(false);
  }

  function getTransferDestinationSubcontractor() {
    if (transferNewSubcontractorMode === "new") {
      return {
        name: manualTransferSubcontractorName.trim(),
        email: manualTransferSubcontractorEmail.trim(),
      };
    }

    const name = selectedTransferSubcontractor
      ? getSubcontractorLabel(selectedTransferSubcontractor)
      : "";

    return {
      name,
      email: transferSubcontractorEmail,
    };
  }

  function buildTransferProposalPayload(): TransferProposalPayload {
    const destination = getTransferDestinationSubcontractor();

    return {
      proposalId: transferProposalId || undefined,
      newSubcontractor: destination.name,
      newSubcontractorEmail: destination.email,
      subcontractorName: destination.name,
      subcontractorEmail: destination.email,
      email: destination.email,
      proposedMonthlyPay: transferTotalProposedPay,
      notes: transferNotes.trim(),
      accounts: selectedTransferAccounts.map((account) => {
        const accountId = getAccountId(account);
        return {
          accountId,
          accountName: normalizeText(account.accountName) || "Unnamed Account",
          address: getProposalAddress(account) || "N/A",
          cleaningDays: getProposalCleaningDays(account),
          scope: getProposalScope(account),
          keysAlarm: getKeysAlarmRequired(account),
          proposedMonthlyPay: moneyToNumber(transferPayByAccountId[accountId]),
          monthlyRevenue: moneyToNumber(account.monthlyRevenue),
        };
      }),
    };
  }

  function validateTransferProposal(): string {
    const destination = getTransferDestinationSubcontractor();

    if (transferNewSubcontractorMode === "new") {
      if (!destination.name) return "Add the new subcontractor name.";
      if (!destination.email) return "Add the new subcontractor email.";
    } else if (!destination.email) {
      return "Choose the new subcontractor first.";
    }

    if (selectedTransferAccounts.length === 0) return "Select at least one account.";
    const missingPayAccount = selectedTransferAccounts.find((account) => {
      const accountId = getAccountId(account);
      return moneyToNumber(transferPayByAccountId[accountId]) <= 0;
    });
    if (missingPayAccount) {
      return `Add proposed monthly pay for ${missingPayAccount.accountName || "the selected account"}.`;
    }
    return "";
  }


  function loadStoredProposalIntoBuilder(proposal: StoredTransferProposal) {
  const proposalAccounts = Array.isArray(proposal.accounts)
    ? proposal.accounts
    : [];

  const proposalIds = proposalAccounts
    .map((account) => normalizeText(account.accountId))
    .filter(Boolean);

  const matchingIds = proposalIds.filter((id) =>
    transferAllAccounts.some((account) => getAccountId(account) === id)
  );

  const payById: Record<string, string> = {};

  proposalAccounts.forEach((storedAccount) => {
    const storedAccountId = normalizeText(storedAccount.accountId);
    if (!storedAccountId) return;

    const proposedPay = moneyToNumber(storedAccount.proposedMonthlyPay);
    payById[storedAccountId] = proposedPay > 0 ? String(proposedPay) : "";
  });

  const email = getStoredProposalEmail(proposal);
  const existingSub = activeSubcontractors.find(
    (sub) => normalizeText(sub.email) === email
  );

  setViewedStoredProposal(proposal);
  setSelectedTransferAccountIds(matchingIds);
  setTransferPayByAccountId(payById);
  setTransferProposalId(getStoredProposalId(proposal));
  setTransferNotes(normalizeText(proposal.notes));
  setTransferError("");

  if (existingSub) {
    setTransferNewSubcontractorMode("existing");
    setTransferSubcontractorEmail(email);
    setManualTransferSubcontractorName("");
    setManualTransferSubcontractorEmail("");
  } else {
    setTransferNewSubcontractorMode("new");
    setTransferSubcontractorEmail("");
    setManualTransferSubcontractorName(getStoredProposalSubcontractor(proposal));
    setManualTransferSubcontractorEmail(email);
  }

  setTransferMessage(
    proposalAccounts.length > 0
      ? "Stored proposal opened below. You can review it, print it, or edit matched accounts."
      : "Stored proposal opened, but this saved record has no account details attached."
  );
}

async function handleSaveTransferProposal() {
  const validationError = validateTransferProposal();
  if (validationError) {
    setTransferError(validationError);
    return;
  }

  try {
    setTransferSaving(true);
    setTransferError("");
    setTransferMessage("");

    const response = await fetch("/api/sub-transfer-proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "createSubTransferProposal",
        proposal: buildTransferProposalPayload(),
      }),
    });

    const data = await readJson<{
      success?: boolean;
      error?: string;
      message?: string;
      proposalId?: string;
      id?: string;
      data?: { proposalId?: string };
    }>(response);

    if (!response.ok || data.success === false) {
      throw new Error(data.error ?? data.message ?? "Could not save transfer proposal.");
    }

    const savedProposalId =
      data.proposalId ??
      data.id ??
      data.data?.proposalId ??
      transferProposalId;

    if (savedProposalId) {
      setTransferProposalId(savedProposalId);
    }

    setTransferMessage(
      savedProposalId ? `Proposal saved: ${savedProposalId}` : "Proposal saved."
    );

    loadTransferProposals();
  } catch (err) {
    setTransferError(
      err instanceof Error
        ? err.message
        : "Something went wrong saving the proposal."
    );
  } finally {
    setTransferSaving(false);
  }
}

  async function handleSendTransferProposalEmail() {
    const validationError = validateTransferProposal();
    if (validationError) {
      setTransferError(validationError);
      return;
    }

    try {
      setTransferSaving(true);
      setTransferError("");
      setTransferMessage("");

      let proposalId = transferProposalId;

      if (!proposalId) {
        const createResponse = await fetch("/api/sub-transfer-proposals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "createSubTransferProposal",
            proposal: buildTransferProposalPayload(),
          }),
        });

        const createData = await readJson<{
          success?: boolean;
          error?: string;
          message?: string;
          proposalId?: string;
          id?: string;
          data?: { proposalId?: string };
        }>(createResponse);

        if (!createResponse.ok || createData.success === false) {
          throw new Error(
            createData.error ?? createData.message ?? "Could not save transfer proposal before sending."
          );
        }

        proposalId = createData.proposalId ?? createData.id ?? createData.data?.proposalId ?? "";

        if (proposalId) {
          setTransferProposalId(proposalId);
        }
      }

      const response = await fetch("/api/sub-transfer-proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sendSubTransferProposalEmail",
          proposal: { ...buildTransferProposalPayload(), proposalId },
        }),
      });

      const data = await readJson<{ success?: boolean; error?: string; message?: string }>(response);
      if (!response.ok || data.success === false) {
        throw new Error(data.error ?? "Could not send transfer proposal email.");
      }

      setTransferMessage(data.message ?? "Proposal email sent.");
      loadTransferProposals();
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : "Something went wrong sending the email.");
    } finally {
      setTransferSaving(false);
    }
  }

  function handlePrintTransferProposal() {
    const validationError = validateTransferProposal();
    if (validationError) {
      setTransferError(validationError);
      return;
    }

    const proposal = buildTransferProposalPayload();
    const rows = proposal.accounts
      .map(
        (account, index) => `
          <div class="account">
            <h2>${index + 1}. ${escapeHtml(account.accountName)}</h2>
            <p><strong>Address:</strong> ${escapeHtml(account.address)}</p>
            <p><strong>Cleaning Days:</strong> ${escapeHtml(account.cleaningDays)}</p>
            <p><strong>Scope:</strong> ${escapeHtml(account.scope)}</p>
            <p><strong>Keys / Alarm Required:</strong> ${escapeHtml(account.keysAlarm)}</p>
            <p><strong>Proposed Monthly Pay:</strong> ${formatMoney(account.proposedMonthlyPay)}</p>
          </div>
        `
      )
      .join("");

    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      setTransferError("Popup blocked. Allow popups for this site and try Print Proposal again.");
      return;
    }

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Cleaning World Transfer Proposal</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 32px; color: #0f172a; }
            h1 { margin: 0 0 8px; font-size: 24px; }
            .meta { margin-bottom: 24px; color: #475569; }
            .account { border: 1px solid #cbd5e1; border-radius: 14px; padding: 18px; margin-bottom: 14px; page-break-inside: avoid; }
            .account h2 { margin: 0 0 12px; font-size: 18px; }
            p { margin: 8px 0; line-height: 1.45; }
            .note { margin-top: 24px; border-top: 1px solid #cbd5e1; padding-top: 16px; }
            @media print { button { display: none; } body { margin: 20px; } }
          </style>
        </head>
        <body>
          <h1>Cleaning World Account Transfer Proposal</h1>
          <div class="meta">
            <p><strong>Subcontractor:</strong> ${escapeHtml(proposal.newSubcontractor)}</p>
            <p><strong>Email:</strong> ${escapeHtml(proposal.newSubcontractorEmail)}</p>
            <p><strong>Total Proposed Monthly Pay:</strong> ${formatMoney(transferTotalProposedPay)}</p>
          </div>
          ${rows}
          <div class="note">
            <p><strong>Notes:</strong></p>
            <p>${escapeHtml(proposal.notes || "N/A")}</p>
            <p><strong>Access details:</strong> Key/alarm details are not included in this proposal. Details will be provided only after acceptance and approval.</p>
          </div>
          <button onclick="window.print()">Print</button>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
  }


  // -------------------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------------------

  function handlePrintSubcontractorAccountList() {
  if (subcontractorFilter === "All") {
    setError("Choose a subcontractor first, then click Print Sub Account List.");
    return;
  }

  const selectedSubOption = subcontractors.find(
    (sub) => sub.value === subcontractorFilter
  );

  const subLabel = selectedSubOption?.label || subcontractorFilter;

  const subAccounts = accounts
    .filter((account) => {
      return (
        account._statusCategory === "Active" &&
        normalizeText(account.subcontractor) === subcontractorFilter
      );
    })
    .sort((a, b) =>
      normalizeText(a.accountName).localeCompare(normalizeText(b.accountName))
    );

  if (subAccounts.length === 0) {
    setError(`No active accounts found for ${subLabel}.`);
    return;
  }

  const totalRevenue = subAccounts.reduce(
    (sum, account) => sum + moneyToNumber(account.monthlyRevenue),
    0
  );

  const totalSubPay = subAccounts.reduce(
    (sum, account) =>
      sum +
      moneyToNumber(
        account.monthlySubcontractorPay ?? account.subcontractorPay
      ),
    0
  );

  const rows = subAccounts
    .map((account, index) => {
      const address = getProposalAddress(account) || "N/A";
      const cleaningDays = getProposalCleaningDays(account);
      const scope = getProposalScope(account);
      const subPay = moneyToNumber(
        account.monthlySubcontractorPay ?? account.subcontractorPay
      );

      return `
        <div class="account">
          <div class="account-header">
            <div>
              <h2>${index + 1}. ${escapeHtml(
                account.accountName || "Unnamed Account"
              )}</h2>
              <p class="address">${escapeHtml(address)}</p>
            </div>
            <div class="pay">
              <span>Sub Pay</span>
              <strong>${formatMoney(subPay)}</strong>
            </div>
          </div>

          <div class="grid">
            <p><strong>Account ID:</strong> ${escapeHtml(getAccountId(account) || "N/A")}</p>
            <p><strong>Cleaning Days:</strong> ${escapeHtml(cleaningDays)}</p>
            <p><strong>Frequency:</strong> ${escapeHtml(normalizeText(account.frequency) || "N/A")}</p>
            <p><strong>Keys / Alarm:</strong> ${escapeHtml(getKeysAlarmRequired(account))}</p>
            <p><strong>Monthly Revenue:</strong> ${formatMoney(account.monthlyRevenue)}</p>
            <p><strong>Account Health:</strong> ${escapeHtml(account.accountHealth || "N/A")}</p>
          </div>

          <p class="scope"><strong>Scope:</strong> ${escapeHtml(scope)}</p>
        </div>
      `;
    })
    .join("");

  const printWindow = window.open("", "_blank", "width=900,height=700");

  if (!printWindow) {
    setError("Popup blocked. Allow popups for this site and try again.");
    return;
  }

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>Cleaning World Subcontractor Account List</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 28px;
            color: #0f172a;
          }

          h1 {
            margin: 0 0 6px;
            font-size: 24px;
          }

          .subtitle {
            margin: 0 0 18px;
            color: #475569;
            font-size: 14px;
            line-height: 1.4;
          }

          .summary {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin: 18px 0 22px;
          }

          .summary-box {
            border: 1px solid #cbd5e1;
            border-radius: 14px;
            padding: 12px;
            background: #f8fafc;
          }

          .summary-box span {
            display: block;
            color: #64748b;
            font-size: 11px;
            text-transform: uppercase;
            font-weight: 800;
            letter-spacing: 0.06em;
          }

          .summary-box strong {
            display: block;
            margin-top: 5px;
            font-size: 18px;
          }

          .account {
            border: 1px solid #cbd5e1;
            border-radius: 16px;
            padding: 16px;
            margin-bottom: 12px;
            page-break-inside: avoid;
          }

          .account-header {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            align-items: flex-start;
          }

          .account h2 {
            margin: 0;
            font-size: 18px;
          }

          .address {
            margin: 5px 0 0;
            color: #475569;
            font-size: 13px;
            font-weight: 700;
          }

          .pay {
            text-align: right;
            min-width: 120px;
          }

          .pay span {
            display: block;
            color: #64748b;
            font-size: 11px;
            text-transform: uppercase;
            font-weight: 800;
          }

          .pay strong {
            display: block;
            margin-top: 4px;
            font-size: 16px;
          }

          .grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 6px 16px;
            margin-top: 12px;
          }

          p {
            margin: 4px 0;
            font-size: 13px;
            line-height: 1.4;
          }

          .scope {
            margin-top: 10px;
          }

          .print-button {
            margin-top: 18px;
            padding: 10px 16px;
            border: 0;
            border-radius: 10px;
            background: #0f172a;
            color: white;
            font-weight: 800;
            cursor: pointer;
          }

          @media print {
            body {
              margin: 18px;
            }

            .print-button {
              display: none;
            }
          }
        </style>
      </head>

      <body>
        <h1>Cleaning World Subcontractor Account List</h1>
        <p class="subtitle">
          <strong>Subcontractor:</strong> ${escapeHtml(subLabel)}<br />
          <strong>Printed:</strong> ${escapeHtml(new Date().toLocaleDateString("en-US"))}
        </p>

        <div class="summary">
          <div class="summary-box">
            <span>Active Accounts</span>
            <strong>${subAccounts.length}</strong>
          </div>

          <div class="summary-box">
            <span>Total Revenue</span>
            <strong>${formatMoney(totalRevenue)}</strong>
          </div>

          <div class="summary-box">
            <span>Total Sub Pay</span>
            <strong>${formatMoney(totalSubPay)}</strong>
          </div>
        </div>

        ${rows}

        <button class="print-button" onclick="window.print()">Print</button>
      </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();
}

  function clearFilters() {
    setSearchText("");
    setStatusFilter("Active");
    setManagerFilter("All");
    setSubcontractorFilter("All");
    nearAccountSearch.clear();
    setNearAccountRadius(DEFAULT_NEAR_ACCOUNT_RADIUS_MILES);
    setMinRevenueFilter("");
    setMaxRevenueFilter("");
    setMinSubPayFilter("");
    setMaxSubPayFilter("");
    setSortOption("Account Name");
    setAccounts([]);
    setHasSearched(false);
  }

  // -------------------------------------------------------------------------
  // Status modal
  // -------------------------------------------------------------------------

  function openStatusModal(account: Account) {
    const current = normalizeText(account.status);
    setStatusModalAccount(account);
    setNewStatus(quickStatusOptions.includes(current as QuickStatusOption) ? (current as QuickStatusOption) : "Active");
    setStatusReason("");
    setStatusError("");
  }

  function closeStatusModal() {
    if (savingStatus) return;
    setStatusModalAccount(null);
    setNewStatus("Active");
    setStatusReason("");
    setStatusError("");
  }


  async function handleSaveStatusChange() {
    if (!statusModalAccount) return;

    const cleanReason = statusReason.trim();
    if (!cleanReason) {
      setStatusError("Please add a reason/note for the status change.");
      return;
    }

    const oldStatus = normalizeText(statusModalAccount.status) || "N/A";
    const accountId = getAccountId(statusModalAccount);
    const accountName = normalizeText(statusModalAccount.accountName) || "Unnamed Account";

    try {
      setSavingStatus(true);
      setStatusError("");

      const accountResponse = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateAccountFields",
          accountId,
          fields: { status: newStatus },
        }),
      });

      const accountData = await readJson<ApiResponse>(accountResponse);
      if (!accountResponse.ok || accountData.success === false) {
        throw new Error(accountData.error ?? "Could not update account status.");
      }

      // Reflect the status change in state immediately, regardless of the history note outcome
      setAccounts((current) =>
        current.map((a) => {
          if (getAccountId(a) !== accountId) return a;
          const updated: Account = { ...a, status: newStatus, _statusCategory: getStatusCategory(newStatus) };
          return updated;
        })
      );

      // Attempt to save the history note — surface a specific message if it fails
      const noteText = `Status changed from ${oldStatus} to ${newStatus}. Reason: ${cleanReason}`;
      try {
        const noteResponse = await fetch("/api/account-updates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "addAccountUpdate",
            accountId,
            accountName,
            updateType: "Status Change",
            manager: statusModalAccount.manager ?? "",
            notes: noteText,
            notifyEmail: "No",
          }),
        });

        const noteData = await readJson<ApiResponse>(noteResponse);
        if (!noteResponse.ok || noteData.success === false) {
          throw new Error(noteData.error ?? "History note could not be saved.");
        }
      } catch (noteErr) {
        // Status already saved — close the modal but warn the user
        closeStatusModal();
        setError(
          `Status updated to "${newStatus}", but the history note could not be saved: ${
            noteErr instanceof Error ? noteErr.message : "Unknown error"
          }`
        );
        return;
      }

      closeStatusModal();
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Something went wrong changing the account status.");
    } finally {
      setSavingStatus(false);
    }
  }

  const money0 = (value: number) =>
    value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  const filtersOn =
    (statusFilter !== "Active" ? 1 : 0) +
    (managerFilter !== "All" ? 1 : 0) +
    (subcontractorFilter !== "All" ? 1 : 0) +
    (nearAccountRef ? 1 : 0) +
    [minRevenueFilter, maxRevenueFilter, minSubPayFilter, maxSubPayFilter].filter((v) => v.trim() !== "").length +
    (!nearAccountRef && sortOption !== "Account Name" ? 1 : 0);

  const selectedCount = selectedBulkToDoIds.size;
  const plural = (n: number) => (n === 1 ? "" : "s");

  return (
    <Screen
      title="Accounts"
      subtitle="The default view shows active accounts."
      headerRight={
        <MoreMenu
          items={[
            { label: transferMode ? "Close transfer" : "Transfer proposal", onSelect: toggleTransferMode },
            { label: bulkToDoMode ? "Cancel selection" : "Create to-dos for multiple", icon: "plus", onSelect: toggleBulkToDoMode },
            ...(hasSearched ? [{ label: "Print sub account list", onSelect: handlePrintSubcontractorAccountList }] : []),
            { label: LABELS.print, onSelect: () => window.print() },
          ]}
        />
      }
      action={
        <BigButton icon="plus" href="/accounts/new">
          Add account
        </BigButton>
      }
    >
      {error ? <ErrorBox title="Something did not load." text={error} onRetry={handleSearch} /> : null}
      {subcontractorWarning ? <ErrorBox title="Some subcontractor details did not load." text={subcontractorWarning} /> : null}

      {bulkToDoMode ? (
        <Card title={`${selectedCount} account${plural(selectedCount)} selected`}>
          <p className="ui-card-text">Tick the boxes next to accounts below, then create to-dos for all of them at once.</p>
          <div style={{ marginTop: 12 }}>
            <BigButton kind="second" disabled={selectedCount === 0} onClick={() => setShowBulkToDoForm(true)}>
              Create to-dos for selected ({selectedCount})
            </BigButton>
          </div>
        </Card>
      ) : null}

      {bulkToDoSuccess ? (
        <p className="ui-savestatus ui-savestatus-saved" role="status">
          {bulkToDoSuccess}
        </p>
      ) : null}

      {/* One search box. Accounts load when Search is tapped (or Enter is
          pressed), with or without a search term, exactly as before. */}
      <form
        className="ui-searchrow"
        onSubmit={(event) => {
          event.preventDefault();
          handleSearch();
        }}
      >
        <SearchBar value={searchText} onChange={setSearchText} label="Search accounts" placeholder="Search accounts, or leave blank to see all" />
        <BigButton type="submit" kind="second" busy={loading} busyLabel="Searching…">
          Search
        </BigButton>
      </form>

      <div className="ui-actions-row">
        <BigButton kind="second" onClick={() => setShowFilters(true)}>
          {filtersOn ? `Filter and sort (${filtersOn} on)` : "Filter and sort"}
        </BigButton>
        {hasSearched ? (
          <BigButton kind="quiet" onClick={clearFilters}>
            Clear filters
          </BigButton>
        ) : null}
      </div>

      <div className="ui-stats">
        <div className="ui-stat">
          <p className="ui-stat-label">Total Loaded</p>
          <p className="ui-stat-value">{accounts.length}</p>
        </div>
        <div className="ui-stat">
          <p className="ui-stat-label">Active</p>
          <p className="ui-stat-value">{activeCount}</p>
        </div>
        <div className="ui-stat">
          <p className="ui-stat-label">Cancelled</p>
          <p className="ui-stat-value">{cancelledCount}</p>
        </div>
        <div className="ui-stat">
          <p className="ui-stat-label">High Risk</p>
          <p className="ui-stat-value">{highRiskCount}</p>
        </div>
        <div className="ui-stat">
          <p className="ui-stat-label">Revenue In Current View</p>
          <p className="ui-stat-value">{money0(filteredRevenue)}</p>
          <p className="ui-muted">Updates when you filter accounts.</p>
        </div>
        <div className="ui-stat">
          <p className="ui-stat-label">Sub Pay In Current View</p>
          <p className="ui-stat-value">{money0(filteredSubPay)}</p>
          <p className="ui-muted">Total subcontractor pay for the filtered accounts.</p>
        </div>
        <div className="ui-stat">
          <p className="ui-stat-label">Gross Margin In Current View</p>
          <p className="ui-stat-value">{money0(filteredGrossMargin)}</p>
          <p className="ui-muted">{filteredMarginPercent}% of revenue</p>
        </div>
      </div>

      {hasSearched ? (
        <div role="status">
          <p className="ui-muted">
            Showing <span className="ui-strong">{visibleAccounts.length}</span> of{" "}
            <span className="ui-strong">{filteredAccounts.length}</span> matching account{plural(filteredAccounts.length)}
            {loading && accounts.length > 0 ? " · Refreshing…" : ""}
          </p>
          {nearAccountRef && !nearAccountCoords ? (
            <p className="ui-field-error">
              {nearAccountRef.accountName || "The selected account"} has no stored location, so distance can&apos;t be calculated.
            </p>
          ) : null}
          {nearAccountRef && nearAccountCoords && nearAccountMissingCoordsCount > 0 ? (
            <p className="ui-field-error">
              {nearAccountMissingCoordsCount} account{plural(nearAccountMissingCoordsCount)} otherwise matching your filters
              have no stored location and are excluded from these results.
            </p>
          ) : null}
        </div>
      ) : null}

      <Sheet
        open={showBulkToDoForm}
        title={`Create to-dos for ${selectedCount} account${plural(selectedCount)}`}
        text="One independent to-do is created per selected account — each fully separate afterward, including its own Calendar sync if the type is calendar-eligible."
        onClose={() => setShowBulkToDoForm(false)}
        busy={bulkToDoSaving}
        actions={
          <BigButton busy={bulkToDoSaving} busyLabel="Creating…" onClick={() => void submitBulkToDos()}>
            {`Create ${selectedCount} to-do${plural(selectedCount)}`}
          </BigButton>
        }
      >
        <SelectField label="Assigned to" value={bulkToDoForm.assignedTo} onChange={(e) => setBulkToDoForm((f) => ({ ...f, assignedTo: e.target.value }))}>
          <option value="">Select a manager…</option>
          {bulkToDoManagers.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Type" value={bulkToDoForm.taskType} onChange={(e) => setBulkToDoForm((f) => ({ ...f, taskType: e.target.value }))}>
          {BULK_TODO_TASK_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </SelectField>
        <Field label="Due date" type="date" optional value={bulkToDoForm.dueDate} onChange={(e) => setBulkToDoForm((f) => ({ ...f, dueDate: e.target.value }))} />
        <Field label="Why" optional placeholder="Routine check-in visit" value={bulkToDoForm.why} onChange={(e) => setBulkToDoForm((f) => ({ ...f, why: e.target.value }))} />
        <Field label="Notes" hint="Applied to every to-do created." optional value={bulkToDoForm.notes} onChange={(e) => setBulkToDoForm((f) => ({ ...f, notes: e.target.value }))} />
        {bulkToDoError ? <ErrorBox title="The to-dos were not created." text={bulkToDoError} /> : null}
      </Sheet>

      <Sheet open={showFilters} title="Filter and sort" onClose={() => setShowFilters(false)} closeLabel="Done">
        <SelectField label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </SelectField>
        <SelectField label="Manager" value={managerFilter} onChange={(e) => setManagerFilter(e.target.value)}>
          {managers.map((m) => (
            <option key={String(m)} value={String(m)}>
              {m}
            </option>
          ))}
        </SelectField>
        <SelectField label="Subcontractor" value={subcontractorFilter} onChange={(e) => setSubcontractorFilter(e.target.value)}>
          {subcontractors.map((sub) => (
            <option key={sub.value} value={sub.value}>
              {sub.label}
            </option>
          ))}
        </SelectField>

        <AutocompleteField
          label="Near Account"
          placeholder="Find accounts near..."
          query={nearAccountSearch.query}
          onQueryChange={nearAccountSearch.setQuery}
          options={nearAccountSearch.options}
          loading={nearAccountSearch.loading}
          selected={nearAccountSearch.selected}
          onSelect={nearAccountSearch.select}
          onClear={nearAccountSearch.clear}
          className="min-w-0 w-full [&_input]:w-full [&_input]:min-h-[48px] [&>div:nth-child(2)]:w-full"
        />
        <SelectField
          label="Radius"
          hint={nearAccountSearch.selected ? undefined : "Pick a Near Account first."}
          value={String(nearAccountRadius)}
          onChange={(e) => setNearAccountRadius(Number(e.target.value))}
          disabled={!nearAccountSearch.selected}
        >
          {NEAR_ACCOUNT_RADIUS_OPTIONS.map((miles) => (
            <option key={miles} value={miles}>
              {miles} mi
            </option>
          ))}
        </SelectField>

        <Field label="Min revenue" optional inputMode="decimal" value={minRevenueFilter} onChange={(e) => setMinRevenueFilter(e.target.value)} />
        <Field label="Max revenue" optional inputMode="decimal" value={maxRevenueFilter} onChange={(e) => setMaxRevenueFilter(e.target.value)} />
        <Field label="Min sub pay" optional inputMode="decimal" value={minSubPayFilter} onChange={(e) => setMinSubPayFilter(e.target.value)} />
        <Field label="Max sub pay" optional inputMode="decimal" value={maxSubPayFilter} onChange={(e) => setMaxSubPayFilter(e.target.value)} />

        <SelectField
          label="Sort"
          hint={nearAccountRef ? "Sorted by distance while Near Account is on." : undefined}
          value={nearAccountRef ? "Distance" : sortOption}
          onChange={(e) => setSortOption(e.target.value as SortOption)}
          disabled={Boolean(nearAccountRef)}
        >
          {nearAccountRef ? (
            <option value="Distance">Distance (Near Account active)</option>
          ) : (
            sortOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))
          )}
        </SelectField>

        {hasSearched ? (
          <p className="ui-muted" role="status">
            {filteredAccounts.length} matching account{plural(filteredAccounts.length)}
          </p>
        ) : (
          <p className="ui-muted">Tap Done, then Search to load accounts.</p>
        )}
        <div>
          <BigButton kind="quiet" onClick={clearFilters}>
            Clear filters
          </BigButton>
        </div>
      </Sheet>

        {/* Transfer proposal panel */}
        {transferMode ? (
          <div className="mt-5 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">
                  Subcontractor Account Transfer
                </p>
                <h2 className="mt-2 text-2xl font-black text-slate-950">
                  New Transfer Proposal
                </h2>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
                  Use the search box or choose the current subcontractor, build the offer, then save, print, or send the email manually.
                </p>
              </div>
              <button
                type="button"
                onClick={clearTransferProposal}
                className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-xs font-black text-emerald-800 hover:bg-emerald-100"
              >
                Clear Proposal
              </button>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {/* Left side: source accounts */}
              <div className="rounded-3xl border border-emerald-200 bg-white p-4">
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-black uppercase tracking-wide text-emerald-700">
                    Select Accounts
                  </p>
                  <h3 className="text-xl font-black text-slate-950">
                    Accounts to Transfer
                  </h3>
                  <p className="text-xs font-semibold leading-5 text-slate-500">
                    No full account list here. Search by account or choose the current subcontractor to show matching accounts.
                  </p>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                      Current Subcontractor
                    </label>
                    <select
                      value={transferSourceSubcontractorFilter}
                      onChange={(e) => setTransferSourceSubcontractorFilter(e.target.value)}
                      className="mt-2 min-h-[48px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-emerald-500 sm:text-sm"
                    >
                      <option value="All">
                        {loadingTransferAccounts ? "Loading subcontractors..." : "All Subcontractors"}
                      </option>
                      {transferSourceSubcontractorOptions
                        .filter((sub) => sub.value !== "All")
                        .map((sub) => (
                          <option key={`source-${sub.value}`} value={sub.value}>
                            {sub.label}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                      Search Accounts
                    </label>
                    <input
                      value={transferAccountSearch}
                      onChange={(e) => setTransferAccountSearch(e.target.value)}
                      placeholder="Name, address, city, sub..."
                      className="mt-2 min-h-[48px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-emerald-500 sm:text-sm"
                    />
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-black text-slate-900">
                    {selectedTransferAccounts.length} selected
                  </p>
                  <p className="text-xs font-semibold text-slate-500">
                    Showing {Math.min(transferCandidateAccounts.length, 25)} of {transferCandidateAccounts.length} matching active accounts.
                  </p>
                </div>

                {transferAccountsError ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-black text-amber-800">
                    {transferAccountsError}
                  </div>
                ) : null}

                <div className="mt-3 max-h-[560px] space-y-2 overflow-y-auto pr-1">
                  {transferCandidateAccounts.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-bold text-slate-500">
                      {loadingTransferAccounts
                        ? "Loading accounts..."
                        : "Search for an account or choose a current subcontractor to show matching active accounts."}
                    </div>
                  ) : (
                    transferCandidateAccounts.slice(0, 25).map((account) => {
                      const accountId = getAccountId(account);
                      const subDisplay = account._subDisplay ?? {
                        contactName: "",
                        companyName: "",
                        fallback: normalizeText(account.subcontractor) || "Unassigned",
                      };
                      const checked = selectedTransferAccountIds.includes(accountId);

                      return (
                        <label
                          key={`transfer-pick-${accountId}`}
                          className={`block cursor-pointer rounded-2xl border p-3 transition ${
                            checked
                              ? "border-emerald-400 bg-emerald-50"
                              : "border-slate-200 bg-white hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex gap-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleTransferAccount(account)}
                              className="mt-1 h-5 w-5 rounded border-slate-300 text-emerald-700 focus:ring-emerald-500"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="font-black leading-5 text-slate-950">
                                {getStoredProposalAccountName(account)}
                              </p>
                              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                                {getProposalAddress(account) || "No address"}
                              </p>
                              <p className="mt-1 text-xs font-bold text-slate-500">
                                Current Sub:{" "}
                                <span className="text-slate-800">
                                  {getSubDisplayLabel(subDisplay)}
                                </span>
                              </p>
                            </div>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right side: destination + proposal */}
              <div className="rounded-3xl border border-emerald-200 bg-white p-4">
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-black uppercase tracking-wide text-emerald-700">
                    Proposal Details
                  </p>
                  <h3 className="text-xl font-black text-slate-950">
                    Offer to new subcontractor
                  </h3>
                  <p className="text-xs font-semibold leading-5 text-slate-500">
                    Keys/alarm shows only Yes or No. Details are not included until accepted and approved.
                  </p>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                      New Subcontractor
                    </label>
                    <select
                      value={transferNewSubcontractorMode === "new" ? "__ADD_NEW__" : transferSubcontractorEmail}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === "__ADD_NEW__") {
                          setTransferNewSubcontractorMode("new");
                          setTransferSubcontractorEmail("");
                        } else {
                          setTransferNewSubcontractorMode("existing");
                          setTransferSubcontractorEmail(value);
                        }
                        setTransferProposalId("");
                        setTransferMessage("");
                        setTransferError("");
                      }}
                      className="mt-2 min-h-[48px] w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-emerald-500 sm:text-sm"
                    >
                      <option value="">
                        {loadingSubcontractors ? "Loading subcontractors..." : "Choose existing subcontractor..."}
                      </option>
                      <option value="__ADD_NEW__">+ Add New Subcontractor</option>
                      {activeSubcontractors.map((sub) => {
                        const email = normalizeText(sub.email);
                        const label = getSubcontractorLabel(sub);
                        if (!email) return null;
                        return (
                          <option key={`${email}-${label}`} value={email}>
                            {label} — {email}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {transferNewSubcontractorMode === "new" ? (
                    <>
                      <div>
                        <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                          New Sub Name
                        </label>
                        <input
                          value={manualTransferSubcontractorName}
                          onChange={(e) => {
                            setManualTransferSubcontractorName(e.target.value);
                            setTransferProposalId("");
                          }}
                          placeholder="Company or contact name"
                          className="mt-2 min-h-[48px] w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-emerald-500 sm:text-sm"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                          New Sub Email
                        </label>
                        <input
                          value={manualTransferSubcontractorEmail}
                          onChange={(e) => {
                            setManualTransferSubcontractorEmail(e.target.value);
                            setTransferProposalId("");
                          }}
                          placeholder="email@example.com"
                          className="mt-2 min-h-[48px] w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-emerald-500 sm:text-sm"
                        />
                      </div>
                    </>
                  ) : null}

                  <div>
                    <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                      Selected Accounts
                    </label>
                    <div className="mt-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                      <p className="text-lg font-black text-slate-950">{selectedTransferAccounts.length}</p>
                      <p className="text-xs font-semibold text-slate-500">
                        Total proposed pay: {formatMoney(transferTotalProposedPay)}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                      Proposal ID
                    </label>
                    <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-sm font-black text-slate-900">{transferProposalId || "Not saved yet"}</p>
                      <p className="text-xs font-semibold text-slate-500">Save first, then email when ready.</p>
                    </div>
                  </div>
                </div>

{viewedStoredProposal ? (
  <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-blue-700">
          Viewing Stored Proposal
        </p>
        <h4 className="mt-1 text-lg font-black text-slate-950">
          {getStoredProposalId(viewedStoredProposal) || "Stored Proposal"}
        </h4>
        <p className="mt-1 text-sm font-semibold text-slate-600">
          New Subcontractor: {getStoredProposalSubcontractor(viewedStoredProposal)}
        </p>
        <p className="text-sm font-semibold text-slate-600">
          Email: {getStoredProposalEmail(viewedStoredProposal) || "N/A"}
        </p>
        <p className="text-sm font-semibold text-slate-600">
          Status: {getStoredProposalStatus(viewedStoredProposal)}
        </p>
      </div>

      <button
        type="button"
        onClick={() => setViewedStoredProposal(null)}
        className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-black text-blue-800 hover:bg-blue-100"
      >
        Close View
      </button>
    </div>

    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-blue-100 bg-white p-3">
        <p className="text-xs font-black uppercase tracking-wide text-slate-500">
          Accounts
        </p>
        <p className="mt-1 text-xl font-black text-slate-950">
          {getStoredProposalAccountCount(viewedStoredProposal)}
        </p>
      </div>

      <div className="rounded-xl border border-blue-100 bg-white p-3">
        <p className="text-xs font-black uppercase tracking-wide text-slate-500">
          Revenue
        </p>
        <p className="mt-1 text-xl font-black text-slate-950">
          {formatMoney(getStoredProposalRevenue(viewedStoredProposal))}
        </p>
      </div>

      <div className="rounded-xl border border-blue-100 bg-white p-3">
        <p className="text-xs font-black uppercase tracking-wide text-slate-500">
          Proposed Pay
        </p>
        <p className="mt-1 text-xl font-black text-slate-950">
          {formatMoney(getStoredProposalPay(viewedStoredProposal))}
        </p>
      </div>
    </div>

    {viewedStoredProposal.notes ? (
      <div className="mt-4 rounded-xl border border-blue-100 bg-white p-3">
        <p className="text-xs font-black uppercase tracking-wide text-slate-500">
          Notes
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">
          {viewedStoredProposal.notes}
        </p>
      </div>
    ) : null}

    <div className="mt-4 space-y-2">
      {Array.isArray(viewedStoredProposal.accounts) &&
      viewedStoredProposal.accounts.length > 0 ? (
        viewedStoredProposal.accounts.map((account, index) => (
          <div
            key={`${normalizeText(account.accountId) || index}-${index}`}
            className="rounded-xl border border-blue-100 bg-white p-3"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-black text-slate-950">
                  {index + 1}. {account.accountName || "Unnamed Account"}
                </p>
                <span
                  role="link"
                  tabIndex={0}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const url = getGoogleMapsUrl(account.address);
                    if (url !== "#") window.open(url, "_blank", "noopener,noreferrer");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      const url = getGoogleMapsUrl(account.address);
                      if (url !== "#") window.open(url, "_blank", "noopener,noreferrer");
                    }
                  }}
                  className="mt-1 block text-sm font-semibold text-slate-600 hover:text-blue-600 hover:underline cursor-pointer"
                >
                  {account.address || "No address"}
                </span>
              </div>

              <div className="text-left sm:text-right">
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Proposed Pay
                </p>
                <p className="text-sm font-black text-slate-950">
                  {formatMoney(getStoredProposalAccountPay(account))}
                </p>
              </div>
            </div>

            <div className="mt-3 grid gap-2 text-xs font-bold text-slate-600 sm:grid-cols-2">
              <p>
                <span className="text-slate-400">Account ID:</span>{" "}
                {account.accountId || "N/A"}
              </p>
              <p>
                <span className="text-slate-400">Cleaning Days:</span>{" "}
                {getStoredProposalAccountDays(account)}
              </p>
              <p>
                <span className="text-slate-400">Keys / Alarm:</span>{" "}
                {getStoredProposalAccountKeysAlarm(account)}
              </p>
              <p>
                <span className="text-slate-400">Revenue:</span>{" "}
                {formatMoney(getStoredProposalAccountRevenue(account))}
              </p>
              <p className="sm:col-span-2">
                <span className="text-slate-400">Scope:</span>{" "}
                {getStoredProposalAccountScope(account)}
              </p>
            </div>
          </div>
        ))
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-black text-amber-800">
          This stored proposal does not include account details yet. It may have been saved before account items were being stored.
        </div>
      )}
    </div>
  </div>
) : null}                  

                {selectedTransferAccounts.length ? (
                  <div className="mt-4 max-h-[460px] space-y-3 overflow-y-auto pr-1">
                    {selectedTransferAccounts.map((account) => {
                      const accountId = getAccountId(account);
                      return (
                        <div key={`proposal-${accountId}`} className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
                          <div className="flex flex-col gap-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-base font-black text-slate-950">{account.accountName || "Unnamed Account"}</p>
                                <p className="mt-1 text-sm font-semibold text-slate-600">{getProposalAddress(account) || "No address"}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => toggleTransferAccount(account)}
                                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-100"
                              >
                                Remove
                              </button>
                            </div>

                            <div className="grid gap-2 text-xs font-bold text-slate-600 sm:grid-cols-2">
                              <p><span className="text-slate-400">Days:</span> {getProposalCleaningDays(account)}</p>
                              <p><span className="text-slate-400">Keys / Alarm:</span> {getKeysAlarmRequired(account)}</p>
                              <p className="sm:col-span-2"><span className="text-slate-400">Scope:</span> {getProposalScope(account)}</p>
                            </div>

                            <div>
                              <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                                Proposed Monthly Pay
                              </label>
                              <input
                                value={transferPayByAccountId[accountId] ?? ""}
                                onChange={(e) => updateTransferPay(accountId, e.target.value)}
                                inputMode="decimal"
                                placeholder="850"
                                className="mt-2 min-h-[48px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-emerald-500 sm:text-sm"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-slate-600">
                    Select accounts from the left side to build this proposal.
                  </div>
                )}

                <div className="mt-4">
                  <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                    Notes
                  </label>
                  <textarea
                    value={transferNotes}
                    onChange={(e) => {
                      setTransferNotes(e.target.value);
                      setTransferProposalId("");
                    }}
                    rows={3}
                    placeholder="Optional notes for this proposal..."
                    className="mt-2 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-emerald-500 sm:text-sm"
                  />
                </div>

                {transferError ? (
                  <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-black text-red-700">
                    {transferError}
                  </div>
                ) : null}

                {transferMessage ? (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-black text-emerald-800">
                    {transferMessage}
                  </div>
                ) : null}

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <button
                    type="button"
                    onClick={cancelTransferProposal}
                    disabled={transferSaving}
                    className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveTransferProposal}
                    disabled={transferSaving}
                    className="rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {transferSaving ? "Working..." : "Save Draft"}
                  </button>
                  <button
                    type="button"
                    onClick={handlePrintTransferProposal}
                    disabled={transferSaving}
                    className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-blue-950 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Print Proposal
                  </button>
                  <button
                    type="button"
                    onClick={handleSendTransferProposalEmail}
                    disabled={transferSaving}
                    className="rounded-2xl bg-blue-700 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Send Email
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                    Stored Transfer Proposals
                  </p>
                  <h3 className="mt-2 text-xl font-black text-slate-950">
                    Drafts and old proposals
                  </h3>
                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                    Saved drafts, sent proposals, accepted, declined, and cancelled proposals appear here.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadTransferProposals}
                  disabled={transferProposalsLoading}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {transferProposalsLoading ? "Loading..." : "Refresh"}
                </button>
              </div>

              {transferProposalsError ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-black text-amber-800">
                  {transferProposalsError}
                </div>
              ) : null}

              {transferProposalsLoading && storedTransferProposals.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500">
                  Loading stored proposals...
                </div>
              ) : storedTransferProposals.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500">
                  No stored transfer proposals yet. Saved drafts and sent proposals will show here.
                </div>
              ) : (
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                  <div className="hidden grid-cols-12 gap-3 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-500 lg:grid">
                    <div className="col-span-2">Date</div>
                    <div className="col-span-3">New Subcontractor</div>
                    <div className="col-span-1 text-right">Accounts</div>
                    <div className="col-span-2 text-right">Revenue</div>
                    <div className="col-span-2 text-right">Proposed Pay</div>
                    <div className="col-span-1">Status</div>
                    <div className="col-span-1 text-right">Action</div>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {storedTransferProposals.map((proposal, index) => {
                      const proposalId = getStoredProposalId(proposal) || `proposal-${index}`;
                      const status = getStoredProposalStatus(proposal);
                      return (
                        <div
                          key={`${proposalId}-${index}`}
                          className="grid gap-3 px-4 py-4 text-sm lg:grid-cols-12 lg:items-center"
                        >
                          <div className="lg:col-span-2">
                            <p className="text-xs font-black uppercase tracking-wide text-slate-400 lg:hidden">Date</p>
                            <p className="font-bold text-slate-700">{getStoredProposalDate(proposal)}</p>
                            <p className="mt-1 text-[11px] font-bold text-slate-400">{proposalId}</p>
                          </div>

                          <div className="lg:col-span-3">
                            <p className="text-xs font-black uppercase tracking-wide text-slate-400 lg:hidden">New Subcontractor</p>
                            <p className="font-black text-slate-950">{getStoredProposalSubcontractor(proposal)}</p>
                            {getStoredProposalEmail(proposal) ? (
                              <p className="mt-1 text-xs font-semibold text-slate-500">{getStoredProposalEmail(proposal)}</p>
                            ) : null}
                          </div>

                          <div className="lg:col-span-1 lg:text-right">
                            <p className="text-xs font-black uppercase tracking-wide text-slate-400 lg:hidden">Accounts</p>
                            <p className="font-black text-slate-950">{getStoredProposalAccountCount(proposal)}</p>
                          </div>

                          <div className="lg:col-span-2 lg:text-right">
                            <p className="text-xs font-black uppercase tracking-wide text-slate-400 lg:hidden">Revenue</p>
                            <p className="font-black text-slate-950">{formatMoney(getStoredProposalRevenue(proposal))}</p>
                          </div>

                          <div className="lg:col-span-2 lg:text-right">
                            <p className="text-xs font-black uppercase tracking-wide text-slate-400 lg:hidden">Proposed Pay</p>
                            <p className="font-black text-slate-950">{formatMoney(getStoredProposalPay(proposal))}</p>
                          </div>

                          <div className="lg:col-span-1">
                            <p className="text-xs font-black uppercase tracking-wide text-slate-400 lg:hidden">Status</p>
                            <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-black ${getStoredProposalStatusClass(status)}`}>
                              {status}
                            </span>
                          </div>

                          <div className="lg:col-span-1 lg:text-right">
                            <button
                              type="button"
                              onClick={() => loadStoredProposalIntoBuilder(proposal)}
                              className="w-full rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-800 hover:bg-blue-100 lg:w-auto"
                            >
                              View
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}

      {/* Accounts list */}
      {!transferMode ? (
        <>
          {/* `loading` alone used to gate this whole block, which blanked the
              entire list back to a loading placeholder on every refetch —
              even though the previous `accounts` data was still sitting in
              state the whole time. The placeholder only shows when there is
              nothing to show yet (first load); a refetch with existing data
              keeps the current rows and swaps them once the new results land. */}
          {loading && accounts.length === 0 ? (
            <SkeletonList rows={4} />
          ) : !hasSearched ? (
            <EmptyState
              icon="search"
              title="Tap Search to get started"
              text="Type a search term first, or leave it blank to browse all accounts."
              action={
                <BigButton kind="second" onClick={handleSearch}>
                  Search
                </BigButton>
              }
            />
          ) : visibleAccounts.length === 0 ? (
            loading ? (
              <SkeletonList rows={3} />
            ) : (
              <EmptyState
                title="No accounts found for this search"
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
              label="Accounts"
              items={visibleAccounts.map((account, index) => ({ account, index }))}
              getKey={({ account, index }) => `${getAccountId(account)}-${index}`}
              renderCard={({ account }) => (
                <Card>
                  <AccountNameBlock
                    account={account}
                    openProblems={openTeamHubProblems[getAccountId(account)] ?? 0}
                    selecting={bulkToDoMode}
                    selected={selectedBulkToDoIds.has(getAccountId(account))}
                    onToggle={() => toggleBulkToDoAccount(account)}
                  />
                  <div className="ui-actions-row" style={{ marginTop: 8 }}>
                    <StatusPill kind={accountStatusKind(account.status)}>{account.status || "N/A"}</StatusPill>
                    <StatusPill kind={accountHealthKind(account.accountHealth)}>{account.accountHealth || "N/A"}</StatusPill>
                  </div>
                  <p className="ui-card-text">
                    Manager: {account.manager || "Unassigned"} · Sub: {getSubDisplayLabel(subDisplayOf(account))}
                  </p>
                  <p className="ui-card-text">Started {formatDate(account.accountStartDate) || "not set"}</p>
                  <AccountMoneyBlock account={account} />
                  <div style={{ marginTop: 12 }}>
                    <AccountRowActions account={account} onStatus={openStatusModal} onToDo={openQuickToDoModal} />
                  </div>
                </Card>
              )}
              columns={[
                {
                  header: "Account",
                  cell: ({ account }) => (
                    <AccountNameBlock
                      account={account}
                      openProblems={openTeamHubProblems[getAccountId(account)] ?? 0}
                      selecting={bulkToDoMode}
                      selected={selectedBulkToDoIds.has(getAccountId(account))}
                      onToggle={() => toggleBulkToDoAccount(account)}
                    />
                  ),
                },
                {
                  header: "Manager / Subcontractor",
                  cell: ({ account }) => (
                    <>
                      <p className="ui-strong">{account.manager || "Unassigned"}</p>
                      <p className="ui-muted">{getSubDisplayLabel(subDisplayOf(account))}</p>
                    </>
                  ),
                },
                {
                  header: "Status / Health",
                  cell: ({ account }) => (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                      <StatusPill kind={accountStatusKind(account.status)}>{account.status || "N/A"}</StatusPill>
                      <StatusPill kind={accountHealthKind(account.accountHealth)}>{account.accountHealth || "N/A"}</StatusPill>
                    </div>
                  ),
                },
                { header: "Start Date", cell: ({ account }) => <span className="ui-nowrap">{formatDate(account.accountStartDate) || "Not set"}</span> },
                { header: "Revenue / Margin", cell: ({ account }) => <AccountMoneyBlock account={account} /> },
                { header: "Action", cell: ({ account }) => <AccountRowActions account={account} onStatus={openStatusModal} onToDo={openQuickToDoModal} /> },
              ]}
            />
          )}

          {/* Load more */}
          {visibleCount < filteredAccounts.length ? (
            <div>
              <BigButton kind="second" onClick={() => setVisibleCount((n) => n + LOAD_MORE_COUNT)}>
                Show 15 more
              </BigButton>
            </div>
          ) : null}
        </>
      ) : null}

      {/* Status change */}
      <Sheet
        open={statusModalAccount !== null}
        title="Change status"
        text={statusModalAccount ? `${statusModalAccount.accountName || "Unnamed Account"}. Current status: ${statusModalAccount.status || "N/A"}.` : undefined}
        onClose={closeStatusModal}
        busy={savingStatus}
        actions={
          <BigButton busy={savingStatus} busyLabel="Saving…" onClick={() => void handleSaveStatusChange()}>
            Save status change
          </BigButton>
        }
      >
        <SelectField label="New status" value={newStatus} onChange={(e) => setNewStatus(e.target.value as QuickStatusOption)} disabled={savingStatus}>
          {quickStatusOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </SelectField>
        <TextAreaField
          label="Reason / history note"
          hint="This also creates an Account Update history note."
          optional
          rows={5}
          placeholder="Customer requested cancellation effective July 1. / Paused due to remodeling."
          value={statusReason}
          onChange={(e) => setStatusReason(e.target.value)}
          disabled={savingStatus}
        />
        {statusError ? <ErrorBox title="The status was not changed." text={statusError} /> : null}
      </Sheet>

      {/* Quick to-do for one account */}
      <Sheet
        open={quickToDoAccount !== null}
        title="New to-do"
        text={quickToDoAccount ? quickToDoAccount.accountName || "Unnamed Account" : undefined}
        onClose={closeQuickToDoModal}
        busy={quickToDoSaving}
        actions={
          <BigButton busy={quickToDoSaving} busyLabel="Creating…" onClick={() => void submitQuickToDo()}>
            Create to-do
          </BigButton>
        }
      >
        <SelectField label="Assigned to" value={quickToDoForm.assignedTo} onChange={(e) => setQuickToDoForm((f) => ({ ...f, assignedTo: e.target.value }))} disabled={quickToDoSaving}>
          <option value="">Select a manager…</option>
          {bulkToDoManagers.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Type" value={quickToDoForm.taskType} onChange={(e) => setQuickToDoForm((f) => ({ ...f, taskType: e.target.value }))} disabled={quickToDoSaving}>
          {BULK_TODO_TASK_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </SelectField>
        <Field label="Due date" type="date" optional value={quickToDoForm.dueDate} onChange={(e) => setQuickToDoForm((f) => ({ ...f, dueDate: e.target.value }))} disabled={quickToDoSaving} />
        <Field
          label="Why"
          optional
          placeholder="Customer said restrooms need attention"
          value={quickToDoForm.why}
          onChange={(e) => setQuickToDoForm((f) => ({ ...f, why: e.target.value }))}
          disabled={quickToDoSaving}
        />
        <TextAreaField
          label="Notes"
          optional
          rows={3}
          placeholder="Extra instructions"
          value={quickToDoForm.notes}
          onChange={(e) => setQuickToDoForm((f) => ({ ...f, notes: e.target.value }))}
          disabled={quickToDoSaving}
        />
        {quickToDoError ? <ErrorBox title="The to-do was not created." text={quickToDoError} /> : null}
      </Sheet>

      {toast ? (
        <div className="ui-toast-region" role="status" aria-live="polite">
          <div className="ui-toast">{toast}</div>
        </div>
      ) : null}
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Row pieces (shared by the phone cards and the wide-screen table)
// ---------------------------------------------------------------------------

function subDisplayOf(account: Account): SubcontractorDisplay {
  return account._subDisplay ?? { contactName: "", companyName: "", fallback: normalizeText(account.subcontractor) || "Unassigned" };
}

// Same categories as the old color classes: Active green, Cancelled red,
// Paused / Over 90 Days amber, anything else gray.
function accountStatusKind(status: string | undefined): StatusKind {
  const category = getStatusCategory(status);
  if (category === "Active") return "done";
  if (category === "Cancelled") return "needs-you";
  if (category === "Paused" || category === "Over 90 Days") return "waiting";
  return "off";
}

function accountHealthKind(health: string | undefined): StatusKind {
  const clean = normalizeLower(health);
  if (clean.includes("high risk")) return "needs-you";
  if (clean.includes("attention")) return "waiting";
  if (clean.includes("stable") || clean.includes("good") || clean.includes("excellent")) return "done";
  return "off";
}

function AccountNameBlock({
  account,
  openProblems,
  selecting,
  selected,
  onToggle,
}: {
  account: Account;
  openProblems: number;
  selecting: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  const accountId = getAccountId(account);
  const mapsUrl = getGoogleMapsUrl(account.address);
  return (
    <div style={{ minWidth: 0 }}>
      {selecting ? (
        <label className="ui-check" style={{ marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label={`Select ${account.accountName || "account"} for bulk to-do creation`}
          />
          <span>Select</span>
        </label>
      ) : null}
      <Link href={`/accounts/${encodeURIComponent(accountId)}`} className="ui-table-rowlink">
        {account.accountName || "Unnamed Account"}
      </Link>
      {openProblems > 0 ? (
        <div>
          <StatusPill kind="needs-you">
            {openProblems} open problem{openProblems === 1 ? "" : "s"}
          </StatusPill>
        </div>
      ) : null}
      <div>
        {mapsUrl !== "#" ? (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="ui-link">
            {account.address || "No address"}
          </a>
        ) : (
          <span className="ui-muted">{account.address || "No address"}</span>
        )}
      </div>
      {account._distanceMiles != null ? <p className="ui-strong">{formatMiles(account._distanceMiles)} away</p> : null}
    </div>
  );
}

function AccountMoneyBlock({ account }: { account: Account }) {
  return (
    <div>
      <p className="ui-strong ui-nowrap">
        {formatMoney(account.monthlyRevenue)} <span className="ui-muted">({account._revenuePercent ?? 0}%)</span>
      </p>
      <p className="ui-muted ui-nowrap">Sub pay: {formatMoney(account.monthlySubcontractorPay ?? account.subcontractorPay)}</p>
      <p className="ui-muted ui-nowrap">
        Margin: {(account._grossMarginNum ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} (
        {account._grossMarginPercent ?? 0}%)
      </p>
      {normalizeText(account._frequencyText) ? <p className="ui-muted">{account._frequencyText}</p> : null}
    </div>
  );
}

function AccountRowActions({
  account,
  onStatus,
  onToDo,
}: {
  account: Account;
  onStatus: (account: Account) => void;
  onToDo: (account: Account) => void;
}) {
  return (
    <div className="ui-actions-row">
      <BigButton kind="second" onClick={() => onStatus(account)} aria-label={`Change status for ${account.accountName ?? "this account"}`}>
        Change status
      </BigButton>
      <BigButton kind="second" icon="plus" onClick={() => onToDo(account)} aria-label={`Add to-do for ${account.accountName ?? "this account"}`}>
        To-do
      </BigButton>
    </div>
  );
}
