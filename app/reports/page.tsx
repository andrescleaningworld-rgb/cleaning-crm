"use client";

import { useEffect, useMemo, useState } from "react";

type AnyRow = Record<string, any>;

function getValue(row: AnyRow, possibleKeys: string[]) {
  for (const key of possibleKeys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }
  return "";
}

function money(value: any) {
  const number = Number(value || 0);
  return number.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function safeDate(value: any) {
  if (!value) return "";
  const date = new Date(value);
  if (isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString();
}

function getQuarter(value: any) {
  if (!value) return "No Date";

  const date = new Date(value);
  if (isNaN(date.getTime())) return "No Date";

  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  if (month <= 3) return `Q1 ${year}`;
  if (month <= 6) return `Q2 ${year}`;
  if (month <= 9) return `Q3 ${year}`;
  return `Q4 ${year}`;
}

export default function ReportsPage() {
  const [accounts, setAccounts] = useState<AnyRow[]>([]);
  const [visits, setVisits] = useState<AnyRow[]>([]);
  const [complaints, setComplaints] = useState<AnyRow[]>([]);
  const [sales, setSales] = useState<AnyRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [managerFilter, setManagerFilter] = useState("All");
  const [salespersonFilter, setSalespersonFilter] = useState("All");
  const [quarterFilter, setQuarterFilter] = useState("All");
  const [search, setSearch] = useState("");

  async function loadAllReportsData() {
    try {
      setLoading(true);

      const [accountsRes, visitsRes, complaintsRes, salesRes] =
        await Promise.allSettled([
          fetch("/api/accounts", { cache: "no-store" }),
          fetch("/api/visits", { cache: "no-store" }),
          fetch("/api/complaints", { cache: "no-store" }),
          fetch("/api/sales", { cache: "no-store" }),
        ]);

      async function readResult(result: PromiseSettledResult<Response>) {
        if (result.status !== "fulfilled") return [];
        const data = await result.value.json();

        if (Array.isArray(data)) return data;
        if (Array.isArray(data.accounts)) return data.accounts;
        if (Array.isArray(data.visits)) return data.visits;
        if (Array.isArray(data.complaints)) return data.complaints;
        if (Array.isArray(data.sales)) return data.sales;

        return [];
      }

      setAccounts(await readResult(accountsRes));
      setVisits(await readResult(visitsRes));
      setComplaints(await readResult(complaintsRes));
      setSales(await readResult(salesRes));
    } catch (error) {
      console.error("Error loading reports:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAllReportsData();
  }, []);

  const managers = useMemo(() => {
    const names = new Set<string>();

    [...accounts, ...visits, ...complaints, ...sales].forEach((row) => {
      const manager = getValue(row, ["manager", "Manager", "accountManager"]);
      if (manager) names.add(String(manager));
    });

    return ["All", ...Array.from(names).sort()];
  }, [accounts, visits, complaints, sales]);

  const salespeople = useMemo(() => {
    const names = new Set<string>();

    sales.forEach((row) => {
      const soldBy = getValue(row, ["soldBy", "Sold By", "salesPerson"]);
      if (soldBy) names.add(String(soldBy));
    });

    return ["All", ...Array.from(names).sort()];
  }, [sales]);

  const quarters = useMemo(() => {
    const list = new Set<string>();

    sales.forEach((row) => {
      const date = getValue(row, ["date", "Date", "saleDate"]);
      list.add(getQuarter(date));
    });

    return ["All", ...Array.from(list).sort().reverse()];
  }, [sales]);

  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      const manager = getValue(sale, ["manager", "Manager", "accountManager"]);
      const soldBy = getValue(sale, ["soldBy", "Sold By", "salesPerson"]);
      const date = getValue(sale, ["date", "Date", "saleDate"]);
      const quarter = getQuarter(date);

      const text = Object.values(sale).join(" ").toLowerCase();

      return (
        (managerFilter === "All" || manager === managerFilter) &&
        (salespersonFilter === "All" || soldBy === salespersonFilter) &&
        (quarterFilter === "All" || quarter === quarterFilter) &&
        text.includes(search.toLowerCase())
      );
    });
  }, [sales, managerFilter, salespersonFilter, quarterFilter, search]);

  const filteredVisits = useMemo(() => {
    return visits.filter((visit) => {
      const manager = getValue(visit, ["manager", "Manager", "visitedBy"]);
      const text = Object.values(visit).join(" ").toLowerCase();

      return (
        (managerFilter === "All" || manager === managerFilter) &&
        text.includes(search.toLowerCase())
      );
    });
  }, [visits, managerFilter, search]);

  const filteredComplaints = useMemo(() => {
    return complaints.filter((complaint) => {
      const manager = getValue(complaint, [
        "manager",
        "Manager",
        "assignedTo",
      ]);
      const text = Object.values(complaint).join(" ").toLowerCase();

      return (
        (managerFilter === "All" || manager === managerFilter) &&
        text.includes(search.toLowerCase())
      );
    });
  }, [complaints, managerFilter, search]);

  const totals = useMemo(() => {
    const salesTotal = filteredSales.reduce((sum, sale) => {
      const amount = getValue(sale, ["amount", "Amount", "saleAmount"]);
      return sum + Number(amount || 0);
    }, 0);

    const commissionTotal = filteredSales.reduce((sum, sale) => {
      const commission = getValue(sale, [
        "commissionAmount",
        "Commission Amount",
        "commission",
      ]);
      return sum + Number(commission || 0);
    }, 0);

    const openComplaints = filteredComplaints.filter((complaint) => {
      const status = String(
        getValue(complaint, ["status", "Status", "complaintStatus"])
      ).toLowerCase();

      return (
        status.includes("open") ||
        status.includes("pending") ||
        status.includes("needs") ||
        status === ""
      );
    }).length;

    return {
      accounts: accounts.length,
      visits: filteredVisits.length,
      complaints: filteredComplaints.length,
      openComplaints,
      salesCount: filteredSales.length,
      salesTotal,
      commissionTotal,
    };
  }, [accounts, filteredVisits, filteredComplaints, filteredSales]);

  const managerSummary = useMemo(() => {
    const summary: Record<
      string,
      {
        visits: number;
        complaints: number;
        salesCount: number;
        salesTotal: number;
        commissionTotal: number;
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
        };
      }
    }

    filteredVisits.forEach((visit) => {
      const manager =
        getValue(visit, ["manager", "Manager", "visitedBy"]) || "Unassigned";
      ensure(manager);
      summary[manager].visits += 1;
    });

    filteredComplaints.forEach((complaint) => {
      const manager =
        getValue(complaint, ["manager", "Manager", "assignedTo"]) ||
        "Unassigned";
      ensure(manager);
      summary[manager].complaints += 1;
    });

    filteredSales.forEach((sale) => {
      const manager =
        getValue(sale, ["manager", "Manager", "accountManager"]) ||
        "Unassigned";
      const amount = getValue(sale, ["amount", "Amount", "saleAmount"]);
      const commission = getValue(sale, [
        "commissionAmount",
        "Commission Amount",
        "commission",
      ]);

      ensure(manager);
      summary[manager].salesCount += 1;
      summary[manager].salesTotal += Number(amount || 0);
      summary[manager].commissionTotal += Number(commission || 0);
    });

    return Object.entries(summary).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredVisits, filteredComplaints, filteredSales]);

  return (
    <main className="min-h-screen bg-gray-100 p-6 print:bg-white print:p-0">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between print:hidden">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
            <p className="text-gray-600">
              Printable summary for accounts, visits, complaints, sales, and
              commissions.
            </p>
          </div>

          <button
            onClick={() => window.print()}
            className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800"
          >
            Print Report
          </button>
        </div>

        <section className="hidden print:block">
          <h1 className="text-2xl font-bold">Cleaning World Report</h1>
          <p className="text-sm text-gray-600">
            Printed on {new Date().toLocaleDateString()}
          </p>
        </section>

        <section className="rounded-xl bg-white p-5 shadow print:hidden">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Search
              </label>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search reports..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Manager
              </label>
              <select
                value={managerFilter}
                onChange={(event) => setManagerFilter(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
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
                Salesperson
              </label>
              <select
                value={salespersonFilter}
                onChange={(event) => setSalespersonFilter(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                {salespeople.map((person) => (
                  <option key={person} value={person}>
                    {person}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Quarter
              </label>
              <select
                value={quarterFilter}
                onChange={(event) => setQuarterFilter(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                {quarters.map((quarter) => (
                  <option key={quarter} value={quarter}>
                    {quarter}
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
            <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="rounded-xl bg-white p-5 shadow">
                <p className="text-sm text-gray-500">Accounts</p>
                <p className="text-2xl font-bold text-gray-900">
                  {totals.accounts}
                </p>
              </div>

              <div className="rounded-xl bg-white p-5 shadow">
                <p className="text-sm text-gray-500">Visits</p>
                <p className="text-2xl font-bold text-gray-900">
                  {totals.visits}
                </p>
              </div>

              <div className="rounded-xl bg-white p-5 shadow">
                <p className="text-sm text-gray-500">Complaints</p>
                <p className="text-2xl font-bold text-gray-900">
                  {totals.complaints}
                </p>
                <p className="text-sm text-gray-600">
                  Open / Pending: {totals.openComplaints}
                </p>
              </div>

              <div className="rounded-xl bg-white p-5 shadow">
                <p className="text-sm text-gray-500">Sales</p>
                <p className="text-2xl font-bold text-gray-900">
                  {money(totals.salesTotal)}
                </p>
                <p className="text-sm text-gray-600">
                  Commission: {money(totals.commissionTotal)}
                </p>
              </div>
            </section>

            <section className="rounded-xl bg-white p-5 shadow">
              <h2 className="mb-4 text-xl font-bold text-gray-900">
                Manager Summary
              </h2>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-gray-600">
                      <th className="px-4 py-3">Manager</th>
                      <th className="px-4 py-3">Visits</th>
                      <th className="px-4 py-3">Complaints</th>
                      <th className="px-4 py-3">Sales Count</th>
                      <th className="px-4 py-3">Sales Total</th>
                      <th className="px-4 py-3">Commission Total</th>
                    </tr>
                  </thead>

                  <tbody>
                    {managerSummary.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
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
                          <td className="px-4 py-3">{data.salesCount}</td>
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
                </table>
              </div>
            </section>

            <section className="rounded-xl bg-white p-5 shadow">
              <h2 className="mb-4 text-xl font-bold text-gray-900">
                Recent Complaints
              </h2>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-gray-600">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Account</th>
                      <th className="px-4 py-3">Issue</th>
                      <th className="px-4 py-3">Manager</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredComplaints.slice(0, 10).map((complaint, index) => (
                      <tr key={index} className="border-b">
                        <td className="px-4 py-3">
                          {safeDate(
                            getValue(complaint, [
                              "date",
                              "Date",
                              "complaintDate",
                            ])
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-900">
                          {getValue(complaint, [
                            "account",
                            "Account",
                            "accountName",
                          ]) || "-"}
                        </td>
                        <td className="px-4 py-3">
                          {getValue(complaint, [
                            "issue",
                            "Issue",
                            "complaint",
                            "description",
                          ]) || "-"}
                        </td>
                        <td className="px-4 py-3">
                          {getValue(complaint, [
                            "manager",
                            "Manager",
                            "assignedTo",
                          ]) || "-"}
                        </td>
                        <td className="px-4 py-3">
                          {getValue(complaint, ["status", "Status"]) ||
                            "Pending"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-xl bg-white p-5 shadow">
              <h2 className="mb-4 text-xl font-bold text-gray-900">
                Sales & Commission Report
              </h2>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-gray-600">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Quarter</th>
                      <th className="px-4 py-3">Account</th>
                      <th className="px-4 py-3">Service</th>
                      <th className="px-4 py-3">Sold By</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Commission</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredSales.map((sale, index) => {
                      const date = getValue(sale, [
                        "date",
                        "Date",
                        "saleDate",
                      ]);

                      return (
                        <tr key={index} className="border-b">
                          <td className="px-4 py-3">{safeDate(date)}</td>
                          <td className="px-4 py-3">{getQuarter(date)}</td>
                          <td className="px-4 py-3 font-semibold text-gray-900">
                            {getValue(sale, [
                              "account",
                              "Account",
                              "accountName",
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
                            ]) || "-"}
                          </td>
                          <td className="px-4 py-3">
                            {money(
                              getValue(sale, [
                                "amount",
                                "Amount",
                                "saleAmount",
                              ])
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {money(
                              getValue(sale, [
                                "commissionAmount",
                                "Commission Amount",
                                "commission",
                              ])
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {getValue(sale, ["status", "Status"]) || "Pending"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}