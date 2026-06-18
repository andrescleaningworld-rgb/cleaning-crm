"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type AnyRow = Record<string, unknown>;

type DashboardData = {
  accounts: AnyRow[];
  visits: AnyRow[];
  complaints: AnyRow[];
  supplyOrders: AnyRow[];
  todos: AnyRow[];
};

type ApiResponse = {
  data?: AnyRow[];
  accounts?: AnyRow[];
  visits?: AnyRow[];
  complaints?: AnyRow[];
  supplyOrders?: AnyRow[];
  todos?: AnyRow[];
  orders?: AnyRow[];
  rows?: AnyRow[];
};

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("en-US");

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function cleanLower(value: unknown): string {
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

function parseMoney(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const cleaned = cleanText(value)
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

function getValue(row: AnyRow, possibleKeys: string[]): unknown {
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

    if (
      found &&
      found.value !== undefined &&
      found.value !== null &&
      found.value !== ""
    ) {
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

    const existing = map.get(key);
    if (!existing) continue;

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
    "Created Date",
    "createdDate",
    "Visit Date",
    "visitDate",
    "Complaint Date",
    "complaintDate",
    "Order Date",
    "orderDate",
    "Request Date",
    "requestDate",
    "Submitted At",
    "submittedAt",
    "Due Date",
    "dueDate",
  ]);

  if (!rawDate) return null;

  const parsed = new Date(cleanText(rawDate));
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

function getDueDate(row: AnyRow): Date | null {
  const rawDate = getValue(row, ["Due Date", "dueDate"]);
  if (!rawDate) return null;

  const parsed = new Date(cleanText(rawDate));
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed;
}

function getDisplayDueDate(row: AnyRow): string {
  const date = getDueDate(row);
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

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
}

function getComplaintStatus(row: AnyRow): string {
  return cleanText(
    getValue(row, ["Status", "status", "Complaint Status", "complaintStatus"])
  );
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

function getSupplyOrderStatus(row: AnyRow): string {
  return cleanText(
    getValue(row, [
      "Status",
      "status",
      "Order Status",
      "orderStatus",
      "Supply Order Status",
      "supplyOrderStatus",
    ])
  );
}

function isNewSupplyOrder(row: AnyRow): boolean {
  const status = cleanLower(getSupplyOrderStatus(row));

  if (!status) return false;

  return (
    status === "new" ||
    status === "requested" ||
    status === "submitted" ||
    status.includes("new order") ||
    status.includes("new request")
  );
}

function getSupplyOrderTitle(row: AnyRow): string {
  return cleanText(
    getValue(row, [
      "Supply Item",
      "supplyItem",
      "Item",
      "item",
      "Items",
      "items",
      "Order",
      "order",
      "Title",
      "title",
    ])
  );
}

function getToDoStatus(row: AnyRow): string {
  return cleanText(getValue(row, ["Status", "status"]));
}

function isToDoOpen(row: AnyRow): boolean {
  const status = cleanLower(getToDoStatus(row));

  if (!status) return true;

  return !(
    status.includes("done") ||
    status.includes("completed") ||
    status.includes("cancelled") ||
    status.includes("canceled")
  );
}

function isToDoOverdue(row: AnyRow): boolean {
  if (!isToDoOpen(row)) return false;

  const dueDate = getDueDate(row);
  if (!dueDate) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  dueDate.setHours(0, 0, 0, 0);

  return dueDate < today;
}

function getToDoAccount(row: AnyRow): string {
  return cleanText(
    getValue(row, ["Account", "Account Name", "account", "accountName"])
  );
}

function getToDoAssignedTo(row: AnyRow): string {
  return cleanText(getValue(row, ["Assigned to", "Assigned To", "assignedTo"]));
}

function getToDoTaskType(row: AnyRow): string {
  return cleanText(getValue(row, ["Task Type", "taskType"]));
}

function getToDoWhy(row: AnyRow): string {
  return cleanText(getValue(row, ["Why", "why", "Reason", "Reason / Why"]));
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
      "Complaint Type",
      "complaintType",
      "Visit Type",
      "visitType",
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

    let json: ApiResponse | AnyRow[];

    try {
      json = JSON.parse(text) as ApiResponse | AnyRow[];
    } catch {
      console.warn(`${key} API did not return JSON:`, text.slice(0, 300));
      return [];
    }

    if (Array.isArray(json)) return json;
    if (Array.isArray(json.data)) return json.data;
    if (Array.isArray(json.accounts)) return json.accounts;
    if (Array.isArray(json.visits)) return json.visits;
    if (Array.isArray(json.complaints)) return json.complaints;
    if (Array.isArray(json.supplyOrders)) return json.supplyOrders;
    if (Array.isArray(json.todos)) return json.todos;
    if (Array.isArray(json.orders)) return json.orders;
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
  href,
}: {
  label: string;
  value: string;
  note?: string;
  href?: string;
}) {
  const content = (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
        {value}
      </h2>
      {note ? <p className="mt-2 text-sm text-gray-500">{note}</p> : null}
    </div>
  );

  if (!href) return content;

  return (
    <Link href={href} className="block">
      {content}
    </Link>
  );
}

function DashboardButton({
  href,
  label,
  badgeCount = 0,
}: {
  href: string;
  label: string;
  badgeCount?: number;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-bold text-gray-900 shadow-sm hover:bg-gray-50"
    >
      <span>{label}</span>
      {badgeCount > 0 ? (
        <span className="ml-2 inline-flex items-center rounded-full bg-red-600 px-2 py-1 text-xs font-bold text-white">
          🔔 {badgeCount}
        </span>
      ) : null}
    </Link>
  );
}

function QuickLink({
  href,
  title,
  note,
}: {
  href: string;
  title: string;
  note: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md"
    >
      <h3 className="font-bold text-gray-900">{title}</h3>
      <p className="mt-2 text-sm text-gray-500">{note}</p>
    </Link>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>({
    accounts: [],
    visits: [],
    complaints: [],
    supplyOrders: [],
    todos: [],
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);

      const [accounts, visits, complaints, supplyOrders, todos] =
        await Promise.all([
          safeReadData("/api/accounts", "Accounts"),
          safeReadData("/api/visits", "Visits"),
          safeReadData("/api/complaints", "Complaints"),
          safeReadData("/api/supply-orders", "Supply Orders"),
          safeReadData("/api/to-do", "To-Dos"),
        ]);

      setData({
        accounts,
        visits,
        complaints,
        supplyOrders,
        todos,
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

    const visitsThisMonth = data.visits.filter(isThisMonth);
    const openComplaints = data.complaints.filter(isComplaintOpen);
    const newSupplyOrders = data.supplyOrders.filter(isNewSupplyOrder);

    const openTodos = data.todos.filter(isToDoOpen);
    const overdueTodos = data.todos.filter(isToDoOverdue);

    const accountsNeedingAttention = revenueAccounts.filter((account) => {
      const health = cleanLower(getAccountHealth(account));

      return (
        health.includes("high risk") ||
        health.includes("needs attention") ||
        health.includes("problem") ||
        health.includes("bad")
      );
    });

    const recentTodos = [...openTodos]
      .sort((a, b) => {
        const dateA = getDueDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const dateB = getDueDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return dateA - dateB;
      })
      .slice(0, 6);

    const recentComplaints = [...data.complaints]
      .sort((a, b) => {
        const dateA = getDate(a)?.getTime() ?? 0;
        const dateB = getDate(b)?.getTime() ?? 0;
        return dateB - dateA;
      })
      .slice(0, 5);

    const recentSupplyOrders = [...data.supplyOrders]
      .sort((a, b) => {
        const dateA = getDate(a)?.getTime() ?? 0;
        const dateB = getDate(b)?.getTime() ?? 0;
        return dateB - dateA;
      })
      .slice(0, 5);

    return {
      rawAccounts,
      revenueAccounts,
      monthlyRevenue,
      monthlySubcontractorPay,
      grossMargin,
      grossMarginPercent,
      visitsThisMonth,
      openComplaints,
      newSupplyOrders,
      openTodos,
      overdueTodos,
      recentTodos,
      accountsNeedingAttention,
      recentComplaints,
      recentSupplyOrders,
    };
  }, [data]);

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6 text-gray-900 sm:px-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
            Cleaning World
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            Operations Command Center
          </h1>
          <p className="mt-2 text-gray-500">
            Faster daily view focused on urgent tasks, visits, complaints,
            supply orders, and accounts needing attention.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <DashboardButton
            href="/to-do"
            label="To-Do List"
            badgeCount={dashboard.overdueTodos.length}
          />
          <DashboardButton
            href="/complaints"
            label="Complaints"
            badgeCount={dashboard.openComplaints.length}
          />
          <DashboardButton href="/supplies" label="Supplies" />
          <DashboardButton
            href="/supply-orders"
            label="Supply Orders"
            badgeCount={dashboard.newSupplyOrders.length}
          />
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-xl bg-gray-900 px-5 py-3 text-sm font-bold text-white"
          >
            Print
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          Loading command center...
        </div>
      ) : (
        <>
          <section className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Overdue To-Dos"
              value={formatNumber(dashboard.overdueTodos.length)}
              note="Needs attention first"
              href="/to-do"
            />

            <StatCard
              label="Visits This Month"
              value={formatNumber(dashboard.visitsThisMonth.length)}
              note="Field/account visits logged"
              href="/visits"
            />

            <StatCard
              label="Open Complaints"
              value={formatNumber(dashboard.openComplaints.length)}
              note="Not closed or resolved"
              href="/complaints"
            />

            <StatCard
              label="Accounts Needing Attention"
              value={formatNumber(dashboard.accountsNeedingAttention.length)}
              note="High risk or needs attention"
              href="/accounts"
            />
          </section>

          <section className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Today&apos;s Manager To-Dos</h2>
                <p className="text-sm text-gray-600">
                  Open tasks sorted by due date. Use this first when assigning
                  or checking work.
                </p>
              </div>

              <Link className="font-bold text-blue-700" href="/to-do">
                View all
              </Link>
            </div>

            {dashboard.recentTodos.length === 0 ? (
              <p className="text-gray-500">No open to-dos found.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {dashboard.recentTodos.map((todo, index) => (
                  <Link
                    key={`todo-${index}`}
                    href="/to-do"
                    className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm hover:border-blue-300"
                  >
                    <div className="mb-2 flex flex-wrap gap-2">
                      <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-bold text-blue-700">
                        {getToDoTaskType(todo) || "Task"}
                      </span>

                      {isToDoOverdue(todo) ? (
                        <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700">
                          Overdue
                        </span>
                      ) : null}

                      <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-bold text-gray-700">
                        {getToDoStatus(todo) || "Open"}
                      </span>
                    </div>

                    <strong>{getToDoAccount(todo) || "No account"}</strong>

                    <p className="mt-1 text-sm text-gray-700">
                      {getToDoWhy(todo) || "No reason entered."}
                    </p>

                    <p className="mt-2 text-xs text-gray-500">
                      Assigned to: {getToDoAssignedTo(todo) || "-"} · Due:{" "}
                      {getDisplayDueDate(todo)}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            <StatCard
              label="Monthly Revenue"
              value={formatMoney(dashboard.monthlyRevenue)}
              note={`${formatNumber(
                dashboard.revenueAccounts.length
              )} active revenue accounts`}
              href="/accounts"
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
                    {dashboard.accountsNeedingAttention
                      .slice(0, 8)
                      .map((account, index) => {
                        const id = getAccountId(account);
                        const name =
                          getAccountName(account) || "Unnamed Account";
                        const href = id
                          ? `/accounts/${encodeURIComponent(id)}`
                          : "/accounts";

                        return (
                          <tr
                            key={`attention-${index}`}
                            className="border-b last:border-b-0"
                          >
                            <td className="p-3">
                              <Link
                                className="font-bold hover:text-blue-600"
                                href={href}
                              >
                                {name}
                              </Link>
                            </td>
                            <td className="p-3">
                              {getAccountStatus(account) || "-"}
                            </td>
                            <td className="p-3">
                              {getAccountHealth(account) || "-"}
                            </td>
                            <td className="p-3">
                              {getAccountManager(account) || "-"}
                            </td>
                            <td className="p-3">
                              {getAccountSubcontractor(account) || "-"}
                            </td>
                            <td className="p-3 text-right">
                              {formatMoney(getMonthlyRevenue(account))}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="mb-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
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
                      <strong>
                        {getRowAccountName(complaint) || "Unknown Account"}
                      </strong>
                      <p className="mt-1 text-gray-700">
                        {getRowTitle(complaint) || "Complaint"}
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        {getComplaintStatus(complaint) || "Open"} ·{" "}
                        {getDisplayDate(complaint)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold">Recent Supply Orders</h2>
                <Link className="font-bold text-blue-600" href="/supply-orders">
                  View
                </Link>
              </div>

              {dashboard.recentSupplyOrders.length === 0 ? (
                <p className="text-gray-500">No supply orders found.</p>
              ) : (
                <div className="space-y-3">
                  {dashboard.recentSupplyOrders.map((order, index) => (
                    <div
                      key={`supply-order-${index}`}
                      className="rounded-xl border border-gray-100 bg-gray-50 p-4"
                    >
                      <strong>
                        {getRowAccountName(order) || "Unknown Account"}
                      </strong>
                      <p className="mt-1 text-gray-700">
                        {getSupplyOrderTitle(order) || "Supply Order"}
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        {getSupplyOrderStatus(order) || "No status"} ·{" "}
                        {getDisplayDate(order)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-xl font-bold">Quick Links</h2>
              <p className="text-sm text-gray-500">
                Heavier pages only load when you click them.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <QuickLink
                href="/visits"
                title="Visits"
                note="View or add account visits."
              />
              <QuickLink
                href="/sales"
                title="Sales"
                note="Sales and commissions."
              />
              <QuickLink
                href="/subcontractors"
                title="Subcontractors"
                note="Sub list, accounts, and performance."
              />
              <QuickLink
                href="/reports"
                title="Reports"
                note="Print and review reports."
              />
            </div>
          </section>
        </>
      )}
    </main>
  );
}