"use client";

// Supply Orders -> "Crew Link orders": the orders crews sent from Crew Link,
// with "Edit order". Open ones first. Subcontractor portal orders are the
// rest of this page and are not touched here. Renders nothing where
// migration 033 is not in the database yet, or when there are no such orders.

import { useCallback, useEffect, useState } from "react";
import AccountLink from "../components/AccountLink";
import { CrewOrderEdit } from "../components/crew-order-edit";
import { BigButton, Card, StatusPill, type StatusKind } from "@/app/ui";
import { formatCrewDateTime } from "@/lib/crewDateTime";

type Status = "new" | "ordered" | "delivered" | "cancelled";
type Order = {
  id: number;
  accountId: string;
  accountName: string;
  status: Status;
  orderedBy: string;
  createdAt: string;
  note: string;
  otherItems: string;
  lines: { itemId: number; itemName: string; unit: string; qty: number }[];
  editedBy: string;
  editedAt: string;
};

// Same wording as the Accounts Center queue.
const STATUS_LABEL: Record<Status, string> = { new: "Sent", ordered: "Ordered", delivered: "Delivered", cancelled: "Cancelled" };
const STATUS_KIND: Record<Status, StatusKind> = { new: "needs-you", ordered: "waiting", delivered: "done", cancelled: "off" };
const isOpen = (order: Order) => order.status === "new" || order.status === "ordered";

export default function CrewLinkOrders() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const fetchOrders = useCallback(async (): Promise<Order[] | null> => {
    try {
      const response = await fetch("/api/admin/crew-supplies?view=orders", { cache: "no-store" });
      const body = (await response.json()) as { success?: boolean; ready?: boolean; orders?: Order[] };
      return response.ok && body.success === true && body.ready === true ? (body.orders ?? []) : null;
    } catch {
      return null;
    }
  }, []);
  const load = useCallback(async () => setOrders(await fetchOrders()), [fetchOrders]);

  useEffect(() => {
    let alive = true;
    void fetchOrders().then((loaded) => {
      if (alive) setOrders(loaded);
    });
    return () => {
      alive = false;
    };
  }, [fetchOrders]);

  if (!orders || orders.length === 0) return null;
  const open = orders.filter(isOpen);
  const closed = orders.filter((order) => !isOpen(order));
  const shown = showClosed ? [...open, ...closed] : open;

  return (
    <div className="print:hidden" data-crew-link-orders style={{ marginBottom: 16 }}>
      <Card title={`Crew Link orders (${open.length} open)`}>
        <div className="ui-stack">
          {shown.length === 0 ? <p className="ui-muted">No open Crew Link orders.</p> : null}
          {shown.map((order) => (
            <div key={order.id} className="ui-stat" data-crew-order={order.id}>
              <div className="ui-card-row">
                <span className="ui-strong">
                  <AccountLink accountId={order.accountId} name={order.accountName} />
                </span>
                <StatusPill kind={STATUS_KIND[order.status]}>{STATUS_LABEL[order.status]}</StatusPill>
              </div>
              <ul className="ui-list-plain" style={{ marginTop: 4 }}>
                {order.lines.map((line) => (
                  <li key={line.itemId}>
                    {line.qty} × {line.itemName} ({line.unit})
                  </li>
                ))}
              </ul>
              {order.otherItems ? (
                <p style={{ margin: "4px 0 0" }}>
                  <span className="ui-strong">Other supplies:</span> {order.otherItems}
                </p>
              ) : null}
              <p className="ui-muted">
                {order.orderedBy || "Unknown"} · {formatCrewDateTime(order.createdAt)}
              </p>
              <div className="ui-actions-row" style={{ marginTop: 8 }}>
                <CrewOrderEdit orderId={order.id} status={order.status} mark={order.editedAt ? { editedBy: order.editedBy, editedAt: order.editedAt } : undefined} onSaved={() => void load()} />
                <a href={`/crew-link/print/order/${order.id}`} target="_blank" rel="noopener" className="ui-btn ui-btn-second">
                  Print
                </a>
              </div>
            </div>
          ))}
          {closed.length > 0 ? (
            <div>
              <BigButton kind="quiet" onClick={() => setShowClosed(!showClosed)}>
                {showClosed ? "Hide delivered and cancelled" : `Show delivered and cancelled (${closed.length})`}
              </BigButton>
            </div>
          ) : null}
          <p className="ui-muted" style={{ margin: 0 }}>
            Mark an order Ordered or Delivered in Accounts Center, under Crew Link.
          </p>
        </div>
      </Card>
    </div>
  );
}
