"use client";

// Supply Orders -> "Orders in progress": every order still on its way, as
// Ordered -> Approved (manager) -> Bought (office) -> Delivered. Each card
// says the step, who has it, what to do, and has that step's one main
// button. Red when it has sat on a step longer than Settings -> Team allows.
//
// The order's existing Status moves with it (New, Approved, Pending / In
// Progress, Completed), so the table below, its filters and its print views
// keep working. A Status changed with the old dropdown is picked up here the
// next time the page loads.

import { useEffect, useMemo, useRef, useState } from "react";
import { BigButton, Counts, EmptyState, Tips } from "@/app/ui";
import { ORDER_STATUS_FOR_STEP, isLate, isMine, sortForWork, stepOf, type HandoffItem } from "@/lib/handoffs";
import { HandoffCard, advanceWithUndo, postHandoff, useHandoffs } from "../components/handoffs";
import { orderForSync } from "../components/my-work";

type Order = Record<string, unknown> & { orderId?: string; rowNumber?: number; status?: string };

export default function OrderSteps({
  orders,
  loading,
  focusId,
  onLocalStatus,
}: {
  orders: Order[];
  loading: boolean;
  /** ?order= from My work: that order's card is brought into view. */
  focusId: string;
  /** Lets the table below show the new Status right away. */
  onLocalStatus: (order: Order, status: string) => void;
}) {
  const handoffs = useHandoffs();
  const [quick, setQuick] = useState<"all" | "late" | "mine">("all");
  // itemId -> the step it is being moved to (shown at once; put back on Undo).
  const [moving, setMoving] = useState<Record<string, string>>({});
  const synced = useRef(false);

  // Line the tracking up with the orders list, once per load.
  useEffect(() => {
    if (handoffs.state !== "ready" || loading || synced.current) return;
    synced.current = true;
    const tracked = new Map(handoffs.items.filter((item) => item.kind === "order").map((item) => [item.itemId, item]));
    const send = orders.map(orderForSync).filter((order) => {
      if (!order.itemId) return false;
      const row = tracked.get(order.itemId);
      if (!row) return order.step !== "" && order.step !== "delivered";
      return !row.doneAt && row.step !== order.step;
    });
    if (send.length === 0) return;
    postHandoff({ action: "syncOrders", orders: send })
      .then(() => handoffs.reload())
      .catch(() => {});
  }, [handoffs, orders, loading]);

  const byId = useMemo(() => new Map(orders.map((order) => [orderForSync(order).itemId, order])), [orders]);
  const open = useMemo(
    () =>
      sortForWork(
        handoffs.items.filter((item) => item.kind === "order" && !item.doneAt).map((item) => (moving[item.itemId] ? { ...item, step: moving[item.itemId] } : item)),
        handoffs.settings
      ).filter((item) => item.step !== "delivered"),
    [handoffs.items, handoffs.settings, moving]
  );
  const late = open.filter((item) => isLate(item, handoffs.settings));
  const mine = open.filter((item) => isMine(item, handoffs.settings, handoffs.me));
  const shown = quick === "late" ? late : quick === "mine" ? mine : open;

  useEffect(() => {
    if (!focusId || handoffs.state !== "ready") return;
    document.getElementById(`order-step-${focusId}`)?.scrollIntoView({ block: "center" });
  }, [focusId, handoffs.state]);

  if (handoffs.state !== "ready") return null;

  function advance(item: HandoffItem) {
    const { next } = stepOf(item, handoffs.settings);
    if (!next) return;
    const order = byId.get(item.itemId);
    const status = ORDER_STATUS_FOR_STEP[next.key];
    const oldStatus = String(order?.status ?? "");
    const setMove = (step: string | null) =>
      setMoving((current) => {
        const copy = { ...current };
        if (step) copy[item.itemId] = step;
        else delete copy[item.itemId];
        return copy;
      });
    advanceWithUndo({
      item,
      toStep: next.key,
      settings: handoffs.settings,
      onOptimistic: () => setMove(next.key),
      onUndo: () => {
        setMove(null);
        if (order) onLocalStatus(order, oldStatus);
      },
      run: async () => {
        // 1. The order's own Status, the way the dropdown saves it.
        if (order) {
          const response = await fetch("/api/supply-orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "updateSupplyOrderStatus", rowNumber: order.rowNumber, orderId: order.orderId, status }),
          });
          const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; message?: string };
          if (!response.ok || data.success === false) throw new Error(data.error || data.message || "The order did not update. Try again.");
          onLocalStatus(order, status);
        }
        // 2. Who moved it, and when.
        await postHandoff({ action: "advance", kind: "order", itemId: item.itemId, toStep: next.key });
        await handoffs.reload();
        setMove(null);
      },
    });
  }

  return (
    <section className="ui-screen-body no-print" aria-label="Orders in progress">
      <Tips
        id="order-steps"
        steps={[
          { target: '[data-tip="order-counts"]', text: "A supply order goes: Ordered, Approved by the manager, Bought by the office, Delivered." },
          { target: '[data-tip="order-list"]', text: "Each card says who has the order now and what they do. Tap its green button when your part is done." },
        ]}
      />
      <h2 className="ui-section-title">Orders in progress</h2>
      <Counts
        data-tip="order-counts"
        items={[
          { label: "In progress", value: open.length, tone: "info", pressed: quick === "all", onClick: () => setQuick("all") },
          { label: "Late", value: late.length, tone: late.length > 0 ? "bad" : "good", pressed: quick === "late", onClick: () => setQuick(quick === "late" ? "all" : "late") },
          { label: "Waiting on me", value: mine.length, tone: "off", pressed: quick === "mine", onClick: () => setQuick(quick === "mine" ? "all" : "mine") },
        ]}
      />
      <div data-tip="order-list">
        {shown.length === 0 ? (
          <EmptyState
            title={quick === "late" ? "Nothing is late ✓" : quick === "mine" ? "Nothing is waiting on you ✓" : "No orders in progress ✓"}
            text={quick === "all" ? "When a subcontractor orders supplies, the order shows up here for the manager to approve." : "Tap In progress to see every order."}
          />
        ) : (
          <ul className="ui-acct-list">
            {shown.map((item) => {
              const { step } = stepOf(item, handoffs.settings);
              return (
                <li key={item.itemId} id={`order-step-${item.itemId}`}>
                  <HandoffCard item={item} settings={handoffs.settings} detail={[item.data.items, item.data.subcontractor ? `for ${item.data.subcontractor}` : ""].filter(Boolean).join(" ")}>
                    {step?.button ? (
                      <BigButton disabled={Boolean(moving[item.itemId])} onClick={() => advance(item)}>
                        {step.button}
                      </BigButton>
                    ) : null}
                  </HandoffCard>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
