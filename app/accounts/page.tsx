"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

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
  | "Start Date - Oldest First";

type ApiResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  data?: Account[];
  accounts?: Account[];
};

type QuickStatusOption =
  | "Active"
  | "Cancelled"
  | "Paused"
  | "Over 90 Days"
  | "Inactive"
  | "Needs Review"
  | "Other";

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function getAccountId(account: Account) {
  return normalizeText(
    account.accountId || account.id || account.rowNumber || account.accountName
  );
}

function moneyToNumber(value: string | number | undefined) {
  if (value === undefined || value === null || value === "") return 0;

  if (typeof value === "number") {
    return Number.isNaN(value) ? 0 : value;
  }

  const cleaned = String(value)
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .trim();

  const parsed = Number(cleaned);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatMoney(value: string | number | undefined) {
  const number = moneyToNumber(value);

  if (!number) return "N/A";

  return number.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function getDateTime(value: string | undefined) {
  if (!value) return 0;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 0;
  }

  return date.getTime();
}

function formatDate(value: string | undefined) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getStatusCategory(status: string | undefined): StatusFilter {
  const clean = normalizeLower(status);

  if (!clean) return "Other";

  if (
    clean === "active" ||
    clean === "active account" ||
    clean === "current"
  ) {
    return "Active";
  }

  if (
    clean.includes("cancel") ||
    clean.includes("lost") ||
    clean.includes("terminated") ||
    clean.includes("closed")
  ) {
    return "Cancelled";
  }

  if (
    clean.includes("pause") ||
    clean.includes("hold") ||
    clean.includes("suspended")
  ) {
    return "Paused";
  }

  if (
    clean.includes("90") ||
    clean.includes("over 90") ||
    clean.includes("over ninety") ||
    clean.includes("old")
  ) {
    return "Over 90 Days";
  }

  if (
    clean.includes("inactive") ||
    clean.includes("archive") ||
    clean.includes("duplicate")
  ) {
    return "Other";
  }

  return "Other";
}

function getStatusClass(status: string | undefined) {
  const category = getStatusCategory(status);

  if (category === "Active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (category === "Cancelled") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  if (category === "Paused" || category === "Over 90 Days") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function getHealthClass(health: string | undefined) {
  const clean = normalizeLower(health);

  if (clean.includes("high risk")) {
    return "border-red-200 bg-red-50 text-red-800";
  }

  if (clean.includes("attention")) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (
    clean.includes("stable") ||
    clean.includes("good") ||
    clean.includes("excellent")
  ) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

async function readApiResponse(response: Response): Promise<ApiResponse> {
  const text = await response.text();

  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as ApiResponse;
  } catch {
    throw new Error("The server did not return valid JSON.");
  }
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Active");
  const [managerFilter, setManagerFilter] = useState("All");
  const [subcontractorFilter, setSubcontractorFilter] = useState("All");
  const [sortOption, setSortOption] = useState<SortOption>("Account Name");

  const [statusModalAccount, setStatusModalAccount] =
    useState<Account | null>(null);
  const [newStatus, setNewStatus] = useState<QuickStatusOption>("Active");
  const [statusReason, setStatusReason] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState("");

  async function loadAccounts() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/accounts", {
        cache: "no-store",
      });

      const data = await readApiResponse(response);

      if (!response.ok || data.success === false) {
        throw new Error(data.error || "Could not load accounts.");
      }

      const loadedAccounts: Account[] = data.accounts || data.data || [];

      setAccounts(loadedAccounts);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong loading accounts."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  const managers = useMemo(() => {
    const uniqueManagers = Array.from(
      new Set(
        accounts
          .map((account) => normalizeText(account.manager))
          .filter(Boolean)
      )
    );

    return ["All", ...uniqueManagers.sort()];
  }, [accounts]);

  const subcontractors = useMemo(() => {
    const uniqueSubs = Array.from(
      new Set(
        accounts
          .map((account) => normalizeText(account.subcontractor))
          .filter(Boolean)
      )
    );

    return ["All", ...uniqueSubs.sort()];
  }, [accounts]);

  const statusOptions: StatusFilter[] = [
    "Active",
    "Cancelled",
    "Paused",
    "Over 90 Days",
    "Other",
    "All",
  ];

  const quickStatusOptions: QuickStatusOption[] = [
    "Active",
    "Cancelled",
    "Paused",
    "Over 90 Days",
    "Inactive",
    "Needs Review",
    "Other",
  ];

  const sortOptions: SortOption[] = [
    "Account Name",
    "Start Date - Newest First",
    "Start Date - Oldest First",
  ];

  const filteredAccounts = useMemo(() => {
    const cleanSearch = searchText.toLowerCase().trim();

    const filtered = accounts.filter((account) => {
      const statusCategory = getStatusCategory(account.status);

      const searchableText = [
        account.accountName,
        account.address,
        account.manager,
        account.subcontractor,
        account.status,
        account.accountHealth,
        account.accountStartDate,
        account.contactName,
        account.phone,
        account.email,
        account.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !cleanSearch || searchableText.includes(cleanSearch);

      const matchesStatus =
        statusFilter === "All" || statusCategory === statusFilter;

      const matchesManager =
        managerFilter === "All" ||
        normalizeText(account.manager) === managerFilter;

      const matchesSubcontractor =
        subcontractorFilter === "All" ||
        normalizeText(account.subcontractor) === subcontractorFilter;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesManager &&
        matchesSubcontractor
      );
    });

    const sorted = [...filtered];

    if (sortOption === "Start Date - Newest First") {
      sorted.sort((a, b) => {
        return getDateTime(b.accountStartDate) - getDateTime(a.accountStartDate);
      });
    } else if (sortOption === "Start Date - Oldest First") {
      sorted.sort((a, b) => {
        return getDateTime(a.accountStartDate) - getDateTime(b.accountStartDate);
      });
    } else {
      sorted.sort((a, b) => {
        return normalizeText(a.accountName).localeCompare(
          normalizeText(b.accountName)
        );
      });
    }

    return sorted;
  }, [
    accounts,
    searchText,
    statusFilter,
    managerFilter,
    subcontractorFilter,
    sortOption,
  ]);

  const activeAccounts = accounts.filter(
    (account) => getStatusCategory(account.status) === "Active"
  ).length;

  const cancelledAccounts = accounts.filter(
    (account) => getStatusCategory(account.status) === "Cancelled"
  ).length;

  const highRiskAccounts = accounts.filter((account) =>
    normalizeLower(account.accountHealth).includes("high risk")
  ).length;

  const filteredRevenue = filteredAccounts.reduce((sum, account) => {
    return sum + moneyToNumber(account.monthlyRevenue);
  }, 0);

  function openStatusModal(account: Account) {
    const currentStatus = normalizeText(account.status);

    setStatusModalAccount(account);
    setNewStatus(
      quickStatusOptions.includes(currentStatus as QuickStatusOption)
        ? (currentStatus as QuickStatusOption)
        : "Active"
    );
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
    const accountName =
      normalizeText(statusModalAccount.accountName) || "Unnamed Account";

    try {
      setSavingStatus(true);
      setStatusError("");

      const updatedAccount: Account = {
        ...statusModalAccount,
        id: statusModalAccount.id || accountId,
        accountId: statusModalAccount.accountId || accountId,
        status: newStatus,
      };

      const accountResponse = await fetch("/api/accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "updateAccount",
          account: updatedAccount,
        }),
      });

      const accountData = await readApiResponse(accountResponse);

      if (!accountResponse.ok || accountData.success === false) {
        throw new Error(accountData.error || "Could not update account status.");
      }

      const updateNote =
        "Status changed from " +
        oldStatus +
        " to " +
        newStatus +
        ". Reason: " +
        cleanReason;

      const updateResponse = await fetch("/api/account-updates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "addAccountUpdate",
          accountId: accountId,
          accountName: accountName,
          updateType: "Status Change",
          manager: statusModalAccount.manager || "",
          notes: updateNote,
          notifyEmail: "No",
        }),
      });

      const updateData = await readApiResponse(updateResponse);

      if (!updateResponse.ok || updateData.success === false) {
        throw new Error(
          updateData.error ||
            "Status changed, but the history note could not be saved."
        );
      }

      setAccounts((currentAccounts) =>
        currentAccounts.map((account) => {
          const currentId = getAccountId(account);

          if (currentId === accountId) {
            return {
              ...account,
              status: newStatus,
            };
          }

          return account;
        })
      );

      closeStatusModal();
    } catch (err) {
      setStatusError(
        err instanceof Error
          ? err.message
          : "Something went wrong changing the account status."
      );
    } finally {
      setSavingStatus(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-3xl bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm font-semibold text-slate-600">
          Loading accounts...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl bg-white p-5 shadow-sm sm:p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div>
      <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700 sm:text-sm">
              Cleaning World
            </p>

            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Accounts
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              View accounts by status, manager, subcontractor, revenue, start
              date, and account details. The default view shows active accounts.
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
              onClick={() => window.print()}
              className="rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-black text-white shadow-sm hover:bg-blue-950"
            >
              Print
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 sm:p-5">
            <p className="text-[11px] font-black uppercase tracking-wide text-blue-700 sm:text-xs">
              Total
            </p>
            <p className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">
              {accounts.length}
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 sm:p-5">
            <p className="text-[11px] font-black uppercase tracking-wide text-emerald-700 sm:text-xs">
              Active
            </p>
            <p className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">
              {activeAccounts}
            </p>
          </div>

          <div className="rounded-2xl border border-red-100 bg-red-50 p-4 sm:p-5">
            <p className="text-[11px] font-black uppercase tracking-wide text-red-700 sm:text-xs">
              Cancelled
            </p>
            <p className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">
              {cancelledAccounts}
            </p>
          </div>

          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 sm:p-5">
            <p className="text-[11px] font-black uppercase tracking-wide text-amber-700 sm:text-xs">
              High Risk
            </p>
            <p className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">
              {highRiskAccounts}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5">
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
            This number changes when you filter by status, manager,
            subcontractor, or search.
          </p>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-5">
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search accounts..."
            className="min-h-[48px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-blue-500 sm:text-sm"
          />

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as StatusFilter)
            }
            className="min-h-[48px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-blue-500 sm:text-sm"
          >
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                Status: {status}
              </option>
            ))}
          </select>

          <select
            value={managerFilter}
            onChange={(event) => setManagerFilter(event.target.value)}
            className="min-h-[48px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-blue-500 sm:text-sm"
          >
            {managers.map((manager) => (
              <option key={String(manager)} value={String(manager)}>
                Manager: {manager}
              </option>
            ))}
          </select>

          <select
            value={subcontractorFilter}
            onChange={(event) => setSubcontractorFilter(event.target.value)}
            className="min-h-[48px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-blue-500 sm:text-sm"
          >
            {subcontractors.map((sub) => (
              <option key={String(sub)} value={String(sub)}>
                Sub: {sub}
              </option>
            ))}
          </select>

          <select
            value={sortOption}
            onChange={(event) =>
              setSortOption(event.target.value as SortOption)
            }
            className="min-h-[48px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-blue-500 sm:text-sm"
          >
            {sortOptions.map((sort) => (
              <option key={sort} value={sort}>
                Sort: {sort}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 flex flex-col gap-1 text-sm font-bold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Showing{" "}
            <span className="font-black text-slate-900">
              {filteredAccounts.length}
            </span>{" "}
            account{filteredAccounts.length === 1 ? "" : "s"}
          </p>

          <p className="text-xs">
            Tap any account name to open the account detail page.
          </p>
        </div>

        <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200">
          <div className="hidden grid-cols-12 gap-3 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-500 lg:grid">
            <div className="col-span-3">Account</div>
            <div className="col-span-2">Manager</div>
            <div className="col-span-2">Subcontractor</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-1">Health</div>
            <div className="col-span-1">Start Date</div>
            <div className="col-span-1 text-right">Revenue</div>
            <div className="col-span-1 text-right">Action</div>
          </div>

          {filteredAccounts.length === 0 ? (
            <div className="bg-white px-4 py-8 text-sm font-semibold text-slate-500">
              No accounts found.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 bg-white">
              {filteredAccounts.map((account, index) => {
                const accountId = getAccountId(account);
                const accountHref = `/accounts/${encodeURIComponent(
                  accountId
                )}`;

                return (
                  <div
                    key={`${accountId}-${index}`}
                    className="px-4 py-4 text-sm hover:bg-blue-50 lg:grid lg:grid-cols-12 lg:gap-3"
                  >
                    <Link
                      href={accountHref}
                      className="block no-underline lg:col-span-3"
                    >
                      <div className="flex items-start justify-between gap-3 lg:block">
                        <div>
                          <p className="text-base font-black leading-6 text-blue-900 lg:text-sm">
                            {account.accountName || "Unnamed Account"}
                          </p>

                          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                            {account.address || "No address"}
                          </p>

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
                          </p>
                        </div>
                      </div>
                    </Link>

                    <div className="mt-4 grid grid-cols-2 gap-3 lg:col-span-9 lg:mt-0 lg:grid-cols-9">
                      <div className="rounded-2xl bg-slate-50 p-3 lg:col-span-2 lg:rounded-none lg:bg-transparent lg:p-0">
                        <p className="text-[11px] font-black uppercase tracking-wide text-slate-400 lg:hidden">
                          Manager
                        </p>
                        <p className="mt-1 font-bold text-slate-700 lg:mt-0">
                          {account.manager || "Unassigned"}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-slate-50 p-3 lg:col-span-2 lg:rounded-none lg:bg-transparent lg:p-0">
                        <p className="text-[11px] font-black uppercase tracking-wide text-slate-400 lg:hidden">
                          Subcontractor
                        </p>
                        <p className="mt-1 font-bold text-slate-700 lg:mt-0">
                          {account.subcontractor || "Unassigned"}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-slate-50 p-3 lg:col-span-1 lg:rounded-none lg:bg-transparent lg:p-0">
                        <p className="text-[11px] font-black uppercase tracking-wide text-slate-400 lg:hidden">
                          Status
                        </p>
                        <span
                          className={`mt-1 inline-flex rounded-full border px-2 py-1 text-xs font-black lg:mt-0 ${getStatusClass(
                            account.status
                          )}`}
                        >
                          {account.status || "N/A"}
                        </span>
                      </div>

                      <div className="rounded-2xl bg-slate-50 p-3 lg:col-span-1 lg:rounded-none lg:bg-transparent lg:p-0">
                        <p className="text-[11px] font-black uppercase tracking-wide text-slate-400 lg:hidden">
                          Health
                        </p>
                        <span
                          className={`mt-1 inline-flex rounded-full border px-2 py-1 text-xs font-black lg:mt-0 ${getHealthClass(
                            account.accountHealth
                          )}`}
                        >
                          {account.accountHealth || "N/A"}
                        </span>
                      </div>

                      <div className="rounded-2xl bg-slate-50 p-3 lg:col-span-1 lg:rounded-none lg:bg-transparent lg:p-0">
                        <p className="text-[11px] font-black uppercase tracking-wide text-slate-400 lg:hidden">
                          Start Date
                        </p>
                        <p className="mt-1 text-xs font-bold text-slate-600 lg:mt-0">
                          {formatDate(account.accountStartDate) || "-"}
                        </p>
                      </div>

                      <div className="hidden text-right font-black text-slate-950 lg:col-span-1 lg:block">
                        {formatMoney(account.monthlyRevenue)}
                      </div>

                      <div className="col-span-2 lg:col-span-1 lg:text-right">
                        <button
                          type="button"
                          onClick={() => openStatusModal(account)}
                          className="w-full rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-800 hover:bg-blue-100 lg:w-auto"
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
      </section>

      {statusModalAccount ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">
                  Quick Status Change
                </p>
                <h2 className="mt-2 text-2xl font-black text-slate-950">
                  {statusModalAccount.accountName || "Unnamed Account"}
                </h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Current status:{" "}
                  <span className="font-black text-slate-800">
                    {statusModalAccount.status || "N/A"}
                  </span>
                </p>
              </div>

              <button
                type="button"
                onClick={closeStatusModal}
                disabled={savingStatus}
                className="rounded-full bg-slate-100 px-3 py-2 text-sm font-black text-slate-600 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                X
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <div>
                <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                  New Status
                </label>
                <select
                  value={newStatus}
                  onChange={(event) =>
                    setNewStatus(event.target.value as QuickStatusOption)
                  }
                  disabled={savingStatus}
                  className="mt-2 min-h-[48px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100 sm:text-sm"
                >
                  {quickStatusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Reason / History Note
                </label>
                <textarea
                  value={statusReason}
                  onChange={(event) => setStatusReason(event.target.value)}
                  disabled={savingStatus}
                  placeholder="Example: Customer requested cancellation effective July 1. / Paused due to remodeling. / Account needs review due to service concern."
                  rows={5}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100 sm:text-sm"
                />
                <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                  This will also create an Account Update history note.
                </p>
              </div>

              {statusError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
                  {statusError}
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={closeStatusModal}
                  disabled={savingStatus}
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleSaveStatusChange}
                  disabled={savingStatus}
                  className="rounded-2xl bg-blue-700 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
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