"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getGoogleMapsUrl } from "../lib/backend";

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
  | "Sub Pay - Lowest First"
  | "Frequency";

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
  "Frequency",
];

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

function getStatusClass(status: string | undefined): string {
  const category = getStatusCategory(status);
  if (category === "Active") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (category === "Cancelled") return "border-red-200 bg-red-50 text-red-800";
  if (category === "Paused" || category === "Over 90 Days") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function getHealthClass(health: string | undefined): string {
  const clean = normalizeLower(health);
  if (clean.includes("high risk")) return "border-red-200 bg-red-50 text-red-800";
  if (clean.includes("attention")) return "border-amber-200 bg-amber-50 text-amber-800";
  if (clean.includes("stable") || clean.includes("good") || clean.includes("excellent")) return "border-emerald-200 bg-emerald-50 text-emerald-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function moneyToNumber(value: string | number | undefined): number {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value === "number") return Number.isNaN(value) ? 0 : value;
  const parsed = Number(String(value).replace(/\$/g, "").replace(/,/g, "").trim());
  return Number.isNaN(parsed) ? 0 : parsed;
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

function useFocusTrap(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || !ref.current) return;

    const container = ref.current;
    const focusable = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    // Move focus into the dialog
    first?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      if (focusable.length === 0) { event.preventDefault(); return; }

      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [active]);

  return ref;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [allSubcontractors, setAllSubcontractors] = useState<Subcontractor[]>([]);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [subcontractorWarning, setSubcontractorWarning] = useState("");

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Active");
  const [managerFilter, setManagerFilter] = useState("All");
  const [subcontractorFilter, setSubcontractorFilter] = useState("All");
  const [frequencyFilter, setFrequencyFilter] = useState("All");
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
  const [viewedStoredProposal, setViewedStoredProposal] =
  useState<StoredTransferProposal | null>(null);

  const debouncedSearch = useDebounce(searchText, SEARCH_DEBOUNCE_MS);

  const [statusModalAccount, setStatusModalAccount] = useState<Account | null>(null);
  const [newStatus, setNewStatus] = useState<QuickStatusOption>("Active");
  const [statusReason, setStatusReason] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState("");

  const modalRef = useFocusTrap(statusModalAccount !== null);

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  async function loadAccounts() {
    try {
      setLoading(true);
      setError("");
      setSubcontractorWarning("");

      const [accountsResponse, subcontractorsResponse] = await Promise.all([
        fetch("/api/accounts"),
        fetch("/api/subcontractors"),
      ]);

      const accountsData = await readJson<ApiResponse>(accountsResponse);
      if (!accountsResponse.ok || accountsData.success === false) {
        throw new Error(accountsData.error ?? "Could not load accounts.");
      }

      let subcontractors: Subcontractor[] = [];
      try {
        const subData = await readJson<SubcontractorsApiResponse>(subcontractorsResponse);
        if (subcontractorsResponse.ok && subData.success !== false) {
          subcontractors = subData.subcontractors ?? subData.subs ?? subData.data ?? [];
          setAllSubcontractors(subcontractors);
        } else {
          setSubcontractorWarning("Subcontractor names may not display correctly — check the subcontractors API.");
        }
      } catch {
        setSubcontractorWarning("Subcontractor names may not display correctly — the subcontractors API returned an unexpected response.");
      }

      const rawAccounts: Account[] = accountsData.accounts ?? accountsData.data ?? [];
      setAccounts(enrichAccounts(rawAccounts, subcontractors));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong loading accounts.");
    } finally {
      setLoading(false);
    }
  }


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

  useEffect(() => {
    loadAccounts();
  }, []);


  useEffect(() => {
    if (transferMode) {
      loadTransferProposals();
    }
  }, [transferMode]);

  // Reset visible count whenever filters change
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [
    debouncedSearch,
    statusFilter,
    managerFilter,
    subcontractorFilter,
    frequencyFilter,
    minRevenueFilter,
    maxRevenueFilter,
    minSubPayFilter,
    maxSubPayFilter,
    sortOption,
  ]);

  // -------------------------------------------------------------------------
  // Derived filter options (managers + subcontractors)
  // -------------------------------------------------------------------------

  const managers = useMemo(() => {
    const unique = Array.from(
      new Set(accounts.map((a) => normalizeText(a.manager)).filter(Boolean))
    );
    return ["All", ...unique.sort()];
  }, [accounts]);

  const subcontractors = useMemo<SubcontractorFilterOption[]>(() => {
    const unique = Array.from(
      new Set(accounts.map((a) => normalizeText(a.subcontractor)).filter(Boolean))
    );

    const options = unique.map((storedSub) => {
      const matchingAccount = accounts.find(
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
  }, [accounts]);

  const frequencies = useMemo(() => {
    const unique = Array.from(
      new Set(
        accounts
          .map((account) => normalizeText(account._frequencyText))
          .filter(Boolean)
      )
    );

    return ["All", ...unique.sort((a, b) => a.localeCompare(b))];
  }, [accounts]);

  // -------------------------------------------------------------------------
  // Filtering + sorting — uses pre-normalized fields for speed
  // -------------------------------------------------------------------------

  const filteredAccounts = useMemo(() => {
    const cleanSearch = debouncedSearch.toLowerCase().trim();

    const minRevenue = moneyToNumber(minRevenueFilter);
    const maxRevenue = moneyToNumber(maxRevenueFilter);
    const minSubPay = moneyToNumber(minSubPayFilter);
    const maxSubPay = moneyToNumber(maxSubPayFilter);

    const filtered = accounts.filter((account) => {
      const revenue = account._monthlyRevenueNum ?? 0;
      const subPay = account._subPayNum ?? 0;

      const matchesSearch =
        !cleanSearch || (account._searchBlob ?? "").includes(cleanSearch);

      const matchesStatus =
        statusFilter === "All" || account._statusCategory === statusFilter;

      const matchesManager =
        managerFilter === "All" || normalizeText(account.manager) === managerFilter;

      const matchesSubcontractor =
        subcontractorFilter === "All" ||
        normalizeText(account.subcontractor) === subcontractorFilter;

      const matchesFrequency =
        frequencyFilter === "All" ||
        normalizeText(account._frequencyText) === frequencyFilter;

      const matchesMinRevenue = minRevenue <= 0 || revenue >= minRevenue;
      const matchesMaxRevenue = maxRevenue <= 0 || revenue <= maxRevenue;

      const matchesMinSubPay = minSubPay <= 0 || subPay >= minSubPay;
      const matchesMaxSubPay = maxSubPay <= 0 || subPay <= maxSubPay;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesManager &&
        matchesSubcontractor &&
        matchesFrequency &&
        matchesMinRevenue &&
        matchesMaxRevenue &&
        matchesMinSubPay &&
        matchesMaxSubPay
      );
    });

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

      if (sortOption === "Frequency") {
        return normalizeText(a._frequencyText).localeCompare(
          normalizeText(b._frequencyText)
        );
      }

      return normalizeText(a.accountName).localeCompare(
        normalizeText(b.accountName)
      );
    });
  }, [
    accounts,
    debouncedSearch,
    statusFilter,
    managerFilter,
    subcontractorFilter,
    frequencyFilter,
    minRevenueFilter,
    maxRevenueFilter,
    minSubPayFilter,
    maxSubPayFilter,
    sortOption,
  ]);

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
    return accounts.filter((account) => selected.has(getAccountId(account)));
  }, [accounts, selectedTransferAccountIds]);

  const transferCandidateAccounts = useMemo(() => {
    const cleanSearch = transferAccountSearch.toLowerCase().trim();
    const hasSearchOrSubFilter =
      Boolean(cleanSearch) || transferSourceSubcontractorFilter !== "All";

    if (!hasSearchOrSubFilter) return [];

    return accounts
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
  }, [accounts, transferAccountSearch, transferSourceSubcontractorFilter]);

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
    accounts.some((account) => getAccountId(account) === id)
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

      const response = await fetch("/api/sub-transfer-proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sendSubTransferProposalEmail",
          proposal: buildTransferProposalPayload(),
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
    setFrequencyFilter("All");
    setMinRevenueFilter("");
    setMaxRevenueFilter("");
    setMinSubPayFilter("");
    setMaxSubPayFilter("");
    setSortOption("Account Name");
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

  function handleOverlayClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) closeStatusModal();
  }

  function handleOverlayKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") closeStatusModal();
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

      const updatedAccount: Account = {
        ...statusModalAccount,
        id: statusModalAccount.id ?? accountId,
        accountId: statusModalAccount.accountId ?? accountId,
        status: newStatus,
      };

      const accountResponse = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updateAccount", account: updatedAccount }),
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

  // -------------------------------------------------------------------------
  // Render: loading / error states
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="rounded-3xl bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm font-semibold text-slate-600">Loading accounts...</p>
      </div>
    );
  }

  if (error && accounts.length === 0) {
    return (
      <div className="rounded-3xl bg-white p-5 shadow-sm sm:p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: main page
  // -------------------------------------------------------------------------

  return (
    <div>
      <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">

        {/* Soft error banner (e.g. partial failures after load) */}
        {error ? (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
            {error}
          </div>
        ) : null}

        {/* Subcontractor data warning */}
        {subcontractorWarning ? (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
            {subcontractorWarning}
          </div>
        ) : null}

        {/* Header */}
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700 sm:text-sm">
              Cleaning World
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Accounts
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              View accounts by status, manager, subcontractor, revenue, start date, and account details.
              The default view shows active accounts.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-row sm:flex-wrap">
            <Link
              href="/accounts/new"
              className="rounded-2xl bg-blue-700 px-5 py-3.5 text-center text-sm font-black text-white shadow-sm no-underline hover:bg-blue-800"
            >
              + Add Account
            </Link>
            <button
              type="button"
              onClick={toggleTransferMode}
              className={`rounded-2xl px-5 py-3.5 text-sm font-black shadow-sm ${
                transferMode
                  ? "bg-amber-500 text-white hover:bg-amber-600"
                  : "bg-emerald-700 text-white hover:bg-emerald-800"
              }`}
            >
              {transferMode ? "Close Transfer" : "Transfer Proposal"}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-black text-white shadow-sm hover:bg-blue-950"
            >
              Print
            </button>
          </div>
        </div>

        {/* Summary stats */}
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 sm:p-5">
            <p className="text-[11px] font-black uppercase tracking-wide text-blue-700 sm:text-xs">Total Loaded</p>
            <p className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">{accounts.length}</p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 sm:p-5">
            <p className="text-[11px] font-black uppercase tracking-wide text-emerald-700 sm:text-xs">Active</p>
            <p className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">{activeCount}</p>
          </div>
          <div className="rounded-2xl border border-red-100 bg-red-50 p-4 sm:p-5">
            <p className="text-[11px] font-black uppercase tracking-wide text-red-700 sm:text-xs">Cancelled</p>
            <p className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">{cancelledCount}</p>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 sm:p-5">
            <p className="text-[11px] font-black uppercase tracking-wide text-amber-700 sm:text-xs">High Risk</p>
            <p className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">{highRiskCount}</p>
          </div>
        </div>

        {/* Money summary tiles */}
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5">
            <p className="text-xs font-black uppercase tracking-wide text-blue-700">
              Revenue In Current View
            </p>
            <p className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">
              {filteredRevenue.toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
                maximumFractionDigits: 0,
              })}
            </p>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              Updates when you filter accounts.
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm sm:p-5">
            <p className="text-xs font-black uppercase tracking-wide text-emerald-700">
              Sub Pay In Current View
            </p>
            <p className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">
              {filteredSubPay.toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
                maximumFractionDigits: 0,
              })}
            </p>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              Total subcontractor pay for the filtered accounts.
            </p>
          </div>

          <div className="rounded-2xl border border-amber-100 bg-white p-4 shadow-sm sm:p-5">
            <p className="text-xs font-black uppercase tracking-wide text-amber-700">
              Gross Margin In Current View
            </p>
            <p className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">
              {filteredGrossMargin.toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
                maximumFractionDigits: 0,
              })}
            </p>
            <p className="mt-1 text-xs font-semibold leading-5 text-amber-700">
              {filteredMarginPercent}% of revenue
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-6 grid gap-3 lg:grid-cols-5">
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search accounts..."
            aria-label="Search accounts"
            className="min-h-[48px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-blue-500 sm:text-sm"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            aria-label="Filter by status"
            className="min-h-[48px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-blue-500 sm:text-sm"
          >
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                Status: {s}
              </option>
            ))}
          </select>

          <select
            value={managerFilter}
            onChange={(e) => setManagerFilter(e.target.value)}
            aria-label="Filter by manager"
            className="min-h-[48px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-blue-500 sm:text-sm"
          >
            {managers.map((m) => (
              <option key={String(m)} value={String(m)}>
                Manager: {m}
              </option>
            ))}
          </select>

          <select
            value={subcontractorFilter}
            onChange={(e) => setSubcontractorFilter(e.target.value)}
            aria-label="Filter by subcontractor"
            className="min-h-[48px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-blue-500 sm:text-sm"
          >
            {subcontractors.map((sub) => (
              <option key={sub.value} value={sub.value}>
                Sub: {sub.label}
              </option>
            ))}
          </select>

          <select
            value={frequencyFilter}
            onChange={(e) => setFrequencyFilter(e.target.value)}
            aria-label="Filter by frequency"
            className="min-h-[48px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-blue-500 sm:text-sm"
          >
            {frequencies.map((frequency) => (
              <option key={frequency} value={frequency}>
                Frequency: {frequency}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-5">
          <input
            value={minRevenueFilter}
            onChange={(e) => setMinRevenueFilter(e.target.value)}
            inputMode="decimal"
            placeholder="Min revenue"
            aria-label="Minimum monthly revenue"
            className="min-h-[48px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-blue-500 sm:text-sm"
          />

          <input
            value={maxRevenueFilter}
            onChange={(e) => setMaxRevenueFilter(e.target.value)}
            inputMode="decimal"
            placeholder="Max revenue"
            aria-label="Maximum monthly revenue"
            className="min-h-[48px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-blue-500 sm:text-sm"
          />

          <input
            value={minSubPayFilter}
            onChange={(e) => setMinSubPayFilter(e.target.value)}
            inputMode="decimal"
            placeholder="Min sub pay"
            aria-label="Minimum subcontractor pay"
            className="min-h-[48px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-blue-500 sm:text-sm"
          />

          <input
            value={maxSubPayFilter}
            onChange={(e) => setMaxSubPayFilter(e.target.value)}
            inputMode="decimal"
            placeholder="Max sub pay"
            aria-label="Maximum subcontractor pay"
            className="min-h-[48px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-blue-500 sm:text-sm"
          />

          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as SortOption)}
            aria-label="Sort accounts"
            className="min-h-[48px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-blue-500 sm:text-sm"
          >
            {sortOptions.map((s) => (
              <option key={s} value={s}>
                Sort: {s}
              </option>
            ))}
          </select>
        </div>

        {/* Result count + clear */}
        <div className="mt-4 flex flex-col gap-3 text-sm font-bold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p>
              Showing{" "}
              <span className="font-black text-slate-900">{visibleAccounts.length}</span>
              {" "}of{" "}
              <span className="font-black text-slate-900">{filteredAccounts.length}</span>
              {" "}matching account{filteredAccounts.length === 1 ? "" : "s"}
            </p>
            <p className="mt-1 text-xs">Tap any account name to open the account detail page.</p>
          </div>
          
          <button
            type="button"
            onClick={handlePrintSubcontractorAccountList}
            className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-black text-blue-800 hover:bg-blue-100"
>
            Print Sub Account List
          </button>

          <button
            type="button"
            onClick={clearFilters}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
          >
            Clear Filters
          </button>
        </div>

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
                      <option value="All">All Subcontractors</option>
                      {subcontractors
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

                <div className="mt-3 max-h-[560px] space-y-2 overflow-y-auto pr-1">
                  {transferCandidateAccounts.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-bold text-slate-500">
                      Search for an account or choose a current subcontractor to show matching active accounts.
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
                      <option value="">Choose existing subcontractor...</option>
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

        {/* Accounts table */}
        {!transferMode ? (
          <>
        <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200">
          <div className="hidden grid-cols-12 gap-3 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-500 lg:grid">
            <div className="col-span-3">Account</div>
            <div className="col-span-2">Manager</div>
            <div className="col-span-2">Subcontractor</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-1">Health</div>
            <div className="col-span-1">Start Date</div>
            <div className="col-span-1 text-right">Revenue / Margin</div>
            <div className="col-span-1 text-right">Action</div>
          </div>

          {visibleAccounts.length === 0 ? (
            <div className="bg-white px-4 py-8 text-sm font-semibold text-slate-500">
              No accounts match your filters.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 bg-white">
              {visibleAccounts.map((account, index) => {
                const accountId = getAccountId(account);
                const accountHref = `/accounts/${encodeURIComponent(accountId)}`;
                const subDisplay = account._subDisplay ?? { contactName: "", companyName: "", fallback: normalizeText(account.subcontractor) || "Unassigned" };

                return (
                  <div
                    key={`${accountId}-${index}`}
                    className="px-4 py-4 text-sm hover:bg-blue-50 lg:grid lg:grid-cols-12 lg:gap-3"
                  >
                    <div className="lg:col-span-3">
                      <div className="flex items-start gap-3">
                        <Link href={accountHref} className="block flex-1 no-underline">
                      <div className="flex items-start justify-between gap-3 lg:block">
                        <div>
                          <p className="text-base font-black leading-6 text-blue-900 lg:text-sm">
                            {account.accountName || "Unnamed Account"}
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
                            className="mt-1 block text-xs font-semibold leading-5 text-slate-500 hover:text-blue-600 hover:underline cursor-pointer"
                          >
                            {account.address || "No address"}
                          </span>
                          <p className="mt-1 text-xs font-bold text-slate-400">
                            ID: {accountId || "N/A"}
                          </p>
                        </div>
                        <div className="text-right lg:hidden">
                          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                            Revenue
                          </p>
                          <p className="text-sm font-black text-slate-950">
                            {formatMoney(account.monthlyRevenue)}
                            <span className="ml-1 text-xs font-normal text-gray-500">({account._revenuePercent ?? 0}%)</span>
                          </p>
                          <p className="mt-1 text-xs font-bold text-emerald-700">
                            Sub Pay: {formatMoney(account.monthlySubcontractorPay ?? account.subcontractorPay)}
                          </p>
                          <p className="mt-1 text-xs font-bold text-amber-600">
                            Margin: {(account._grossMarginNum ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} ({account._grossMarginPercent ?? 0}%)
                          </p>
                        </div>
                      </div>
                        </Link>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 lg:col-span-9 lg:mt-0 lg:grid-cols-9">
                      <div className="rounded-2xl bg-slate-50 p-3 lg:col-span-2 lg:rounded-none lg:bg-transparent lg:p-0">
                        <p className="text-[11px] font-black uppercase tracking-wide text-slate-400 lg:hidden">Manager</p>
                        <p className="mt-1 font-bold text-slate-700 lg:mt-0">{account.manager || "Unassigned"}</p>
                      </div>

                      <div className="rounded-2xl bg-slate-50 p-3 lg:col-span-2 lg:rounded-none lg:bg-transparent lg:p-0">
                        <p className="text-[11px] font-black uppercase tracking-wide text-slate-400 lg:hidden">Subcontractor</p>
                        <p className="mt-1 font-bold text-slate-700 lg:mt-0">
                          {getSubDisplayLabel(subDisplay)}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-slate-50 p-3 lg:col-span-1 lg:rounded-none lg:bg-transparent lg:p-0">
                        <p className="text-[11px] font-black uppercase tracking-wide text-slate-400 lg:hidden">Status</p>
                        <span
                          className={`mt-1 inline-flex rounded-full border px-2 py-1 text-xs font-black lg:mt-0 ${getStatusClass(account.status)}`}
                          aria-label={`Status: ${account.status ?? "N/A"}`}
                        >
                          {account.status || "N/A"}
                        </span>
                      </div>

                      <div className="rounded-2xl bg-slate-50 p-3 lg:col-span-1 lg:rounded-none lg:bg-transparent lg:p-0">
                        <p className="text-[11px] font-black uppercase tracking-wide text-slate-400 lg:hidden">Health</p>
                        <span
                          className={`mt-1 inline-flex rounded-full border px-2 py-1 text-xs font-black lg:mt-0 ${getHealthClass(account.accountHealth)}`}
                          aria-label={`Account health: ${account.accountHealth ?? "N/A"}`}
                        >
                          {account.accountHealth || "N/A"}
                        </span>
                      </div>

                      <div className="rounded-2xl bg-slate-50 p-3 lg:col-span-1 lg:rounded-none lg:bg-transparent lg:p-0">
                        <p className="text-[11px] font-black uppercase tracking-wide text-slate-400 lg:hidden">Start Date</p>
                        <p className="mt-1 text-xs font-bold text-slate-600 lg:mt-0">
                          {formatDate(account.accountStartDate) || "-"}
                        </p>
                      </div>

                      <div className="hidden text-right lg:col-span-1 lg:block">
                        <p className="font-black text-slate-950">
                          {formatMoney(account.monthlyRevenue)}
                          <span className="ml-1 text-xs font-normal text-gray-500">({account._revenuePercent ?? 0}%)</span>
                        </p>
                        <p className="mt-1 text-[11px] font-bold text-emerald-700">
                          Sub: {formatMoney(account.monthlySubcontractorPay ?? account.subcontractorPay)}
                        </p>
                        <p className="mt-1 text-[11px] font-bold text-amber-600">
                          Margin: {(account._grossMarginNum ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} ({account._grossMarginPercent ?? 0}%)
                        </p>
                        {normalizeText(account._frequencyText) ? (
                          <p className="mt-1 text-[11px] font-bold text-slate-400">
                            {account._frequencyText}
                          </p>
                        ) : null}
                      </div>

                      <div className="col-span-2 lg:col-span-1 lg:text-right">
                        <button
                          type="button"
                          onClick={() => openStatusModal(account)}
                          aria-label={`Change status for ${account.accountName ?? "this account"}`}
                          className="w-full rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-800 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 lg:w-auto"
                        >
                          Change Status
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Load more */}
        {visibleCount < filteredAccounts.length ? (
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={() => setVisibleCount((n) => n + LOAD_MORE_COUNT)}
              className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-black text-white shadow-sm hover:bg-blue-950"
            >
              Load 15 More
            </button>
          </div>
        ) : null}
          </>
        ) : null}
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Status modal                                                        */}
      {/* ----------------------------------------------------------------- */}

      {statusModalAccount ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="presentation"
          onClick={handleOverlayClick}
          onKeyDown={handleOverlayKeyDown}
        >
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="status-modal-title"
            className="w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">
                  Quick Status Change
                </p>
                <h2 id="status-modal-title" className="mt-2 text-2xl font-black text-slate-950">
                  {statusModalAccount.accountName || "Unnamed Account"}
                </h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Current status:{" "}
                  <span className="font-black text-slate-800">{statusModalAccount.status || "N/A"}</span>
                </p>
              </div>

              <button
                type="button"
                onClick={closeStatusModal}
                disabled={savingStatus}
                aria-label="Close dialog"
                className="rounded-full bg-slate-100 px-3 py-2 text-sm font-black text-slate-600 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <div>
                <label htmlFor="new-status" className="text-xs font-black uppercase tracking-wide text-slate-500">
                  New Status
                </label>
                <select
                  id="new-status"
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as QuickStatusOption)}
                  disabled={savingStatus}
                  className="mt-2 min-h-[48px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100 sm:text-sm"
                >
                  {quickStatusOptions.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="status-reason" className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Reason / History Note
                </label>
                <textarea
                  id="status-reason"
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  disabled={savingStatus}
                  placeholder="Example: Customer requested cancellation effective July 1. / Paused due to remodeling."
                  rows={5}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100 sm:text-sm"
                />
                <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                  This also creates an Account Update history note.
                </p>
              </div>

              {statusError ? (
                <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
                  {statusError}
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={closeStatusModal}
                  disabled={savingStatus}
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveStatusChange}
                  disabled={savingStatus}
                  className="rounded-2xl bg-blue-700 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingStatus ? "Saving..." : "Save Status Change"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
