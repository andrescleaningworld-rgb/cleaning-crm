"use client";

// "My work" on the Dashboard: only what is waiting on the logged-in person,
// across new accounts, account updates and supply orders. Red first, then
// the one that has waited longest. One tap opens the item with its one main
// button.

import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, SkeletonList, Tips } from "@/app/ui";
import { isLate, isMine, orderStepFromStatus, sortForWork, type HandoffItem } from "@/lib/handoffs";
import { HandoffCard, handoffCardHref, postHandoff, useHandoffs } from "./handoffs";

/** What the handoff tracking needs to know about one supply order, from whatever the orders list returned. */
export function orderForSync(order: Record<string, unknown>) {
  const text = (...keys: string[]) => {
    for (const key of keys) {
      const value = order[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
    }
    return "";
  };
  const itemId = text("orderId", "Order ID", "id") || text("rowNumber");
  const quantity = [text("quantity", "Quantity"), text("unit", "Unit")].filter(Boolean).join(" ");
  const supply = text("supplyItem", "Supply Item", "item");
  return {
    itemId,
    step: orderStepFromStatus(text("status", "Status")),
    title: text("accountName", "Account Name", "account") || "Supply order",
    accountId: text("accountId", "Account ID"),
    accountName: text("accountName", "Account Name", "account"),
    stepSince: text("lastUpdated", "Last Updated", "timestamp", "Timestamp", "date"),
    createdBy: text("subcontractor", "Subcontractor"),
    data: { items: [quantity, supply].filter(Boolean).join(" "), subcontractor: text("subcontractor", "Subcontractor") },
  };
}

function detailOf(item: HandoffItem): string {
  if (item.kind === "order") return [item.data.items, item.data.subcontractor ? `for ${item.data.subcontractor}` : ""].filter(Boolean).join(" ");
  if (item.kind === "update") return [item.data.updateType, item.data.notes].filter(Boolean).join(": ");
  return item.manager ? `Manager: ${item.manager}` : "";
}

export default function MyWork({ orders }: { orders: Record<string, unknown>[] }) {
  const handoffs = useHandoffs();
  const [everyone, setEveryone] = useState(false);
  const synced = useRef(false);

  // Line the order tracking up with the orders list (new orders, and ones
  // whose Status was changed with the old dropdown), once per visit.
  useEffect(() => {
    if (handoffs.state !== "ready" || synced.current || orders.length === 0) return;
    synced.current = true;
    const tracked = new Map(handoffs.items.filter((item) => item.kind === "order").map((item) => [item.itemId, item]));
    const send = orders
      .map(orderForSync)
      .filter((order) => {
        if (!order.itemId) return false;
        const row = tracked.get(order.itemId);
        if (!row) return order.step !== "" && order.step !== "delivered";
        return !row.doneAt && row.step !== order.step;
      });
    if (send.length === 0) return;
    postHandoff({ action: "syncOrders", orders: send })
      .then(() => handoffs.reload())
      .catch(() => {});
  }, [handoffs, orders]);

  const open = useMemo(() => handoffs.items.filter((item) => !item.doneAt), [handoffs.items]);
  const mine = useMemo(() => sortForWork(open.filter((item) => isMine(item, handoffs.settings, handoffs.me)), handoffs.settings), [open, handoffs.settings, handoffs.me]);
  const shown = everyone ? sortForWork(open, handoffs.settings) : mine;
  const others = open.length - mine.length;

  // The feature is off in a database that does not have its tables yet.
  if (handoffs.state === "off" || handoffs.state === "failed") return null;

  return (
    <section className="ui-screen-body" aria-label="My work">
      <Tips
        id="my-work"
        ready={handoffs.state === "ready"}
        steps={[
          { target: '[data-tip="my-work"]', text: "My work is what is waiting on you: new accounts, account updates and supply orders. Red means late." },
          { target: '[data-tip="my-work"] .ui-acct', text: "Tap a card to open it. It has one main button. Tap it and the next person gets it." },
        ]}
      />
      <div className="ui-card-row">
        <h2 className="ui-section-title">
          {everyone ? "Everyone's work" : "My work"} ({shown.length})
        </h2>
        {others > 0 || everyone ? (
          <button type="button" className="ui-chip" aria-pressed={everyone} onClick={() => setEveryone((value) => !value)}>
            {everyone ? "Only mine" : `Everyone's (${open.length})`}
          </button>
        ) : null}
      </div>

      <div data-tip="my-work">
        {handoffs.state === "loading" ? (
          <SkeletonList rows={2} />
        ) : shown.length === 0 ? (
          <EmptyState title="Nothing is waiting on you ✓" text={others > 0 ? "Tap Everyone's to see what the others have." : "New accounts, account updates and supply orders show up here when it is your turn."} />
        ) : (
          <ul className="ui-acct-list">
            {shown.map((item) => (
              <li key={`${item.kind}-${item.itemId}`}>
                <HandoffCard item={item} settings={handoffs.settings} href={handoffCardHref(item)} showKind detail={detailOf(item)} />
              </li>
            ))}
          </ul>
        )}
      </div>
      {shown.some((item) => isLate(item, handoffs.settings)) ? <p className="ui-muted">Red cards are late. Do those first.</p> : null}
    </section>
  );
}
