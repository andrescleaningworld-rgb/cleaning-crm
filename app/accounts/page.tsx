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

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Active");
  const [managerFilter, setManagerFilter] = useState("All");
  const [subcontractorFilter, setSubcontractorFilter] = useState("All");

  useEffect(() => {
    async function loadAccounts() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch("/api/accounts", {
          cache: "no-store",
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
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

  const filteredAccounts = useMemo(() => {
    const cleanSearch = searchText.toLowerCase().trim();

    return accounts.filter((account) => {
      const statusCategory = getStatusCategory(account.status);

      const searchableText = [
        account.accountName,
        account.address,
        account.city,
        account.state,
        account.zip,
        account.manager,
        account.subcontractor,
        account.status,
        account.accountHealth,
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
  }, [accounts, searchText, statusFilter, managerFilter, subcontractorFilter]);

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

  if (loading) {
    return (
      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-slate-600">
          Loading accounts...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div>
      <section className="rounded-3xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-700">
              Cleaning World
            </p>

            <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950">
              Accounts
            </h1>

            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              View accounts by status, manager, subcontractor, revenue, and
              account details. The default view shows active accounts.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Link
              href="/accounts/new"
              className="rounded-2xl bg-blue-700 px-5 py-3 text-center text-sm font-black text-white shadow-sm no-underline hover:bg-blue-800"
            >
              + Add Account
            </Link>

            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-blue-950"
            >
              Print
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
            <p className="text-xs font-black uppercase tracking-wide text-blue-700">
              Total Accounts
            </p>
            <p className="mt-2 text-3xl font-black text-slate-950">
              {accounts.length}
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
            <p className="text-xs font-black uppercase tracking-wide text-emerald-700">
              Active
            </p>
            <p className="mt-2 text-3xl font-black text-slate-950">
              {activeAccounts}
            </p>
          </div>

          <div className="rounded-2xl border border-red-100 bg-red-50 p-5">
            <p className="text-xs font-black uppercase tracking-wide text-red-700">
              Cancelled
            </p>
            <p className="mt-2 text-3xl font-black text-slate-950">
              {cancelledAccounts}
            </p>
          </div>

          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
            <p className="text-xs font-black uppercase tracking-wide text-amber-700">
              High Risk
            </p>
            <p className="mt-2 text-3xl font-black text-slate-950">
              {highRiskAccounts}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wide text-blue-700">
            Revenue In Current View
          </p>
          <p className="mt-2 text-3xl font-black text-slate-950">
            {filteredRevenue.toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0,
            })}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            This number changes when you filter by status, manager, sub, or
            search.
          </p>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-4">
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search accounts..."
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 lg:col-span-1"
          />

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as StatusFilter)
            }
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500"
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
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500"
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
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500"
          >
            {subcontractors.map((sub) => (
              <option key={String(sub)} value={String(sub)}>
                Sub: {sub}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200">
          <div className="grid grid-cols-12 gap-3 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-500">
            <div className="col-span-3">Account</div>
            <div className="col-span-2">Manager</div>
            <div className="col-span-2">Subcontractor</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-1">Health</div>
            <div className="col-span-1">Cancelled</div>
            <div className="col-span-2 text-right">Revenue</div>
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
                  <Link
                    key={`${accountId}-${index}`}
                    href={accountHref}
                    className="grid grid-cols-12 gap-3 px-4 py-4 text-sm no-underline hover:bg-blue-50"
                  >
                    <div className="col-span-3">
                      <p className="font-black text-blue-900">
                        {account.accountName || "Unnamed Account"}
                      </p>

                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {[account.address, account.city, account.state]
                          .filter(Boolean)
                          .join(", ") || "No address"}
                      </p>

                      <p className="mt-1 text-xs font-bold text-slate-400">
                        ID: {accountId || "N/A"}
                      </p>
                    </div>

                    <div className="col-span-2 font-bold text-slate-700">
                      {account.manager || "Unassigned"}
                    </div>

                    <div className="col-span-2 font-bold text-slate-700">
                      {account.subcontractor || "Unassigned"}
                    </div>

                    <div className="col-span-1">
                      <span
                        className={`inline-flex rounded-full border px-2 py-1 text-xs font-black ${getStatusClass(
                          account.status
                        )}`}
                      >
                        {account.status || "N/A"}
                      </span>
                    </div>

                    <div className="col-span-1">
                      <span
                        className={`inline-flex rounded-full border px-2 py-1 text-xs font-black ${getHealthClass(
                          account.accountHealth
                        )}`}
                      >
                        {account.accountHealth || "N/A"}
                      </span>
                    </div>

                    <div className="col-span-1 text-xs font-bold text-slate-600">
                      {formatDate(account.cancelledDate) || "-"}
                    </div>

                    <div className="col-span-2 text-right font-black text-slate-950">
                      {formatMoney(account.monthlyRevenue)}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}