"use client";

// Supply Orders: the one inbox for every supply order, wherever it came from
// (Crew Link, the sub portal, a manager's call or text). One card per order
// (order-cards.tsx): Approve or Decline, then "How do we fill it?". Above
// them: what arrived different and what the office sent with no order
// (deliveries.tsx). "+ Order for a sub" enters an order from a call or text.
// Printing is the card's 🖨 Print (app/supply-orders/print).

import Link from "next/link";
import { AddBar, AddButton, CHEER, ErrorBox } from "@/app/ui";
import { useEffect, useMemo, useState } from "react";
import OrderCards, { type OrderSummary, type SubOrder } from "./order-cards";
import Deliveries from "./deliveries";
import { useShelves } from "./shelves-data";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import SupplyOrderSheet from "../components/supply-order-sheet";
import { AccountScopeBar, useAccountScope } from "../components/account-scope";
import { ORDER_STATUSES } from "@/lib/supplyOrderStatus";

type SupplyOrdersResponse = { success?: boolean; error?: string; message?: string; supplyOrders?: SubOrder[]; orders?: SubOrder[]; data?: SubOrder[] };

const DELIVERY_FILTER_OPTIONS = ["All", "Pick Up", "Deliver to Account"];

export default function SupplyOrdersPage() {
  const [allOrders, setOrders] = useState<SubOrder[]>([]);
  // Opened from an account's page (?accountId=): only that account's orders, with a way back.
  const scope = useAccountScope();
  const orders = useMemo(() => (scope.active ? allOrders.filter((order) => scope.matches(order.accountId, order.accountName)) : allOrders), [allOrders, scope]);
  const [loading, setLoading] = useState(true);
  // ?order= from My work on the Dashboard: that order's card is brought into view.
  const [focusOrderId, setFocusOrderId] = useState("");
  useEffect(() => {
    setFocusOrderId(new URLSearchParams(window.location.search).get("order") ?? "");
  }, []);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [deliveryFilter, setDeliveryFilter] = useState("All");
  const [dateSort, setDateSort] = useState("Newest First");
  const [ordering, setOrdering] = useState(false);
  // What is on its way and what arrived different: one load for the panels
  // above the cards and for the cards themselves.
  const shelves = useShelves();

  async function loadOrders() {
    try {
      setLoading(true);
      setError("");
      const res = await fetchWithTimeout("/api/supply-orders", { cache: "no-store" });
      const data = (await res.json()) as SupplyOrdersResponse;
      if (!res.ok || data.success === false) throw new Error(data.error || data.message || "Failed to load supply orders.");
      setOrders(data.supplyOrders ?? data.orders ?? data.data ?? []);
    } catch (err) {
      setOrders([]);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  /** Refresh, and after a new order: the orders and the shelves. */
  function loadAll() {
    void loadOrders();
    void shelves.reload();
  }

  useEffect(() => {
    void loadOrders();
  }, []);

  // The top numbers count orders (one per card), not order lines.
  const [summary, setSummary] = useState<OrderSummary>({ total: 0, newOrReview: 0, approved: 0, pending: 0, completed: 0 });

  return (
    <main className="ui-screen">
      <div className="ui-screen-body">
        <AddBar>
          <AddButton onClick={() => setOrdering(true)} data-order-for-sub>
            Order for a sub (call or text)
          </AddButton>
        </AddBar>
        <AccountScopeBar scope={scope} what="supply orders" />
        {/* What arrived different, and what the office sent with no order. */}
        {shelves.error ? <ErrorBox title={shelves.error} text="Deliveries, back orders and what arrived different may be missing or out of date." onRetry={() => void shelves.reload()} /> : null}
        <Deliveries accountId={scope.active ? scope.accountId : ""} data={shelves.data} onChanged={() => void shelves.reload()} />

        <section className="ui-card">
          <div className="ui-stack">
            <div>
              <p className="ui-strong">Cleaning World</p>
              <h1 className="ui-screen-title">Supply Orders</h1>
              <p className="ui-muted">Every order, from crews, subs and managers. Approve or decline, then pick how we fill it.</p>
              <p className="ui-cheer">{CHEER.order}</p>
            </div>
            <div className="ui-actions-row">
              <button type="button" onClick={loadAll} disabled={loading} className="ui-btn ui-btn-second">
                {loading ? "Refreshing..." : "Refresh"}
              </button>
              <Link href="/supplies" className="ui-btn ui-btn-second">
                Warehouse and stock
              </Link>
            </div>
          </div>
          {error ? <div className="ui-field-error">{error}</div> : null}
        </section>

        <section className="ui-card">
          <div className="ui-stats">
            <div className="ui-stat">
              <p className="ui-muted">Total Orders</p>
              <p className="ui-stat-value">{summary.total}</p>
            </div>
            <div className="ui-stat">
              <p className="ui-strong">New / Review</p>
              <p className="ui-stat-value">{summary.newOrReview}</p>
            </div>
            <div className="ui-stat">
              <p className="ui-strong">Approved</p>
              <p className="ui-stat-value">{summary.approved}</p>
            </div>
            <div className="ui-stat">
              <p className="ui-strong">On its way</p>
              <p className="ui-stat-value">{summary.pending}</p>
            </div>
            <div className="ui-stat">
              <p className="ui-strong">Delivered</p>
              <p className="ui-stat-value">{summary.completed}</p>
            </div>
          </div>

          <div className="ui-two">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search subcontractor, account, item, status..." className="ui-input w-full" />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="ui-input w-full">
              <option value="All">All statuses</option>
              {ORDER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <select value={deliveryFilter} onChange={(event) => setDeliveryFilter(event.target.value)} className="ui-input w-full">
              {DELIVERY_FILTER_OPTIONS.map((deliveryMode) => (
                <option key={deliveryMode} value={deliveryMode}>
                  {deliveryMode === "All" ? "All delivery modes" : deliveryMode}
                </option>
              ))}
            </select>
            <select value={dateSort} onChange={(event) => setDateSort(event.target.value)} className="ui-input w-full">
              <option value="Newest First">Newest first</option>
              <option value="Oldest First">Oldest first</option>
            </select>
          </div>
        </section>

        {/* One card per order (Crew Link, sub portal, a manager's), its big buttons, and the sticky bar for many at once. */}
        <OrderCards
          orders={orders}
          loading={loading}
          focusId={focusOrderId}
          accountId={scope.active ? scope.accountId : ""}
          search={search}
          statusFilter={statusFilter}
          deliveryFilter={deliveryFilter}
          newestFirst={dateSort !== "Oldest First"}
          onChanged={loadOrders}
          onSummary={setSummary}
          shelves={shelves}
        />
      </div>

      <SupplyOrderSheet
        open={ordering}
        site={scope.active ? { id: scope.accountId, name: scope.accountName } : undefined}
        onClose={() => setOrdering(false)}
        onOrdered={() => {
          setOrdering(false);
          loadAll();
        }}
      />
    </main>
  );
}
