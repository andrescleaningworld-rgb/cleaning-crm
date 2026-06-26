"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type RawAccount = {
  "Account ID"?: string;
  "Account Name"?: string;
  Account?: string;
  Name?: string;
  accountId?: string;
  accountName?: string;
  id?: string;
  name?: string;
  Manager?: string;
  manager?: string;
  Subcontractor?: string;
  subcontractor?: string;
  "Sub Contractor"?: string;
};

type RawSale = {
  "Sale ID"?: string;
  id?: string;
  "Account ID"?: string;
  accountId?: string;
  "Account Name"?: string;
  accountName?: string;
  "Sale Date"?: string;
  date?: string;
  "Service Sold"?: string;
  service?: string;
  "Service Type"?: string;
  type?: string;
  "Sold By"?: string;
  soldBy?: string;
  Manager?: string;
  manager?: string;
  "Amount Sold"?: string | number;
  Amount?: string | number;
  amount?: string | number;
  "Commission %"?: string | number;
  commissionPercent?: string | number;
  "Commission $"?: string | number;
  "Commission Amount"?: string | number;
  commissionAmount?: string | number;
  Status?: string;
  status?: string;
  "Work Order / Estimate #"?: string;
  "Work Order / Estimate"?: string;
  "Work Order / Est"?: string;
  workOrder?: string;
  Notes?: string;
  notes?: string;
};

type Account = {
  id: string;
  name: string;
  manager: string;
  subcontractor: string;
};

type Sale = {
  id: string;
  accountId: string;
  accountName: string;
  saleDate: string;
  saleDateRaw: string;
  serviceSold: string;
  serviceType: string;
  soldBy: string;
  manager: string;
  amount: number;
  commissionPercent: number;
  commissionAmount: number;
  status: string;
  workOrderEstimateNumber: string;
  notes: string;
};

function cleanText(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function toNumber(value: string | number | undefined) {
  if (typeof value === "number") return value;
  if (!value) return 0;

  const cleaned = String(value).replace(/[$,% ,]/g, "");
  const number = Number(cleaned);

  return Number.isFinite(number) ? number : 0;
}

function createIdFromName(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, "-");
}

function formatDate(value: string) {
  if (!value) return "N/A";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-US");
}

function formatMoney(amount: number) {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function getCurrentQuarter() {
  const month = new Date().getMonth() + 1;

  if (month <= 3) return "Q1";
  if (month <= 6) return "Q2";
  if (month <= 9) return "Q3";

  return "Q4";
}

function getQuarterFromDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const month = date.getMonth() + 1;

  if (month <= 3) return "Q1";
  if (month <= 6) return "Q2";
  if (month <= 9) return "Q3";

  return "Q4";
}

function getYearFromDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return String(date.getFullYear());
}

function createSaleId(raw: RawSale, index: number) {
  const accountId = cleanText(raw["Account ID"] || raw.accountId, "sale");
  const saleDate = cleanText(raw["Sale Date"] || raw.date, "no-date")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-");

  return `${accountId}-${saleDate}-${index + 1}`;
}

function mapRawAccount(raw: RawAccount): Account {
  const name = cleanText(
    raw["Account Name"] ||
      raw.accountName ||
      raw.Account ||
      raw.Name ||
      raw.name,
    "Unnamed Account"
  );

  const id = cleanText(
    raw["Account ID"] || raw.accountId || raw.id,
    createIdFromName(name)
  );

  return {
    id,
    name,
    manager: cleanText(raw.Manager || raw.manager, "Unassigned"),
    subcontractor: cleanText(
      raw.Subcontractor || raw.subcontractor || raw["Sub Contractor"],
      "Unassigned"
    ),
  };
}

function mapRawSale(raw: RawSale, index: number): Sale {
  const amount = toNumber(raw["Amount Sold"] || raw.Amount || raw.amount);

  const commissionPercent = toNumber(
    raw["Commission %"] || raw.commissionPercent
  );

  const commissionAmountFromSheet = toNumber(
    raw["Commission $"] || raw["Commission Amount"] || raw.commissionAmount
  );

  const commissionAmount =
    commissionAmountFromSheet || amount * (commissionPercent / 100);

  return {
    id: cleanText(raw["Sale ID"] || raw.id, createSaleId(raw, index)),
    accountId: cleanText(raw["Account ID"] || raw.accountId, ""),
    accountName: cleanText(
      raw["Account Name"] || raw.accountName,
      "Unnamed Account"
    ),
    saleDate: formatDate(cleanText(raw["Sale Date"] || raw.date)),
    saleDateRaw: cleanText(raw["Sale Date"] || raw.date),
    serviceSold: cleanText(raw["Service Sold"] || raw.service, "N/A"),
    serviceType: cleanText(raw["Service Type"] || raw.type, "N/A"),
    soldBy: cleanText(raw["Sold By"] || raw.soldBy, "N/A"),
    manager: cleanText(raw.Manager || raw.manager, "N/A"),
    amount,
    commissionPercent,
    commissionAmount,
    status: cleanText(raw.Status || raw.status, "Pending"),
    workOrderEstimateNumber: cleanText(
      raw["Work Order / Estimate #"] ||
        raw["Work Order / Estimate"] ||
        raw["Work Order / Est"] ||
        raw.workOrder,
      "N/A"
    ),
    notes: cleanText(raw.Notes || raw.notes, "N/A"),
  };
}

function getStatusClass(status: string) {
  const cleanStatus = status.toLowerCase();

  if (cleanStatus.includes("paid")) {
    return "bg-green-100 text-green-800 border-green-200";
  }

  if (cleanStatus.includes("approved")) {
    return "bg-blue-100 text-blue-800 border-blue-200";
  }

  if (cleanStatus.includes("pending")) {
    return "bg-yellow-100 text-yellow-800 border-yellow-200";
  }

  if (cleanStatus.includes("cancel")) {
    return "bg-red-100 text-red-800 border-red-200";
  }

  return "bg-gray-100 text-gray-800 border-gray-200";
}

function SalesPageContent() {
  const searchParams = useSearchParams();

  const accountIdFromUrl = searchParams.get("accountId") || "";
  const accountNameFromUrl = searchParams.get("account") || "";

  const openedFromAccountDetail = Boolean(accountIdFromUrl || accountNameFromUrl);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);

  const [searchText, setSearchText] = useState("");
  const [selectedYear, setSelectedYear] = useState(
    String(new Date().getFullYear())
  );
  const [selectedQuarter, setSelectedQuarter] = useState(getCurrentQuarter());
  const [selectedSalesperson, setSelectedSalesperson] = useState("All");

  const [accountSearchText, setAccountSearchText] = useState(accountNameFromUrl);
  const [selectedAccountId, setSelectedAccountId] = useState(accountIdFromUrl);
  const [selectedAccountName, setSelectedAccountName] =
    useState(accountNameFromUrl);
  const [selectedManager, setSelectedManager] = useState("");

  const [saleDate, setSaleDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [serviceSold, setServiceSold] = useState("");
  const [serviceType, setServiceType] = useState("Extra Service");
  const [soldBy, setSoldBy] = useState("");
  const [amount, setAmount] = useState("");
  const [commissionPercent, setCommissionPercent] = useState("5");
  const [status, setStatus] = useState("Pending");
  const [workOrderEstimateNumber, setWorkOrderEstimateNumber] = useState("");
  const [notes, setNotes] = useState("");

  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [isLoadingSales, setIsLoadingSales] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    async function loadAccounts() {
      try {
        const response = await fetch("/api/accounts", {
          method: "GET",
        });

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || "Could not load accounts.");
        }

        const rawAccounts = result.data || result.accounts || [];

        const mappedAccounts = rawAccounts
          .map(mapRawAccount)
          .filter((account: Account) => account.name !== "Unnamed Account");

        const uniqueAccounts = Array.from(
          new Map(
            mappedAccounts.map((account: Account) => [account.id, account])
          ).values()
        ) as Account[];

        setAccounts(uniqueAccounts);

        if (accountIdFromUrl || accountNameFromUrl) {
          const matchingAccount = uniqueAccounts.find((account) => {
            return (
              account.id === accountIdFromUrl ||
              account.name === accountNameFromUrl
            );
          });

          if (matchingAccount) {
            setSelectedAccountId(matchingAccount.id);
            setSelectedAccountName(matchingAccount.name);
            setSelectedManager(matchingAccount.manager);
            setAccountSearchText(matchingAccount.name);
          } else if (accountNameFromUrl) {
            setSelectedAccountName(accountNameFromUrl);
            setAccountSearchText(accountNameFromUrl);
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Could not load accounts.";

        setErrorMessage(message);
      } finally {
        setIsLoadingAccounts(false);
      }
    }

    loadAccounts();
  }, [accountIdFromUrl, accountNameFromUrl]);

  useEffect(() => {
    async function loadSales() {
      try {
        const response = await fetch("/api/sales", {
          method: "GET",
        });

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || "Could not load sales.");
        }

        const rawSales = result.data || result.sales || [];

        const mappedSales = rawSales
          .map(mapRawSale)
          .filter((sale: Sale) => sale.accountName !== "Unnamed Account");

        setSales(mappedSales);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Could not load sales.";

        setErrorMessage(message);
      } finally {
        setIsLoadingSales(false);
      }
    }

    loadSales();
  }, []);

  const availableYears = useMemo(() => {
    const yearsFromSales = sales
      .map((sale) => getYearFromDate(sale.saleDateRaw))
      .filter(Boolean);

    const yearSet = new Set([
      String(new Date().getFullYear()),
      ...yearsFromSales,
    ]);

    return Array.from(yearSet).sort((a, b) => Number(b) - Number(a));
  }, [sales]);

  const availableSalespeople = useMemo(() => {
    const peopleFromSales = sales
      .map((sale) => sale.soldBy)
      .filter((person) => person && person !== "N/A");

    const peopleSet = new Set([
      "All",
      "Andrés",
      "Greg",
      "Drew",
      ...peopleFromSales,
    ]);

    return Array.from(peopleSet);
  }, [sales]);

  const filteredAccountOptions = useMemo(() => {
    const search = accountSearchText.toLowerCase().trim();

    if (!search) return accounts.slice(0, 20);

    return accounts
      .filter((account) => {
        return (
          account.name.toLowerCase().includes(search) ||
          account.id.toLowerCase().includes(search)
        );
      })
      .slice(0, 20);
  }, [accounts, accountSearchText]);

  const filteredSales = useMemo(() => {
    const search = searchText.toLowerCase().trim();

    return sales
      .filter((sale) => {
        const matchesAccountFromUrl = accountIdFromUrl
          ? sale.accountId === accountIdFromUrl
          : true;

        const saleYear = getYearFromDate(sale.saleDateRaw);
        const saleQuarter = getQuarterFromDate(sale.saleDateRaw);

        const matchesYear = selectedYear ? saleYear === selectedYear : true;
        const matchesQuarter = selectedQuarter
          ? saleQuarter === selectedQuarter
          : true;

        const matchesSalesperson =
          selectedSalesperson === "All" ? true : sale.soldBy === selectedSalesperson;

        const matchesSearch = search
          ? sale.accountName.toLowerCase().includes(search) ||
            sale.serviceSold.toLowerCase().includes(search) ||
            sale.serviceType.toLowerCase().includes(search) ||
            sale.soldBy.toLowerCase().includes(search) ||
            sale.manager.toLowerCase().includes(search) ||
            sale.status.toLowerCase().includes(search) ||
            sale.workOrderEstimateNumber.toLowerCase().includes(search)
          : true;

        return (
          matchesAccountFromUrl &&
          matchesYear &&
          matchesQuarter &&
          matchesSalesperson &&
          matchesSearch
        );
      })
      .sort((a, b) => {
        const dateA = new Date(a.saleDateRaw).getTime();
        const dateB = new Date(b.saleDateRaw).getTime();

        if (Number.isNaN(dateA) && Number.isNaN(dateB)) return 0;
        if (Number.isNaN(dateA)) return 1;
        if (Number.isNaN(dateB)) return -1;

        return dateB - dateA;
      });
  }, [
    sales,
    searchText,
    accountIdFromUrl,
    selectedYear,
    selectedQuarter,
    selectedSalesperson,
  ]);

  const salesByPerson = useMemo(() => {
    const grouped = new Map<
      string,
      {
        soldBy: string;
        salesCount: number;
        totalSales: number;
        totalCommission: number;
      }
    >();

    filteredSales.forEach((sale) => {
      const key = sale.soldBy || "N/A";
      const current = grouped.get(key) || {
        soldBy: key,
        salesCount: 0,
        totalSales: 0,
        totalCommission: 0,
      };

      current.salesCount += 1;
      current.totalSales += sale.amount;
      current.totalCommission += sale.commissionAmount;

      grouped.set(key, current);
    });

    return Array.from(grouped.values()).sort(
      (a, b) => b.totalCommission - a.totalCommission
    );
  }, [filteredSales]);

  const totalSalesAmount = filteredSales.reduce(
    (total, sale) => total + sale.amount,
    0
  );

  const totalCommissionAmount = filteredSales.reduce(
    (total, sale) => total + sale.commissionAmount,
    0
  );

  const pendingSales = filteredSales.filter((sale) =>
    sale.status.toLowerCase().includes("pending")
  ).length;

  const paidSales = filteredSales.filter((sale) =>
    sale.status.toLowerCase().includes("paid")
  ).length;

  const calculatedCommissionAmount =
    toNumber(amount) * (toNumber(commissionPercent) / 100);

  function handleAccountSelect(account: Account) {
    setSelectedAccountId(account.id);
    setSelectedAccountName(account.name);
    setSelectedManager(account.manager);
    setAccountSearchText(account.name);
  }

  async function handleAddSale(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSaving) {
      return;
    }

    if (!selectedAccountName) {
      setSaveMessage("Please select an account before saving the sale.");
      return;
    }

    if (!saleDate || !serviceSold || !soldBy || !amount) {
      setSaveMessage(
        "Please complete the date, service sold, sold by, and amount fields."
      );
      return;
    }

    setIsSaving(true);
    setSaveMessage("");

    const finalAccountId =
      selectedAccountId || createIdFromName(selectedAccountName);

    const finalAmount = toNumber(amount);
    const finalCommissionPercent = toNumber(commissionPercent);
    const finalCommissionAmount =
      finalAmount * (finalCommissionPercent / 100);

    try {
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          action: "addSale",

          accountId: finalAccountId,
          accountName: selectedAccountName,
          date: saleDate,
          saleDate: saleDate,
          service: serviceSold,
          serviceSold: serviceSold,
          type: serviceType,
          serviceType: serviceType,
          soldBy: soldBy,
          manager: selectedManager,
          amount: finalAmount,
          amountSold: finalAmount,
          commissionPercent: finalCommissionPercent,
          commissionAmount: finalCommissionAmount,
          status: status,
          workOrder: workOrderEstimateNumber,
          notes: notes,
          quarter: getQuarterFromDate(saleDate),

          "Account ID": finalAccountId,
          "Account Name": selectedAccountName,
          "Sale Date": saleDate,
          "Service Sold": serviceSold,
          "Service Type": serviceType,
          "Sold By": soldBy,
          Manager: selectedManager,
          "Amount Sold": finalAmount,
          Amount: finalAmount,
          "Commission %": finalCommissionPercent,
          "Commission $": finalCommissionAmount,
          "Commission Amount": finalCommissionAmount,
          Status: status,
          "Work Order / Estimate #": workOrderEstimateNumber,
          Notes: notes,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Could not save sale.");
      }

      const newSale: Sale = {
        id: result.data?.saleId || result.id || `sale-${Date.now()}`,
        accountId: finalAccountId,
        accountName: selectedAccountName,
        saleDate: formatDate(saleDate),
        saleDateRaw: saleDate,
        serviceSold,
        serviceType,
        soldBy,
        manager: selectedManager || "N/A",
        amount: finalAmount,
        commissionPercent: finalCommissionPercent,
        commissionAmount: finalCommissionAmount,
        status,
        workOrderEstimateNumber: workOrderEstimateNumber || "N/A",
        notes: notes || "N/A",
      };

      setSales((currentSales) => [newSale, ...currentSales]);

      const newSaleYear = getYearFromDate(saleDate);
      const newSaleQuarter = getQuarterFromDate(saleDate);

      if (newSaleYear) setSelectedYear(newSaleYear);
      if (newSaleQuarter) setSelectedQuarter(newSaleQuarter);

      setSelectedSalesperson(soldBy);
      setSaveMessage("Sale saved successfully.");

      setSaleDate(new Date().toISOString().split("T")[0]);
      setServiceSold("");
      setServiceType("Extra Service");
      setSoldBy("");
      setAmount("");
      setCommissionPercent("5");
      setStatus("Pending");
      setWorkOrderEstimateNumber("");
      setNotes("");

      if (!openedFromAccountDetail) {
        setSelectedAccountId("");
        setSelectedAccountName("");
        setSelectedManager("");
        setAccountSearchText("");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not save sale.";

      setSaveMessage(message);
    } finally {
      setIsSaving(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 print:bg-white print:p-0">
      <div className="mx-auto max-w-7xl print:max-w-none">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between print:mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {openedFromAccountDetail ? "Add Sale" : "Sales & Commissions"}
            </h1>

            <p className="mt-1 text-gray-600">
              {openedFromAccountDetail
                ? "Add a sale for the selected account."
                : "Quarterly commission sheet for extra services, work orders, estimates, and sales status."}
            </p>

            {!openedFromAccountDetail && (
              <p className="mt-2 text-sm font-semibold text-blue-700">
                Showing {selectedQuarter} {selectedYear}
                {selectedSalesperson !== "All"
                  ? ` for ${selectedSalesperson}`
                  : " for all salespeople"}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3 md:flex-row print:hidden">
            {!openedFromAccountDetail && (
              <button
                type="button"
                onClick={handlePrint}
                className="rounded-lg bg-gray-900 px-5 py-3 text-center font-semibold text-white shadow-sm hover:bg-black"
              >
                Print Quarterly Report
              </button>
            )}

            {openedFromAccountDetail && (
              <Link
                href={`/accounts/${
                  selectedAccountId || createIdFromName(selectedAccountName)
                }`}
                className="rounded-lg border border-gray-300 bg-white px-5 py-3 text-center font-semibold text-gray-800 shadow-sm hover:bg-gray-50"
              >
                Back to Account
              </Link>
            )}
          </div>
        </div>

        {errorMessage && (
          <section className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {errorMessage}
          </section>
        )}

        {!openedFromAccountDetail && (
          <>
            <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm print:hidden">
              <h2 className="text-xl font-bold text-gray-900">
                Quarterly Commission Filter
              </h2>

              <div className="mt-4 grid gap-4 md:grid-cols-4">
                <div>
                  <label className="text-sm font-semibold text-gray-700">
                    Year
                  </label>

                  <select
                    value={selectedYear}
                    onChange={(event) => setSelectedYear(event.target.value)}
                    className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  >
                    {availableYears.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-700">
                    Quarter
                  </label>

                  <select
                    value={selectedQuarter}
                    onChange={(event) => setSelectedQuarter(event.target.value)}
                    className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="Q1">Q1 - Jan to Mar</option>
                    <option value="Q2">Q2 - Apr to Jun</option>
                    <option value="Q3">Q3 - Jul to Sep</option>
                    <option value="Q4">Q4 - Oct to Dec</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-700">
                    Salesperson
                  </label>

                  <select
                    value={selectedSalesperson}
                    onChange={(event) =>
                      setSelectedSalesperson(event.target.value)
                    }
                    className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  >
                    {availableSalespeople.map((person) => (
                      <option key={person} value={person}>
                        {person === "All" ? "All Salespeople" : person}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="sales-search"
                    className="text-sm font-semibold text-gray-700"
                  >
                    Search Inside Filter
                  </label>

                  <input
                    id="sales-search"
                    type="text"
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder="Search account, service, status..."
                    className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>
            </section>

            <div className="mb-6 grid gap-4 md:grid-cols-4 print:grid-cols-4 print:gap-3">
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm print:p-3 print:shadow-none">
                <p className="text-sm text-gray-500">Sales Showing</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">
                  {filteredSales.length}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {selectedQuarter} {selectedYear}
                </p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm print:p-3 print:shadow-none">
                <p className="text-sm text-gray-500">Sales Total</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">
                  {formatMoney(totalSalesAmount)}
                </p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm print:p-3 print:shadow-none">
                <p className="text-sm text-gray-500">Commission Due</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">
                  {formatMoney(totalCommissionAmount)}
                </p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm print:p-3 print:shadow-none">
                <p className="text-sm text-gray-500">Payment Status</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">
                  {pendingSales} Pending
                </p>
                <p className="mt-1 text-xs text-gray-500">{paidSales} paid</p>
              </div>
            </div>

            <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm print:shadow-none">
              <div className="mb-4">
                <h2 className="text-xl font-bold text-gray-900">
                  Commission Summary by Salesperson
                </h2>
                <p className="mt-1 text-sm text-gray-600 print:hidden">
                  This section updates based on the selected year, quarter, and
                  salesperson filter.
                </p>
              </div>

              {salesByPerson.length === 0 ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                  No commissions found for this filter.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm print:text-xs">
                    <thead>
                      <tr className="border-b bg-gray-50 text-gray-600">
                        <th className="px-4 py-3 font-semibold">Salesperson</th>
                        <th className="px-4 py-3 font-semibold">Sales Count</th>
                        <th className="px-4 py-3 font-semibold">Sales Total</th>
                        <th className="px-4 py-3 font-semibold">
                          Commission Due
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {salesByPerson.map((person) => (
                        <tr key={person.soldBy} className="border-b">
                          <td className="px-4 py-3 font-semibold text-gray-900">
                            {person.soldBy}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {person.salesCount}
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {formatMoney(person.totalSales)}
                          </td>
                          <td className="px-4 py-3 font-bold text-gray-900">
                            {formatMoney(person.totalCommission)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm print:hidden">
          <h2 className="text-xl font-bold text-gray-900">Add Sale</h2>

          {openedFromAccountDetail && (
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-5 text-center">
              <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
                Sale For
              </p>
              <p className="mt-1 text-2xl font-bold text-blue-950">
                {selectedAccountName || accountNameFromUrl || accountIdFromUrl}
              </p>
            </div>
          )}

          {!openedFromAccountDetail && (
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-5">
              <label className="text-sm font-semibold text-gray-700">
                Search Account
              </label>

              <input
                type="text"
                value={accountSearchText}
                onChange={(event) => {
                  setAccountSearchText(event.target.value);
                  setSelectedAccountId("");
                  setSelectedAccountName("");
                  setSelectedManager("");
                }}
                placeholder={
                  isLoadingAccounts
                    ? "Loading accounts..."
                    : "Start typing account name..."
                }
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />

              {accountSearchText && filteredAccountOptions.length > 0 && (
                <div className="mt-3 max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                  {filteredAccountOptions.map((account) => (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => handleAccountSelect(account)}
                      className="block w-full border-b border-gray-100 px-4 py-3 text-left hover:bg-blue-50"
                    >
                      <span className="block font-semibold text-gray-900">
                        {account.name}
                      </span>
                      <span className="block text-xs text-gray-500">
                        Manager: {account.manager} | Sub:{" "}
                        {account.subcontractor}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {selectedAccountName && (
                <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3">
                  <p className="text-sm font-semibold text-green-800">
                    Selected Account: {selectedAccountName}
                  </p>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleAddSale} className="mt-4 grid gap-4">
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <label className="text-sm font-semibold text-gray-700">
                  Sale Date
                </label>

                <input
                  type="date"
                  value={saleDate}
                  onChange={(event) => setSaleDate(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700">
                  Service Type
                </label>

                <select
                  value={serviceType}
                  onChange={(event) => setServiceType(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="Extra Service">Extra Service</option>
                  <option value="Floor Work">Floor Work</option>
                  <option value="Carpet Cleaning">Carpet Cleaning</option>
                  <option value="Window Cleaning">Window Cleaning</option>
                  <option value="Power Washing">Power Washing</option>
                  <option value="High Dusting">High Dusting</option>
                  <option value="Recurring Increase">Recurring Increase</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700">
                  Sold By
                </label>

                <select
                  value={soldBy}
                  onChange={(event) => setSoldBy(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Select person</option>
                  <option value="Andrés">Andrés</option>
                  <option value="Greg">Greg</option>
                  <option value="Drew">Drew</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700">
                  Status
                </label>

                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="Pending">Pending</option>
                  <option value="Approved">Approved</option>
                  <option value="Paid">Paid</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700">
                Service Sold
              </label>

              <input
                type="text"
                value={serviceSold}
                onChange={(event) => setServiceSold(event.target.value)}
                placeholder="Example: Strip and wax, carpet cleaning, one-time deep clean..."
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <label className="text-sm font-semibold text-gray-700">
                  Amount
                </label>

                <input
                  type="number"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0.00"
                  className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700">
                  Commission %
                </label>

                <input
                  type="number"
                  value={commissionPercent}
                  onChange={(event) =>
                    setCommissionPercent(event.target.value)
                  }
                  placeholder="5"
                  className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700">
                  Commission Amount
                </label>

                <div className="mt-2 rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 font-semibold text-gray-900">
                  {formatMoney(calculatedCommissionAmount)}
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700">
                  Work Order / Estimate #
                </label>

                <input
                  type="text"
                  value={workOrderEstimateNumber}
                  onChange={(event) =>
                    setWorkOrderEstimateNumber(event.target.value)
                  }
                  placeholder="WO-123 / EST-123"
                  className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700">
                Notes
              </label>

              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional notes about the sale, approval, invoice, or commission..."
                rows={3}
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {saveMessage && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm font-semibold text-gray-800">
                {saveMessage}
              </div>
            )}

            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-lg bg-green-700 px-5 py-3 font-semibold text-white shadow-sm hover:bg-green-800 disabled:bg-green-300"
              >
                {isSaving ? "Saving..." : "Save Sale"}
              </button>

              {openedFromAccountDetail && (
                <Link
                  href={`/accounts/${
                    selectedAccountId || createIdFromName(selectedAccountName)
                  }`}
                  className="rounded-lg border border-gray-300 bg-white px-5 py-3 text-center font-semibold text-gray-800 shadow-sm hover:bg-gray-50"
                >
                  Cancel / Back to Account
                </Link>
              )}
            </div>
          </form>
        </section>

        {!openedFromAccountDetail && (
          <section className="rounded-xl border border-gray-200 bg-white shadow-sm print:rounded-none print:border print:shadow-none">
            <div className="border-b border-gray-200 p-5 print:p-3">
              <h2 className="text-xl font-bold text-gray-900">
                Quarterly Sales Detail
              </h2>

              <p className="mt-1 text-sm text-gray-600 print:hidden">
                {isLoadingSales
                  ? "Loading sales from Google Sheets..."
                  : "Detailed sales included in this quarter's commission sheet."}
              </p>
            </div>

            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full border-collapse text-left text-sm print:text-xs">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-600">
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Account</th>
                    <th className="px-4 py-3 font-semibold">Service Sold</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">Sold By</th>
                    <th className="px-4 py-3 font-semibold">Amount</th>
                    <th className="px-4 py-3 font-semibold">Commission</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">
                      Work Order / Estimate #
                    </th>
                    <th className="px-4 py-3 font-semibold">Notes</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredSales.map((sale) => (
                    <tr key={sale.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-700">
                        {sale.saleDate}
                      </td>

                      <td className="px-4 py-3">
                        <Link
                          href={`/accounts/${sale.accountId}`}
                          className="font-semibold text-blue-700 hover:underline print:text-gray-900"
                        >
                          {sale.accountName}
                        </Link>
                      </td>

                      <td className="px-4 py-3 font-medium text-gray-900">
                        {sale.serviceSold}
                      </td>

                      <td className="px-4 py-3 text-gray-700">
                        {sale.serviceType}
                      </td>

                      <td className="px-4 py-3 text-gray-700">{sale.soldBy}</td>

                      <td className="px-4 py-3 font-semibold text-gray-900">
                        {formatMoney(sale.amount)}
                      </td>

                      <td className="px-4 py-3 text-gray-700">
                        {formatMoney(sale.commissionAmount)}
                        <span className="block text-xs text-gray-500">
                          {sale.commissionPercent}%
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full border px-2 py-1 text-xs font-semibold ${getStatusClass(
                            sale.status
                          )}`}
                        >
                          {sale.status}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-gray-700">
                        {sale.workOrderEstimateNumber}
                      </td>

                      <td className="max-w-md px-4 py-3 text-gray-700">
                        <span className="line-clamp-2 print:line-clamp-none">
                          {sale.notes}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!isLoadingSales && filteredSales.length === 0 && (
              <div className="p-6 text-center text-gray-600">
                No sales found for this filter.
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

export default function SalesPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-gray-50 p-6">
          Loading sales...
        </main>
      }
    >
      <SalesPageContent />
    </Suspense>
  );
}