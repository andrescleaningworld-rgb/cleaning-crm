"use client";

// "My work" on the Dashboard: only what is waiting on the logged-in person,
// across new accounts, account updates and supply orders. Red first, then
// the one that has waited longest. One tap opens the item with its one main
// button.

import { useEffect, useMemo, useRef, useState } from "react";
import { CHEER, EmptyState, MOTTO, SkeletonList, Tips } from "@/app/ui";
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

const BANNER_KEY = "cwMottoBannerClosed";
const STREAK_KEY = "cwNothingLateStreak";
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
};

function detailOf(item: HandoffItem): string {
  if (item.kind === "order") return [item.data.items, item.data.subcontractor ? `for ${item.data.subcontractor}` : ""].filter(Boolean).join(" ");
  if (item.kind === "update") return [item.data.updateType, item.data.notes].filter(Boolean).join(": ");
  return item.manager ? `Manager: ${item.manager}` : "";
}

export default function MyWork({ orders }: { orders: Record<string, unknown>[] }) {
  const handoffs = useHandoffs();
  const [everyone, setEveryone] = useState(false);
  const synced = useRef(false);
  // The house rule as a slim banner: closing it hides it until tomorrow.
  const [banner, setBanner] = useState(false);
  // Days in a row this person had nothing late (kept on this device).
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBanner(window.localStorage.getItem(BANNER_KEY) !== today());
    } catch {
      setBanner(true);
    }
  }, []);

  function closeBanner() {
    setBanner(false);
    try {
      window.localStorage.setItem(BANNER_KEY, today());
    } catch {
      // Not remembered: it simply shows again next visit.
    }
  }

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

  // The streak: one more day when nothing of mine is late; back to zero,
  // without a word, when something is.
  const lateMine = mine.filter((item) => isLate(item, handoffs.settings)).length;
  const myName = handoffs.me.name;
  useEffect(() => {
    if (handoffs.state !== "ready" || !myName) return;
    try {
      const key = `${STREAK_KEY}:${myName}`;
      const saved = JSON.parse(window.localStorage.getItem(key) ?? "{}") as { day?: string; count?: number };
      let count = Number(saved.count) || 0;
      if (lateMine > 0) count = 0;
      else if (saved.day !== today()) count += 1;
      window.localStorage.setItem(key, JSON.stringify({ day: today(), count }));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStreak(count);
    } catch {
      // No storage: no streak, nothing else changes.
    }
  }, [handoffs.state, myName, lateMine]);

  const mottoBanner = banner ? (
    <div className="ui-banner" role="note">
      <span>{MOTTO.en}</span>
      <button type="button" onClick={closeBanner} aria-label="Close this message until tomorrow">
        ×
      </button>
    </div>
  ) : null;

  // Handoffs off (a database without their tables, or the feature flag): only the house rule shows.
  if (handoffs.state === "off" || handoffs.state === "failed") return mottoBanner;

  return (
    <section className="ui-screen-body" aria-label="My work">
      {mottoBanner}
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
        {!everyone && streak >= 2 ? <span className="ui-streak">🔥 {CHEER.streak(streak)}</span> : null}
        {others > 0 || everyone ? (
          <button type="button" className="ui-chip" aria-pressed={everyone} onClick={() => setEveryone((value) => !value)}>
            {everyone ? "Only mine" : `Everyone's (${open.length})`}
          </button>
        ) : null}
      </div>

      <div data-tip="my-work">
        {handoffs.state === "loading" ? (
          <SkeletonList rows={2} />
        ) : shown.length === 0 && !everyone ? (
          <div className="ui-allclear" role="status">
            <p className="ui-allclear-title">{CHEER.allClearTitle}</p>
            <p>{CHEER.allClearText}</p>
            {others > 0 ? <p className="ui-muted">Tap Everyone&apos;s to see what the others have.</p> : null}
          </div>
        ) : shown.length === 0 ? (
          <EmptyState title="Nothing is waiting on anyone ✓" text="New accounts, account updates and supply orders show up here when there is something to do." />
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
