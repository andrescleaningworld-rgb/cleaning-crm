"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type SupplyOrder = {
  rowNumber?: number;
  timestamp?: string;
  orderId?: string;
  subcontractor?: string;
  subcontractorEmail?: string;
  accountName?: string;
  accountId?: string;
  supplyItem?: string;
  quantity?: string;
  unit?: string;
  deliveryMode?: string;
  status?: string;
  notes?: string;
};

type SupplyOrdersResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  count?: number;
  data?: SupplyOrder[];
  supplyOrders?: SupplyOrder[];
  orders?: SupplyOrder[];
};

function getLoadedOrders(data: SupplyOrdersResponse): SupplyOrder[] {
  if (Array.isArray(data.supplyOrders)) return data.supplyOrders;
  if (Array.isArray(data.orders)) return data.orders;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

function isNewOrder(order: SupplyOrder) {
  const status = String(order.status || "").toLowerCase().trim();
  return !status || status === "new";
}

function isPendingOrder(order: SupplyOrder) {
  const status = String(order.status || "").toLowerCase().trim();
  return status === "pending" || status === "in progress";
}

function isCompletedOrder(order: SupplyOrder) {
  const status = String(order.status || "").toLowerCase().trim();

  return (
    status === "completed" ||
    status === "complete" ||
    status === "done" ||
    status === "closed"
  );
}

function getStatusClass(statusValue?: string) {
  const status = String(statusValue || "New").toLowerCase().trim();

  if (status === "completed" || status === "complete" || status === "done") {
    return "rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800";
  }

  if (status === "pending" || status === "in progress") {
    return "rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800";
  }

  return "rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800";
}

export default function SupplyOrdersPage() {
  const [orders, setOrders] = useState<SupplyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  async function loadOrders() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/supply-orders", {
        cache: "no-store",
      });

      const data = (await res.json()) as SupplyOrdersResponse;

      if (!res.ok || data.success === false) {
        throw new Error(
          data.error || data.message || "Failed to load supply orders."
        );
      }

      const loadedOrders = getLoadedOrders(data);
      setOrders(loadedOrders);
    } catch (err) {
      setOrders([]);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
  }, []);

  const filteredOrders = useMemo(() => {
    const safeOrders = Array.isArray(orders) ? orders : [];
    const q = search.toLowerCase().trim();

    if (!q) return safeOrders;

    return safeOrders.filter((order) =>
      [
        order.timestamp,
        order.orderId,
        order.subcontractor,
        order.subcontractorEmail,
        order.accountName,
        order.accountId,
        order.supplyItem,
        order.quantity,
        order.unit,
        order.deliveryMode,
        order.status,
        order.notes,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [orders, search]);

  const safeOrders = Array.isArray(orders) ? orders : [];

  const newOrdersCount = safeOrders.filter(isNewOrder).length;
  const pendingOrdersCount = safeOrders.filter(isPendingOrder).length;
  const completedOrdersCount = safeOrders.filter(isCompletedOrder).length;

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-6 text-slate-900 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
                Cleaning World
              </p>

              <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
                Supply Orders
              </h1>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Review supply orders submitted by subcontractors through the
                subcontractor supply portal.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={loadOrders}
                disabled={loading}
                className="rounded-lg bg-blue-700 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
              >
                {loading ? "Refreshing..." : "Refresh Orders"}
              </button>

              <Link
                href="/supplies"
                className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Back to Supplies
              </Link>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Total Orders
              </p>
              <p className="mt-1 text-2xl font-bold">{safeOrders.length}</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">
                New Orders
              </p>
              <p className="mt-1 text-2xl font-bold">{newOrdersCount}</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Pending Orders
              </p>
              <p className="mt-1 text-2xl font-bold">{pendingOrdersCount}</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Completed Orders
              </p>
              <p className="mt-1 text-2xl font-bold">
                {completedOrdersCount}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by subcontractor, account, supply item, status..."
              className="min-h-[48px] w-full rounded-lg border border-slate-300 px-4 py-3 text-base outline-none focus:border-blue-600 sm:text-sm"
            />
          </div>
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-bold">Orders</h2>
            <p className="text-sm text-slate-600">
              {filteredOrders.length} shown
            </p>
          </div>

          {loading ? (
            <p className="text-sm text-slate-600">Loading supply orders...</p>
          ) : filteredOrders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <p className="text-sm font-semibold text-slate-700">
                No supply orders found.
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Submitted subcontractor supply orders will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-slate-700">
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Order ID</th>
                    <th className="px-4 py-3 font-semibold">Subcontractor</th>
                    <th className="px-4 py-3 font-semibold">Account</th>
                    <th className="px-4 py-3 font-semibold">Supply</th>
                    <th className="px-4 py-3 font-semibold">Qty</th>
                    <th className="px-4 py-3 font-semibold">Delivery</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Notes</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredOrders.map((order, index) => {
                    const status = order.status || "New";

                    return (
                      <tr
                        key={
                          order.orderId ||
                          `${order.accountName}-${order.supplyItem}-${index}`
                        }
                        className="border-b last:border-b-0 hover:bg-slate-50"
                      >
                        <td className="whitespace-nowrap px-4 py-3">
                          {order.timestamp || "-"}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 font-semibold">
                          {order.orderId || "-"}
                        </td>

                        <td className="px-4 py-3">
                          <div className="font-semibold">
                            {order.subcontractor || "-"}
                          </div>

                          {order.subcontractorEmail ? (
                            <div className="mt-1 text-xs text-slate-500">
                              {order.subcontractorEmail}
                            </div>
                          ) : null}
                        </td>

                        <td className="px-4 py-3">
                          <div className="font-semibold">
                            {order.accountName || "-"}
                          </div>

                          {order.accountId ? (
                            <div className="mt-1 text-xs text-slate-500">
                              {order.accountId}
                            </div>
                          ) : null}
                        </td>

                        <td className="px-4 py-3 font-semibold">
                          {order.supplyItem || "-"}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3">
                          {order.quantity || "-"}
                          {order.unit ? ` ${order.unit}` : ""}
                        </td>

                        <td className="px-4 py-3">
                          {order.deliveryMode || "-"}
                        </td>

                        <td className="px-4 py-3">
                          <span className={getStatusClass(status)}>
                            {status}
                          </span>
                        </td>

                        <td className="max-w-xs px-4 py-3 text-slate-600">
                          {order.notes || "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}