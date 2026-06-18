"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type SupplyOrder = {
  rowNumber?: number;
  timestamp?: string;
  orderId?: string;
  orderGroupId?: string;
  subcontractor?: string;
  subcontractorEmail?: string;
  accountName?: string;
  accountId?: string;
  supplyItem?: string;
  category?: string;
  description?: string;
  itemDescription?: string;
  quantity?: string;
  unit?: string;
  deliveryMode?: string;
  status?: string;
  notes?: string;
  emailStatus?: string;
  emailSentTo?: string;
  lastUpdated?: string;
};

type NestedSupplyOrdersResponse = {
  success?: boolean;
  count?: number;
  data?: SupplyOrder[];
  supplyOrders?: SupplyOrder[];
  orders?: SupplyOrder[];
};

type SupplyOrdersResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  count?: number;
  data?: SupplyOrder[];
  supplyOrders?: SupplyOrder[] | NestedSupplyOrdersResponse;
  orders?: SupplyOrder[] | NestedSupplyOrdersResponse;
};

type StatusUpdateResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  status?: string;
  orderId?: string;
  rowNumber?: number;
};

const ORDER_STATUS_OPTIONS = [
  "New",
  "Needs Review",
  "Approved",
  "Pending / In Progress",
  "Completed",
  "Denied",
  "Cancelled",
];

const DELIVERY_FILTER_OPTIONS = [
  "All",
  "Pick Up",
  "Deliver to Account",
];

function getLoadedOrders(data: SupplyOrdersResponse): SupplyOrder[] {
  if (Array.isArray(data.supplyOrders)) return data.supplyOrders;
  if (Array.isArray(data.orders)) return data.orders;
  if (Array.isArray(data.data)) return data.data;

  if (
    data.supplyOrders &&
    typeof data.supplyOrders === "object" &&
    !Array.isArray(data.supplyOrders)
  ) {
    if (Array.isArray(data.supplyOrders.supplyOrders)) {
      return data.supplyOrders.supplyOrders;
    }

    if (Array.isArray(data.supplyOrders.orders)) {
      return data.supplyOrders.orders;
    }

    if (Array.isArray(data.supplyOrders.data)) {
      return data.supplyOrders.data;
    }
  }

  if (
    data.orders &&
    typeof data.orders === "object" &&
    !Array.isArray(data.orders)
  ) {
    if (Array.isArray(data.orders.supplyOrders)) {
      return data.orders.supplyOrders;
    }

    if (Array.isArray(data.orders.orders)) {
      return data.orders.orders;
    }

    if (Array.isArray(data.orders.data)) {
      return data.orders.data;
    }
  }

  return [];
}

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeStatus(statusValue?: string) {
  const status = cleanText(statusValue);

  if (!status) return "New";

  const lower = status.toLowerCase();

  if (lower === "pending" || lower === "in progress") {
    return "Pending / In Progress";
  }

  if (lower === "complete" || lower === "done" || lower === "closed") {
    return "Completed";
  }

  if (lower === "canceled") {
    return "Cancelled";
  }

  return status;
}

function getOrderDescription(order: SupplyOrder) {
  return cleanText(order.description || order.itemDescription);
}

function parseOrderDate(order: SupplyOrder) {
  const value = cleanText(order.timestamp);

  if (!value) return 0;

  const parsed = Date.parse(value);

  if (Number.isNaN(parsed)) return 0;

  return parsed;
}

function isNewOrNeedsReview(order: SupplyOrder) {
  const status = normalizeStatus(order.status).toLowerCase();

  return status === "new" || status === "needs review";
}

function isApprovedOrder(order: SupplyOrder) {
  const status = normalizeStatus(order.status).toLowerCase();

  return status === "approved";
}

function isPendingOrder(order: SupplyOrder) {
  const status = normalizeStatus(order.status).toLowerCase();

  return status === "pending / in progress";
}

function isCompletedOrder(order: SupplyOrder) {
  const status = normalizeStatus(order.status).toLowerCase();

  return status === "completed";
}

function getStatusClass(statusValue?: string) {
  const status = normalizeStatus(statusValue).toLowerCase();

  if (status === "completed") {
    return "rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800";
  }

  if (status === "approved") {
    return "rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800";
  }

  if (status === "pending / in progress") {
    return "rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800";
  }

  if (status === "needs review") {
    return "rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-800";
  }

  if (status === "denied" || status === "cancelled") {
    return "rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800";
  }

  return "rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800";
}

function getSelectClass(statusValue?: string) {
  const status = normalizeStatus(statusValue).toLowerCase();

  if (status === "completed") {
    return "border-green-300 bg-green-50 text-green-900";
  }

  if (status === "approved") {
    return "border-emerald-300 bg-emerald-50 text-emerald-900";
  }

  if (status === "pending / in progress") {
    return "border-amber-300 bg-amber-50 text-amber-900";
  }

  if (status === "needs review") {
    return "border-orange-300 bg-orange-50 text-orange-900";
  }

  if (status === "denied" || status === "cancelled") {
    return "border-red-300 bg-red-50 text-red-900";
  }

  return "border-blue-300 bg-blue-50 text-blue-900";
}

export default function SupplyOrdersPage() {
  const [orders, setOrders] = useState<SupplyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingOrderKey, setUpdatingOrderKey] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [deliveryFilter, setDeliveryFilter] = useState("All");
  const [dateSort, setDateSort] = useState("Newest First");

  const [selectedOrder, setSelectedOrder] = useState<SupplyOrder | null>(null);

  async function loadOrders() {
    try {
      setLoading(true);
      setError("");
      setSuccessMessage("");

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

  async function updateOrderStatus(order: SupplyOrder, newStatus: string) {
    const oldStatus = normalizeStatus(order.status);
    const orderKey =
      order.orderId ||
      String(order.rowNumber || "") ||
      `${order.accountName}-${order.supplyItem}`;

    try {
      setError("");
      setSuccessMessage("");
      setUpdatingOrderKey(orderKey);

      setOrders((currentOrders) =>
        currentOrders.map((currentOrder) => {
          const currentKey =
            currentOrder.orderId ||
            String(currentOrder.rowNumber || "") ||
            `${currentOrder.accountName}-${currentOrder.supplyItem}`;

          if (currentKey !== orderKey) return currentOrder;

          return {
            ...currentOrder,
            status: newStatus,
          };
        })
      );

      const response = await fetch("/api/supply-orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "updateSupplyOrderStatus",
          rowNumber: order.rowNumber,
          orderId: order.orderId,
          status: newStatus,
        }),
      });

      const data = (await response.json()) as StatusUpdateResponse;

      if (!response.ok || data.success === false) {
        throw new Error(
          data.error || data.message || "Failed to update supply order status."
        );
      }

      setSelectedOrder((currentSelected) => {
        if (!currentSelected) return currentSelected;

        const selectedKey =
          currentSelected.orderId ||
          String(currentSelected.rowNumber || "") ||
          `${currentSelected.accountName}-${currentSelected.supplyItem}`;

        if (selectedKey !== orderKey) return currentSelected;

        return {
          ...currentSelected,
          status: newStatus,
        };
      });

      setSuccessMessage("Supply order status updated.");
    } catch (err) {
      setOrders((currentOrders) =>
        currentOrders.map((currentOrder) => {
          const currentKey =
            currentOrder.orderId ||
            String(currentOrder.rowNumber || "") ||
            `${currentOrder.accountName}-${currentOrder.supplyItem}`;

          if (currentKey !== orderKey) return currentOrder;

          return {
            ...currentOrder,
            status: oldStatus,
          };
        })
      );

      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setUpdatingOrderKey("");
    }
  }

  const filteredOrders = useMemo(() => {
    const safeOrders = Array.isArray(orders) ? orders : [];
    const q = search.toLowerCase().trim();

    let results = safeOrders.filter((order) => {
      const status = normalizeStatus(order.status);
      const deliveryMode = cleanText(order.deliveryMode);

      const matchesSearch =
        !q ||
        [
          order.timestamp,
          order.orderId,
          order.orderGroupId,
          order.subcontractor,
          order.subcontractorEmail,
          order.accountName,
          order.accountId,
          order.supplyItem,
          order.category,
          order.description,
          order.itemDescription,
          order.quantity,
          order.unit,
          order.deliveryMode,
          order.status,
          order.notes,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);

      const matchesStatus =
        statusFilter === "All" || status === statusFilter;

      const matchesDelivery =
        deliveryFilter === "All" || deliveryMode === deliveryFilter;

      return matchesSearch && matchesStatus && matchesDelivery;
    });

    results = [...results].sort((a, b) => {
      const dateA = parseOrderDate(a);
      const dateB = parseOrderDate(b);

      if (dateSort === "Oldest First") {
        return dateA - dateB;
      }

      return dateB - dateA;
    });

    return results;
  }, [orders, search, statusFilter, deliveryFilter, dateSort]);

  const safeOrders = Array.isArray(orders) ? orders : [];

  const newOrNeedsReviewCount = safeOrders.filter(isNewOrNeedsReview).length;
  const approvedCount = safeOrders.filter(isApprovedOrder).length;
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
                Review, approve, deny, and complete supply orders submitted by
                subcontractors.
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
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
              {error}
            </div>
          ) : null}

          {successMessage ? (
            <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
              {successMessage}
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Total Orders
              </p>
              <p className="mt-1 text-2xl font-bold">{safeOrders.length}</p>
            </div>

            <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
              <p className="text-xs font-semibold uppercase text-orange-700">
                New / Review
              </p>
              <p className="mt-1 text-2xl font-bold text-orange-900">
                {newOrNeedsReviewCount}
              </p>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-semibold uppercase text-emerald-700">
                Approved
              </p>
              <p className="mt-1 text-2xl font-bold text-emerald-900">
                {approvedCount}
              </p>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-semibold uppercase text-amber-700">
                Pending
              </p>
              <p className="mt-1 text-2xl font-bold text-amber-900">
                {pendingOrdersCount}
              </p>
            </div>

            <div className="rounded-xl border border-green-200 bg-green-50 p-4">
              <p className="text-xs font-semibold uppercase text-green-700">
                Completed
              </p>
              <p className="mt-1 text-2xl font-bold text-green-900">
                {completedOrdersCount}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-4">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search subcontractor, account, item, status..."
              className="min-h-[48px] w-full rounded-lg border border-slate-300 px-4 py-3 text-base outline-none focus:border-blue-600 sm:text-sm lg:col-span-1"
            />

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="min-h-[48px] w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-blue-600 sm:text-sm"
            >
              <option value="All">All statuses</option>
              {ORDER_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>

            <select
              value={deliveryFilter}
              onChange={(event) => setDeliveryFilter(event.target.value)}
              className="min-h-[48px] w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-blue-600 sm:text-sm"
            >
              {DELIVERY_FILTER_OPTIONS.map((deliveryMode) => (
                <option key={deliveryMode} value={deliveryMode}>
                  {deliveryMode === "All" ? "All delivery modes" : deliveryMode}
                </option>
              ))}
            </select>

            <select
              value={dateSort}
              onChange={(event) => setDateSort(event.target.value)}
              className="min-h-[48px] w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-blue-600 sm:text-sm"
            >
              <option value="Newest First">Newest first</option>
              <option value="Oldest First">Oldest first</option>
            </select>
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
                    <th className="px-4 py-3 font-semibold">Subcontractor</th>
                    <th className="px-4 py-3 font-semibold">Account</th>
                    <th className="px-4 py-3 font-semibold">Supply</th>
                    <th className="px-4 py-3 font-semibold">Qty</th>
                    <th className="px-4 py-3 font-semibold">Delivery</th>
                    <th className="px-4 py-3 font-semibold">
                      Status / Approval
                    </th>
                    <th className="px-4 py-3 font-semibold">Notes</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredOrders.map((order, index) => {
                    const status = normalizeStatus(order.status);
                    const orderKey =
                      order.orderId ||
                      String(order.rowNumber || "") ||
                      `${order.accountName}-${order.supplyItem}-${index}`;
                    const isUpdating = updatingOrderKey === orderKey;
                    const description = getOrderDescription(order);

                    return (
                      <tr
                        key={orderKey}
                        onClick={() => setSelectedOrder(order)}
                        className="cursor-pointer border-b last:border-b-0 hover:bg-slate-50"
                      >
                        <td className="whitespace-nowrap px-4 py-3 align-top">
                          {order.timestamp || "-"}
                        </td>

                        <td className="px-4 py-3 align-top">
                          <div className="font-semibold">
                            {order.subcontractor || "-"}
                          </div>

                          {order.subcontractorEmail ? (
                            <div className="mt-1 text-xs text-slate-500">
                              {order.subcontractorEmail}
                            </div>
                          ) : null}
                        </td>

                        <td className="px-4 py-3 align-top">
                          <div className="font-semibold">
                            {order.accountName || "-"}
                          </div>

                          {order.accountId ? (
                            <div className="mt-1 text-xs text-slate-500">
                              {order.accountId}
                            </div>
                          ) : null}
                        </td>

                        <td className="min-w-[240px] px-4 py-3 align-top">
                          <div className="font-semibold">
                            {order.supplyItem || "-"}
                          </div>

                          {order.category ? (
                            <div className="mt-1 text-xs font-semibold text-blue-700">
                              {order.category}
                            </div>
                          ) : null}

                          {description ? (
                            <div className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
                              {description}
                            </div>
                          ) : null}

                          {order.orderId ? (
                            <div className="mt-1 text-[11px] text-slate-400">
                              {order.orderId}
                            </div>
                          ) : null}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 align-top">
                          {order.quantity || "-"}
                          {order.unit ? ` ${order.unit}` : ""}
                        </td>

                        <td className="px-4 py-3 align-top">
                          {order.deliveryMode || "-"}
                        </td>

                        <td
                          className="min-w-[210px] px-4 py-3 align-top"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <select
                            value={status}
                            disabled={isUpdating}
                            onChange={(event) =>
                              updateOrderStatus(order, event.target.value)
                            }
                            className={`w-full rounded-lg border px-3 py-2 text-sm font-bold outline-none focus:border-blue-600 disabled:cursor-not-allowed disabled:opacity-60 ${getSelectClass(
                              status
                            )}`}
                          >
                            {ORDER_STATUS_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>

                          {isUpdating ? (
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              Saving...
                            </p>
                          ) : (
                            <span className={`mt-2 inline-block ${getStatusClass(status)}`}>
                              {status}
                            </span>
                          )}
                        </td>

                        <td className="max-w-xs px-4 py-3 align-top text-slate-600">
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

      {selectedOrder ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-5 shadow-xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
                  Supply Order Detail
                </p>
                <h3 className="mt-1 text-2xl font-black text-slate-900">
                  {selectedOrder.supplyItem || "Supply Order"}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedOrder.orderId || "No order ID"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase text-slate-500">
                  Date
                </p>
                <p className="mt-1 font-semibold">
                  {selectedOrder.timestamp || "-"}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase text-slate-500">
                  Status / Approval
                </p>
                <p className="mt-2">
                  <span className={getStatusClass(selectedOrder.status)}>
                    {normalizeStatus(selectedOrder.status)}
                  </span>
                </p>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase text-slate-500">
                  Subcontractor
                </p>
                <p className="mt-1 font-semibold">
                  {selectedOrder.subcontractor || "-"}
                </p>
                {selectedOrder.subcontractorEmail ? (
                  <p className="mt-1 text-sm text-slate-600">
                    {selectedOrder.subcontractorEmail}
                  </p>
                ) : null}
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase text-slate-500">
                  Account
                </p>
                <p className="mt-1 font-semibold">
                  {selectedOrder.accountName || "-"}
                </p>
                {selectedOrder.accountId ? (
                  <p className="mt-1 text-sm text-slate-600">
                    {selectedOrder.accountId}
                  </p>
                ) : null}
              </div>

              <div className="rounded-2xl bg-slate-50 p-4 sm:col-span-2">
                <p className="text-xs font-bold uppercase text-slate-500">
                  Supply Item
                </p>
                <p className="mt-1 font-semibold">
                  {selectedOrder.supplyItem || "-"}
                </p>

                {selectedOrder.category ? (
                  <p className="mt-1 text-sm font-bold text-blue-700">
                    {selectedOrder.category}
                  </p>
                ) : null}

                {getOrderDescription(selectedOrder) ? (
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {getOrderDescription(selectedOrder)}
                  </p>
                ) : null}
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase text-slate-500">
                  Quantity
                </p>
                <p className="mt-1 font-semibold">
                  {selectedOrder.quantity || "-"}
                  {selectedOrder.unit ? ` ${selectedOrder.unit}` : ""}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase text-slate-500">
                  Delivery Mode
                </p>
                <p className="mt-1 font-semibold">
                  {selectedOrder.deliveryMode || "-"}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4 sm:col-span-2">
                <p className="text-xs font-bold uppercase text-slate-500">
                  Notes
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {selectedOrder.notes || "-"}
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-black text-slate-900">
                Admin Approval
              </p>

              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <select
                  value={normalizeStatus(selectedOrder.status)}
                  onChange={(event) =>
                    updateOrderStatus(selectedOrder, event.target.value)
                  }
                  className={`w-full rounded-lg border px-3 py-3 text-sm font-bold outline-none focus:border-blue-600 ${getSelectClass(
                    selectedOrder.status
                  )}`}
                >
                  {ORDER_STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800"
                >
                  Done
                </button>
              </div>

              <p className="mt-3 text-xs leading-5 text-slate-500">
                Approved means the office reviewed and accepted the order.
                Denied means the order should not be processed. Completed means
                the order has been fulfilled.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}