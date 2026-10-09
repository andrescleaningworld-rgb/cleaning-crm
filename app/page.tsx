"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BigButton, Counts, EmptyState, PullToRefresh, Screen, SkeletonList, StatusPill, Tile, Tips } from "@/app/ui";

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

// Mirrors the "Active" bucket of STATUS_CATEGORY_MAP in app/accounts/page.tsx
// so this dashboard's count agrees with the Accounts page's own Active stat.
function isAccountActive(row: AnyRow): boolean {
  const status = cleanLower(getAccountStatus(row));
  return status === "active" || status === "active account" || status === "current";
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
    // Matches app/to-do/page.tsx's own loadTodos() — without this, a plain
    // fetch() defaults to the browser's normal HTTP cache mode, which can
    // serve a stale response instead of always hitting the API fresh.
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

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>({
    accounts: [],
    visits: [],
    complaints: [],
    supplyOrders: [],
    todos: [],
  });

  const [loading, setLoading] = useState(true);
  // Open problems the crew reported, per account (best effort: none on failure).
  const [crewProblems, setCrewProblems] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/team-hub/open-counts", { cache: "no-store" })
      .then((res) => res.json())
      .then((body: { countsByAccountId?: Record<string, number> }) => {
        if (!cancelled) setCrewProblems(body.countsByAccountId ?? {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard(showLoading: boolean) {
      if (showLoading) setLoading(true);

      const [accounts, visits, complaints, supplyOrders, todos] =
        await Promise.all([
          safeReadData("/api/accounts", "Accounts"),
          safeReadData("/api/visits", "Visits"),
          safeReadData("/api/complaints", "Complaints"),
          safeReadData("/api/supply-orders", "Supply Orders"),
          safeReadData("/api/to-do", "To-Dos"),
        ]);

      if (cancelled) return;

      setData({
        accounts,
        visits,
        complaints,
        supplyOrders,
        todos,
      });

      if (showLoading) setLoading(false);
    }

    void loadDashboard(true);

    // The mount-only load above never re-runs on its own — a manager who
    // creates a to-do on /to-do and comes back to this tab would otherwise
    // keep seeing whatever "Today's Manager To-Dos" looked like at the
    // start of the session. Refetch (silently — no loading flash, so
    // already-visible cards never blank mid-refresh) whenever this tab
    // regains focus/visibility, which is the realistic moment this data
    // needs to be current.
    function handleFocusOrVisible() {
      if (document.visibilityState === "visible") {
        void loadDashboard(false);
      }
    }

    document.addEventListener("visibilitychange", handleFocusOrVisible);
    window.addEventListener("focus", handleFocusOrVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleFocusOrVisible);
      window.removeEventListener("focus", handleFocusOrVisible);
    };
  }, []);

  const dashboard = useMemo(() => {
    const rawAccounts = data.accounts;
    const uniqueAccounts = dedupeAccountsByName(rawAccounts);
    const revenueAccounts = uniqueAccounts.filter(isRevenueAccount);
    const activeAccounts = uniqueAccounts.filter(isAccountActive);

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

    // The same rule as "Need you" on Accounts Center, so the number here and
    // the list it opens agree: not cancelled, and either High Risk or an open
    // problem from the crew. (It used to also count "needs attention" health.)
    const accountsNeedingAttention = rawAccounts.filter((account) => {
      const status = cleanLower(getAccountStatus(account));
      if (["cancel", "lost", "terminated", "closed"].some((word) => status.includes(word))) return false;
      if ((crewProblems[getAccountId(account)] ?? 0) > 0) return true;
      return cleanLower(getAccountHealth(account)).includes("high risk");
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
      activeAccounts,
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
  }, [data, crewProblems]);

  const [showMore, setShowMore] = useState(false);
  const [showMoney, setShowMoney] = useState(false);

  useEffect(() => {
    // Deferred read: localStorage isn't available during SSR. Same switch
    // as "Money hidden" on Accounts Center, so one tap covers both.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowMoney(window.localStorage.getItem("cwAccountsShowMoney") === "1");
    } catch {
      // Private mode: money simply starts hidden.
    }
  }, []);

  function toggleMoney() {
    const next = !showMoney;
    setShowMoney(next);
    try {
      window.localStorage.setItem("cwAccountsShowMoney", next ? "1" : "0");
    } catch {
      // Not remembered, still switched for now.
    }
  }

  const overdue = dashboard.overdueTodos.length;
  const openComplaints = dashboard.openComplaints.length;
  const needYou = dashboard.accountsNeedingAttention.length;
  const newOrders = dashboard.newSupplyOrders.length;

  return (
    <Screen title="Dashboard">
      <Tips
        id="dashboard"
        ready={!loading}
        steps={[
          { target: '[data-tip="counts"]', text: "These numbers are what needs you today. Tap one to see the list." },
          { target: '[data-tip="todos"]', text: "Tap a to-do to open it." },
          { target: '[data-tip="tiles"]', text: "Tap a green tile to go to that part of the app." },
        ]}
      />
      <PullToRefresh onRefresh={() => {
          window.dispatchEvent(new Event("focus"));
        }} />

      {loading ? (
        <SkeletonList rows={4} />
      ) : (
        <>
          {/* The situation in two seconds. Red only when there is a problem. */}
          <Counts
            data-tip="counts"
            items={[
              { label: "Overdue to-dos", value: formatNumber(overdue), tone: overdue > 0 ? "bad" : "good", href: "/to-do?filter=overdue" },
              { label: "Open complaints", value: formatNumber(openComplaints), tone: openComplaints > 0 ? "bad" : "good", href: "/complaints?status=open" },
              { label: "Accounts need you", value: formatNumber(needYou), tone: needYou > 0 ? "bad" : "good", href: "/accounts-center?show=need-you" },
              { label: "Visits this month", value: formatNumber(dashboard.visitsThisMonth.length), tone: "info", href: "/visits" },
              { label: "Active accounts", value: formatNumber(dashboard.activeAccounts.length), tone: "good", href: "/accounts-center?show=active" },
            ]}
          />

          {/* The one main list: what to do next. */}
          <section className="ui-screen-body" aria-label="To-dos to do next">
            <div className="ui-card-row">
              <h2 className="ui-section-title">Do next</h2>
              <Link className="ui-btn ui-btn-second" href="/to-do">
                All to-dos
              </Link>
            </div>

            {dashboard.recentTodos.length === 0 ? (
              <EmptyState title="No to-dos open" text="Tap Add to-do to make one." action={<BigButton href="/to-do?add=1">Add to-do</BigButton>} />
            ) : (
              <ul className="ui-acct-list" data-tip="todos">
                {dashboard.recentTodos.map((todo, index) => {
                  const id = cleanText(getValue(todo, ["id", "ID", "toDoId", "todoId"]));
                  return (
                    <li key={`todo-${id || index}`}>
                      <Link href={id ? `/to-do?id=${encodeURIComponent(id)}` : "/to-do"} className={`ui-acct ui-acct-link ${isToDoOverdue(todo) ? "ui-acct-problem" : ""}`.trim()}>
                        <span className="ui-acct-name">{getToDoAccount(todo) || "No account"}</span>
                        <span className="ui-actions-row">
                          {isToDoOverdue(todo) ? <StatusPill kind="needs-you">Overdue</StatusPill> : <StatusPill kind="waiting">{getToDoStatus(todo) || "Open"}</StatusPill>}
                          <StatusPill kind="off">{getToDoTaskType(todo) || "Task"}</StatusPill>
                        </span>
                        <span className="ui-acct-line">{getToDoWhy(todo) || "No reason entered."}</span>
                        <span className="ui-acct-line">
                          {getToDoAssignedTo(todo) || "Nobody yet"} · Due {getDisplayDueDate(todo)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Where to go. */}
          <div className="ui-acttiles" data-tip="tiles">
            <Tile icon="todo" label="To-Do" detail={overdue > 0 ? `${overdue} overdue` : undefined} href="/to-do" />
            <Tile icon="problem" label="Complaints" detail={openComplaints > 0 ? `${openComplaints} open` : undefined} href="/complaints" />
            <Tile icon="visit" label="Visits" href="/visits" />
            <Tile icon="note" label="Supply Orders" detail={newOrders > 0 ? `${newOrders} new` : undefined} href="/supply-orders" />
            <Tile icon="key" label="Supplies" href="/supplies" />
            <Tile icon="call" label="Crew Link" href="/crew-link" />
            <Tile icon="money" label="Sales" href="/sales" />
            <Tile icon="status" label="Subcontractors" href="/subcontractors" />
            <Tile icon="print" label="Reports" href="/reports" />
            <Tile icon="more" label={showMore ? "Less" : "More"} onClick={() => setShowMore((value) => !value)} aria-expanded={showMore} aria-controls="dashboard-more" />
          </div>

          {/* One tap deeper: the accounts that need you, the latest complaints and orders, money. */}
          <div id="dashboard-more" hidden={!showMore} className="ui-screen-body">
            <section className="ui-screen-body" aria-label="Accounts that need you">
              <div className="ui-card-row">
                <h2 className="ui-section-title">Accounts that need you</h2>
                <Link className="ui-btn ui-btn-second" href="/accounts-center?show=need-you">
                  See all
                </Link>
              </div>
              {dashboard.accountsNeedingAttention.length === 0 ? (
                <p className="ui-muted">None. No account is High Risk and the crew has no open problems.</p>
              ) : (
                <ul className="ui-acct-list">
                  {dashboard.accountsNeedingAttention.slice(0, 8).map((account, index) => {
                    const id = getAccountId(account);
                    return (
                      <li key={`attention-${index}`}>
                        <Link href={id ? `/accounts/${encodeURIComponent(id)}` : "/accounts-center"} className="ui-acct ui-acct-link ui-acct-problem">
                          <span className="ui-acct-name">{getAccountName(account) || "Unnamed Account"}</span>
                          <span className="ui-actions-row">
                            <StatusPill kind="needs-you">{getAccountHealth(account) || "Needs you"}</StatusPill>
                            <StatusPill kind="off">{getAccountStatus(account) || "No status"}</StatusPill>
                          </span>
                          <span className="ui-acct-line">
                            Manager: {getAccountManager(account) || "-"} · Sub: {getAccountSubcontractor(account) || "-"}
                          </span>
                          {showMoney ? <span className="ui-acct-line">{formatMoney(getMonthlyRevenue(account))} a month</span> : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="ui-screen-body" aria-label="Recent complaints">
              <div className="ui-card-row">
                <h2 className="ui-section-title">Recent complaints</h2>
                <Link className="ui-btn ui-btn-second" href="/complaints">
                  See all
                </Link>
              </div>
              {dashboard.recentComplaints.length === 0 ? (
                <p className="ui-muted">No complaints yet.</p>
              ) : (
                <ul className="ui-acct-list">
                  {dashboard.recentComplaints.map((complaint, index) => {
                    const id = cleanText(getValue(complaint, ["id", "ID", "complaintId", "rowNumber"]));
                    const open = isComplaintOpen(complaint);
                    return (
                      <li key={`complaint-${index}`}>
                        <Link href={id ? `/complaints/${encodeURIComponent(id)}` : "/complaints"} className={`ui-acct ui-acct-link ${open ? "ui-acct-problem" : ""}`.trim()}>
                          <span className="ui-acct-name">{getRowAccountName(complaint) || "Unknown Account"}</span>
                          <span className="ui-actions-row">
                            <StatusPill kind={open ? "needs-you" : "done"}>{getComplaintStatus(complaint) || "Open"}</StatusPill>
                          </span>
                          <span className="ui-acct-line">{getRowTitle(complaint) || "Complaint"}</span>
                          <span className="ui-acct-line">{getDisplayDate(complaint)}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="ui-screen-body" aria-label="Recent supply orders">
              <div className="ui-card-row">
                <h2 className="ui-section-title">Recent supply orders</h2>
                <Link className="ui-btn ui-btn-second" href="/supply-orders">
                  See all
                </Link>
              </div>
              {dashboard.recentSupplyOrders.length === 0 ? (
                <p className="ui-muted">No supply orders yet.</p>
              ) : (
                <ul className="ui-acct-list">
                  {dashboard.recentSupplyOrders.map((order, index) => (
                    <li key={`supply-order-${index}`}>
                      <Link href="/supply-orders" className="ui-acct ui-acct-link">
                        <span className="ui-acct-name">{getRowAccountName(order) || "Unknown Account"}</span>
                        <span className="ui-actions-row">
                          <StatusPill kind={isNewSupplyOrder(order) ? "waiting" : "off"}>{getSupplyOrderStatus(order) || "No status"}</StatusPill>
                        </span>
                        <span className="ui-acct-line">{getSupplyOrderTitle(order) || "Supply Order"}</span>
                        <span className="ui-acct-line">{getDisplayDate(order)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <BigButton kind="second" onClick={() => window.print()}>
              Print
            </BigButton>

            <button type="button" className="ui-money-toggle" aria-pressed={showMoney} onClick={toggleMoney}>
              {showMoney ? "Money showing · tap to hide" : "Money hidden · tap to show"}
            </button>
            {showMoney ? (
              <div className="ui-stats">
                <Link href="/accounts-center?show=active" className="ui-stat">
                  <p className="ui-stat-label">Monthly Revenue</p>
                  <p className="ui-stat-value">{formatMoney(dashboard.monthlyRevenue)}</p>
                  <p className="ui-muted">{formatNumber(dashboard.revenueAccounts.length)} active revenue accounts</p>
                </Link>
                <Link href="/subcontractors" className="ui-stat">
                  <p className="ui-stat-label">Monthly Sub Pay</p>
                  <p className="ui-stat-value">{formatMoney(dashboard.monthlySubcontractorPay)}</p>
                  <p className="ui-muted">Revenue accounts only</p>
                </Link>
                <Link href="/reports" className="ui-stat">
                  <p className="ui-stat-label">Gross Margin</p>
                  <p className="ui-stat-value">{formatMoney(dashboard.grossMargin)}</p>
                  <p className="ui-muted">{formatPercent(dashboard.grossMarginPercent)}</p>
                </Link>
              </div>
            ) : null}
          </div>
        </>
      )}
    </Screen>
  );
}
