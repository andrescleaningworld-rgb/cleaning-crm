"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import AccountLink from "../components/AccountLink";

type AnyRow = Record<string, unknown>;

type DateRange = {
  label: string;
  start: Date;
  end: Date;
};

type ApiResponse = {
  accounts?: AnyRow[];
  visits?: AnyRow[];
  complaints?: AnyRow[];
  sales?: AnyRow[];
  data?: AnyRow[];
};

function normalizeKey(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function getValue(row: AnyRow, possibleKeys: string[]) {
  for (const key of possibleKeys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return clean(row[key]);
    }
  }

  const normalizedRowKeys = Object.keys(row).reduce<Record<string, string>>(
    (acc, key) => {
      acc[normalizeKey(key)] = key;
      return acc;
    },
    {}
  );

  for (const key of possibleKeys) {
    const realKey = normalizedRowKeys[normalizeKey(key)];

    if (
      realKey &&
      row[realKey] !== undefined &&
      row[realKey] !== null &&
      row[realKey] !== ""
    ) {
      return clean(row[realKey]);
    }
  }

  return "";
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

function safeDate(value: unknown) {
  if (!value) return "";
  const date = getDate(value);
  if (!date) return clean(value);
  return date.toLocaleDateString();
}

function getDate(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number") {
    const excelDate = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!Number.isNaN(excelDate.getTime())) return excelDate;
  }

  const text = clean(value);

  if (!text) return null;

  const directDate = new Date(text);
  if (!Number.isNaN(directDate.getTime())) return directDate;

  const slashParts = text.split("/");
  if (slashParts.length === 3) {
    const month = Number(slashParts[0]);
    const day = Number(slashParts[1]);
    const year = Number(slashParts[2]);

    if (month && day && year) {
      const parsedDate = new Date(year, month - 1, day);
      if (!Number.isNaN(parsedDate.getTime())) return parsedDate;
    }
  }

  const dashParts = text.split("-");
  if (dashParts.length === 3) {
    const year = Number(dashParts[0]);
    const month = Number(dashParts[1]);
    const day = Number(dashParts[2]);

    if (month && day && year) {
      const parsedDate = new Date(year, month - 1, day);
      if (!Number.isNaN(parsedDate.getTime())) return parsedDate;
    }
  }

  return null;
}

function isDateInRange(value: unknown, start: Date, end: Date) {
  const date = getDate(value);

  if (!date) {
    return false;
  }

  const startDate = new Date(start);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(end);
  endDate.setHours(23, 59, 59, 999);

  return date >= startDate && date <= endDate;
}

function isDateInRangeOrMissing(value: unknown, start: Date, end: Date) {
  const date = getDate(value);

  if (!date) {
    return true;
  }

  const startDate = new Date(start);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(end);
  endDate.setHours(23, 59, 59, 999);

  return date >= startDate && date <= endDate;
}

function getQuarter(value: unknown) {
  if (!value) return "No Date";

  const date = getDate(value);
  if (!date) return "No Date";

  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  if (month <= 3) return `Q1 ${year}`;
  if (month <= 6) return `Q2 ${year}`;
  if (month <= 9) return `Q3 ${year}`;
  return `Q4 ${year}`;
}

function toInputDate(date: Date) {
  return date.toISOString().split("T")[0];
}

function getAccountName(row: AnyRow) {
  return (
    getValue(row, [
      "accountName",
      "Account Name",
      "Account",
      "account",
      "Customer",
      "customer",
      "Name",
      "name",
    ]) || "-"
  );
}

function getAccountManager(row: AnyRow) {
  return (
    getValue(row, [
      "manager",
      "Manager",
      "accountManager",
      "Account Manager",
      "assignedManager",
      "Assigned Manager",
      "Assigned To",
      "assignedTo",
    ]) || ""
  );
}

function getSubcontractor(row: AnyRow) {
  return (
    getValue(row, [
      "subcontractor",
      "Subcontractor",
      "subContractor",
      "Sub Contractor",
      "Sub-Contractor",
      "Sub Contractor Name",
      "Cleaner",
      "cleaner",
      "assignedSubcontractor",
      "Assigned Subcontractor",
      "Assigned Sub",
      "assignedSub",
    ]) || ""
  );
}

function getStatus(row: AnyRow) {
  return getValue(row, ["status", "Status", "accountStatus", "Account Status"]);
}

function getStartDate(row: AnyRow) {
  return getValue(row, [
    "startDate",
    "StartDate",
    "Start Date",
    "start date",
    "START DATE",
    "serviceStartDate",
    "ServiceStartDate",
    "Service Start Date",
    "service start date",
    "dateStarted",
    "DateStarted",
    "Date Started",
    "date started",
    "startingDate",
    "StartingDate",
    "Starting Date",
    "starting date",
    "accountStartDate",
    "AccountStartDate",
    "Account Start Date",
    "account start date",
    "firstServiceDate",
    "First Service Date",
    "first service date",
    "beginDate",
    "Begin Date",
    "begin date",
    "start",
    "Start",
    "START",
  ]);
}

function getCancelledDate(row: AnyRow) {
  return getValue(row, [
    "cancelledDate",
    "CancelledDate",
    "Cancelled Date",
    "cancelled date",
    "canceledDate",
    "CanceledDate",
    "Canceled Date",
    "canceled date",
    "dateCancelled",
    "DateCancelled",
    "Date Cancelled",
    "date cancelled",
    "dateCanceled",
    "DateCanceled",
    "Date Canceled",
    "date canceled",
    "cancellationDate",
    "CancellationDate",
    "Cancellation Date",
    "cancellation date",
  ]);
}

function getMonthlyRevenue(row: AnyRow) {
  return numberValue(
    getValue(row, [
      "monthlyRevenue",
      "Monthly Revenue",
      "whatCleaningWorldGetsPaid",
      "What Cleaning World Gets Paid",
      "Cleaning World Gets Paid",
      "cleaningWorldGetsPaid",
      "monthlyAmount",
      "Monthly Amount",
      "Monthly Price",
      "monthlyPrice",
      "price",
      "Price",
    ])
  );
}

function getMonthlySubPay(row: AnyRow) {
  return numberValue(
    getValue(row, [
      "monthlySubcontractorPay",
      "Monthly Subcontractor Pay",
      "Subcontractor Pay",
      "subcontractorPay",
      "subPay",
      "Sub Pay",
      "cleanerPay",
      "Cleaner Pay",
      "Monthly Sub Pay",
      "monthlySubPay",
    ])
  );
}

function getGrossMargin(row: AnyRow) {
  const revenue = getMonthlyRevenue(row);
  const subPay = getMonthlySubPay(row);
  return revenue - subPay;
}

function getGrossMarginPercent(row: AnyRow) {
  const revenue = getMonthlyRevenue(row);
  if (!revenue) return 0;
  return (getGrossMargin(row) / revenue) * 100;
}

function getSaleDate(row: AnyRow) {
  return getValue(row, ["date", "Date", "saleDate", "Sale Date"]);
}

function getSaleAmount(row: AnyRow) {
  return numberValue(
    getValue(row, ["amount", "Amount", "saleAmount", "Sale Amount"])
  );
}

function getCommissionAmount(row: AnyRow) {
  return numberValue(
    getValue(row, [
      "commissionAmount",
      "Commission Amount",
      "commission",
      "Commission",
      "commissionDue",
      "Commission Due",
    ])
  );
}

function rowMatchesSearch(row: AnyRow, search: string) {
  if (!search.trim()) return true;
  return Object.values(row)
    .join(" ")
    .toLowerCase()
    .includes(search.toLowerCase());
}

async function readResult(
  result: PromiseSettledResult<Response>,
  type: "accounts" | "visits" | "complaints" | "sales"
): Promise<AnyRow[]> {
  if (result.status !== "fulfilled") return [];

  const data = (await result.value.json()) as ApiResponse | AnyRow[];

  if (Array.isArray(data)) return data;

  if (type === "accounts" && Array.isArray(data.accounts)) return data.accounts;
  if (type === "visits" && Array.isArray(data.visits)) return data.visits;
  if (type === "complaints" && Array.isArray(data.complaints)) {
    return data.complaints;
  }
  if (type === "sales" && Array.isArray(data.sales)) return data.sales;
  if (Array.isArray(data.data)) return data.data;

  return [];
}

export default function ReportsPage() {
  const [accounts, setAccounts] = useState<AnyRow[]>([]);
  const [visits, setVisits] = useState<AnyRow[]>([]);
  const [complaints, setComplaints] = useState<AnyRow[]>([]);
  const [sales, setSales] = useState<AnyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const today = new Date();
  const firstDayOfYear = new Date(today.getFullYear(), 0, 1);

  const [datePreset, setDatePreset] = useState("YTD");
  const [customStartDate, setCustomStartDate] = useState(
    toInputDate(firstDayOfYear)
  );
  const [customEndDate, setCustomEndDate] = useState(toInputDate(today));

  const [reportType, setReportType] = useState("Overview");
  const [managerFilter, setManagerFilter] = useState("All");
  const [subcontractorFilter, setSubcontractorFilter] = useState("All");
  const [salespersonFilter, setSalespersonFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [minRevenueFilter, setMinRevenueFilter] = useState("");
  const [maxRevenueFilter, setMaxRevenueFilter] = useState("");
  const [search, setSearch] = useState("");

  async function loadAllReportsData() {
    try {
      setLoading(true);
      setLoadError("");

      const [accountsRes, visitsRes, complaintsRes, salesRes] =
        await Promise.allSettled([
          fetch("/api/accounts"),
          fetch("/api/visits"),
          fetch("/api/complaints"),
          fetch("/api/sales"),
        ]);

      setAccounts(await readResult(accountsRes, "accounts"));
      setVisits(await readResult(visitsRes, "visits"));
      setComplaints(await readResult(complaintsRes, "complaints"));
      setSales(await readResult(salesRes, "sales"));
    } catch (error) {
      console.error("Error loading reports:", error);
      setLoadError(
        error instanceof Error ? error.message : "Error loading reports."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAllReportsData();
  }, []);

  const dateRange: DateRange = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    if (datePreset === "This Month") {
      return {
        label: "This Month",
        start: new Date(year, month, 1),
        end: now,
      };
    }

    if (datePreset === "This Quarter") {
      const quarterStartMonth = Math.floor(month / 3) * 3;

      return {
        label: "This Quarter",
        start: new Date(year, quarterStartMonth, 1),
        end: now,
      };
    }

    if (datePreset === "YTD") {
      return {
        label: "Year to Date",
        start: new Date(year, 0, 1),
        end: now,
      };
    }

    const customStart = getDate(customStartDate) || new Date(year, 0, 1);
    const customEnd = getDate(customEndDate) || now;

    return {
      label: "Custom Date Range",
      start: customStart,
      end: customEnd,
    };
  }, [datePreset, customStartDate, customEndDate]);

  const managers = useMemo(() => {
    const names = new Set<string>();

    [...accounts, ...visits, ...complaints, ...sales].forEach((row) => {
      const manager =
        getAccountManager(row) ||
        getValue(row, ["visitedBy", "Visited By", "assignedTo", "Assigned To"]);

      if (manager) names.add(manager);
    });

    return ["All", ...Array.from(names).sort()];
  }, [accounts, visits, complaints, sales]);

  const subcontractors = useMemo(() => {
    const names = new Set<string>();

    accounts.forEach((row) => {
      const sub = getSubcontractor(row);
      if (sub) names.add(sub);
    });

    return ["All", ...Array.from(names).sort()];
  }, [accounts]);

  const salespeople = useMemo(() => {
    const names = new Set<string>();

    sales.forEach((row) => {
      const soldBy = getValue(row, [
        "soldBy",
        "Sold By",
        "salesPerson",
        "Sales Person",
        "salesperson",
        "Salesperson",
      ]);

      if (soldBy) names.add(soldBy);
    });

    return ["All", ...Array.from(names).sort()];
  }, [sales]);

  const statuses = useMemo(() => {
    const list = new Set<string>();

    accounts.forEach((row) => {
      const status = getStatus(row);
      if (status) list.add(status);
    });

    return ["All", ...Array.from(list).sort()];
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    const minRevenue = numberValue(minRevenueFilter);
    const maxRevenue = numberValue(maxRevenueFilter);

    return accounts.filter((account) => {
      const manager = getAccountManager(account);
      const subcontractor = getSubcontractor(account);
      const status = getStatus(account);
      const revenue = getMonthlyRevenue(account);

      return (
        (managerFilter === "All" || manager === managerFilter) &&
        (subcontractorFilter === "All" ||
          subcontractor === subcontractorFilter) &&
        (statusFilter === "All" || status === statusFilter) &&
        (!minRevenueFilter.trim() || revenue >= minRevenue) &&
        (!maxRevenueFilter.trim() || revenue <= maxRevenue) &&
        rowMatchesSearch(account, search)
      );
    });
  }, [
    accounts,
    managerFilter,
    subcontractorFilter,
    statusFilter,
    minRevenueFilter,
    maxRevenueFilter,
    search,
  ]);

  const activeAccounts = useMemo(() => {
    return filteredAccounts.filter((account) => {
      const status = getStatus(account).toLowerCase();
      return !status.includes("cancel");
    });
  }, [filteredAccounts]);

  const startedAccounts = useMemo(() => {
    return filteredAccounts
      .filter((account) =>
        isDateInRange(getStartDate(account), dateRange.start, dateRange.end)
      )
      .sort((a, b) => {
        const dateA = getDate(getStartDate(a))?.getTime() || 0;
        const dateB = getDate(getStartDate(b))?.getTime() || 0;
        return dateB - dateA;
      });
  }, [filteredAccounts, dateRange]);

  const cancelledAccounts = useMemo(() => {
    return filteredAccounts
      .filter((account) => {
        const status = getStatus(account).toLowerCase();
        const cancelledDate = getCancelledDate(account);

        return (
          status.includes("cancel") &&
          isDateInRange(cancelledDate, dateRange.start, dateRange.end)
        );
      })
      .sort((a, b) => {
        const dateA = getDate(getCancelledDate(a))?.getTime() || 0;
        const dateB = getDate(getCancelledDate(b))?.getTime() || 0;
        return dateB - dateA;
      });
  }, [filteredAccounts, dateRange]);

  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      const manager = getValue(sale, ["manager", "Manager", "accountManager"]);
      const soldBy = getValue(sale, [
        "soldBy",
        "Sold By",
        "salesPerson",
        "Sales Person",
        "salesperson",
        "Salesperson",
      ]);
      const date = getSaleDate(sale);

      return (
        isDateInRangeOrMissing(date, dateRange.start, dateRange.end) &&
        (managerFilter === "All" || manager === managerFilter) &&
        (salespersonFilter === "All" || soldBy === salespersonFilter) &&
        rowMatchesSearch(sale, search)
      );
    });
  }, [sales, dateRange, managerFilter, salespersonFilter, search]);

  const filteredVisits = useMemo(() => {
    return visits.filter((visit) => {
      const manager = getValue(visit, [
        "manager",
        "Manager",
        "visitedBy",
        "Visited By",
      ]);
      const date = getValue(visit, [
        "date",
        "Date",
        "visitDate",
        "Visit Date",
      ]);

      return (
        isDateInRangeOrMissing(date, dateRange.start, dateRange.end) &&
        (managerFilter === "All" || manager === managerFilter) &&
        rowMatchesSearch(visit, search)
      );
    });
  }, [visits, dateRange, managerFilter, search]);

  const filteredComplaints = useMemo(() => {
    return complaints.filter((complaint) => {
      const manager = getValue(complaint, [
        "manager",
        "Manager",
        "assignedTo",
        "Assigned To",
      ]);
      const date = getValue(complaint, [
        "date",
        "Date",
        "complaintDate",
        "Complaint Date",
      ]);

      return (
        isDateInRangeOrMissing(date, dateRange.start, dateRange.end) &&
        (managerFilter === "All" || manager === managerFilter) &&
        rowMatchesSearch(complaint, search)
      );
    });
  }, [complaints, dateRange, managerFilter, search]);

  // A visit row has no subcontractor or status of its own: they come from its
  // account, found by Account ID first, then by name (older visits carry the
  // sheet's ACC- ids, which do not always match).
  const accountForVisit = useMemo(() => {
    const byId = new Map<string, AnyRow>();
    const byName = new Map<string, AnyRow>();
    accounts.forEach((account) => {
      const id = getValue(account, ["accountId", "Account ID", "id", "ID"]);
      if (id) byId.set(id, account);
      const name = normalizeKey(getAccountName(account));
      if (name && name !== "-" && !byName.has(name)) byName.set(name, account);
    });
    return (visit: AnyRow): AnyRow | null =>
      byId.get(getValue(visit, ["accountId", "Account ID"])) ??
      byName.get(normalizeKey(getValue(visit, ["accountName", "Account Name", "account", "Account"]))) ??
      null;
  }, [accounts]);

  // "Visits": every visit in the date range, newest first.
  const visitsReport = useMemo(() => {
    return visits
      .filter((visit) => {
        if (!isDateInRange(getVisitDate(visit), dateRange.start, dateRange.end)) return false;
        const account = accountForVisit(visit);
        return (
          (managerFilter === "All" || getVisitManager(visit) === managerFilter) &&
          (subcontractorFilter === "All" || (account ? getSubcontractor(account) : "") === subcontractorFilter) &&
          (statusFilter === "All" || (account ? getStatus(account) : "") === statusFilter) &&
          rowMatchesSearch(visit, search)
        );
      })
      .sort((a, b) => (getDate(getVisitDate(b))?.getTime() || 0) - (getDate(getVisitDate(a))?.getTime() || 0));
  }, [visits, accountForVisit, dateRange, managerFilter, subcontractorFilter, statusFilter, search]);

  const visitsPerManager = useMemo(() => {
    const counts: Record<string, number> = {};
    visitsReport.forEach((visit) => {
      const manager = getVisitManager(visit) || "Unassigned";
      counts[manager] = (counts[manager] || 0) + 1;
    });
    return Object.entries(counts).sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
  }, [visitsReport]);

  // "Last Visit by Account": one row per account, from ALL visits (the date
  // range does not apply). Status "All" means Active accounts here.
  const lastVisitReport = useMemo(() => {
    const latest = new Map<AnyRow, { date: Date; by: string }>();
    visits.forEach((visit) => {
      const account = accountForVisit(visit);
      const date = getDate(getVisitDate(visit));
      if (!account || !date) return;
      const current = latest.get(account);
      if (!current || date > current.date) latest.set(account, { date, by: getVisitManager(visit) });
    });

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const rows = accounts
      .filter((account) => {
        const status = getStatus(account);
        return (
          (statusFilter === "All" ? !status.toLowerCase().includes("cancel") : status === statusFilter) &&
          (managerFilter === "All" || getAccountManager(account) === managerFilter) &&
          (subcontractorFilter === "All" || getSubcontractor(account) === subcontractorFilter) &&
          rowMatchesSearch(account, search)
        );
      })
      .map((account) => {
        const last = latest.get(account) ?? null;
        let days: number | null = null;
        if (last) {
          const day = new Date(last.date);
          day.setHours(0, 0, 0, 0);
          days = Math.max(0, Math.round((startOfToday.getTime() - day.getTime()) / 86_400_000));
        }
        return { account, last, days };
      })
      // Never visited first, then the oldest visit first.
      .sort((a, b) => {
        if (a.days === null || b.days === null) {
          if (a.days === null && b.days === null) return getAccountName(a.account).localeCompare(getAccountName(b.account));
          return a.days === null ? -1 : 1;
        }
        return b.days - a.days || getAccountName(a.account).localeCompare(getAccountName(b.account));
      });

    return {
      rows,
      days30: rows.filter((row) => row.days !== null && row.days >= 30).length,
      days60: rows.filter((row) => row.days !== null && row.days >= 60).length,
      never: rows.filter((row) => row.days === null).length,
    };
  }, [accounts, visits, accountForVisit, statusFilter, managerFilter, subcontractorFilter, search]);

  const totals = useMemo(() => {
    const revenueAdded = startedAccounts.reduce((sum, account) => {
      return sum + getMonthlyRevenue(account);
    }, 0);

    const revenueLost = cancelledAccounts.reduce((sum, account) => {
      return sum + getMonthlyRevenue(account);
    }, 0);

    const activeRevenue = activeAccounts.reduce((sum, account) => {
      return sum + getMonthlyRevenue(account);
    }, 0);

    const activeSubPay = activeAccounts.reduce((sum, account) => {
      return sum + getMonthlySubPay(account);
    }, 0);

    const salesTotal = filteredSales.reduce((sum, sale) => {
      return sum + getSaleAmount(sale);
    }, 0);

    const commissionTotal = filteredSales.reduce((sum, sale) => {
      return sum + getCommissionAmount(sale);
    }, 0);

    const openComplaints = filteredComplaints.filter((complaint) => {
      const status = getValue(complaint, [
        "status",
        "Status",
        "complaintStatus",
        "Complaint Status",
      ]).toLowerCase();

      return (
        status.includes("open") ||
        status.includes("pending") ||
        status.includes("needs") ||
        status === ""
      );
    }).length;

    return {
      totalAccounts: filteredAccounts.length,
      activeAccounts: activeAccounts.length,
      startedAccounts: startedAccounts.length,
      cancelledAccounts: cancelledAccounts.length,
      revenueAdded,
      revenueLost,
      netRevenueGrowth: revenueAdded - revenueLost,
      activeRevenue,
      activeSubPay,
      activeGrossMargin: activeRevenue - activeSubPay,
      visits: filteredVisits.length,
      complaints: filteredComplaints.length,
      openComplaints,
      salesCount: filteredSales.length,
      salesTotal,
      commissionTotal,
    };
  }, [
    filteredAccounts,
    activeAccounts,
    startedAccounts,
    cancelledAccounts,
    filteredVisits,
    filteredComplaints,
    filteredSales,
  ]);

  const managerSummary = useMemo(() => {
    const summary: Record<
      string,
      {
        visits: number;
        complaints: number;
        salesCount: number;
        salesTotal: number;
        commissionTotal: number;
        accountsStarted: number;
        accountsCancelled: number;
        revenueAdded: number;
        revenueLost: number;
      }
    > = {};

    function ensure(name: string) {
      if (!summary[name]) {
        summary[name] = {
          visits: 0,
          complaints: 0,
          salesCount: 0,
          salesTotal: 0,
          commissionTotal: 0,
          accountsStarted: 0,
          accountsCancelled: 0,
          revenueAdded: 0,
          revenueLost: 0,
        };
      }
    }

    filteredVisits.forEach((visit) => {
      const manager =
        getValue(visit, ["manager", "Manager", "visitedBy", "Visited By"]) ||
        "Unassigned";
      ensure(manager);
      summary[manager].visits += 1;
    });

    filteredComplaints.forEach((complaint) => {
      const manager =
        getValue(complaint, [
          "manager",
          "Manager",
          "assignedTo",
          "Assigned To",
        ]) || "Unassigned";
      ensure(manager);
      summary[manager].complaints += 1;
    });

    filteredSales.forEach((sale) => {
      const manager =
        getValue(sale, ["manager", "Manager", "accountManager"]) ||
        "Unassigned";
      ensure(manager);
      summary[manager].salesCount += 1;
      summary[manager].salesTotal += getSaleAmount(sale);
      summary[manager].commissionTotal += getCommissionAmount(sale);
    });

    startedAccounts.forEach((account) => {
      const manager = getAccountManager(account) || "Unassigned";
      ensure(manager);
      summary[manager].accountsStarted += 1;
      summary[manager].revenueAdded += getMonthlyRevenue(account);
    });

    cancelledAccounts.forEach((account) => {
      const manager = getAccountManager(account) || "Unassigned";
      ensure(manager);
      summary[manager].accountsCancelled += 1;
      summary[manager].revenueLost += getMonthlyRevenue(account);
    });

    return Object.entries(summary).sort(([a], [b]) => a.localeCompare(b));
  }, [
    filteredVisits,
    filteredComplaints,
    filteredSales,
    startedAccounts,
    cancelledAccounts,
  ]);

  // "Account Management Performance": growth, loss rate and retention, from
  // each account's start date, cancelled date, status and monthly price.
  // Only the Manager filter applies; the date range does not.
  //   - No start date: counted as already active a year ago (they are the
  //     oldest accounts), left out of the 1/2/5-year counts.
  //   - Cancelled with no cancelled date: left out of every count, because
  //     when it left is not known.
  //   - Revenue "12 months ago" uses today's prices (no price history).
  const performance = useMemo(() => {
    const now = new Date();
    const rows = accounts
      .filter((account) => managerFilter === "All" || getAccountManager(account) === managerFilter)
      .map((account) => {
        const cancelled = getStatus(account).toLowerCase().includes("cancel");
        return {
          start: getDate(getStartDate(account)),
          cancelled,
          cancelledOn: cancelled ? getDate(getCancelledDate(account)) : null,
          revenue: getMonthlyRevenue(account),
        };
      });

    // Cancelled with no date: not known when it left, so it is in no count.
    const known = rows.filter((row) => !row.cancelled || row.cancelledOn);
    const activeOn = (day: Date) =>
      known.filter((row) => (!row.start || row.start <= day) && (!row.cancelled || (row.cancelledOn as Date) > day));
    const sum = (list: { revenue: number }[]) => list.reduce((total, row) => total + row.revenue, 0);
    const change = (was: number, is: number) => (was ? ((is - was) / was) * 100 : null);

    const yearAgo = new Date(now);
    yearAgo.setFullYear(now.getFullYear() - 1);
    const activeNow = activeOn(now);
    const activeYearAgo = activeOn(yearAgo);
    const lostLast12 = known.filter((row) => row.cancelledOn && row.cancelledOn > yearAgo && row.cancelledOn <= now);

    const thisYear = now.getFullYear();
    const dataYears = known.flatMap((row) => [row.start?.getFullYear(), row.cancelledOn?.getFullYear()]).filter((year): year is number => !!year && year <= thisYear);
    const firstYear = Math.max(Math.min(thisYear, ...dataYears), thisYear - 9);
    const years = [];
    for (let year = thisYear; year >= firstYear; year--) {
      const jan1 = new Date(year, 0, 1);
      const started = known.filter((row) => row.start && row.start.getFullYear() === year);
      const lost = known.filter((row) => row.cancelledOn && row.cancelledOn.getFullYear() === year);
      const atStart = activeOn(new Date(jan1.getTime() - 1)).length;
      years.push({
        year,
        started: started.length,
        cancelled: lost.length,
        revenueAdded: sum(started),
        revenueLost: sum(lost),
        atStart,
        lossRate: atStart ? (lost.length / atStart) * 100 : null,
      });
    }

    const kept = (span: number) => {
      const since = new Date(now);
      since.setFullYear(now.getFullYear() - span);
      const list = activeNow.filter((row) => row.start && row.start <= since);
      return { years: span, count: list.length, share: activeNow.length ? (list.length / activeNow.length) * 100 : 0, revenue: sum(list) };
    };

    return {
      revenueNow: sum(activeNow),
      revenueYearAgo: sum(activeYearAgo),
      revenueChange: change(sum(activeYearAgo), sum(activeNow)),
      activeNow: activeNow.length,
      activeYearAgo: activeYearAgo.length,
      activeChange: change(activeYearAgo.length, activeNow.length),
      lostLast12: lostLast12.length,
      lossRateLast12: activeYearAgo.length ? (lostLast12.length / activeYearAgo.length) * 100 : null,
      years,
      retention: [kept(1), kept(2), kept(5)],
      noStartActive: activeNow.filter((row) => !row.start).length,
      noStartAll: rows.filter((row) => !row.start).length,
      cancelledNoDate: rows.length - known.length,
    };
  }, [accounts, managerFilter]);

  const showOverview = reportType === "Overview";
  const showStarted = reportType === "YTD Started Accounts";
  const showCancelled = reportType === "YTD Cancelled Accounts";
  const showManagerSummary = reportType === "Manager Summary";
  const showComplaints = reportType === "Complaints";
  const showSales = reportType === "Sales & Commissions";
  const showVisits = reportType === "Visits";
  const showLastVisit = reportType === "Last Visit by Account";
  const showPerformance = reportType === "Account Management Performance";

  // Overview and Manager Summary print their summary on top, then every list
  // under it (Manager Summary: grouped by manager, each list keeping its own order).
  const withLists = showOverview || showManagerSummary;
  const showStartedList = showStarted || withLists;
  const showCancelledList = showCancelled || withLists;
  const showComplaintsList = showComplaints || withLists;
  const showSalesList = showSales || withLists;
  const showVisitsList = showVisits || withLists;
  const byManager = <T,>(rows: T[], manager: (row: T) => string) =>
    showManagerSummary ? [...rows].sort((a, b) => (manager(a) || "Unassigned").localeCompare(manager(b) || "Unassigned")) : rows;
  const complaintManager = (row: AnyRow) => getValue(row, ["manager", "Manager", "assignedTo", "Assigned To"]);
  const startedList = byManager(startedAccounts, getAccountManager);
  const cancelledList = byManager(cancelledAccounts, getAccountManager);
  const complaintsList = byManager(filteredComplaints, complaintManager);
  const salesList = byManager(filteredSales, (row) => getValue(row, ["manager", "Manager", "accountManager"]));
  const visitsList = byManager(visitsReport, getVisitManager);

  return (
    <main className="ui-screen print:bg-white print:p-0">
      <style>{`
        @media print {
          /* Margins only: no page size or orientation here, so the print
             dialog keeps its Layout choice (Portrait by default). The
             tables below are sized to fit Portrait. */
          @page {
            margin: 0.35in;
          }

          /* The table is never scrolled or clipped on paper: it shrinks to the page. */
          .overflow-x-auto {
            overflow: visible !important;
          }

          .ui-table {
            width: 100% !important;
            table-layout: auto;
          }

          /* Small enough for 9-10 columns on a Portrait page; long names
             and notes wrap inside their column instead of pushing it off. */
          .ui-table th,
          .ui-table td {
            font-size: 9px !important;
            line-height: 1.25 !important;
            padding: 3px 4px !important;
            white-space: normal !important;
            overflow-wrap: anywhere;
          }

          .ui-table th {
            font-weight: 700;
          }

          .ui-card {
            padding: 8px !important;
          }

          .reports-print-only {
            display: block !important;
          }

          .reports-screen-only {
            display: none !important;
          }

          /* No colored rows on paper (ink): the dot and the bold days carry it. */
          .visit-age-watch td,
          .visit-age-problem td {
            background: none !important;
          }

          html,
          body {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          main {
            min-height: 0 !important;
            padding: 0 !important;
            background: white !important;
          }

          .print-card {
            box-shadow: none !important;
            border: 1px solid #d1d5db !important;
          }

          .print-section {
            break-before: auto !important;
            page-break-before: auto !important;
            break-inside: auto !important;
            page-break-inside: auto !important;
          }

          .print-avoid-break {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          table {
            font-size: 10px;
            page-break-inside: auto !important;
          }

          thead {
            display: table-header-group;
          }

          tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          th,
          td {
            padding: 4px !important;
          }
        }

        /* Only on paper: the Cleaning World header and one-line summaries. */
        .reports-print-only {
          display: none;
        }

        /* Last Visit by Account: 30-59 days yellow, 60+ days or Never red.
           On screen the whole row; on paper only the dot. */
        .visit-age-watch td {
          background: #fff4c2;
        }
        .visit-age-problem td {
          background: #fde2df;
        }
        .visit-age-dot {
          display: inline-block;
          width: 9px;
          height: 9px;
          margin-right: 6px;
          border-radius: 50%;
          vertical-align: middle;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .visit-age-watch .visit-age-dot {
          background: #d49a00;
        }
        .visit-age-problem .visit-age-dot {
          background: #c0261c;
        }
      `}</style>

      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between print:hidden no-print">
          <div>
            <h1 className="ui-screen-title">Reports</h1>
            <p className="ui-muted">
              Select one report, preview it, then print or save as PDF.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-row">
            <button
              type="button"
              onClick={loadAllReportsData}
              className="ui-btn ui-btn-second"
            >
              Refresh
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="ui-btn ui-btn-main"
            >
              Print Selected Report
            </button>
          </div>
        </div>

        <section className="reports-print-only">
          <div className="mb-5 flex items-center justify-between border-b border-gray-300 pb-4">
            <div>
              <Image
                src="/cw-logo.jpg"
                alt="Cleaning World Logo"
                width={170}
                height={70}
                className="h-auto w-[170px]"
                priority
              />
            </div>

            <div className="text-right">
              <h1 className="ui-screen-title">Cleaning World</h1>
              <p className="ui-strong">
                Operations & Quality Report
              </p>
              <p className="ui-muted">{reportType}</p>
              <p className="ui-muted">
                {showLastVisit ? (
                  "All visits (date range does not apply)"
                ) : showPerformance ? (
                  `As of ${new Date().toLocaleDateString()} · Manager: ${managerFilter === "All" ? "All" : managerFilter}`
                ) : (
                  <>
                    Date Range: {safeDate(dateRange.start)} -{" "}
                    {safeDate(dateRange.end)}
                  </>
                )}
              </p>
              <p className="ui-muted">
                Printed on {new Date().toLocaleDateString()}
              </p>
            </div>
          </div>
        </section>

        <section className="ui-card print:hidden no-print">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <label className="ui-label">
                Report Type
              </label>
              <select
                value={reportType}
                onChange={(event) => setReportType(event.target.value)}
                className="ui-input w-full"
              >
                <option>Overview</option>
                <option>YTD Started Accounts</option>
                <option>YTD Cancelled Accounts</option>
                <option>Manager Summary</option>
                <option>Complaints</option>
                <option>Sales & Commissions</option>
                <option>Visits</option>
                <option>Last Visit by Account</option>
                <option>Account Management Performance</option>
              </select>
            </div>

            <div>
              <label className="ui-label">
                Date Range
              </label>
              <select
                value={datePreset}
                onChange={(event) => setDatePreset(event.target.value)}
                className="ui-input w-full"
              >
                <option>YTD</option>
                <option>This Month</option>
                <option>This Quarter</option>
                <option>Custom</option>
              </select>
            </div>

            <div>
              <label className="ui-label">
                Start Date
              </label>
              <input
                type="date"
                value={customStartDate}
                onChange={(event) => {
                  setDatePreset("Custom");
                  setCustomStartDate(event.target.value);
                }}
                className="ui-input w-full"
              />
            </div>

            <div>
              <label className="ui-label">
                End Date
              </label>
              <input
                type="date"
                value={customEndDate}
                onChange={(event) => {
                  setDatePreset("Custom");
                  setCustomEndDate(event.target.value);
                }}
                className="ui-input w-full"
              />
            </div>

            <div>
              <label className="ui-label">
                Search
              </label>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search reports..."
                className="ui-input w-full"
              />
            </div>

            <div>
              <label className="ui-label">
                Manager
              </label>
              <select
                value={managerFilter}
                onChange={(event) => setManagerFilter(event.target.value)}
                className="ui-input w-full"
              >
                {managers.map((manager) => (
                  <option key={manager} value={manager}>
                    {manager}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="ui-label">
                Subcontractor
              </label>
              <select
                value={subcontractorFilter}
                onChange={(event) => setSubcontractorFilter(event.target.value)}
                className="ui-input w-full"
              >
                {subcontractors.map((subcontractor) => (
                  <option key={subcontractor} value={subcontractor}>
                    {subcontractor}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="ui-label">
                Account Status
              </label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="ui-input w-full"
              >
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="ui-label">
                Salesperson
              </label>
              <select
                value={salespersonFilter}
                onChange={(event) => setSalespersonFilter(event.target.value)}
                className="ui-input w-full"
              >
                {salespeople.map((person) => (
                  <option key={person} value={person}>
                    {person}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="ui-label">
                Min Revenue
              </label>
              <input
                value={minRevenueFilter}
                onChange={(event) => setMinRevenueFilter(event.target.value)}
                inputMode="decimal"
                placeholder="$500"
                aria-label="Minimum monthly revenue"
                className="ui-input w-full"
              />
            </div>

            <div>
              <label className="ui-label">
                Max Revenue
              </label>
              <input
                value={maxRevenueFilter}
                onChange={(event) => setMaxRevenueFilter(event.target.value)}
                inputMode="decimal"
                placeholder="$2000"
                aria-label="Maximum monthly revenue"
                className="ui-input w-full"
              />
            </div>
          </div>
        </section>

        {loading ? (
          <section className="ui-card">
            Loading report data...
          </section>
        ) : (
          <>
            <section className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-blue-900 print:hidden no-print">
              Loaded records: {accounts.length} accounts, {visits.length}{" "}
              visits, {complaints.length} complaints, {sales.length} sales.
            </section>

            {loadError && (
              <section className="ui-field-error print:hidden no-print">
                {loadError}
              </section>
            )}

            {showOverview && (
              <section className="print-section">
                <div className="mb-3">
                  <h2 className="ui-card-title">
                    Report Overview
                  </h2>
                  <p className="ui-muted">
                    {safeDate(dateRange.start)} - {safeDate(dateRange.end)}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                  <SummaryCard
                    label="Active Accounts"
                    value={String(totals.activeAccounts)}
                    note={`Total shown: ${totals.totalAccounts}`}
                  />

                  <SummaryCard
                    label="Accounts Started"
                    value={String(totals.startedAccounts)}
                    note={`Revenue added: ${money(totals.revenueAdded)}`}
                  />

                  <SummaryCard
                    label="Accounts Cancelled"
                    value={String(totals.cancelledAccounts)}
                    note={`Revenue lost: ${money(totals.revenueLost)}`}
                  />

                  <SummaryCard
                    label="Net Monthly Growth"
                    value={money(totals.netRevenueGrowth)}
                    note="Added minus lost"
                  />

                  <SummaryCard
                    label="Active Monthly Revenue"
                    value={money(totals.activeRevenue)}
                    note={`Sub pay: ${money(totals.activeSubPay)}`}
                  />

                  <SummaryCard
                    label="Active Gross Margin"
                    value={money(totals.activeGrossMargin)}
                    note="Revenue minus sub pay"
                  />

                  <SummaryCard
                    label="Complaints"
                    value={String(totals.complaints)}
                    note={`Open / Pending: ${totals.openComplaints}`}
                  />

                  <SummaryCard
                    label="Sales"
                    value={money(totals.salesTotal)}
                    note={`Commission: ${money(totals.commissionTotal)}`}
                  />
                </div>
              </section>
            )}

            {showManagerSummary && (
              <section className="ui-card">
                <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
                  <h2 className="ui-card-title">
                    Manager Summary
                  </h2>

                  <div className="font-semibold text-gray-700">
                    Count: {managerSummary.length} managers
                  </div>
                </div>

                <ReportTable>
                  <thead>
                    <tr className="border-b bg-gray-50 text-gray-600">
                      <th className="px-4 py-3">Manager</th>
                      <th className="px-4 py-3">Visits</th>
                      <th className="px-4 py-3">Complaints</th>
                      <th className="px-4 py-3">Started</th>
                      <th className="px-4 py-3">Cancelled</th>
                      <th className="px-4 py-3">Revenue Added</th>
                      <th className="px-4 py-3">Revenue Lost</th>
                      <th className="px-4 py-3">Sales</th>
                      <th className="px-4 py-3">Commission</th>
                    </tr>
                  </thead>

                  <tbody>
                    {managerSummary.length === 0 ? (
                      <tr>
                        <td
                          colSpan={9}
                          className="px-4 py-6 text-center text-gray-500"
                        >
                          No manager activity found.
                        </td>
                      </tr>
                    ) : (
                      managerSummary.map(([manager, data]) => (
                        <tr key={manager} className="border-b">
                          <td className="px-4 py-3 font-semibold text-gray-900">
                            {manager}
                          </td>
                          <td className="px-4 py-3">{data.visits}</td>
                          <td className="px-4 py-3">{data.complaints}</td>
                          <td className="px-4 py-3">
                            {data.accountsStarted}
                          </td>
                          <td className="px-4 py-3">
                            {data.accountsCancelled}
                          </td>
                          <td className="px-4 py-3">
                            {money(data.revenueAdded)}
                          </td>
                          <td className="px-4 py-3">
                            {money(data.revenueLost)}
                          </td>
                          <td className="px-4 py-3">
                            {money(data.salesTotal)}
                          </td>
                          <td className="px-4 py-3">
                            {money(data.commissionTotal)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </ReportTable>
              </section>
            )}

            {showStartedList && (
              <section className="ui-card">
                <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h2 className="ui-card-title">
                      YTD / Filtered Started Accounts
                    </h2>
                    <p className="ui-muted">
                      Accounts with Start Date between{" "}
                      {safeDate(dateRange.start)} and {safeDate(dateRange.end)}.
                    </p>
                  </div>

                  <div className="font-semibold text-gray-700">
                    Count: {startedList.length} | Revenue Added:{" "}
                    {money(totals.revenueAdded)}
                  </div>
                </div>

                <ReportTable>
                  <thead>
                    <tr className="border-b bg-gray-50 text-gray-600">
                      <th className="px-4 py-3">Start Date</th>
                      <th className="px-4 py-3">Account</th>
                      <th className="px-4 py-3">Manager</th>
                      <th className="px-4 py-3">Subcontractor</th>
                      <th className="px-4 py-3">Monthly Revenue</th>
                      <th className="px-4 py-3">Sub Pay</th>
                      <th className="px-4 py-3">Gross Margin</th>
                      <th className="px-4 py-3">GM %</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {startedList.length === 0 ? (
                      <tr>
                        <td
                          colSpan={9}
                          className="px-4 py-6 text-center text-gray-500"
                        >
                          No started accounts found for this filter. Check that
                          the Accounts sheet has a Start Date / Starting Date /
                          Date Started column with dates in this range.
                        </td>
                      </tr>
                    ) : (
                      startedList.map((account, index) => (
                        <tr key={index} className="border-b">
                          <td className="px-4 py-3">
                            {safeDate(getStartDate(account))}
                          </td>
                          <td className="px-4 py-3 font-semibold text-gray-900">
                            <AccountLink accountId={getValue(account, ["accountId", "Account ID", "id", "ID"])} name={getAccountName(account)} />
                          </td>
                          <td className="px-4 py-3">
                            {getAccountManager(account) || "-"}
                          </td>
                          <td className="px-4 py-3">
                            {getSubcontractor(account) || "-"}
                          </td>
                          <td className="px-4 py-3">
                            {money(getMonthlyRevenue(account))}
                          </td>
                          <td className="px-4 py-3">
                            {money(getMonthlySubPay(account))}
                          </td>
                          <td className="px-4 py-3">
                            {money(getGrossMargin(account))}
                          </td>
                          <td className="px-4 py-3">
                            {getGrossMarginPercent(account).toFixed(1)}%
                          </td>
                          <td className="px-4 py-3">
                            {getStatus(account) || "-"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </ReportTable>
              </section>
            )}

            {showCancelledList && (
              <section className="ui-card">
                <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h2 className="ui-card-title">
                      YTD / Filtered Cancelled Accounts
                    </h2>
                    <p className="ui-muted">
                      Accounts with Cancelled Date between{" "}
                      {safeDate(dateRange.start)} and {safeDate(dateRange.end)}.
                    </p>
                  </div>

                  <div className="font-semibold text-gray-700">
                    Count: {cancelledList.length} | Revenue Lost:{" "}
                    {money(totals.revenueLost)}
                  </div>
                </div>

                <ReportTable>
                  <thead>
                    <tr className="border-b bg-gray-50 text-gray-600">
                      <th className="px-4 py-3">Cancelled Date</th>
                      <th className="px-4 py-3">Account</th>
                      <th className="px-4 py-3">Manager</th>
                      <th className="px-4 py-3">Subcontractor</th>
                      <th className="px-4 py-3">Lost Revenue</th>
                      <th className="px-4 py-3">Sub Pay</th>
                      <th className="px-4 py-3">Lost Margin</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Notes / Reason</th>
                    </tr>
                  </thead>

                  <tbody>
                    {cancelledList.length === 0 ? (
                      <tr>
                        <td
                          colSpan={9}
                          className="px-4 py-6 text-center text-gray-500"
                        >
                          No cancelled accounts found for this filter.
                        </td>
                      </tr>
                    ) : (
                      cancelledList.map((account, index) => (
                        <tr key={index} className="border-b">
                          <td className="px-4 py-3">
                            {safeDate(getCancelledDate(account))}
                          </td>
                          <td className="px-4 py-3 font-semibold text-gray-900">
                            <AccountLink accountId={getValue(account, ["accountId", "Account ID", "id", "ID"])} name={getAccountName(account)} />
                          </td>
                          <td className="px-4 py-3">
                            {getAccountManager(account) || "-"}
                          </td>
                          <td className="px-4 py-3">
                            {getSubcontractor(account) || "-"}
                          </td>
                          <td className="px-4 py-3">
                            {money(getMonthlyRevenue(account))}
                          </td>
                          <td className="px-4 py-3">
                            {money(getMonthlySubPay(account))}
                          </td>
                          <td className="px-4 py-3">
                            {money(getGrossMargin(account))}
                          </td>
                          <td className="px-4 py-3">
                            {getStatus(account) || "-"}
                          </td>
                          <td className="px-4 py-3">
                            {getValue(account, [
                              "notes",
                              "Notes",
                              "reason",
                              "Reason",
                              "cancelReason",
                              "Cancel Reason",
                              "cancellationReason",
                              "Cancellation Reason",
                            ]) || "-"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </ReportTable>
              </section>
            )}

            {showComplaintsList && (
              <section className="ui-card">
                <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
                  <h2 className="ui-card-title">
                    Complaints Report
                  </h2>

                  <div className="font-semibold text-gray-700">
                    Count: {complaintsList.length} | Open / Pending:{" "}
                    {totals.openComplaints}
                  </div>
                </div>

                <ReportTable>
                  <thead>
                    <tr className="border-b bg-gray-50 text-gray-600">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Account</th>
                      <th className="px-4 py-3">Issue</th>
                      <th className="px-4 py-3">Manager</th>
                      <th className="px-4 py-3">Validity</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {complaintsList.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-6 text-center text-gray-500"
                        >
                          No complaints found for this filter.
                        </td>
                      </tr>
                    ) : (
                      complaintsList.map((complaint, index) => (
                        <tr key={index} className="border-b">
                          <td className="px-4 py-3">
                            {safeDate(
                              getValue(complaint, [
                                "date",
                                "Date",
                                "complaintDate",
                                "Complaint Date",
                              ])
                            )}
                          </td>
                          <td className="px-4 py-3 font-semibold text-gray-900">
                            <AccountLink
                              accountId={getValue(complaint, ["accountId", "Account ID"])}
                              name={getValue(complaint, [
                                "account",
                                "Account",
                                "accountName",
                                "Account Name",
                              ]) || "-"}
                            />
                          </td>
                          <td className="px-4 py-3">
                            {getValue(complaint, [
                              "issue",
                              "Issue",
                              "complaint",
                              "Complaint",
                              "description",
                              "Description",
                            ]) || "-"}
                          </td>
                          <td className="px-4 py-3">
                            {getValue(complaint, [
                              "manager",
                              "Manager",
                              "assignedTo",
                              "Assigned To",
                            ]) || "-"}
                          </td>
                          <td className="px-4 py-3">
                            {getValue(complaint, [
                              "validity",
                              "Validity",
                              "complaintValidity",
                              "Complaint Validity",
                            ]) || "-"}
                          </td>
                          <td className="px-4 py-3">
                            {getValue(complaint, ["status", "Status"]) ||
                              "Pending"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </ReportTable>
              </section>
            )}

            {showSalesList && (
              <section className="ui-card">
                <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h2 className="ui-card-title">
                      Sales & Commission Report
                    </h2>
                    <p className="ui-muted">
                      Printable sales commission summary.
                    </p>
                  </div>

                  <div className="font-semibold text-gray-700">
                    Count: {salesList.length} | Sales:{" "}
                    {money(totals.salesTotal)} | Commission:{" "}
                    {money(totals.commissionTotal)}
                  </div>
                </div>

                <ReportTable>
                  <thead>
                    <tr className="border-b bg-gray-50 text-gray-600">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Quarter</th>
                      <th className="px-4 py-3">Estimate / WO #</th>
                      <th className="px-4 py-3">Account</th>
                      <th className="px-4 py-3">Service</th>
                      <th className="px-4 py-3">Sold By</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Commission %</th>
                      <th className="px-4 py-3">Commission</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {salesList.length === 0 ? (
                      <tr>
                        <td
                          colSpan={10}
                          className="px-4 py-6 text-center text-gray-500"
                        >
                          No sales found for this filter.
                        </td>
                      </tr>
                    ) : (
                      salesList.map((sale, index) => {
                        const date = getSaleDate(sale);

                        return (
                          <tr key={index} className="border-b">
                            <td className="px-4 py-3">{safeDate(date)}</td>
                            <td className="px-4 py-3">{getQuarter(date)}</td>
                            <td className="px-4 py-3">
                              {getValue(sale, [
                                "estimateNumber",
                                "Estimate Number",
                                "workOrderNumber",
                                "Work Order Number",
                                "woNumber",
                                "WO Number",
                                "invoiceNumber",
                                "Invoice Number",
                              ]) || "-"}
                            </td>
                            <td className="px-4 py-3 font-semibold text-gray-900">
                              <AccountLink
                                accountId={getValue(sale, ["accountId", "Account ID"])}
                                name={getValue(sale, [
                                  "account",
                                  "Account",
                                  "accountName",
                                  "Account Name",
                                ]) || "-"}
                              />
                            </td>
                            <td className="px-4 py-3">
                              {getValue(sale, [
                                "service",
                                "Service",
                                "type",
                                "Type",
                              ]) || "-"}
                            </td>
                            <td className="px-4 py-3">
                              {getValue(sale, [
                                "soldBy",
                                "Sold By",
                                "salesPerson",
                                "Sales Person",
                                "salesperson",
                                "Salesperson",
                              ]) || "-"}
                            </td>
                            <td className="px-4 py-3">
                              {money(getSaleAmount(sale))}
                            </td>
                            <td className="px-4 py-3">
                              {getValue(sale, [
                                "commissionPercent",
                                "Commission Percent",
                                "commission%",
                                "Commission %",
                                "commissionRate",
                                "Commission Rate",
                              ]) || "-"}
                            </td>
                            <td className="px-4 py-3">
                              {money(getCommissionAmount(sale))}
                            </td>
                            <td className="px-4 py-3">
                              {getValue(sale, ["status", "Status"]) ||
                                "Pending"}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </ReportTable>
              </section>
            )}

            {showVisitsList && (
              <section className="ui-card">
                <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h2 className="ui-card-title">Visits</h2>
                    <p className="ui-muted">
                      Every visit between {safeDate(dateRange.start)} and{" "}
                      {safeDate(dateRange.end)}, newest first.
                    </p>
                  </div>

                  <div className="reports-screen-only font-semibold text-gray-700">
                    Total visits: {visitsList.length}
                  </div>
                </div>

                <p className="reports-print-only mb-2 font-semibold">
                  Total visits: {visitsList.length}
                  {visitsPerManager.length > 0
                    ? ` | Per manager: ${visitsPerManager.map(([manager, count]) => `${manager} ${count}`).join(", ")}`
                    : ""}
                </p>

                {visitsPerManager.length > 0 ? (
                  <div className="reports-screen-only mb-4 flex flex-wrap gap-x-6 gap-y-1 text-gray-700">
                    <span className="font-semibold">Per manager:</span>
                    {visitsPerManager.map(([manager, count]) => (
                      <span key={manager}>
                        {manager}: <strong>{count}</strong>
                      </span>
                    ))}
                  </div>
                ) : null}

                <ReportTable>
                  <thead>
                    <tr className="border-b bg-gray-50 text-gray-600">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Account</th>
                      <th className="px-4 py-3">Visited By</th>
                      <th className="px-4 py-3">Subcontractor</th>
                      <th className="px-4 py-3">Type / Notes</th>
                    </tr>
                  </thead>

                  <tbody>
                    {visitsList.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                          No visits found for this filter.
                        </td>
                      </tr>
                    ) : (
                      visitsList.map((visit, index) => {
                        const account = accountForVisit(visit);
                        return (
                          <tr key={getValue(visit, ["id", "Visit ID"]) || index} className="border-b">
                            <td className="px-4 py-3 whitespace-nowrap">{safeDate(getVisitDate(visit))}</td>
                            <td className="px-4 py-3 font-semibold text-gray-900">
                              <AccountLink
                                accountId={account ? getValue(account, ["accountId", "Account ID", "id", "ID"]) : getValue(visit, ["accountId", "Account ID"])}
                                name={getValue(visit, ["accountName", "Account Name", "account", "Account"]) || "-"}
                              />
                            </td>
                            <td className="px-4 py-3">{getVisitManager(visit) || "-"}</td>
                            <td className="px-4 py-3">{(account && getSubcontractor(account)) || "-"}</td>
                            <td className="px-4 py-3">{visitSummary(visit)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </ReportTable>
              </section>
            )}

            {showLastVisit && (
              <section className="ui-card">
                <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h2 className="ui-card-title">Last Visit by Account</h2>
                    <p className="ui-muted">
                      {statusFilter === "All" ? "Active accounts" : `Accounts with status ${statusFilter}`}, oldest visit
                      first. Uses all visits: the date range does not apply.
                    </p>
                  </div>

                  <div className="reports-screen-only font-semibold text-gray-700">
                    Accounts: {lastVisitReport.rows.length}
                  </div>
                </div>

                <p className="reports-print-only mb-2 font-semibold">
                  Accounts: {lastVisitReport.rows.length} | 30+ days: {lastVisitReport.days30} | 60+ days:{" "}
                  {lastVisitReport.days60} | Never: {lastVisitReport.never}
                </p>

                <div className="reports-screen-only mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                  <SummaryCard label="30+ days since a visit" value={String(lastVisitReport.days30)} note="Includes the 60+ days ones" />
                  <SummaryCard label="60+ days since a visit" value={String(lastVisitReport.days60)} note="Marked red" />
                  <SummaryCard label="Never visited" value={String(lastVisitReport.never)} note="Marked red, at the top" />
                </div>

                <ReportTable>
                  <thead>
                    <tr className="border-b bg-gray-50 text-gray-600">
                      <th className="px-4 py-3">Account</th>
                      <th className="px-4 py-3">Manager</th>
                      <th className="px-4 py-3">Subcontractor</th>
                      <th className="px-4 py-3">Last Visit</th>
                      <th className="px-4 py-3">Days Since</th>
                      <th className="px-4 py-3">Visited By</th>
                    </tr>
                  </thead>

                  <tbody>
                    {lastVisitReport.rows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                          No accounts found for this filter.
                        </td>
                      </tr>
                    ) : (
                      lastVisitReport.rows.map(({ account, last, days }, index) => {
                        const age = days === null || days >= 60 ? "visit-age-problem" : days >= 30 ? "visit-age-watch" : "";
                        return (
                          <tr key={getValue(account, ["accountId", "Account ID", "id", "ID"]) || index} className={`border-b ${age}`}>
                            <td className="px-4 py-3 font-semibold text-gray-900">
                              <AccountLink accountId={getValue(account, ["accountId", "Account ID", "id", "ID"])} name={getAccountName(account)} />
                            </td>
                            <td className="px-4 py-3">{getAccountManager(account) || "-"}</td>
                            <td className="px-4 py-3">{getSubcontractor(account) || "-"}</td>
                            <td className="px-4 py-3 whitespace-nowrap">{last ? last.date.toLocaleDateString() : <strong>Never</strong>}</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {age ? <span className="visit-age-dot" aria-hidden="true" /> : null}
                              {days === null ? <strong>Never</strong> : days >= 30 ? <strong>{days}</strong> : days}
                            </td>
                            <td className="px-4 py-3">{last?.by || "-"}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </ReportTable>
              </section>
            )}

            {showPerformance && (
              <section className="ui-card">
                <div className="mb-4">
                  <h2 className="ui-card-title">Account Management Performance</h2>
                  <p className="ui-muted">
                    {managerFilter === "All" ? "All managers" : `Manager: ${managerFilter}`}. Today compared with 12 months ago.
                    Only the Manager filter applies.
                  </p>
                </div>

                <h3 className="ui-strong mb-2">1. Are we growing?</h3>
                <div className="print-avoid-break mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <SummaryCard
                    label="Monthly revenue now"
                    value={money(performance.revenueNow)}
                    note={`12 months ago: ${money(performance.revenueYearAgo)} (${percentChange(performance.revenueChange)})`}
                  />
                  <SummaryCard
                    label="Active accounts now"
                    value={String(performance.activeNow)}
                    note={`12 months ago: ${performance.activeYearAgo} (${percentChange(performance.activeChange)})`}
                  />
                </div>

                <ReportTable>
                  <thead>
                    <tr className="border-b bg-gray-50 text-gray-600">
                      <th className="px-4 py-3">Year</th>
                      <th className="px-4 py-3">Started</th>
                      <th className="px-4 py-3">Cancelled</th>
                      <th className="px-4 py-3">Net Accounts</th>
                      <th className="px-4 py-3">Revenue Added</th>
                      <th className="px-4 py-3">Revenue Lost</th>
                      <th className="px-4 py-3">Net Revenue</th>
                      <th className="px-4 py-3">Loss Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {performance.years.map((row) => (
                      <tr key={row.year} className="border-b">
                        <td className="px-4 py-3 font-semibold text-gray-900">
                          {row.year}
                          {row.year === new Date().getFullYear() ? " (so far)" : ""}
                        </td>
                        <td className="px-4 py-3">{row.started}</td>
                        <td className="px-4 py-3">{row.cancelled}</td>
                        <td className="px-4 py-3 font-semibold">{signed(row.started - row.cancelled)}</td>
                        <td className="px-4 py-3">{money(row.revenueAdded)}</td>
                        <td className="px-4 py-3">{money(row.revenueLost)}</td>
                        <td className="px-4 py-3 font-semibold">{money(row.revenueAdded - row.revenueLost)}</td>
                        <td className="px-4 py-3">
                          {row.lossRate === null ? "-" : `${row.lossRate.toFixed(1)}%`}
                          <span className="ui-muted"> ({row.cancelled} of {row.atStart})</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </ReportTable>
                <p className="ui-muted mt-2">
                  Loss rate = accounts cancelled that year ÷ accounts active on January 1 of that year. Revenue is each account&apos;s
                  monthly price.
                </p>

                <h3 className="ui-strong mb-2 mt-6">2. How many accounts do we lose?</h3>
                <div className="print-avoid-break mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <SummaryCard
                    label="Loss rate, last 12 months"
                    value={performance.lossRateLast12 === null ? "-" : `${performance.lossRateLast12.toFixed(1)}%`}
                    note={`${performance.lostLast12} cancelled out of ${performance.activeYearAgo} active 12 months ago`}
                  />
                </div>

                <h3 className="ui-strong mb-2 mt-6">3. How long do accounts stay?</h3>
                <div className="print-avoid-break mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                  {performance.retention.map((row) => (
                    <SummaryCard
                      key={row.years}
                      label={`With us more than ${row.years} year${row.years === 1 ? "" : "s"}`}
                      value={String(row.count)}
                      note={`${row.share.toFixed(0)}% of active accounts · ${money(row.revenue)} a month`}
                    />
                  ))}
                </div>

                <div className="print-avoid-break rounded-xl border border-amber-200 bg-amber-50 p-3 text-gray-800">
                  <p className="font-semibold">About the data</p>
                  <ul className="ml-5 list-disc">
                    <li>
                      {performance.noStartAll} account{performance.noStartAll === 1 ? " has" : "s have"} no start date (
                      {performance.noStartActive} of them active). They count as already active 12 months ago and are left out
                      of the 1, 2 and 5 year counts.
                    </li>
                    <li>
                      {performance.cancelledNoDate} cancelled account{performance.cancelledNoDate === 1 ? " has" : "s have"} no
                      cancelled date and {performance.cancelledNoDate === 1 ? "is" : "are"} left out, because when{" "}
                      {performance.cancelledNoDate === 1 ? "it" : "they"} left is not known.
                    </li>
                    <li>Revenue 12 months ago uses today&apos;s prices: the app keeps no price history.</li>
                  </ul>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

/** "+5.2%", "-3.0%", or "no data" when there is nothing to compare with. */
function percentChange(value: number | null) {
  if (value === null) return "no data";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function getVisitDate(row: AnyRow) {
  return getValue(row, ["date", "Date", "visitDate", "Visit Date"]);
}

/** Who made the visit. */
function getVisitManager(row: AnyRow) {
  return getValue(row, ["manager", "Manager", "completedBy", "Completed By", "visitedBy", "Visited By"]);
}

/** "Routine Visit: floors look good…": the type, then the notes cut short. */
function visitSummary(row: AnyRow) {
  const type = getValue(row, ["visitType", "Visit Type", "type", "Type"]);
  const notes = getValue(row, ["notes", "Notes"]).replace(/\s+/g, " ");
  const short = notes.length > 140 ? `${notes.slice(0, 137).trimEnd()}…` : notes;
  if (type && short) return `${type}: ${short}`;
  return type || short || "-";
}

function SummaryCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="ui-card">
      <p className="ui-muted">{label}</p>
      <p className="ui-stat-value">{value}</p>
      <p className="ui-muted">{note}</p>
    </div>
  );
}

function ReportTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="ui-table w-full">
        {children}
      </table>
    </div>
  );
}