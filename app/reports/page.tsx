"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

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
  const [search, setSearch] = useState("");

  async function loadAllReportsData() {
    try {
      setLoading(true);
      setLoadError("");

      const [accountsRes, visitsRes, complaintsRes, salesRes] =
        await Promise.allSettled([
          fetch("/api/accounts", { cache: "no-store" }),
          fetch("/api/visits", { cache: "no-store" }),
          fetch("/api/complaints", { cache: "no-store" }),
          fetch("/api/sales", { cache: "no-store" }),
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
    return accounts.filter((account) => {
      const manager = getAccountManager(account);
      const subcontractor = getSubcontractor(account);
      const status = getStatus(account);

      return (
        (managerFilter === "All" || manager === managerFilter) &&
        (subcontractorFilter === "All" ||
          subcontractor === subcontractorFilter) &&
        (statusFilter === "All" || status === statusFilter) &&
        rowMatchesSearch(account, search)
      );
    });
  }, [accounts, managerFilter, subcontractorFilter, statusFilter, search]);

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

  const showOverview = reportType === "Overview";
  const showStarted = reportType === "YTD Started Accounts";
  const showCancelled = reportType === "YTD Cancelled Accounts";
  const showManagerSummary = reportType === "Manager Summary";
  const showComplaints = reportType === "Complaints";
  const showSales = reportType === "Sales & Commissions";

  return (
    <main className="min-h-screen bg-gray-100 p-4 text-gray-900 print:bg-white print:p-0 sm:p-6">
      <style>{`
        @media print {
          @page {
            size: letter;
            margin: 0.45in;
          }

          body {
            background: white !important;
            color: black !important;
          }

          .print-card {
            box-shadow: none !important;
            border: 1px solid #d1d5db !important;
            break-inside: avoid;
          }

          .print-section {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          table {
            font-size: 10.5px;
          }

          th, td {
            padding: 5px !important;
          }
        }
      `}</style>

      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between print:hidden">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
            <p className="text-sm leading-6 text-gray-600 sm:text-base">
              Select one report, preview it, then print or save as PDF.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-row">
            <button
              type="button"
              onClick={loadAllReportsData}
              className="rounded-lg border border-gray-300 bg-white px-5 py-3 font-semibold text-gray-700 hover:bg-gray-50"
            >
              Refresh
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800"
            >
              Print Selected Report
            </button>
          </div>
        </div>

        <section className="hidden print:block">
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
              <h1 className="text-2xl font-bold">Cleaning World</h1>
              <p className="text-lg font-semibold">
                Operations & Quality Report
              </p>
              <p className="text-sm text-gray-600">{reportType}</p>
              <p className="text-sm text-gray-600">
                Date Range: {safeDate(dateRange.start)} -{" "}
                {safeDate(dateRange.end)}
              </p>
              <p className="text-sm text-gray-600">
                Printed on {new Date().toLocaleDateString()}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow print:hidden">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Report Type
              </label>
              <select
                value={reportType}
                onChange={(event) => setReportType(event.target.value)}
                className="min-h-[48px] w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                <option>Overview</option>
                <option>YTD Started Accounts</option>
                <option>YTD Cancelled Accounts</option>
                <option>Manager Summary</option>
                <option>Complaints</option>
                <option>Sales & Commissions</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Date Range
              </label>
              <select
                value={datePreset}
                onChange={(event) => setDatePreset(event.target.value)}
                className="min-h-[48px] w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                <option>YTD</option>
                <option>This Month</option>
                <option>This Quarter</option>
                <option>Custom</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Start Date
              </label>
              <input
                type="date"
                value={customStartDate}
                onChange={(event) => {
                  setDatePreset("Custom");
                  setCustomStartDate(event.target.value);
                }}
                className="min-h-[48px] w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                End Date
              </label>
              <input
                type="date"
                value={customEndDate}
                onChange={(event) => {
                  setDatePreset("Custom");
                  setCustomEndDate(event.target.value);
                }}
                className="min-h-[48px] w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Search
              </label>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search reports..."
                className="min-h-[48px] w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Manager
              </label>
              <select
                value={managerFilter}
                onChange={(event) => setManagerFilter(event.target.value)}
                className="min-h-[48px] w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                {managers.map((manager) => (
                  <option key={manager} value={manager}>
                    {manager}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Subcontractor
              </label>
              <select
                value={subcontractorFilter}
                onChange={(event) => setSubcontractorFilter(event.target.value)}
                className="min-h-[48px] w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                {subcontractors.map((subcontractor) => (
                  <option key={subcontractor} value={subcontractor}>
                    {subcontractor}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Account Status
              </label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="min-h-[48px] w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Salesperson
              </label>
              <select
                value={salespersonFilter}
                onChange={(event) => setSalespersonFilter(event.target.value)}
                className="min-h-[48px] w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                {salespeople.map((person) => (
                  <option key={person} value={person}>
                    {person}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {loading ? (
          <section className="rounded-xl bg-white p-6 shadow">
            Loading report data...
          </section>
        ) : (
          <>
            <section className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900 print:hidden">
              Loaded records: {accounts.length} accounts, {visits.length}{" "}
              visits, {complaints.length} complaints, {sales.length} sales.
            </section>

            {loadError && (
              <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 print:hidden">
                {loadError}
              </section>
            )}

            {showOverview && (
              <section className="print-section">
                <div className="mb-3">
                  <h2 className="text-xl font-bold text-gray-900">
                    Report Overview
                  </h2>
                  <p className="text-sm text-gray-600">
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
              <section className="print-section rounded-xl bg-white p-5 shadow print-card">
                <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
                  <h2 className="text-xl font-bold text-gray-900">
                    Manager Summary
                  </h2>

                  <div className="text-sm font-semibold text-gray-700">
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

            {showStarted && (
              <section className="print-section rounded-xl bg-white p-5 shadow print-card">
                <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      YTD / Filtered Started Accounts
                    </h2>
                    <p className="text-sm text-gray-600">
                      Accounts with Start Date between{" "}
                      {safeDate(dateRange.start)} and {safeDate(dateRange.end)}.
                    </p>
                  </div>

                  <div className="text-sm font-semibold text-gray-700">
                    Count: {startedAccounts.length} | Revenue Added:{" "}
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
                    {startedAccounts.length === 0 ? (
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
                      startedAccounts.map((account, index) => (
                        <tr key={index} className="border-b">
                          <td className="px-4 py-3">
                            {safeDate(getStartDate(account))}
                          </td>
                          <td className="px-4 py-3 font-semibold text-gray-900">
                            {getAccountName(account)}
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

            {showCancelled && (
              <section className="print-section rounded-xl bg-white p-5 shadow print-card">
                <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      YTD / Filtered Cancelled Accounts
                    </h2>
                    <p className="text-sm text-gray-600">
                      Accounts with Cancelled Date between{" "}
                      {safeDate(dateRange.start)} and {safeDate(dateRange.end)}.
                    </p>
                  </div>

                  <div className="text-sm font-semibold text-gray-700">
                    Count: {cancelledAccounts.length} | Revenue Lost:{" "}
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
                    {cancelledAccounts.length === 0 ? (
                      <tr>
                        <td
                          colSpan={9}
                          className="px-4 py-6 text-center text-gray-500"
                        >
                          No cancelled accounts found for this filter.
                        </td>
                      </tr>
                    ) : (
                      cancelledAccounts.map((account, index) => (
                        <tr key={index} className="border-b">
                          <td className="px-4 py-3">
                            {safeDate(getCancelledDate(account))}
                          </td>
                          <td className="px-4 py-3 font-semibold text-gray-900">
                            {getAccountName(account)}
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

            {showComplaints && (
              <section className="print-section rounded-xl bg-white p-5 shadow print-card">
                <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
                  <h2 className="text-xl font-bold text-gray-900">
                    Complaints Report
                  </h2>

                  <div className="text-sm font-semibold text-gray-700">
                    Count: {filteredComplaints.length} | Open / Pending:{" "}
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
                    {filteredComplaints.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-6 text-center text-gray-500"
                        >
                          No complaints found for this filter.
                        </td>
                      </tr>
                    ) : (
                      filteredComplaints.slice(0, 50).map((complaint, index) => (
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
                            {getValue(complaint, [
                              "account",
                              "Account",
                              "accountName",
                              "Account Name",
                            ]) || "-"}
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

            {showSales && (
              <section className="print-section rounded-xl bg-white p-5 shadow print-card">
                <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      Sales & Commission Report
                    </h2>
                    <p className="text-sm text-gray-600">
                      Printable sales commission summary.
                    </p>
                  </div>

                  <div className="text-sm font-semibold text-gray-700">
                    Count: {filteredSales.length} | Sales:{" "}
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
                    {filteredSales.length === 0 ? (
                      <tr>
                        <td
                          colSpan={10}
                          className="px-4 py-6 text-center text-gray-500"
                        >
                          No sales found for this filter.
                        </td>
                      </tr>
                    ) : (
                      filteredSales.map((sale, index) => {
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
                              {getValue(sale, [
                                "account",
                                "Account",
                                "accountName",
                                "Account Name",
                              ]) || "-"}
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
          </>
        )}
      </div>
    </main>
  );
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
    <div className="print-card rounded-xl bg-white p-5 shadow">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-600">{note}</p>
    </div>
  );
}

function ReportTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        {children}
      </table>
    </div>
  );
}