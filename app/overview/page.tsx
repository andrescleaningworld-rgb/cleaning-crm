"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isToDoDoneThisWeek } from "@/lib/toDoWeek";
import MyWork from "../components/my-work";
import AccountLink from "../components/AccountLink";
import { BigButton, CHEER, Counts, EmptyState, ErrorBox, PullToRefresh, Screen, SkeletonList, StatusPill, Tile, Tips } from "@/app/ui";
import {
  attentionItems,
  LIGHT_SYMBOL,
  LIGHT_WORD,
  OVERVIEW_THRESHOLDS,
  sectionLights,
  summarySentences,
  type Light,
  type OverviewFacts,
  type SectionKey as OverviewSectionKey,
} from "@/lib/overviewHealth";
import MonthBars, { type MonthValue } from "./month-bars";
import { shareOfRevenue } from "@/lib/payShare";
import styles from "./overview.module.css";

type AnyRow = Record<string, unknown>;

type DashboardData = {
  accounts: AnyRow[];
  visits: AnyRow[];
  complaints: AnyRow[];
  supplyOrders: AnyRow[];
  todos: AnyRow[];
};

type SectionKey = keyof DashboardData;
type SectionStatus = "loading" | "ready" | "failed";

// Each part of the dashboard loads on its own, so one slow or broken source
// only affects the cards that need it.
const SECTIONS: Record<SectionKey, { url: string; label: string }> = {
  accounts: { url: "/api/accounts", label: "Accounts" },
  visits: { url: "/api/visits", label: "Visits" },
  complaints: { url: "/api/complaints", label: "Complaints" },
  supplyOrders: { url: "/api/supply-orders", label: "Supply Orders" },
  todos: { url: "/api/to-do", label: "To-Dos" },
};
const SECTION_KEYS = Object.keys(SECTIONS) as SectionKey[];

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

// The account a to-do, complaint or supply order is about (not the record's own ID).
function getRecordAccountId(row: AnyRow): string {
  return cleanText(getValue(row, ["accountId", "Account ID", "account_id"]));
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

// Which data each Overview section is counted from.
const SOURCES_OF: Record<OverviewSectionKey, SectionKey[]> = {
  money: ["accounts"],
  complaints: ["complaints"],
  visits: ["visits", "accounts"],
  accounts: ["accounts"],
  supplies: ["supplyOrders"],
  activity: ["todos"],
};

// "2026-10-03" (the account list sends the start day this way) → that day, local time.
function getStartDate(row: AnyRow): Date | null {
  const raw = cleanText(getValue(row, ["accountStartDate", "Account Start Date", "startDate", "Start Date"]));
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const parsed = raw ? new Date(raw) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
}

function getCancelledDate(row: AnyRow): Date | null {
  const raw = cleanText(getValue(row, ["cancelledDate", "Cancelled Date", "canceledDate"]));
  const parsed = raw ? new Date(raw) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
}

function isCancelledAccount(row: AnyRow): boolean {
  const status = cleanLower(getAccountStatus(row));
  return status.includes("cancel");
}

function sameMonth(date: Date | null, now: Date): boolean {
  return date !== null && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function daysAgo(date: Date, now: Date): number {
  return Math.floor((now.getTime() - date.getTime()) / 86_400_000);
}

// The last `count` months, oldest first, this month last: "May", "Jun", …
function lastMonths(now: Date, count: number): { year: number; month: number; label: string }[] {
  const months: { year: number; month: number; label: string }[] = [];
  for (let back = count - 1; back >= 0; back--) {
    const day = new Date(now.getFullYear(), now.getMonth() - back, 1);
    months.push({ year: day.getFullYear(), month: day.getMonth(), label: day.toLocaleDateString("en-US", { month: "short" }) });
  }
  return months;
}

function countByMonth(dates: (Date | null)[], months: { year: number; month: number; label: string }[]): MonthValue[] {
  return months.map((m) => ({
    label: m.label,
    value: dates.filter((date) => date !== null && date.getFullYear() === m.year && date.getMonth() === m.month).length,
  }));
}

// Null means the source did not answer; an empty list means it answered with
// nothing.
async function safeReadData(url: string, key: string): Promise<AnyRow[] | null> {
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
      return null;
    }

    let json: ApiResponse | AnyRow[];

    try {
      json = JSON.parse(text) as ApiResponse | AnyRow[];
    } catch {
      console.warn(`${key} API did not return JSON:`, text.slice(0, 300));
      return null;
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
    return null;
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

  const [status, setStatus] = useState<Record<SectionKey, SectionStatus>>({
    accounts: "loading",
    visits: "loading",
    complaints: "loading",
    supplyOrders: "loading",
    todos: "loading",
  });
  const alive = useRef(true);
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

  const loadSection = useCallback(async (key: SectionKey) => {
    const rows = await safeReadData(SECTIONS[key].url, SECTIONS[key].label);
    if (!alive.current) return;

    if (rows) {
      setData((current) => ({ ...current, [key]: rows }));
      setStatus((current) => (current[key] === "ready" ? current : { ...current, [key]: "ready" }));
      return;
    }

    // A failed refresh keeps what is already on screen; only a section that
    // has nothing to show turns into the red box.
    setStatus((current) => (current[key] === "ready" ? current : { ...current, [key]: "failed" }));
  }, []);

  function retrySection(key: SectionKey) {
    setStatus((current) => ({ ...current, [key]: "loading" }));
    void loadSection(key);
  }

  useEffect(() => {
    alive.current = true;

    function loadAll() {
      for (const key of SECTION_KEYS) void loadSection(key);
    }

    loadAll();

    // The mount-only load above never re-runs on its own — a manager who
    // creates a to-do on /to-do and comes back to this tab would otherwise
    // keep seeing whatever "Today's Manager To-Dos" looked like at the
    // start of the session. Refetch (silently — no loading flash, so
    // already-visible cards never blank mid-refresh) whenever this tab
    // regains focus/visibility, which is the realistic moment this data
    // needs to be current.
    function handleFocusOrVisible() {
      if (document.visibilityState === "visible") {
        loadAll();
      }
    }

    document.addEventListener("visibilitychange", handleFocusOrVisible);
    window.addEventListener("focus", handleFocusOrVisible);

    return () => {
      alive.current = false;
      document.removeEventListener("visibilitychange", handleFocusOrVisible);
      window.removeEventListener("focus", handleFocusOrVisible);
    };
  }, [loadSection]);

  const dashboard = useMemo(() => {
    const now = new Date();
    const rawAccounts = data.accounts;
    const uniqueAccounts = dedupeAccountsByName(rawAccounts);
    const revenueAccounts = uniqueAccounts.filter(isRevenueAccount);
    const activeAccounts = uniqueAccounts.filter(isAccountActive);

    const monthlyRevenue = revenueAccounts.reduce((total, account) => total + getMonthlyRevenue(account), 0);
    const monthlySubcontractorPay = revenueAccounts.reduce((total, account) => total + getMonthlySubPay(account), 0);
    const grossMargin = monthlyRevenue - monthlySubcontractorPay;
    const grossMarginPercent = monthlyRevenue > 0 ? (grossMargin / monthlyRevenue) * 100 : 0;

    // Started / cancelled this month: from each account's own start and cancel day, at its current price.
    const startedThisMonth = uniqueAccounts.filter((account) => sameMonth(getStartDate(account), now));
    const cancelledThisMonth = uniqueAccounts.filter((account) => isCancelledAccount(account) && sameMonth(getCancelledDate(account), now));

    const visitsThisMonth = data.visits.filter(isThisMonth);
    const openComplaints = data.complaints.filter(isComplaintOpen);
    const oldOpenComplaints = openComplaints.filter((complaint) => {
      const date = getDate(complaint);
      return date !== null && daysAgo(date, now) > OVERVIEW_THRESHOLDS.complaints.openProblemAfterDays;
    });
    const newSupplyOrders = data.supplyOrders.filter(isNewSupplyOrder);
    const oldSupplyOrders = newSupplyOrders.filter((order) => {
      const date = getDate(order);
      return date !== null && daysAgo(date, now) > OVERVIEW_THRESHOLDS.supplies.waitingProblemAfterDays;
    });

    // Active accounts with no visit in the last 60 days. An account that
    // started less than 60 days ago is not counted (it cannot be late yet).
    const lastVisit = new Map<string, number>();
    for (const visit of data.visits) {
      const date = getDate(visit);
      if (!date) continue;
      for (const key of [cleanLower(getRecordAccountId(visit)) && `id:${cleanLower(getRecordAccountId(visit))}`, getRowAccountName(visit) && `name:${normalizeAccountName(getRowAccountName(visit))}`]) {
        if (key && (lastVisit.get(key) ?? 0) < date.getTime()) lastVisit.set(key, date.getTime());
      }
    }
    const notVisitedDays = OVERVIEW_THRESHOLDS.visits.notVisitedDays;
    const notVisited = activeAccounts
      .filter((account) => {
        const started = getStartDate(account);
        if (started && daysAgo(started, now) < notVisitedDays) return false;
        const last = Math.max(lastVisit.get(`id:${cleanLower(getAccountId(account))}`) ?? 0, lastVisit.get(`name:${normalizeAccountName(getAccountName(account))}`) ?? 0);
        return last === 0 || daysAgo(new Date(last), now) >= notVisitedDays;
      })
      .sort((a, b) => getAccountName(a).localeCompare(getAccountName(b)));

    const noSubAccounts = activeAccounts.filter((account) => !getAccountSubcontractor(account));

    const openTodos = data.todos.filter(isToDoOpen);
    const overdueTodos = data.todos.filter(isToDoOverdue);
    // Done, with a due date (or, with none, a created date) in this week: see lib/toDoWeek.ts.
    const doneThisWeekTodos = data.todos.filter((todo) =>
      isToDoDoneThisWeek({
        status: getToDoStatus(todo),
        dueDate: cleanText(getValue(todo, ["Due Date", "dueDate"])),
        createdDate: cleanText(getValue(todo, ["Created Date", "createdDate"])),
      })
    );

    // The same rule as "Need you" on Accounts Center, so the number here and
    // the list it opens agree: not cancelled, and either High Risk or an open
    // problem from the crew.
    const accountsNeedingAttention = rawAccounts.filter((account) => {
      const status = cleanLower(getAccountStatus(account));
      if (["cancel", "lost", "terminated", "closed"].some((word) => status.includes(word))) return false;
      if ((crewProblems[getAccountId(account)] ?? 0) > 0) return true;
      return cleanLower(getAccountHealth(account)).includes("high risk");
    });

    // Last week (Monday to Sunday), for the Monday team card: totals for the
    // whole team, never per person.
    const lastWeekDay = new Date();
    lastWeekDay.setDate(lastWeekDay.getDate() - 7);
    const lastWeekStart = new Date(lastWeekDay.getFullYear(), lastWeekDay.getMonth(), lastWeekDay.getDate() - ((lastWeekDay.getDay() + 6) % 7));
    const lastWeekEnd = new Date(lastWeekStart.getFullYear(), lastWeekStart.getMonth(), lastWeekStart.getDate() + 7);
    const inLastWeek = (date: Date | null) => date !== null && date >= lastWeekStart && date < lastWeekEnd;
    const lastWeek = {
      todosDone: data.todos.filter((todo) =>
        isToDoDoneThisWeek(
          { status: getToDoStatus(todo), dueDate: cleanText(getValue(todo, ["Due Date", "dueDate"])), createdDate: cleanText(getValue(todo, ["Created Date", "createdDate"])) },
          lastWeekDay
        )
      ).length,
      visits: data.visits.filter((visit) => inLastWeek(getDate(visit))).length,
      complaints: data.complaints.filter((complaint) => inLastWeek(getDate(complaint))).length,
    };

    const recentTodos = [...openTodos]
      .sort((a, b) => (getDueDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER) - (getDueDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER))
      .slice(0, 6);
    const recentComplaints = [...data.complaints].sort((a, b) => (getDate(b)?.getTime() ?? 0) - (getDate(a)?.getTime() ?? 0)).slice(0, 5);
    const recentSupplyOrders = [...data.supplyOrders].sort((a, b) => (getDate(b)?.getTime() ?? 0) - (getDate(a)?.getTime() ?? 0)).slice(0, 5);

    // Six months of real dates for the charts (this month last).
    const months = lastMonths(now, 6);
    const charts = {
      visits: countByMonth(data.visits.map(getDate), months),
      complaints: countByMonth(data.complaints.map(getDate), months),
      newAccounts: countByMonth(uniqueAccounts.map(getStartDate), months),
    };

    return {
      revenueAccounts,
      activeAccounts,
      monthlyRevenue,
      monthlySubcontractorPay,
      grossMargin,
      grossMarginPercent,
      startedThisMonth,
      cancelledThisMonth,
      visitsThisMonth,
      openComplaints,
      oldOpenComplaints,
      newSupplyOrders,
      oldSupplyOrders,
      notVisited,
      noSubAccounts,
      openTodos,
      overdueTodos,
      doneThisWeekTodos,
      lastWeek,
      recentTodos,
      accountsNeedingAttention,
      recentComplaints,
      recentSupplyOrders,
      charts,
    };
  }, [data, crewProblems]);

  const [openSections, setOpenSections] = useState<Partial<Record<OverviewSectionKey, boolean>>>({});
  const toggleSection = (key: OverviewSectionKey) => setOpenSections((current) => ({ ...current, [key]: !current[key] }));

  const overdue = dashboard.overdueTodos.length;
  const openComplaints = dashboard.openComplaints.length;
  const needYou = dashboard.accountsNeedingAttention.length;
  const newOrders = dashboard.newSupplyOrders.length;

  // A number is only shown once everything it is counted from has loaded:
  // "…" while loading, "–" with a red line when a source failed.
  const failed = (...keys: SectionKey[]) => keys.some((key) => status[key] === "failed");
  const pending = (...keys: SectionKey[]) => keys.some((key) => status[key] === "loading");
  const ready = (...keys: SectionKey[]) => keys.every((key) => status[key] === "ready");
  const countValue = (count: number, ...keys: SectionKey[]) => (failed(...keys) ? "–" : pending(...keys) ? "…" : formatNumber(count));
  const countNote = (...keys: SectionKey[]) => (failed(...keys) ? "Did not load" : undefined);
  const countTone = (tone: "good" | "bad" | "info", ...keys: SectionKey[]) => (failed(...keys) || pending(...keys) ? "off" : tone);

  // Only what loaded is described; a part that did not load is left out, never guessed.
  const facts: OverviewFacts = {
    money: ready("accounts")
      ? {
          moneyIn: dashboard.monthlyRevenue,
          paidToSubs: dashboard.monthlySubcontractorPay,
          weKeep: dashboard.grossMargin,
          weKeepPercent: dashboard.grossMarginPercent,
          billedAccounts: dashboard.revenueAccounts.length,
          startedThisMonth: { count: dashboard.startedThisMonth.length, moneyIn: dashboard.startedThisMonth.reduce((sum, a) => sum + getMonthlyRevenue(a), 0) },
          cancelledThisMonth: { count: dashboard.cancelledThisMonth.length, moneyIn: dashboard.cancelledThisMonth.reduce((sum, a) => sum + getMonthlyRevenue(a), 0) },
        }
      : null,
    complaints: ready("complaints") ? { open: openComplaints, openOld: dashboard.oldOpenComplaints.length } : null,
    visits: ready("visits", "accounts") ? { thisMonth: dashboard.visitsThisMonth.length, notVisited: dashboard.notVisited.length } : null,
    accounts: ready("accounts") ? { active: dashboard.activeAccounts.length, needYou, noSub: dashboard.noSubAccounts.length } : null,
    supplies: ready("supplyOrders") ? { waiting: newOrders, waitingOld: dashboard.oldSupplyOrders.length } : null,
    activity: ready("todos") ? { overdue, open: dashboard.openTodos.length, doneThisWeek: dashboard.doneThisWeekTodos.length } : null,
  };
  const lights = sectionLights(facts);
  const sentences = summarySentences(facts);
  const attention = attentionItems(facts);
  const stillLoading = pending(...SECTION_KEYS);
  const notLoaded = SECTION_KEYS.filter((key) => status[key] === "failed").map((key) => SECTIONS[key].label);
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const section = (key: OverviewSectionKey, name: string, headline: { number: string; words: string }, body: ReactNode) => {
    const open = Boolean(openSections[key]);
    const light = lights[key];
    const checking = pending(...SOURCES_OF[key]);
    return (
      <section className={styles.section} aria-label={name}>
        <button type="button" className={styles.sectionHead} aria-expanded={open} aria-controls={`overview-${key}`} onClick={() => toggleSection(key)}>
          <h2 className={styles.sectionName}>{name}</h2>
          <LightBadge light={light} checking={checking} />
          <span className={styles.headline}>
            <span className={styles.bigNumber}>{headline.number}</span>
            <span className={styles.headlineWords}>{headline.words}</span>
          </span>
          <span className={styles.openHint}>{open ? "Tap to close ▲" : "Tap to see more ▼"}</span>
        </button>
        {open ? (
          <div id={`overview-${key}`} className={styles.sectionBody}>
            {body}
          </div>
        ) : null}
      </section>
    );
  };

  const value = (n: number, ...keys: SectionKey[]) => (failed(...keys) ? "–" : pending(...keys) ? "…" : formatNumber(n));
  const moneyValue = (n: number) => (failed("accounts") ? "–" : pending("accounts") ? "…" : formatMoney(n));
  const keepPerHundred = Math.round(dashboard.grossMarginPercent);

  return (
    <Screen title="Overview">
      <Tips
        id="dashboard"
        ready={!stillLoading}
        steps={[
          { target: '[data-tip="summary"]', text: "Start here: how we are doing, in a few sentences." },
          { target: '[data-tip="attention"]', text: "What needs attention first. Tap See it to go there." },
          { target: '[data-tip="sections"]', text: "Each part has a light: GOOD, WATCH or PROBLEM. Tap one to see more." },
        ]}
      />
      <PullToRefresh
        onRefresh={() => {
          window.dispatchEvent(new Event("focus"));
        }}
      />

      <div className={`${styles.page} ${styles.stack}`}>
        <div className={styles.topRow}>
          <p className={styles.note}>{today}</p>
          <span className={styles.noPrint}>
            <BigButton kind="second" className={styles.printButton} onClick={() => window.print()}>
              Print
            </BigButton>
          </span>
        </div>

        {/* 1. How are we doing? Plain sentences, only facts. */}
        <section className={styles.summary} data-tip="summary" aria-label="How are we doing?">
          <h2 className={styles.summaryTitle}>How are we doing?</h2>
          {sentences.length === 0 ? (
            <p className={styles.note}>{stillLoading ? "Counting…" : "The numbers did not load. Pull down to try again."}</p>
          ) : (
            <ul className={styles.summaryList}>
              {sentences.map((sentence) => (
                <li key={sentence}>{sentence}</li>
              ))}
            </ul>
          )}
        </section>

        {/* 2. Needs attention: the most important problems first, at most 5. */}
        <section className={styles.attention} data-tip="attention" aria-label="Needs attention">
          <h2 className={styles.boxTitle}>Needs attention</h2>
          {attention.length > 0 ? (
            <ul className={styles.attentionList}>
              {attention.map((item) => (
                <li key={item.text} className={styles.attentionItem}>
                  <LightBadge light={item.light} />
                  <span className={styles.attentionText}>{item.text}</span>
                  <BigButton href={item.href} className={styles.seeIt}>
                    See it
                  </BigButton>
                </li>
              ))}
            </ul>
          ) : stillLoading ? (
            <p className={styles.note}>Checking…</p>
          ) : (
            <p className={styles.allGood}>All good ✓</p>
          )}
          {notLoaded.length > 0 ? <p className={styles.note}>Did not load: {notLoaded.join(", ")}. Those parts are not checked here.</p> : null}
        </section>

        {/* 3. The six counters. */}
        <div className={`${styles.noPrint} ${styles.counters}`}>
          <Counts
            data-tip="counts"
            items={[
              {
                label: "To-dos pending",
                value: countValue(dashboard.openTodos.length, "todos"),
                tone: countTone("info", "todos"),
                problemNote: countNote("todos") ?? (overdue > 0 ? `${formatNumber(overdue)} overdue` : undefined),
                href: "/to-do?filter=pending",
              },
              { label: "To-dos done this week", value: countValue(dashboard.doneThisWeekTodos.length, "todos"), tone: countTone("good", "todos"), problemNote: countNote("todos"), href: "/to-do?filter=done-week" },
              { label: "Open complaints", value: countValue(openComplaints, "complaints"), tone: countTone(openComplaints > 0 ? "bad" : "good", "complaints"), problemNote: countNote("complaints"), href: "/complaints?status=open" },
              { label: "Accounts need you", value: countValue(needYou, "accounts"), tone: countTone(needYou > 0 ? "bad" : "good", "accounts"), problemNote: countNote("accounts"), href: "/accounts-center?show=need-you" },
              { label: "Visits this month", value: countValue(dashboard.visitsThisMonth.length, "visits"), tone: countTone("info", "visits"), problemNote: countNote("visits"), href: "/visits" },
              { label: "Active accounts", value: countValue(dashboard.activeAccounts.length, "accounts"), tone: countTone("good", "accounts"), problemNote: countNote("accounts"), href: "/accounts-center?show=active" },
            ]}
          />
        </div>

        {/* 4. Each part, closed until tapped: its light and one number. */}
        <div className={styles.sections} data-tip="sections">
          {section(
            "money",
            "Money",
            { number: moneyValue(dashboard.monthlyRevenue), words: "comes in every month" },
            failed("accounts") ? (
              <ErrorBox title="The money numbers did not load." onRetry={() => retrySection("accounts")} />
            ) : (
              <>
                <div className={styles.cards}>
                  <div className={styles.card}>
                    <p className={styles.cardWord}>Money in</p>
                    <p className={styles.realTerm}>Monthly revenue</p>
                    <p className={styles.cardNumber}>{moneyValue(dashboard.monthlyRevenue)}</p>
                    <p className={styles.cardLine}>every month, from {formatNumber(dashboard.revenueAccounts.length)} accounts</p>
                  </div>
                  <div className={styles.card}>
                    <p className={styles.cardWord}>Paid to subs</p>
                    <p className={styles.realTerm}>Subcontractor pay</p>
                    <p className={styles.cardNumber}>{moneyValue(dashboard.monthlySubcontractorPay)}</p>
                    <p className={styles.cardLine}>every month, {shareOfRevenue(dashboard.monthlySubcontractorPay, dashboard.monthlyRevenue)} of the money in</p>
                  </div>
                  <div className={styles.card}>
                    <p className={styles.cardWord}>We keep</p>
                    <p className={styles.realTerm}>Gross margin</p>
                    <p className={styles.cardNumber}>{moneyValue(dashboard.grossMargin)}</p>
                    <p className={styles.cardLine}>{formatPercent(dashboard.grossMarginPercent)} of the money in</p>
                  </div>
                </div>
                <p className={styles.note}>
                  Out of every $100 that comes in, about ${100 - keepPerHundred} goes to subs and we keep about ${keepPerHundred}. Below{" "}
                  {OVERVIEW_THRESHOLDS.money.weKeepProblemBelowPercent}% is a problem.
                </p>
                <div className={styles.cards}>
                  <div className={styles.card}>
                    <p className={styles.cardWord}>New accounts this month</p>
                    <p className={styles.cardNumber}>{formatNumber(dashboard.startedThisMonth.length)}</p>
                    <p className={styles.cardLine}>+{formatMoney(dashboard.startedThisMonth.reduce((sum, a) => sum + getMonthlyRevenue(a), 0))} a month</p>
                  </div>
                  <div className={styles.card}>
                    <p className={styles.cardWord}>Cancelled this month</p>
                    <p className={styles.cardNumber}>{formatNumber(dashboard.cancelledThisMonth.length)}</p>
                    <p className={styles.cardLine}>−{formatMoney(dashboard.cancelledThisMonth.reduce((sum, a) => sum + getMonthlyRevenue(a), 0))} a month</p>
                  </div>
                </div>
                <p className={styles.note}>These are each account&apos;s current monthly price. The app does not keep a history of past bills.</p>
              </>
            )
          )}

          {section(
            "complaints",
            "Complaints",
            { number: value(openComplaints, "complaints"), words: openComplaints === 1 ? "complaint is open" : "complaints are open" },
            failed("complaints") ? (
              <ErrorBox title="The complaints did not load." onRetry={() => retrySection("complaints")} />
            ) : (
              <>
                <div className={styles.cards}>
                  <div className={styles.card}>
                    <p className={styles.cardWord}>Open now</p>
                    <p className={styles.cardNumber}>{formatNumber(openComplaints)}</p>
                  </div>
                  <div className={styles.card}>
                    <p className={styles.cardWord}>Open more than {OVERVIEW_THRESHOLDS.complaints.openProblemAfterDays} days</p>
                    <p className={styles.cardNumber}>{formatNumber(dashboard.oldOpenComplaints.length)}</p>
                  </div>
                </div>
                <MonthBars title="Complaints logged each month" months={dashboard.charts.complaints} noun="complaints" />
                <h3 className={styles.chartTitle}>Latest complaints</h3>
                {dashboard.recentComplaints.length === 0 ? (
                  <p className={styles.note}>No complaints yet.</p>
                ) : (
                  <ul className="ui-acct-list">
                    {dashboard.recentComplaints.map((complaint, index) => {
                      const id = cleanText(getValue(complaint, ["id", "ID", "complaintId", "rowNumber"]));
                      const open = isComplaintOpen(complaint);
                      return (
                        <li key={`complaint-${index}`}>
                          <Link href={id ? `/complaints/${encodeURIComponent(id)}` : "/complaints"} className={`ui-acct ui-acct-link ${open ? "ui-acct-problem" : ""}`.trim()}>
                            <span className="ui-acct-name">
                              <AccountLink nested accountId={getRecordAccountId(complaint)} name={getRowAccountName(complaint) || "Unknown account"} />
                            </span>
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
                <BigButton kind="second" href="/complaints">
                  All complaints
                </BigButton>
              </>
            )
          )}

          {section(
            "visits",
            "Visits",
            { number: value(dashboard.visitsThisMonth.length, "visits"), words: "visits this month" },
            failed("visits", "accounts") ? (
              <ErrorBox title="The visits did not load." onRetry={() => retrySection(failed("visits") ? "visits" : "accounts")} />
            ) : (
              <>
                <div className={styles.cards}>
                  <div className={styles.card}>
                    <p className={styles.cardWord}>Visits this month</p>
                    <p className={styles.cardNumber}>{formatNumber(dashboard.visitsThisMonth.length)}</p>
                  </div>
                  <div className={styles.card}>
                    <p className={styles.cardWord}>Not visited in {OVERVIEW_THRESHOLDS.visits.notVisitedDays} days</p>
                    <p className={styles.cardNumber}>{formatNumber(dashboard.notVisited.length)}</p>
                    <p className={styles.cardLine}>active accounts</p>
                  </div>
                </div>
                {dashboard.notVisited.length > 0 ? (
                  <>
                    <ul className={styles.nameList}>
                      {dashboard.notVisited.slice(0, 10).map((account, index) => {
                        const id = getAccountId(account);
                        return (
                          <li key={`not-visited-${index}`}>
                            <Link href={id ? `/accounts/${encodeURIComponent(id)}` : "/accounts-center"}>{getAccountName(account) || "Unnamed account"}</Link>
                          </li>
                        );
                      })}
                    </ul>
                    {dashboard.notVisited.length > 10 ? <p className={styles.note}>And {formatNumber(dashboard.notVisited.length - 10)} more.</p> : null}
                  </>
                ) : null}
                <p className={styles.note}>Accounts that started less than {OVERVIEW_THRESHOLDS.visits.notVisitedDays} days ago are not counted.</p>
                <MonthBars title="Visits logged each month" months={dashboard.charts.visits} noun="visits" />
                <BigButton kind="second" href="/visits">
                  All visits
                </BigButton>
              </>
            )
          )}

          {section(
            "accounts",
            "Accounts & Subs",
            { number: value(dashboard.activeAccounts.length, "accounts"), words: "active accounts" },
            failed("accounts") ? (
              <ErrorBox title="The accounts did not load." onRetry={() => retrySection("accounts")} />
            ) : (
              <>
                <div className={styles.cards}>
                  <div className={styles.card}>
                    <p className={styles.cardWord}>Active accounts</p>
                    <p className={styles.cardNumber}>{formatNumber(dashboard.activeAccounts.length)}</p>
                  </div>
                  <div className={styles.card}>
                    <p className={styles.cardWord}>Need you</p>
                    <p className={styles.cardNumber}>{formatNumber(needYou)}</p>
                    <p className={styles.cardLine}>High Risk, or a problem the crew reported</p>
                  </div>
                  <div className={styles.card}>
                    <p className={styles.cardWord}>No sub assigned</p>
                    <p className={styles.cardNumber}>{formatNumber(dashboard.noSubAccounts.length)}</p>
                    <p className={styles.cardLine}>active accounts</p>
                  </div>
                </div>
                {needYou > 0 ? (
                  <ul className="ui-acct-list">
                    {dashboard.accountsNeedingAttention.slice(0, 8).map((account, index) => {
                      const id = getAccountId(account);
                      return (
                        <li key={`attention-${index}`}>
                          <Link href={id ? `/accounts/${encodeURIComponent(id)}` : "/accounts-center"} className="ui-acct ui-acct-link ui-acct-problem">
                            <span className="ui-acct-name">{getAccountName(account) || "Unnamed account"}</span>
                            <span className="ui-actions-row">
                              <StatusPill kind="needs-you">{getAccountHealth(account) || "Needs you"}</StatusPill>
                              <StatusPill kind="off">{getAccountStatus(account) || "No status"}</StatusPill>
                            </span>
                            <span className="ui-acct-line">
                              Manager: {getAccountManager(account) || "none"} · Sub: {getAccountSubcontractor(account) || "none"}
                            </span>
                            <span className="ui-acct-line">{formatMoney(getMonthlyRevenue(account))} a month</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {dashboard.noSubAccounts.length > 0 ? (
                  <>
                    <h3 className={styles.chartTitle}>Active accounts with no sub</h3>
                    <ul className={styles.nameList}>
                      {dashboard.noSubAccounts.slice(0, 10).map((account, index) => {
                        const id = getAccountId(account);
                        return (
                          <li key={`no-sub-${index}`}>
                            <Link href={id ? `/accounts/${encodeURIComponent(id)}` : "/accounts-center"}>{getAccountName(account) || "Unnamed account"}</Link>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : null}
                <MonthBars title="New accounts started each month" months={dashboard.charts.newAccounts} noun="new accounts" />
                <div className="ui-actions-row">
                  <BigButton kind="second" href="/accounts-center">
                    Accounts Center
                  </BigButton>
                  <BigButton kind="second" href="/subcontractors">
                    Subcontractors
                  </BigButton>
                </div>
              </>
            )
          )}

          {section(
            "supplies",
            "Supplies",
            { number: value(newOrders, "supplyOrders"), words: newOrders === 1 ? "new supply order is waiting" : "new supply orders are waiting" },
            failed("supplyOrders") ? (
              <ErrorBox title="The supply orders did not load." onRetry={() => retrySection("supplyOrders")} />
            ) : (
              <>
                <div className={styles.cards}>
                  <div className={styles.card}>
                    <p className={styles.cardWord}>New orders waiting</p>
                    <p className={styles.cardNumber}>{formatNumber(newOrders)}</p>
                  </div>
                  <div className={styles.card}>
                    <p className={styles.cardWord}>Waiting more than {OVERVIEW_THRESHOLDS.supplies.waitingProblemAfterDays} days</p>
                    <p className={styles.cardNumber}>{formatNumber(dashboard.oldSupplyOrders.length)}</p>
                  </div>
                </div>
                <h3 className={styles.chartTitle}>Latest supply orders</h3>
                {dashboard.recentSupplyOrders.length === 0 ? (
                  <p className={styles.note}>No supply orders yet.</p>
                ) : (
                  <ul className="ui-acct-list">
                    {dashboard.recentSupplyOrders.map((order, index) => (
                      <li key={`supply-order-${index}`}>
                        <Link href="/supply-orders" className="ui-acct ui-acct-link">
                          <span className="ui-acct-name">
                            <AccountLink nested accountId={getRecordAccountId(order)} name={getRowAccountName(order) || "Unknown account"} />
                          </span>
                          <span className="ui-actions-row">
                            <StatusPill kind={isNewSupplyOrder(order) ? "waiting" : "off"}>{getSupplyOrderStatus(order) || "No status"}</StatusPill>
                          </span>
                          <span className="ui-acct-line">{getSupplyOrderTitle(order) || "Supply order"}</span>
                          <span className="ui-acct-line">{getDisplayDate(order)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                <BigButton kind="second" href="/supply-orders">
                  All supply orders
                </BigButton>
              </>
            )
          )}

          {section(
            "activity",
            "Activity",
            { number: value(dashboard.openTodos.length, "todos"), words: `to-dos open${overdue > 0 ? `, ${formatNumber(overdue)} overdue` : ""}` },
            <>
              {/* Mondays: what the team got into the app last week. Totals only. */}
              {new Date().getDay() === 1 && ready("todos", "visits", "complaints") ? (
                <section className="ui-allclear" aria-label={CHEER.mondayTitle}>
                  <p className="ui-allclear-title">{CHEER.mondayTitle}</p>
                  <p className="ui-strong">
                    {formatNumber(dashboard.lastWeek.todosDone)} to-dos done · {formatNumber(dashboard.lastWeek.visits)} visits logged · {formatNumber(dashboard.lastWeek.complaints)} complaints logged
                  </p>
                  <p>{CHEER.mondayText}</p>
                </section>
              ) : null}

              {/* What is waiting on me: new accounts, account updates, supply orders. */}
              <MyWork orders={data.supplyOrders} />

              <h3 className={styles.chartTitle}>To-dos next</h3>
              {failed("todos") ? (
                <ErrorBox title="The to-dos did not load." onRetry={() => retrySection("todos")} />
              ) : pending("todos") ? (
                <SkeletonList rows={3} />
              ) : dashboard.recentTodos.length === 0 ? (
                <EmptyState title="No to-dos open" text="Nothing is waiting." />
              ) : (
                <ul className="ui-acct-list">
                  {dashboard.recentTodos.map((todo, index) => {
                    const id = cleanText(getValue(todo, ["id", "ID", "toDoId", "todoId"]));
                    return (
                      <li key={`todo-${id || index}`}>
                        <Link href={id ? `/to-do?id=${encodeURIComponent(id)}` : "/to-do"} className={`ui-acct ui-acct-link ${isToDoOverdue(todo) ? "ui-acct-problem" : ""}`.trim()}>
                          <span className="ui-acct-name">
                            <AccountLink nested accountId={getRecordAccountId(todo)} name={getToDoAccount(todo) || "No account"} />
                          </span>
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
              <BigButton kind="second" href="/to-do">
                All to-dos
              </BigButton>
            </>
          )}
        </div>

        {/* Where to go. */}
        <div className={`ui-acttiles ${styles.noPrint}`}>
          <Tile icon="todo" label="To-Do" detail={overdue > 0 ? `${overdue} overdue` : undefined} href="/to-do" />
          <Tile icon="problem" label="Complaints" detail={openComplaints > 0 ? `${openComplaints} open` : undefined} href="/complaints" />
          <Tile icon="visit" label="Visits" href="/visits" />
          <Tile icon="note" label="Supply Orders" detail={newOrders > 0 ? `${newOrders} new` : undefined} href="/supply-orders" />
          <Tile icon="key" label="Supplies" href="/supplies" />
          <Tile icon="call" label="Crew Link" href="/crew-link" />
          <Tile icon="money" label="Sales" href="/sales" />
          <Tile icon="status" label="Subcontractors" href="/subcontractors" />
          <Tile icon="print" label="Reports" href="/reports" />
        </div>
      </div>
    </Screen>
  );
}

/** GOOD / WATCH / PROBLEM: a word and a shape, never color alone. */
function LightBadge({ light, checking = false }: { light: Light | null; checking?: boolean }) {
  if (!light) {
    return (
      <span className={`${styles.badge} ${styles.unknown}`}>
        <span className={styles.badgeSymbol} aria-hidden="true">
          {checking ? "…" : "?"}
        </span>
        {checking ? "CHECKING" : "NOT LOADED"}
      </span>
    );
  }
  return (
    <span className={`${styles.badge} ${styles[light]}`}>
      <span className={styles.badgeSymbol} aria-hidden="true">
        {LIGHT_SYMBOL[light]}
      </span>
      {LIGHT_WORD[light]}
    </span>
  );
}
