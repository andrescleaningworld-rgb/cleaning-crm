"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type AnyRow = Record<string, any>;

type DashboardData = {
  accounts: AnyRow[];
  visits: AnyRow[];
  complaints: AnyRow[];
  sales: AnyRow[];
  subcontractors: AnyRow[];
};

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("en-US");

function cleanText(value: any): string {
  return String(value ?? "").trim();
}

function cleanLower(value: any): string {
  return cleanText(value).toLowerCase();
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "").replace(/_/g, "");
}

function normalizeAccountName(value: string): string {
  return cleanLower(value)
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

function parseMoney(value: any): number {
  if (value === null || value === undefined || value === "") return 0;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const cleaned = String(value)
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .replace(/\s/g, "")
    .replace(/[^\d.-]/g, "");

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number): string {
  return moneyFormatter.format(value || 0);
}

function formatNumber(value: number): string {
  return numberFormatter.format(value || 0);
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0.0%";
  return `${value.toFixed(1)}%`;
}

function getValue(row: AnyRow, possibleKeys: string[]): any {
  for (const key of possibleKeys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }

  const entries = Object.entries(row).map(([key, value]) => ({
    key: normalizeKey(key),
    value,
  }));

  for (const possibleKey of possibleKeys) {
    const wanted = normalizeKey(possibleKey);
    const found = entries.find((entry) => entry.key === wanted);

    if (found && found.value !== undefined && found.value !== null && found.value !== "") {
      return found.value;
    }
  }

  return "";
}

function getAccountId(row: AnyRow): string {
  return cleanText(
    getValue(row, ["ID", "id", "Account ID", "accountId", "account_id"])
  );
}

function getAccountName(row: AnyRow): string {
  return cleanText(
    getValue(row, [
      "Account Name",
      "accountName",
      "Account",
      "account",
      "Customer",
      "customer",
      "Name",
      "name",
    ])
  );
}

function getAccountStatus(row: AnyRow): string {
  return cleanText(
    getValue(row, [
      "Status",
      "status",
      "Account Status",
      "accountStatus",
      "AccountStatus",
    ])
  );
}

function getAccountManager(row: AnyRow): string {
  return cleanText(
    getValue(row, [
      "Manager",
      "manager",
      "Account Manager",
      "accountManager",
      "Assigned Manager",
      "assignedManager",
    ])
  );
}

function getAccountSubcontractor(row: AnyRow): string {
  return cleanText(
    getValue(row, [
      "Subcontractor",
      "subcontractor",
      "Sub",
      "sub",
      "Assigned Subcontractor",
      "assignedSubcontractor",
      "Cleaner",
      "cleaner",
    ])
  );
}

function getAccountHealth(row: AnyRow): string {
  return cleanText(
    getValue(row, [
      "Account Health",
      "accountHealth",
      "Health",
      "health",
      "Condition",
      "condition",
      "Score Status",
      "scoreStatus",
    ])
  );
}

function getMonthlyRevenue(row: AnyRow): number {
  return parseMoney(
    getValue(row, [
      "Monthly Revenue",
      "monthlyRevenue",
      "MonthlyRevenue",
      "What Cleaning World Gets Paid",
      "whatCleaningWorldGetsPaid",
      "Cleaning World Gets Paid",
      "cleaningWorldGetsPaid",
      "Monthly Billing",
      "monthlyBilling",
    ])
  );
}

function getMonthlySubPay(row: AnyRow): number {
  return parseMoney(
    getValue(row, [
      "Monthly Subcontractor Pay",
      "monthlySubcontractorPay",
      "MonthlySubcontractorPay",
      "Subcontractor Pay",
      "subcontractorPay",
      "Sub Pay",
      "subPay",
      "Monthly Sub Pay",
      "monthlySubPay",
      "Cleaner Pay",
      "cleanerPay",
    ])
  );
}

function isRevenueAccount(row: AnyRow): boolean {
  const status = cleanLower(getAccountStatus(row));
  const revenue = getMonthlyRevenue(row);

  if (revenue <= 0) return false;

  if (!status) return true;

  const excludedStatuses = [
    "cancelled",
    "canceled",
    "inactive",
    "paused",
    "lost",
    "terminated",
    "closed",
  ];

  return !excludedStatuses.some((badStatus) => status.includes(badStatus));
}

function dedupeAccountsByName(accounts: AnyRow[]): AnyRow[] {
  const map = new Map<string, AnyRow>();

  for (const account of accounts) {
    const name = getAccountName(account);
    const id = getAccountId(account);

    const key = name
      ? `name:${normalizeAccountName(name)}`
      : id
      ? `id:${cleanLower(id)}`
      : `row:${JSON.stringify(account)}`;

    if (!map.has(key)) {
      map.set(key, account);
      continue;
    }

    const existing = map.get(key)!;

    const existingIsRevenue = isRevenueAccount(existing);
    const newIsRevenue = isRevenueAccount(account);

    const existingRevenue = getMonthlyRevenue(existing);
    const newRevenue = getMonthlyRevenue(account);

    const existingSubPay = getMonthlySubPay(existing);
    const newSubPay = getMonthlySubPay(account);

    if (!existingIsRevenue && newIsRevenue) {
      map.set(key, account);
      continue;
    }

    if (
      existingIsRevenue === newIsRevenue &&
      ((existingRevenue === 0 && newRevenue > 0) ||
        (existingSubPay === 0 && newSubPay > 0))
    ) {
      map.set(key, account);
    }
  }

  return Array.from(map.values());
}

function getDate(row: AnyRow): Date | null {
  const rawDate = getValue(row, [
    "Date",
    "date",
    "Created At",
    "createdAt",
    "Created",
    "created",
    "Visit Date",
    "visitDate",
    "Complaint Date",
    "complaintDate",
    "Sale Date",
    "saleDate",
  ]);

  if (!rawDate) return null;

  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed;
}

function getDisplayDate(row: AnyRow): string {
  const date = getDate(row);

  if (!date) return "-";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isThisMonth(row: AnyRow): boolean {
  const date = getDate(row);
  if (!date) return false;

  const now = new Date();

  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function isThisQuarter(row: AnyRow): boolean {
  const date = getDate(row);
  if (!date) return false;

  const now = new Date();
  const currentQuarter = Math.floor(now.getMonth() / 3);
  const rowQuarter = Math.floor(date.getMonth() / 3);

  return date.getFullYear() === now.getFullYear() && rowQuarter === currentQuarter;
}

function getComplaintStatus(row: AnyRow): string {
  return cleanText(getValue(row, ["Status", "status", "Complaint Status", "complaintStatus"]));
}

function isComplaintOpen(row: AnyRow): boolean {
  const status = cleanLower(getComplaintStatus(row));

  if (!status) return true;

  return !(
    status.includes("closed") ||
    status.includes("resolved") ||
    status.includes("completed") ||
    status.includes("done") ||
    status.includes("cancelled") ||
    status.includes("canceled")
  );
}

function getSaleAmount(row: AnyRow): number {
  return parseMoney(
    getValue(row, [
      "Amount",
      "amount",
      "Sale Amount",
      "saleAmount",
      "Total",
      "total",
      "Price",
      "price",
    ])
  );
}

function getSaleStatus(row: AnyRow): string {
  return cleanText(getValue(row, ["Status", "status", "Sale Status", "saleStatus"]));
}

function isSaleValid(row: AnyRow): boolean {
  const status = cleanLower(getSaleStatus(row));

  if (!status) return true;

  return !(
    status.includes("cancelled") ||
    status.includes("canceled") ||
    status.includes("declined") ||
    status.includes("void") ||
    status.includes("lost")
  );
}

function getRowAccountName(row: AnyRow): string {
  return cleanText(
    getValue(row, [
      "Account Name",
      "accountName",
      "Account",
      "account",
      "Customer",
      "customer",
      "Name",
      "name",
    ])
  );
}

function getRowTitle(row: AnyRow): string {
  return cleanText(
    getValue(row, [
      "Title",
      "title",
      "Type",
      "type",
      "Service",
      "service",
      "Subject",
      "subject",
      "Issue",
      "issue",
      "Visit Type",
      "visitType",
      "Complaint Type",
      "complaintType",
    ])
  );
}

function getRowPerson(row: AnyRow): string {
  return cleanText(
    getValue(row, [
      "Manager",
      "manager",
      "Sold By",
      "soldBy",
      "Sales Person",
      "salesPerson",
      "Created By",
      "createdBy",
      "Person",
      "person",
    ])
  );
}

async function safeReadData(url: string, key: string): Promise<AnyRow[]> {
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
    });

    const text = await response.text();

    if (!response.ok) {
      console.warn(`${key} API failed:`, response.status, text.slice(0, 300));
      return [];
    }

    let json: any;

    try {
      json = JSON.parse(text);
    } catch {
      console.warn(`${key} API did not return JSON:`, text.slice(0, 300));
      return [];
    }

    if (Array.isArray(json)) return json;
    if (Array.isArray(json.data)) return json.data;
    if (Array.isArray(json.accounts)) return json.accounts;
    if (Array.isArray(json.visits)) return json.visits;
    if (Array.isArray(json.complaints)) return json.complaints;
    if (Array.isArray(json.sales)) return json.sales;
    if (Array.isArray(json.subcontractors)) return json.subcontractors;
    if (Array.isArray(json.rows)) return json.rows;

    return [];
  } catch (error) {
    console.warn(`${key} API error:`, error);
    return [];
  }
}

function StatCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">{value}</h2>
      {note ? <p className="mt-2 text-sm text-gray-500">{note}</p> : null}
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>({
    accounts: [],
    visits: [],
    complaints: [],
    sales: [],
    subcontractors: [],
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);

      const [accounts, visits, complaints, sales, subcontractors] = await Promise.all([
        safeReadData("/api/accounts", "Accounts"),
        safeReadData("/api/visits", "Visits"),
        safeReadData("/api/complaints", "Complaints"),
        safeReadData("/api/sales", "Sales"),
        safeReadData("/api/subcontractors", "Subcontractors"),
      ]);

      setData({
        accounts,
        visits,
        complaints,
        sales,
        subcontractors,
      });

      setLoading(false);
    }

    loadDashboard();
  }, []);

  const dashboard = useMemo(() => {
    const rawAccounts = data.accounts;
    const uniqueAccounts = dedupeAccountsByName(rawAccounts);
    const revenueAccounts = uniqueAccounts.filter(isRevenueAccount);

    const monthlyRevenue = revenueAccounts.reduce((total, account) => {
      return total + getMonthlyRevenue(account);
    }, 0);

    const monthlySubcontractorPay = revenueAccounts.reduce((total, account) => {
      return total + getMonthlySubPay(account);
    }, 0);

    const grossMargin = monthlyRevenue - monthlySubcontractorPay;

    const grossMarginPercent =
      monthlyRevenue > 0 ? (grossMargin / monthlyRevenue) * 100 : 0;

    const openComplaints = data.complaints.filter(isComplaintOpen);
    const visitsThisMonth = data.visits.filter(isThisMonth);

    const salesThisQuarter = data.sales.filter((sale) => {
      return isSaleValid(sale) && isThisQuarter(sale);
    });

    const salesThisQuarterTotal = salesThisQuarter.reduce((total, sale) => {
      return total + getSaleAmount(sale);
    }, 0);

    const accountsNeedingAttention = revenueAccounts.filter((account) => {
      const health = cleanLower(getAccountHealth(account));

      return (
        health.includes("high risk") ||
        health.includes("needs attention") ||
        health.includes("problem") ||
        health.includes("bad")
      );
    });

    const recentComplaints = [...data.complaints]
      .sort((a, b) => {
        const dateA = getDate(a)?.getTime() ?? 0;
        const dateB = getDate(b)?.getTime() ?? 0;
        return dateB - dateA;
      })
      .slice(0, 5);

    const recentVisits = [...data.visits]
      .sort((a, b) => {
        const dateA = getDate(a)?.getTime() ?? 0;
        const dateB = getDate(b)?.getTime() ?? 0;
        return dateB - dateA;
      })
      .slice(0, 5);

    const recentSales = [...data.sales]
      .sort((a, b) => {
        const dateA = getDate(a)?.getTime() ?? 0;
        const dateB = getDate(b)?.getTime() ?? 0;
        return dateB - dateA;
      })
      .slice(0, 5);

    return {
      rawAccounts,
      uniqueAccounts,
      revenueAccounts,
      monthlyRevenue,
      monthlySubcontractorPay,
      grossMargin,
      grossMarginPercent,
      openComplaints,
      visitsThisMonth,
      salesThisQuarter,
      salesThisQuarterTotal,
      accountsNeedingAttention,
      recentComplaints,
      recentVisits,
      recentSales,
    };
  }, [data]);

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-6 text-gray-900">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
            Cleaning World
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Operations Dashboard</h1>
          <p className="mt-2 text-gray-500">
            Accounts, revenue, complaints, visits, sales, and subcontractor activity.
          </p>
        </div>

        <button
          onClick={() => window.print()}
          className="rounded-xl bg-gray-900 px-5 py-3 text-sm font-bold text-white"
        >
          Print
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          Loading dashboard...
        </div>
      ) : (
        <>
          <section className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <StatCard
              label="Monthly Revenue"
              value={formatMoney(dashboard.monthlyRevenue)}
              note={`${formatNumber(dashboard.revenueAccounts.length)} revenue accounts from ${formatNumber(
                dashboard.rawAccounts.length
              )} rows`}
            />

            <StatCard
              label="Monthly Sub Pay"
              value={formatMoney(dashboard.monthlySubcontractorPay)}
              note="Revenue accounts only"
            />

            <StatCard
              label="Gross Margin"
              value={formatMoney(dashboard.grossMargin)}
              note={formatPercent(dashboard.grossMarginPercent)}
            />

            <StatCard
              label="Open Complaints"
              value={formatNumber(dashboard.openComplaints.length)}
              note="Not closed or resolved"
            />

            <StatCard
              label="Visits This Month"
              value={formatNumber(dashboard.visitsThisMonth.length)}
              note="Based on visit date"
            />

            <StatCard
              label="Sales This Quarter"
              value={formatMoney(dashboard.salesThisQuarterTotal)}
              note={`${formatNumber(dashboard.salesThisQuarter.length)} sales`}
            />
          </section>

          <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-xl font-bold">Accounts Needing Attention</h2>
              <Link className="font-bold text-blue-600" href="/accounts">
                View all
              </Link>
            </div>

            {dashboard.accountsNeedingAttention.length === 0 ? (
              <p className="text-gray-500">
                No accounts marked as high risk or needing attention.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="p-3">Account</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Health</th>
                      <th className="p-3">Manager</th>
                      <th className="p-3">Subcontractor</th>
                      <th className="p-3 text-right">Monthly Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.accountsNeedingAttention.slice(0, 8).map((account, index) => {
                      const id = getAccountId(account);
                      const name = getAccountName(account) || "Unnamed Account";
                      const href = id ? `/accounts/${encodeURIComponent(id)}` : "/accounts";

                      return (
                        <tr key={`attention-${index}`} className="border-b last:border-b-0">
                          <td className="p-3">
                            <Link className="font-bold hover:text-blue-600" href={href}>
                              {name}
                            </Link>
                          </td>
                          <td className="p-3">{getAccountStatus(account) || "-"}</td>
                          <td className="p-3">{getAccountHealth(account) || "-"}</td>
                          <td className="p-3">{getAccountManager(account) || "-"}</td>
                          <td className="p-3">{getAccountSubcontractor(account) || "-"}</td>
                          <td className="p-3 text-right">{formatMoney(getMonthlyRevenue(account))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold">Recent Complaints</h2>
                <Link className="font-bold text-blue-600" href="/complaints">
                  View
                </Link>
              </div>

              {dashboard.recentComplaints.length === 0 ? (
                <p className="text-gray-500">No complaints found.</p>
              ) : (
                <div className="space-y-3">
                  {dashboard.recentComplaints.map((complaint, index) => (
                    <div
                      key={`complaint-${index}`}
                      className="rounded-xl border border-gray-100 bg-gray-50 p-4"
                    >
                      <strong>{getRowAccountName(complaint) || "Unknown Account"}</strong>
                      <p className="mt-1 text-gray-700">{getRowTitle(complaint) || "Complaint"}</p>
                      <p className="mt-1 text-sm text-gray-500">
                        {getComplaintStatus(complaint) || "Open"} · {getDisplayDate(complaint)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold">Recent Visits</h2>
                <Link className="font-bold text-blue-600" href="/visits">
                  View
                </Link>
              </div>

              {dashboard.recentVisits.length === 0 ? (
                <p className="text-gray-500">No visits found.</p>
              ) : (
                <div className="space-y-3">
                  {dashboard.recentVisits.map((visit, index) => (
                    <div
                      key={`visit-${index}`}
                      className="rounded-xl border border-gray-100 bg-gray-50 p-4"
                    >
                      <strong>{getRowAccountName(visit) || "Unknown Account"}</strong>
                      <p className="mt-1 text-gray-700">{getRowTitle(visit) || "Visit"}</p>
                      <p className="mt-1 text-sm text-gray-500">
                        {getRowPerson(visit) || "-"} · {getDisplayDate(visit)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold">Recent Sales</h2>
                <Link className="font-bold text-blue-600" href="/sales">
                  View
                </Link>
              </div>

              {dashboard.recentSales.length === 0 ? (
                <p className="text-gray-500">No sales found.</p>
              ) : (
                <div className="space-y-3">
                  {dashboard.recentSales.map((sale, index) => (
                    <div
                      key={`sale-${index}`}
                      className="rounded-xl border border-gray-100 bg-gray-50 p-4"
                    >
                      <strong>{getRowAccountName(sale) || "Unknown Account"}</strong>
                      <p className="mt-1 text-gray-700">{getRowTitle(sale) || "Sale"}</p>
                      <p className="mt-1 text-sm text-gray-500">
                        {formatMoney(getSaleAmount(sale))} · {getDisplayDate(sale)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </main>
  );
}