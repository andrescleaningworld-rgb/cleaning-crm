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
  Icon,
  LABELS,
  MoreMenu,
  PullToRefresh,
  Screen,
  SearchBar,
  SelectField,
  Sheet,
  SkeletonList,
  StatusPill,
  SwipeRow,
  TextAreaField,
  TileIconSvg,
  Tips,
  CHEER,
  showToast as kitToast,
  undoable,
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
const SHOW_MONEY_KEY = "cwAccountsShowMoney";

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

// Accepted green, declined / cancelled red, sent and drafts amber ("waiting").
function proposalStatusKind(status: string): StatusKind {
  const clean = normalizeLower(status);
  if (clean.includes("accept")) return "done";
  if (clean.includes("declin") || clean.includes("cancel")) return "needs-you";
  return "waiting";
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

  const [showFilters, setShowFilters] = useState(false);

  // Redesign: what the three counts, the chips, the card's three dots and
  // the money switch need.
  const [needsYouOnly, setNeedsYouOnly] = useState(false);
  const [townFilter, setTownFilter] = useState("");
  const [picker, setPicker] = useState<"sub" | "town" | null>(null);
  const [moreAccount, setMoreAccount] = useState<Account | null>(null);
  const [showMoney, setShowMoney] = useState(false);
  const [myName, setMyName] = useState("");

  useEffect(() => {
    // Deferred read: localStorage isn't available during SSR.
    try {
      setShowMoney(window.localStorage.getItem(SHOW_MONEY_KEY) === "1");
    } catch {
      // Private mode: money simply starts hidden.
    }
    // A count on the Dashboard links here already filtered: ?show=need-you.
    if (new URLSearchParams(window.location.search).get("show") === "need-you") {
      setNeedsYouOnly(true);
      setStatusFilter("All");
    }
    // Who is logged in, for the "My accounts" chip.
    fetch("/api/session-role", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { name?: string }) => setMyName(normalizeText(data.name)))
      .catch(() => {});
  }, []);

  function toggleMoney() {
    setShowMoney((value) => {
      try {
        window.localStorage.setItem(SHOW_MONEY_KEY, value ? "0" : "1");
      } catch {
        // Not remembered, still switched for now.
      }
      return !value;
    });
  }

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
    kitToast(message);
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
      if (townFilter && townOf(account) !== townFilter) return false;
      if (needsYouOnly && !problemLineOf(account, openTeamHubProblems[getAccountId(account)] ?? 0)) return false;

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
  }, [accounts, nonLocationFilterParams, nearAccountRef, nearAccountCoords, nearAccountRadius, sortOption, townFilter, needsYouOnly, openTeamHubProblems]);

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
      // This account's share of the revenue of the accounts shown. One decimal:
      // most accounts are well under 1% of the total, and a whole number
      // printed "(0%)" on nearly every row.
      const pct = filteredRevenue > 0 ? Math.round((revNum / filteredRevenue) * 1000) / 10 : 0;
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
  const needsYouCount = useMemo(
    () => accounts.filter((a) => problemLineOf(a, openTeamHubProblems[getAccountId(a)] ?? 0) !== "").length,
    [accounts, openTeamHubProblems]
  );
  // Towns of the accounts that are not cancelled, most accounts first.
  const towns = useMemo(() => {
    const counts = new Map<string, number>();
    for (const account of filterOptionAccounts.length ? filterOptionAccounts : accounts) {
      if (account._statusCategory === "Cancelled") continue;
      const town = townOf(account);
      if (town) counts.set(town, (counts.get(town) ?? 0) + 1);
    }
    return Array.from(counts, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [filterOptionAccounts, accounts]);
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

  // The manager name on the accounts that belongs to whoever is logged in
  // (accents and capitals can differ between the two lists).
  const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const myManagerName = myName ? managers.map(String).find((name) => name !== "All" && fold(name) === fold(myName)) ?? "" : "";
  const myAccountsOn = myManagerName !== "" && managerFilter === myManagerName;

  function toggleMyAccounts() {
    if (myAccountsOn) {
      setManagerFilter("All");
      return;
    }
    if (!myManagerName) {
      kitToast("No accounts have you as their manager.", "bad");
      return;
    }
    setManagerFilter(myManagerName);
  }

  // The three big counts at the top.
  function showOnly(which: "Active" | "NeedsYou" | "Cancelled") {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
    if (which === "NeedsYou") {
      // Tapping it again goes back to Active.
      setNeedsYouOnly((value) => !value);
      setStatusFilter(needsYouOnly ? "Active" : "All");
      return;
    }
    setNeedsYouOnly(false);
    setStatusFilter(which);
  }

  async function refreshList() {
    await fetchAccounts(searchText.trim());
    kitToast("Updated ✓");
  }

  // Open crew problems are worked from the Crew Link tab of Accounts Center.
  function seeCrewProblems() {
    if (window.location.pathname.startsWith("/accounts-center")) {
      window.dispatchEvent(new CustomEvent("cw:accounts-center-tab", { detail: "team-hub" }));
      window.scrollTo({ top: 0 });
    } else {
      window.location.assign("/accounts-center?tab=team-hub");
    }
  }

  function clearFilters() {
    setNeedsYouOnly(false);
    setTownFilter("");
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
    void fetchAccounts("");
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
      kitToast(CHEER.logged);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Something went wrong changing the account status.");
      // After an Undo wait the sheet is closed: open it again so the error and its Try again are seen.
      setStatusModalAccount(statusModalAccount);
    } finally {
      setSavingStatus(false);
    }
  }

  // Cancelling an account is hard to take back, so it waits 5 seconds behind
  // an Undo button before anything is saved. Every other status saves at once.
  function requestStatusSave() {
    const target = statusModalAccount;
    if (!target) return;
    if (newStatus !== "Cancelled" || target._statusCategory === "Cancelled") {
      void handleSaveStatusChange();
      return;
    }
    if (!statusReason.trim()) {
      setStatusError("Please add a reason/note for the status change.");
      return;
    }
    setStatusError("");
    setStatusModalAccount(null);
    undoable({
      message: `Cancelling ${normalizeText(target.accountName) || "this account"}…`,
      run: () => handleSaveStatusChange(),
      onUndo: () => setStatusModalAccount(target),
      undoneMessage: "Not cancelled. Nothing was changed.",
    });
  }

  const money0 = (value: number) =>
    value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  const filtersOn =
    (statusFilter !== "Active" ? 1 : 0) +
    (managerFilter !== "All" ? 1 : 0) +
    (subcontractorFilter !== "All" ? 1 : 0) +
    (townFilter ? 1 : 0) +
    (nearAccountRef ? 1 : 0) +
    [minRevenueFilter, maxRevenueFilter, minSubPayFilter, maxSubPayFilter].filter((v) => v.trim() !== "").length +
    (!nearAccountRef && sortOption !== "Account Name" ? 1 : 0);

  const selectedCount = selectedBulkToDoIds.size;
  const plural = (n: number) => (n === 1 ? "" : "s");

  return (
    <Screen
      title="Accounts"
      subtitle="Tap a number to see those accounts."
      headerRight={
        <MoreMenu
          items={[
            { label: filtersOn ? `Filter and sort (${filtersOn} on)` : "Filter and sort", onSelect: () => setShowFilters(true) },
            { label: "Clear filters", onSelect: clearFilters },
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
      <Tips
        id="accounts"
        ready={hasSearched && !loading && !transferMode && visibleAccounts.length > 0}
        steps={[
          { target: '[data-tip="counts"]', text: "Tap a number to see only those accounts." },
          { target: '[data-tip="open"]', text: "Tap Open to see an account." },
          { target: '[data-tip="card-more"]', text: "Tap the three dots for Call, To-do and more. On a phone you can also swipe a card to the left." },
        ]}
      />

      {error ? <ErrorBox title="Something did not load." text={error} onRetry={handleSearch} /> : null}
      {subcontractorWarning ? <ErrorBox title="Some subcontractor details did not load." text={subcontractorWarning} /> : null}

      {/* Three big counts. Tapping one shows only those accounts. */}
      <div className="ui-counts" data-tip="counts">
        <button type="button" className="ui-count ui-count-good" aria-pressed={!needsYouOnly && statusFilter === "Active"} onClick={() => showOnly("Active")}>
          <span className="ui-count-number">{activeCount}</span>
          <span className="ui-count-label">Active</span>
        </button>
        <button type="button" className="ui-count ui-count-bad" aria-pressed={needsYouOnly} onClick={() => showOnly("NeedsYou")}>
          <span className="ui-count-number">{needsYouCount}</span>
          <span className="ui-count-label">Need you</span>
        </button>
        <button type="button" className="ui-count ui-count-off" aria-pressed={!needsYouOnly && statusFilter === "Cancelled"} onClick={() => showOnly("Cancelled")}>
          <span className="ui-count-number">{cancelledCount}</span>
          <span className="ui-count-label">Cancelled</span>
        </button>
      </div>

      {/* One search box. The list narrows as you type; Enter (or the
          keyboard's Search key) also asks the server, exactly as the old
          Search button did. */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleSearch();
        }}
      >
        <SearchBar value={searchText} onChange={setSearchText} label="Find an account" placeholder="Find an account" />
      </form>

      <div className="ui-chips" role="group" aria-label="Filters">
        <button type="button" className="ui-chip" aria-pressed={myAccountsOn} onClick={toggleMyAccounts}>
          My accounts
        </button>
        <button type="button" className="ui-chip" aria-pressed={subcontractorFilter !== "All"} onClick={() => setPicker("sub")}>
          {subcontractorFilter !== "All" ? `Sub: ${subcontractors.find((sub) => sub.value === subcontractorFilter)?.label ?? subcontractorFilter}` : "By sub"}
        </button>
        <button type="button" className="ui-chip" aria-pressed={townFilter !== ""} onClick={() => setPicker("town")}>
          {townFilter ? `Town: ${townFilter}` : "By town"}
        </button>
      </div>

      <Sheet open={picker === "sub"} title="Show one sub's accounts" onClose={() => setPicker(null)}>
        <ul className="ui-picker-list">
          {subcontractors.map((sub) => (
            <li key={sub.value}>
              <button
                type="button"
                className="ui-picker-option"
                aria-pressed={subcontractorFilter === sub.value}
                onClick={() => {
                  setSubcontractorFilter(sub.value);
                  setPicker(null);
                }}
              >
                {sub.value === "All" ? "All subs" : sub.label}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      <Sheet open={picker === "town"} title="Show one town's accounts" onClose={() => setPicker(null)}>
        <ul className="ui-picker-list">
          <li>
            <button
              type="button"
              className="ui-picker-option"
              aria-pressed={townFilter === ""}
              onClick={() => {
                setTownFilter("");
                setPicker(null);
              }}
            >
              All towns
            </button>
          </li>
          {towns.map((town) => (
            <li key={town.name}>
              <button
                type="button"
                className="ui-picker-option"
                aria-pressed={townFilter === town.name}
                onClick={() => {
                  setTownFilter(town.name);
                  setPicker(null);
                }}
              >
                {town.name} ({town.count})
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

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

      {/* Transfer proposal builder */}
      {transferMode ? (
        <>
          <Card title="New Transfer Proposal">
            <p className="ui-card-text">
              Use the search box or choose the current subcontractor, build the offer, then save, print, or send the email
              manually.
            </p>
            <div className="ui-actions-row" style={{ marginTop: 12 }}>
              <BigButton kind="second" onClick={clearTransferProposal}>
                Clear proposal
              </BigButton>
            </div>
          </Card>

          <div className="ui-two">
            {/* Left side: source accounts */}
            <Card title="Accounts to Transfer">
              <p className="ui-card-text">
                No full account list here. Search by account or choose the current subcontractor to show matching accounts.
              </p>
              <div className="ui-stack">
                <SelectField
                  label="Current subcontractor"
                  value={transferSourceSubcontractorFilter}
                  onChange={(e) => setTransferSourceSubcontractorFilter(e.target.value)}
                >
                  <option value="All">{loadingTransferAccounts ? "Loading subcontractors…" : "All Subcontractors"}</option>
                  {transferSourceSubcontractorOptions
                    .filter((sub) => sub.value !== "All")
                    .map((sub) => (
                      <option key={`source-${sub.value}`} value={sub.value}>
                        {sub.label}
                      </option>
                    ))}
                </SelectField>

                <SearchBar value={transferAccountSearch} onChange={setTransferAccountSearch} label="Search accounts to transfer" placeholder="Name, address, city, sub" />

                <p className="ui-muted" role="status">
                  <span className="ui-strong">{selectedTransferAccounts.length} selected.</span> Showing{" "}
                  {Math.min(transferCandidateAccounts.length, 25)} of {transferCandidateAccounts.length} matching active accounts.
                </p>

                {transferAccountsError ? <ErrorBox title="The accounts did not load." text={transferAccountsError} /> : null}

                {transferCandidateAccounts.length === 0 ? (
                  loadingTransferAccounts ? (
                    <SkeletonList rows={2} />
                  ) : (
                    <p className="ui-muted">Search for an account or choose a current subcontractor to show matching active accounts.</p>
                  )
                ) : (
                  <div className="ui-scrollbox">
                    {transferCandidateAccounts.slice(0, 25).map((account) => {
                      const accountId = getAccountId(account);
                      return (
                        <label key={`transfer-pick-${accountId}`} className="ui-check" style={{ alignItems: "flex-start", paddingTop: 10, paddingBottom: 10 }}>
                          <input type="checkbox" checked={selectedTransferAccountIds.includes(accountId)} onChange={() => toggleTransferAccount(account)} />
                          <span style={{ minWidth: 0 }}>
                            <span className="ui-strong" style={{ display: "block" }}>
                              {getStoredProposalAccountName(account)}
                            </span>
                            <span className="ui-muted" style={{ display: "block" }}>
                              {getProposalAddress(account) || "No address"}
                            </span>
                            <span className="ui-muted" style={{ display: "block" }}>
                              Current sub: {getSubDisplayLabel(subDisplayOf(account))}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>

            {/* Right side: destination + proposal */}
            <Card title="Offer to new subcontractor">
              <p className="ui-card-text">Keys/alarm shows only Yes or No. Details are not included until accepted and approved.</p>
              <div className="ui-stack">
                <SelectField
                  label="New subcontractor"
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
                >
                  <option value="">{loadingSubcontractors ? "Loading subcontractors…" : "Choose existing subcontractor…"}</option>
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
                </SelectField>

                {transferNewSubcontractorMode === "new" ? (
                  <>
                    <Field
                      label="New sub name"
                      placeholder="Company or contact name"
                      value={manualTransferSubcontractorName}
                      onChange={(e) => {
                        setManualTransferSubcontractorName(e.target.value);
                        setTransferProposalId("");
                      }}
                    />
                    <Field
                      label="New sub email"
                      inputMode="email"
                      placeholder="email@example.com"
                      value={manualTransferSubcontractorEmail}
                      onChange={(e) => {
                        setManualTransferSubcontractorEmail(e.target.value);
                        setTransferProposalId("");
                      }}
                    />
                  </>
                ) : null}

                <div className="ui-stats-pair">
                  <div className="ui-stat">
                    <p className="ui-stat-label">Selected Accounts</p>
                    <p className="ui-stat-value">{selectedTransferAccounts.length}</p>
                    <p className="ui-muted">Total proposed pay: {formatMoney(transferTotalProposedPay)}</p>
                  </div>
                  <div className="ui-stat">
                    <p className="ui-stat-label">Proposal</p>
                    <p className="ui-stat-value">{transferProposalId ? "Saved" : "Not saved yet"}</p>
                    <p className="ui-muted">{transferProposalId ? transferProposalId : "Save first, then email when ready."}</p>
                  </div>
                </div>

                {viewedStoredProposal ? (
                  <Card title={`Viewing stored proposal ${getStoredProposalId(viewedStoredProposal) || ""}`.trim()}>
                    <p className="ui-card-text">New subcontractor: {getStoredProposalSubcontractor(viewedStoredProposal)}</p>
                    <p className="ui-card-text">Email: {getStoredProposalEmail(viewedStoredProposal) || "N/A"}</p>
                    <p className="ui-card-text">Status: {getStoredProposalStatus(viewedStoredProposal)}</p>
                    <div className="ui-actions-row" style={{ marginTop: 8 }}>
                      <BigButton kind="second" onClick={() => setViewedStoredProposal(null)}>
                        Close view
                      </BigButton>
                    </div>

                    <div className="ui-stats" style={{ marginTop: 12 }}>
                      <div className="ui-stat">
                        <p className="ui-stat-label">Accounts</p>
                        <p className="ui-stat-value">{getStoredProposalAccountCount(viewedStoredProposal)}</p>
                      </div>
                      <div className="ui-stat">
                        <p className="ui-stat-label">Revenue</p>
                        <p className="ui-stat-value">{formatMoney(getStoredProposalRevenue(viewedStoredProposal))}</p>
                      </div>
                      <div className="ui-stat">
                        <p className="ui-stat-label">Proposed Pay</p>
                        <p className="ui-stat-value">{formatMoney(getStoredProposalPay(viewedStoredProposal))}</p>
                      </div>
                    </div>

                    {viewedStoredProposal.notes ? (
                      <div style={{ marginTop: 12 }}>
                        <p className="ui-strong">Notes</p>
                        <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{viewedStoredProposal.notes}</p>
                      </div>
                    ) : null}

                    <div className="ui-stack">
                      {Array.isArray(viewedStoredProposal.accounts) && viewedStoredProposal.accounts.length > 0 ? (
                        viewedStoredProposal.accounts.map((account, index) => {
                          const mapsUrl = getGoogleMapsUrl(account.address);
                          return (
                            <div key={`${normalizeText(account.accountId) || index}-${index}`} className="ui-stat">
                              <p className="ui-strong">
                                {index + 1}. {account.accountName || "Unnamed Account"}
                              </p>
                              {mapsUrl !== "#" ? (
                                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="ui-link">
                                  {account.address || "No address"}
                                </a>
                              ) : (
                                <p className="ui-muted">{account.address || "No address"}</p>
                              )}
                              <p className="ui-muted">Proposed pay: {formatMoney(getStoredProposalAccountPay(account))}</p>
                              <p className="ui-muted">Cleaning days: {getStoredProposalAccountDays(account)}</p>
                              <p className="ui-muted">Keys / Alarm: {getStoredProposalAccountKeysAlarm(account)}</p>
                              <p className="ui-muted">Revenue: {formatMoney(getStoredProposalAccountRevenue(account))}</p>
                              <p className="ui-muted">Scope: {getStoredProposalAccountScope(account)}</p>
                            </div>
                          );
                        })
                      ) : (
                        <ErrorBox
                          title="No account details in this proposal."
                          text="This stored proposal does not include account details yet. It may have been saved before account items were being stored."
                        />
                      )}
                    </div>
                  </Card>
                ) : null}

                {selectedTransferAccounts.length ? (
                  <div className="ui-scrollbox">
                    {selectedTransferAccounts.map((account) => {
                      const accountId = getAccountId(account);
                      return (
                        <div key={`proposal-${accountId}`} className="ui-stat">
                          <p className="ui-strong">{account.accountName || "Unnamed Account"}</p>
                          <p className="ui-muted">{getProposalAddress(account) || "No address"}</p>
                          <p className="ui-muted">Days: {getProposalCleaningDays(account)}</p>
                          <p className="ui-muted">Keys / Alarm: {getKeysAlarmRequired(account)}</p>
                          <p className="ui-muted">Scope: {getProposalScope(account)}</p>
                          <div className="ui-stack">
                            <Field
                              label="Proposed monthly pay"
                              inputMode="decimal"
                              placeholder="850"
                              value={transferPayByAccountId[accountId] ?? ""}
                              onChange={(e) => updateTransferPay(accountId, e.target.value)}
                            />
                            <div>
                              <BigButton kind="quiet" onClick={() => toggleTransferAccount(account)} aria-label={`Remove ${account.accountName || "this account"} from the proposal`}>
                                {LABELS.remove}
                              </BigButton>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="ui-muted">Select accounts from the list to build this proposal.</p>
                )}

                <TextAreaField
                  label="Notes"
                  optional
                  rows={3}
                  placeholder="Optional notes for this proposal"
                  value={transferNotes}
                  onChange={(e) => {
                    setTransferNotes(e.target.value);
                    setTransferProposalId("");
                  }}
                />

                {transferError ? <ErrorBox title="That did not work." text={transferError} /> : null}
                {transferMessage ? (
                  <p className="ui-savestatus ui-savestatus-saved" role="status">
                    {transferMessage}
                  </p>
                ) : null}

                <div className="ui-actions-row">
                  <BigButton kind="second" busy={transferSaving} busyLabel="Working…" onClick={() => void handleSaveTransferProposal()}>
                    Save draft
                  </BigButton>
                  <BigButton kind="second" disabled={transferSaving} onClick={() => void handleSendTransferProposalEmail()}>
                    Send email
                  </BigButton>
                  <BigButton kind="second" disabled={transferSaving} onClick={handlePrintTransferProposal}>
                    Print proposal
                  </BigButton>
                  <BigButton kind="quiet" disabled={transferSaving} onClick={cancelTransferProposal}>
                    Cancel
                  </BigButton>
                </div>
              </div>
            </Card>
          </div>

          <Card title="Drafts and old proposals">
            <p className="ui-card-text">Saved drafts, sent proposals, accepted, declined, and cancelled proposals appear here.</p>
            <div className="ui-actions-row" style={{ marginTop: 12 }}>
              <BigButton kind="second" busy={transferProposalsLoading} busyLabel="Loading…" onClick={() => void loadTransferProposals()}>
                Refresh
              </BigButton>
            </div>
            <div className="ui-stack">
              {transferProposalsError ? <ErrorBox title="The stored proposals did not load." text={transferProposalsError} onRetry={() => void loadTransferProposals()} /> : null}

              {transferProposalsLoading && storedTransferProposals.length === 0 ? (
                <SkeletonList rows={2} />
              ) : storedTransferProposals.length === 0 ? (
                <p className="ui-muted">No stored transfer proposals yet. Saved drafts and sent proposals will show here.</p>
              ) : (
                <CardList
                  label="Stored transfer proposals"
                  items={storedTransferProposals.map((proposal, index) => ({ proposal, index }))}
                  getKey={({ proposal, index }) => `${getStoredProposalId(proposal) || "proposal"}-${index}`}
                  renderCard={({ proposal }) => (
                    <Card
                      title={getStoredProposalSubcontractor(proposal)}
                      right={<StatusPill kind={proposalStatusKind(getStoredProposalStatus(proposal))}>{getStoredProposalStatus(proposal)}</StatusPill>}
                    >
                      {getStoredProposalEmail(proposal) ? <p className="ui-card-text">{getStoredProposalEmail(proposal)}</p> : null}
                      <p className="ui-card-text">{getStoredProposalDate(proposal)}</p>
                      <p className="ui-card-text">
                        {getStoredProposalAccountCount(proposal)} accounts · Revenue {formatMoney(getStoredProposalRevenue(proposal))} · Proposed pay{" "}
                        {formatMoney(getStoredProposalPay(proposal))}
                      </p>
                      <div style={{ marginTop: 12 }}>
                        <BigButton kind="second" onClick={() => loadStoredProposalIntoBuilder(proposal)}>
                          {LABELS.open}
                        </BigButton>
                      </div>
                    </Card>
                  )}
                  columns={[
                    { header: "Date", cell: ({ proposal }) => <span className="ui-nowrap">{getStoredProposalDate(proposal)}</span> },
                    {
                      header: "New Subcontractor",
                      cell: ({ proposal }) => (
                        <>
                          <p className="ui-strong">{getStoredProposalSubcontractor(proposal)}</p>
                          {getStoredProposalEmail(proposal) ? <p className="ui-muted">{getStoredProposalEmail(proposal)}</p> : null}
                        </>
                      ),
                    },
                    { header: "Accounts", cell: ({ proposal }) => getStoredProposalAccountCount(proposal) },
                    { header: "Revenue", cell: ({ proposal }) => <span className="ui-nowrap">{formatMoney(getStoredProposalRevenue(proposal))}</span> },
                    { header: "Proposed Pay", cell: ({ proposal }) => <span className="ui-nowrap">{formatMoney(getStoredProposalPay(proposal))}</span> },
                    {
                      header: "Status",
                      cell: ({ proposal }) => <StatusPill kind={proposalStatusKind(getStoredProposalStatus(proposal))}>{getStoredProposalStatus(proposal)}</StatusPill>,
                    },
                    {
                      header: "Action",
                      cell: ({ proposal }) => (
                        <BigButton kind="second" onClick={() => loadStoredProposalIntoBuilder(proposal)}>
                          {LABELS.open}
                        </BigButton>
                      ),
                    },
                  ]}
                />
              )}
            </div>
          </Card>
        </>
      ) : null}

      {/* Accounts list */}
      {!transferMode ? (
        <PullToRefresh onRefresh={refreshList}>
          {/* The loading placeholder only shows when there is nothing to show
              yet (first load); a refetch with existing data keeps the current
              cards and swaps them once the new results land. */}
          {loading && accounts.length === 0 ? (
            <SkeletonList rows={4} />
          ) : !hasSearched ? (
            <EmptyState
              icon="search"
              title="No accounts loaded yet"
              text="Tap Show accounts to load them."
              action={
                <BigButton kind="second" onClick={handleSearch}>
                  Show accounts
                </BigButton>
              }
            />
          ) : visibleAccounts.length === 0 ? (
            loading ? (
              <SkeletonList rows={3} />
            ) : (
              <EmptyState
                title={needsYouOnly ? "Nothing needs you right now" : "No accounts match"}
                text={needsYouOnly ? "Tap Active to see all your active accounts." : "Try a shorter search, or tap Clear filters to see them all."}
                action={
                  <BigButton kind="second" onClick={clearFilters}>
                    Clear filters
                  </BigButton>
                }
              />
            )
          ) : (
            <ul className="ui-acct-list" aria-label="Accounts">
              {visibleAccounts.map((account, index) => (
                <li key={`${getAccountId(account)}-${index}`}>
                  <AccountCard
                    account={account}
                    openProblems={openTeamHubProblems[getAccountId(account)] ?? 0}
                    selecting={bulkToDoMode}
                    selected={selectedBulkToDoIds.has(getAccountId(account))}
                    onToggle={() => toggleBulkToDoAccount(account)}
                    showMoney={showMoney}
                    onMore={setMoreAccount}
                    onToDo={openQuickToDoModal}
                    onSeeCrewProblems={seeCrewProblems}
                  />
                </li>
              ))}
            </ul>
          )}

          {/* Load more */}
          {visibleCount < filteredAccounts.length ? (
            <div style={{ marginTop: 12 }}>
              <BigButton kind="second" onClick={() => setVisibleCount((n) => n + LOAD_MORE_COUNT)}>
                Show 15 more
              </BigButton>
            </div>
          ) : null}
        </PullToRefresh>
      ) : null}

      {/* Money is hidden until someone asks for it. The choice is remembered on this device. */}
      <button type="button" className="ui-money-toggle" aria-pressed={showMoney} onClick={toggleMoney}>
        {showMoney ? "Money showing · tap to hide" : "Money hidden · tap to show"}
      </button>

      {showMoney ? (
        <div className="ui-stats">
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
      ) : null}

      <p className="ui-muted">
        Total loaded: <span className="ui-strong">{accounts.length}</span> · High risk: <span className="ui-strong">{highRiskCount}</span>
      </p>

      {/* The three dots on a card: everything about that account that is not on the card. */}
      <Sheet open={moreAccount !== null} title={moreAccount?.accountName || "Account"} onClose={() => setMoreAccount(null)}>
        {moreAccount ? (
          <>
            <div className="ui-actions-row">
              <StatusPill kind={accountStatusKind(moreAccount.status)}>{moreAccount.status || "N/A"}</StatusPill>
              <StatusPill kind={accountHealthKind(moreAccount.accountHealth)}>{moreAccount.accountHealth || "N/A"}</StatusPill>
            </div>
            <dl className="ui-details">
              <div className="ui-detail">
                <dt>Manager</dt>
                <dd>{moreAccount.manager || "Unassigned"}</dd>
              </div>
              <div className="ui-detail">
                <dt>Subcontractor</dt>
                <dd>{getSubDisplayLabel(subDisplayOf(moreAccount))}</dd>
              </div>
              <div className="ui-detail">
                <dt>Started</dt>
                <dd>{formatDate(moreAccount.accountStartDate) || "Not set"}</dd>
              </div>
              {normalizeText(moreAccount._frequencyText) ? (
                <div className="ui-detail">
                  <dt>Frequency</dt>
                  <dd>{moreAccount._frequencyText}</dd>
                </div>
              ) : null}
            </dl>
            {showMoney ? <AccountMoneyBlock account={moreAccount} /> : <p className="ui-muted">Money is hidden. Use the button at the bottom of the list to show it.</p>}
            <div className="ui-more-actions">
              <BigButton href={`/accounts/${encodeURIComponent(getAccountId(moreAccount))}`}>Open</BigButton>
              {telHref(moreAccount.phone) ? (
                <a className="ui-btn ui-btn-second" href={telHref(moreAccount.phone)}>
                  Call contact
                </a>
              ) : (
                <BigButton kind="second" disabled>
                  No phone on file
                </BigButton>
              )}
              <BigButton
                kind="second"
                icon="plus"
                onClick={() => {
                  const account = moreAccount;
                  setMoreAccount(null);
                  openQuickToDoModal(account);
                }}
              >
                To-do
              </BigButton>
              <BigButton
                kind="second"
                onClick={() => {
                  const account = moreAccount;
                  setMoreAccount(null);
                  openStatusModal(account);
                }}
              >
                Change status
              </BigButton>
              {getGoogleMapsUrl(moreAccount.address) !== "#" ? (
                <a className="ui-btn ui-btn-second" href={getGoogleMapsUrl(moreAccount.address)} target="_blank" rel="noopener noreferrer">
                  Directions
                </a>
              ) : null}
            </div>
          </>
        ) : null}
      </Sheet>

      {/* Status change */}
      <Sheet
        open={statusModalAccount !== null}
        title="Change status"
        text={statusModalAccount ? `${statusModalAccount.accountName || "Unnamed Account"}. Current status: ${statusModalAccount.status || "N/A"}.` : undefined}
        onClose={closeStatusModal}
        busy={savingStatus}
        actions={
          <BigButton busy={savingStatus} busyLabel="Saving…" onClick={requestStatusSave}>
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
        {statusError ? <ErrorBox title="The status was not changed." text={statusError} onRetry={requestStatusSave} /> : null}
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

    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Row pieces (shared by the phone cards and the wide-screen table)
// ---------------------------------------------------------------------------

function subDisplayOf(account: Account): SubcontractorDisplay {
  return account._subDisplay ?? { contactName: "", companyName: "", fallback: normalizeText(account.subcontractor) || "Unassigned" };
}

// "Red only for problems": a cancelled account is finished, not a problem, so
// it is gray. Active green, Paused / Over 90 Days amber, anything else gray.
function accountStatusKind(status: string | undefined): StatusKind {
  const category = getStatusCategory(status);
  if (category === "Active") return "done";
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

function telHref(phone: string | undefined): string {
  const digits = normalizeText(phone).replace(/[^0-9+]/g, "");
  return digits.replace(/\D/g, "").length >= 7 ? `tel:${digits}` : "";
}

// The town an account is in: its City, or else the part of the address just
// before the state ("12 Main St, Springfield, IL 62701" -> "Springfield").
function townOf(account: Account): string {
  const city = normalizeText(account.city);
  if (city) return city;
  const parts = normalizeText(account.address)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 3) return "";
  const town = parts[parts.length - 2];
  return /\d/.test(town) ? "" : town;
}

// What makes an account "need you": the crew reported a problem that is
// still open, or its health is High Risk. Cancelled accounts never do.
function problemLineOf(account: Account, openProblems: number): string {
  if (account._statusCategory === "Cancelled") return "";
  if (openProblems > 0) return `${openProblems} open problem${openProblems === 1 ? "" : "s"} from the crew.`;
  if (normalizeLower(account.accountHealth).includes("high risk")) return "Account health is High Risk.";
  return "";
}

function AccountCard({
  account,
  openProblems,
  selecting,
  selected,
  onToggle,
  showMoney,
  onMore,
  onToDo,
  onSeeCrewProblems,
}: {
  account: Account;
  openProblems: number;
  selecting: boolean;
  selected: boolean;
  onToggle: () => void;
  showMoney: boolean;
  onMore: (account: Account) => void;
  onToDo: (account: Account) => void;
  onSeeCrewProblems: () => void;
}) {
  const accountId = getAccountId(account);
  const href = `/accounts/${encodeURIComponent(accountId)}`;
  const name = account.accountName || "Unnamed Account";
  const mapsUrl = getGoogleMapsUrl(account.address);
  const problem = problemLineOf(account, openProblems);
  const tel = telHref(account.phone);
  const days = normalizeText(account.cleaningDays) || normalizeText(account.frequency);

  return (
    <SwipeRow
      actions={
        <>
          {tel ? (
            <a href={tel} aria-label={`Call the contact for ${name}`}>
              <TileIconSvg name="call" />
              Call
            </a>
          ) : null}
          <button type="button" onClick={() => onToDo(account)} aria-label={`Add to-do for ${name}`}>
            <TileIconSvg name="todo" />
            To-do
          </button>
        </>
      }
    >
      <article className={`ui-acct ${problem ? "ui-acct-problem" : ""}`.trim()}>
        {selecting ? (
          <label className="ui-check">
            <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${name} for bulk to-do creation`} />
            <span>Select</span>
          </label>
        ) : null}
        <h3 className="ui-acct-name">
          <Link href={href}>{name}</Link>
        </h3>
        <p className="ui-acct-line">
          {mapsUrl !== "#" ? (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="ui-link">
              {account.address || "No address"}
            </a>
          ) : (
            account.address || "No address"
          )}
        </p>
        {account._distanceMiles != null ? <p className="ui-strong">{formatMiles(account._distanceMiles)} away</p> : null}
        <div className="ui-actions-row">
          {problem ? <StatusPill kind="needs-you">Needs you</StatusPill> : null}
          <StatusPill kind={accountStatusKind(account.status)}>{account.status || "N/A"}</StatusPill>
        </div>
        {problem ? <p className="ui-acct-wrong">{problem}</p> : null}
        <p className="ui-acct-line">
          Sub: {getSubDisplayLabel(subDisplayOf(account))}
          {days ? ` · ${days}` : ""}
        </p>
        {showMoney ? <AccountMoneyBlock account={account} /> : null}
        <div className="ui-acct-buttons">
          {problem ? (
            openProblems > 0 ? (
              <button type="button" className="ui-btn ui-btn-problem" onClick={onSeeCrewProblems}>
                See problem
              </button>
            ) : (
              <Link href={href} className="ui-btn ui-btn-problem">
                See problem
              </Link>
            )
          ) : (
            <Link href={href} className="ui-btn ui-btn-main" data-tip="open">
              Open
            </Link>
          )}
          <button type="button" className="ui-btn ui-btn-second ui-btn-icon" aria-label={`More for ${name}`} onClick={() => onMore(account)} data-tip="card-more">
            <Icon name="more" />
          </button>
        </div>
      </article>
    </SwipeRow>
  );
}

function AccountMoneyBlock({ account }: { account: Account }) {
  return (
    <div>
      <p className="ui-strong ui-nowrap">
        {formatMoney(account.monthlyRevenue)}{" "}
        <span className="ui-muted">
          ({(account._monthlyRevenueNum ?? 0) > 0 && (account._revenuePercent ?? 0) < 0.1 ? "under 0.1" : account._revenuePercent ?? 0}% of total)
        </span>
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
