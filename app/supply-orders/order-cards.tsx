"use client";

// Supply Orders -> one card per order (lib/supplyOrderStatus.ts, lib/pg/shelves.ts):
//
//   a sub-portal order   its lines (same order group; older lines: same account,
//                        sub and time), each still its own order row
//   a Crew Link order    one order with its lines
//
// The card says the step of its least-advanced item. Its big button moves the
// whole order one step: ✓ Approve -> 🛒 Mark bought -> 🚚 Sent to site. The
// crew's "📦 Supplies arrived" marks it Delivered. "Change items one by one"
// opens the lines (Status per line; Edit order for Crew Link). Tick cards for
// the sticky bar: the same three actions for many orders at once, after
// "Do this for X orders?". Anything that arrived short is red on its card.
// 🖨 Print opens a clean printable order (app/supply-orders/print), and
// 📌 Pin to board puts it on the board with the same square picker as an
// account's Print PDF; both work for one card or every ticked card.
//
// The step tracking stays one item per order line (handoff_items, kind
// "order"; a Crew Link order is "crew-<id>"), so the In progress / Late /
// Waiting on me counts, My work and the dashboard keep working as before.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AccountLink from "../components/AccountLink";
import { CrewOrderEdit } from "../components/crew-order-edit";
import { HandoffCard, postHandoff, useHandoffs } from "../components/handoffs";
import { orderForSync } from "../components/my-work";
import { SquareTiles, pinIsOn, pinRecord, usePinInfo, type BoardSpot } from "../components/pin-to-board";
import { ConfirmSheet, Counts, EmptyState, Sheet, StatusPill, Tips, showToast, type StatusKind } from "@/app/ui";
import { ORDER_STATUS_FOR_STEP, ORDER_STEPS, isLate, isMine, orderStepFromStatus, type HandoffItem } from "@/lib/handoffs";
import { ORDER_STATUSES, canonicalOrderStatus } from "@/lib/supplyOrderStatus";
import { formatCrewDateTime } from "@/lib/crewDateTime";

export type SubOrder = Record<string, unknown> & {
  rowNumber?: number;
  orderId?: string;
  orderGroupId?: string;
  timestamp?: string;
  accountId?: string;
  accountName?: string;
  subcontractor?: string;
  supplyItem?: string;
  quantity?: string;
  unit?: string;
  deliveryMode?: string;
  status?: string;
  notes?: string;
};

type CrewOrder = {
  id: number;
  accountId: string;
  accountName: string;
  status: "new" | "ordered" | "delivered" | "cancelled";
  orderedBy: string;
  createdAt: string;
  otherItems: string;
  lines: { itemId: number; itemName: string; unit: string; qty: number }[];
  editedBy: string;
  editedAt: string;
};
type Waiting = { key: string; source: "crew-order" | "sub-order" | "office"; ref: string; sentAt: string };
type Short = { source: string; ref: string; lines: string[] };

type Item = { itemId: string; text: string; delivery: string; status: string; step: string; row?: SubOrder };
type Card = {
  key: string;
  source: "sub" | "crew";
  accountId: string;
  accountName: string;
  orderedBy: string;
  at: number;
  atText: string;
  items: Item[];
  /** The least-advanced step of its items. "" = out of the flow (denied, cancelled). */
  step: string;
  status: string;
  crew?: CrewOrder;
  /** Shelves keys this order can be sent with (not sent yet). */
  sendKeys: string[];
  sent: boolean;
  short: string[];
  late: boolean;
  mine: boolean;
  search: string;
};

export type OrderSummary = { total: number; newOrReview: number; approved: number; pending: number; completed: number };

type Action = "approved" | "bought" | "send";
const ACTION_LABEL: Record<Action, string> = { approved: "✓ Approve", bought: "🛒 Mark bought", send: "🚚 Sent to site" };
/** What the card's button does on each step. */
const ACTION_FOR_STEP: Record<string, Action> = { ordered: "approved", approved: "bought", bought: "send" };
const STEP_INDEX = new Map(ORDER_STEPS.map((step, index) => [step.key, index]));
const STEP_LABEL = new Map(ORDER_STEPS.map((step) => [step.key, step.label]));
const CREW_STEP: Record<CrewOrder["status"], string> = { new: "ordered", ordered: "bought", delivered: "delivered", cancelled: "" };
const CREW_STATUS: Record<CrewOrder["status"], string> = { new: "New", ordered: "Pending / In Progress", delivered: "Completed", cancelled: "Cancelled" };

const clean = (value: unknown) => String(value ?? "").trim();
const crewItemId = (id: number) => `crew-${id}`;
/** The printable page for these orders, each on its own page. */
const printHref = (keys: string[]) => `/supply-orders/print?${keys.map((key) => `o=${encodeURIComponent(key)}`).join("&")}`;
const parseDate = (text: string) => {
  const ms = Date.parse(text);
  return Number.isNaN(ms) ? 0 : ms;
};

export function statusKind(status: string): StatusKind {
  const lower = canonicalOrderStatus(status).toLowerCase();
  if (lower === "completed" || lower === "approved") return "done";
  if (lower === "pending / in progress") return "waiting";
  if (lower === "needs review" || lower === "denied" || lower === "cancelled") return "needs-you";
  return "off";
}

// Same rule as the page's PO picker: lines sent together share orderGroupId;
// older lines fall back to the same account + sub + time.
export function orderGroupKey(order: SubOrder): string {
  const groupId = clean(order.orderGroupId);
  if (groupId) return `group:${groupId}`;
  return `fallback:${clean(order.accountName).toLowerCase()}|${clean(order.subcontractor).toLowerCase()}|${clean(order.timestamp)}`;
}

export default function OrderCards({
  orders,
  loading,
  focusId,
  accountId,
  search,
  statusFilter,
  deliveryFilter,
  newestFirst,
  onItemStatus,
  onChanged,
  onSummary,
}: {
  orders: SubOrder[];
  loading: boolean;
  /** ?order= from My work: that order's card is brought into view. */
  focusId: string;
  /** Opened from an account: only its orders. "" = every account. */
  accountId: string;
  search: string;
  /** "All" = the orders in progress (with the In progress / Late / Waiting on me counts); a Status = every order with a line in it. */
  statusFilter: string;
  deliveryFilter: string;
  newestFirst: boolean;
  /** Changes one line's Status (the page's own save). */
  onItemStatus: (order: SubOrder, status: string) => Promise<void>;
  /** Something changed on the server: the page reloads its order list. */
  onChanged: () => Promise<void> | void;
  /** The top numbers: how many ORDERS (not lines) are in each status. */
  onSummary?: (summary: OrderSummary) => void;
}) {
  const handoffs = useHandoffs();
  const { info: pinInfo } = usePinInfo();
  const [crewOrders, setCrewOrders] = useState<CrewOrder[]>([]);
  const [waiting, setWaiting] = useState<Waiting[]>([]);
  const [short, setShort] = useState<Short[]>([]);
  const [quick, setQuick] = useState<"all" | "late" | "mine">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState<{ action: Action; cards: Card[] } | null>(null);
  // "📌 Pin to board": the orders waiting for a square to be picked.
  const [pinning, setPinning] = useState<Card[] | null>(null);
  const [pinBusy, setPinBusy] = useState("");
  const synced = useRef(false);

  const loadExtras = useCallback(async () => {
    const [crew, shelves] = await Promise.all([
      fetch("/api/admin/crew-supplies?view=orders", { cache: "no-store" })
        .then((response) => response.json())
        .catch(() => ({})) as Promise<{ success?: boolean; ready?: boolean; orders?: CrewOrder[] }>,
      fetch("/api/shelves", { cache: "no-store" })
        .then((response) => response.json())
        .catch(() => ({})) as Promise<{ success?: boolean; ready?: boolean; waiting?: Waiting[]; short?: Short[] }>,
    ]);
    setCrewOrders(crew.success && crew.ready ? (crew.orders ?? []) : []);
    setWaiting(shelves.success && shelves.ready ? (shelves.waiting ?? []) : []);
    setShort(shelves.success && shelves.ready ? (shelves.short ?? []) : []);
  }, []);

  useEffect(() => {
    void loadExtras();
  }, [loadExtras]);

  // Line the step tracking up with the orders, once per load: sub-portal lines
  // from their Status (as before), Crew Link orders only forward (their own
  // status has no Approved or Bought), closed when delivered or cancelled.
  useEffect(() => {
    if (handoffs.state !== "ready" || loading || synced.current) return;
    synced.current = true;
    const tracked = new Map(handoffs.items.filter((item) => item.kind === "order").map((item) => [item.itemId, item]));
    const send: Record<string, unknown>[] = orders.map(orderForSync).filter((order) => {
      if (!order.itemId) return false;
      const row = tracked.get(order.itemId);
      if (!row) return order.step !== "" && order.step !== "delivered";
      return !row.doneAt && row.step !== order.step;
    });
    for (const order of crewOrders) {
      const itemId = crewItemId(order.id);
      const want = CREW_STEP[order.status];
      const row = tracked.get(itemId);
      const base = {
        itemId,
        step: want,
        title: order.accountName || "Supply order",
        accountId: order.accountId,
        accountName: order.accountName,
        stepSince: order.createdAt,
        createdBy: order.orderedBy,
        data: { items: order.lines.map((line) => `${line.qty} ${line.itemName}`).join(", "), subcontractor: "Crew Link" },
      };
      if (!row) {
        if (want !== "" && want !== "delivered") send.push(base);
      } else if (!row.doneAt && (want === "" || (STEP_INDEX.get(want) ?? 0) > (STEP_INDEX.get(row.step) ?? 0))) {
        send.push(base);
      }
    }
    if (send.length === 0) return;
    postHandoff({ action: "syncOrders", orders: send })
      .then(() => handoffs.reload())
      .catch(() => {});
  }, [handoffs, orders, crewOrders, loading]);

  const cards = useMemo<Card[]>(() => {
    if (handoffs.state !== "ready") return [];
    const tracked = new Map(handoffs.items.filter((item) => item.kind === "order").map((item) => [item.itemId, item]));
    const stepOfItem = (itemId: string, fallback: string) => {
      const row = tracked.get(itemId);
      return row && !row.doneAt ? row.step : fallback;
    };
    const lateOrMine = (itemIds: string[], sent: boolean) => {
      const rows = itemIds.map((id) => tracked.get(id)).filter((row): row is HandoffItem => Boolean(row && !row.doneAt));
      return { late: rows.some((row) => isLate(row, handoffs.settings)), mine: !sent && rows.some((row) => isMine(row, handoffs.settings, handoffs.me)) };
    };
    const leastStep = (items: Item[]) => {
      const inFlow = items.filter((item) => item.step !== "");
      if (inFlow.length === 0) return "";
      return inFlow.reduce((low, item) => ((STEP_INDEX.get(item.step) ?? 0) < (STEP_INDEX.get(low) ?? 0) ? item.step : low), inFlow[0].step);
    };

    const out: Card[] = [];
    const groups = new Map<string, SubOrder[]>();
    for (const order of orders) {
      const key = orderGroupKey(order);
      groups.set(key, [...(groups.get(key) ?? []), order]);
    }
    for (const [key, rows] of groups) {
      const first = rows[0];
      const items: Item[] = rows.map((row) => {
        const sync = orderForSync(row);
        const status = canonicalOrderStatus(row.status);
        return { itemId: sync.itemId, text: `${clean(row.quantity)}${row.unit ? ` ${clean(row.unit)}` : ""} × ${clean(row.supplyItem)}`, delivery: clean(row.deliveryMode), status, step: stepOfItem(sync.itemId, orderStepFromStatus(status)), row };
      });
      // The shelves know a sub order by its group (or, for an older line, its own order id).
      const refs = [...new Set(rows.map((row) => clean(row.orderGroupId) || clean(row.orderId)).filter(Boolean))];
      const mineWaiting = waiting.filter((entry) => entry.source === "sub-order" && refs.includes(entry.ref));
      const sent = mineWaiting.some((entry) => entry.sentAt);
      const step = leastStep(items);
      out.push({
        key,
        source: "sub",
        accountId: clean(first.accountId),
        accountName: clean(first.accountName),
        orderedBy: clean(first.subcontractor),
        at: parseDate(clean(first.timestamp)),
        atText: clean(first.timestamp),
        items,
        step,
        status: items.find((item) => item.step === step)?.status ?? items[0].status,
        sendKeys: mineWaiting.filter((entry) => !entry.sentAt).map((entry) => entry.key),
        sent,
        short: short.filter((entry) => entry.source === "sub-order" && refs.includes(entry.ref)).flatMap((entry) => entry.lines),
        ...lateOrMine(items.map((item) => item.itemId), sent),
        search: [first.accountName, first.accountId, first.subcontractor, first.timestamp, ...rows.flatMap((row) => [row.orderId, row.orderGroupId, row.supplyItem, row.category, row.description, row.quantity, row.unit, row.deliveryMode, row.status, row.notes])]
          .map(clean)
          .join(" ")
          .toLowerCase(),
      });
    }
    for (const order of crewOrders) {
      const itemId = crewItemId(order.id);
      const status = CREW_STATUS[order.status];
      const step = stepOfItem(itemId, CREW_STEP[order.status]);
      const entries = waiting.filter((entry) => entry.source === "crew-order" && entry.ref === String(order.id));
      const sent = entries.some((entry) => entry.sentAt);
      out.push({
        key: itemId,
        source: "crew",
        accountId: order.accountId,
        accountName: order.accountName,
        orderedBy: order.orderedBy,
        at: parseDate(order.createdAt),
        atText: formatCrewDateTime(order.createdAt),
        items: [
          ...order.lines.map((line) => ({ itemId, text: `${line.qty} ${line.unit} × ${line.itemName}`, delivery: "", status, step })),
          ...(order.otherItems ? [{ itemId, text: `Other: ${order.otherItems}`, delivery: "", status, step }] : []),
        ],
        step,
        status,
        crew: order,
        sendKeys: entries.filter((entry) => !entry.sentAt).map((entry) => entry.key),
        sent,
        short: short.filter((entry) => entry.source === "crew-order" && entry.ref === String(order.id)).flatMap((entry) => entry.lines),
        ...lateOrMine([itemId], sent),
        search: [order.accountName, order.accountId, order.orderedBy, "crew link", order.otherItems, ...order.lines.map((line) => line.itemName), status].join(" ").toLowerCase(),
      });
    }
    return out;
  }, [handoffs, orders, crewOrders, waiting, short]);

  // Search, delivery mode and account first; then In progress / Late / Waiting on me, or a Status.
  const matching = useMemo(() => {
    const words = search.trim().toLowerCase();
    return cards.filter(
      (card) =>
        (!accountId || card.accountId.toLowerCase() === accountId.toLowerCase()) &&
        (!words || card.search.includes(words)) &&
        (deliveryFilter === "All" || card.items.some((item) => item.delivery === deliveryFilter))
    );
  }, [cards, search, deliveryFilter, accountId]);
  const inProgress = matching.filter((card) => card.step !== "" && card.step !== "delivered");

  // One count per order, by the status of its item furthest behind (the account
  // the page is opened for only; search and filters do not change them).
  const summary = useMemo<OrderSummary>(() => {
    const mineOnly = cards.filter((card) => !accountId || card.accountId.toLowerCase() === accountId.toLowerCase());
    const count = (...statuses: string[]) => mineOnly.filter((card) => statuses.includes(card.status)).length;
    return { total: mineOnly.length, newOrReview: count("New", "Needs Review"), approved: count("Approved"), pending: count("Pending / In Progress"), completed: count("Completed") };
  }, [cards, accountId]);
  useEffect(() => {
    onSummary?.(summary);
  }, [summary, onSummary]);
  const late = inProgress.filter((card) => card.late);
  const mine = inProgress.filter((card) => card.mine);
  const shown = useMemo(() => {
    const list =
      statusFilter !== "All"
        ? matching.filter((card) => card.items.some((item) => item.status === statusFilter))
        : quick === "late"
          ? late
          : quick === "mine"
            ? mine
            : inProgress;
    return [...list].sort((a, b) => (newestFirst ? b.at - a.at : a.at - b.at));
  }, [matching, statusFilter, quick, late, mine, inProgress, newestFirst]);

  useEffect(() => {
    if (!focusId || handoffs.state !== "ready") return;
    document.querySelector(`[data-order-items~="${CSS.escape(focusId)}"]`)?.scrollIntoView({ block: "center" });
  }, [focusId, handoffs.state, cards.length]);

  if (handoffs.state !== "ready") return null;

  const actionOf = (card: Card): Action | null => {
    const action = ACTION_FOR_STEP[card.step];
    if (!action) return null;
    if (action === "send" && (card.sent || card.sendKeys.length === 0)) return null;
    return action;
  };

  /** Moves one order one step. Returns false when it could not. */
  async function act(card: Card, action: Action): Promise<boolean> {
    try {
      if (action === "send") {
        for (const key of card.sendKeys) {
          const response = await fetch("/api/shelves", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", key }) });
          const body = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
          if (!response.ok || !body.success) throw new Error(body.error || "It was not sent.");
        }
        return true;
      }
      // Approve / Mark bought: the items on the card's step move one step on.
      const toStep = action;
      if (card.source === "crew") {
        const seed = { step: card.step, title: card.accountName || "Supply order", accountId: card.accountId, accountName: card.accountName, createdBy: card.orderedBy };
        await postHandoff({ action: "advance", kind: "order", itemId: card.key, toStep, seed });
        return true;
      }
      for (const item of card.items.filter((entry) => entry.step === card.step && entry.row)) {
        await onItemStatus(item.row!, ORDER_STATUS_FOR_STEP[toStep]);
        await postHandoff({ action: "advance", kind: "order", itemId: item.itemId, toStep, seed: orderForSync(item.row!) });
      }
      return true;
    } catch (error) {
      showToast(`${card.accountName}: ${error instanceof Error ? error.message : "That did not save."}`, "bad");
      return false;
    }
  }

  async function run(action: Action, list: Card[]) {
    setBusy(action);
    let done = 0;
    for (const card of list) if (await act(card, action)) done++;
    await Promise.all([handoffs.reload(), loadExtras(), onChanged()]);
    setSelected(new Set());
    setBusy("");
    if (done > 0) showToast(`${ACTION_LABEL[action]}: ${done} order${done === 1 ? "" : "s"} ✓`);
  }

  /** Pins each order to the square picked. A manager is texted only for their own square (the board's rule). */
  async function pinOrders(list: Card[], spot: BoardSpot) {
    setPinBusy(spot.key);
    let done = 0;
    for (const card of list) {
      try {
        await pinRecord({
          type: "order",
          recordId: card.key,
          title: card.accountName || "Supply order",
          accountId: card.accountId,
          accountName: card.accountName,
          square: spot.square,
          box: spot.box,
          forWho: spot.label,
          notes: card.items.map((item) => item.text).join("; ").slice(0, 900),
        });
        done++;
      } catch (error) {
        showToast(`${card.accountName}: ${error instanceof Error ? error.message : "It was not pinned."}`, "bad");
      }
    }
    setPinBusy("");
    setPinning(null);
    if (done > 0) showToast(`Pinned to ${spot.label} ✓${done > 1 ? ` (${done} orders)` : ""}`);
  }
  const canPin = pinInfo !== null && pinIsOn(pinInfo, "order");

  const picked = shown.filter((card) => selected.has(card.key));
  const pickedFor = (action: Action) => picked.filter((card) => actionOf(card) === action);
  const toggle = (key: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <section className="ui-screen-body no-print" aria-label="Supply orders" data-order-cards>
      <Tips
        id="order-cards"
        steps={[
          { target: '[data-tip="order-counts"]', text: "One card per order. It goes: Approve, Mark bought, Sent to site. The crew taps Supplies arrived." },
          { target: '[data-tip="order-list"]', text: "Tick several cards to do the same step for all of them at once." },
        ]}
      />
      {statusFilter === "All" ? (
        <Counts
          data-tip="order-counts"
          items={[
            { label: "In progress", value: inProgress.length, tone: "info", pressed: quick === "all", onClick: () => setQuick("all") },
            { label: "Late", value: late.length, tone: late.length > 0 ? "bad" : "good", pressed: quick === "late", onClick: () => setQuick(quick === "late" ? "all" : "late") },
            { label: "Waiting on me", value: mine.length, tone: "off", pressed: quick === "mine", onClick: () => setQuick(quick === "mine" ? "all" : "mine") },
          ]}
        />
      ) : null}

      <div data-tip="order-list" className="ui-stack">
        {loading ? <p className="ui-muted">Loading supply orders…</p> : null}
        {!loading && shown.length === 0 ? (
          <EmptyState
            title={statusFilter !== "All" ? "No orders with that status." : quick === "late" ? "Nothing is late ✓" : quick === "mine" ? "Nothing is waiting on you ✓" : "No orders in progress ✓"}
            text={statusFilter !== "All" ? "Pick All statuses to see the orders in progress." : "New orders from subs and crews show up here."}
          />
        ) : null}
        {shown.map((card) => {
          const action = actionOf(card);
          const stepLabel = card.step === "" ? card.status : STEP_LABEL.get(card.step) ?? card.step;
          const itemIds = [...new Set(card.items.map((item) => item.itemId))].join(" ");
          return (
            <article key={card.key} className={`ui-card ${card.late ? "border-2 border-red-400" : ""}`} data-order-card={card.key} data-order-items={itemIds}>
              <div className="ui-card-row" style={{ alignItems: "flex-start" }}>
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="h-6 w-6" checked={selected.has(card.key)} onChange={() => toggle(card.key)} aria-label={`Select the order for ${card.accountName}`} />
                  <span className="ui-strong">{card.accountName ? <AccountLink accountId={card.accountId} name={card.accountName} /> : "No account"}</span>
                </label>
                <span className="flex flex-wrap items-center gap-2">
                  {card.late ? <StatusPill kind="needs-you">Late</StatusPill> : null}
                  <StatusPill kind={card.sent ? "waiting" : statusKind(card.status)}>{card.sent && card.step === "bought" ? "🚚 On the way" : stepLabel}</StatusPill>
                </span>
              </div>
              <p className="ui-muted" style={{ margin: "2px 0 8px" }}>
                {card.source === "crew" ? "Crew Link" : "Sub portal"} · {card.orderedBy || "Unknown"} · {card.atText || "No date"}
              </p>
              <ul className="ui-list-plain">
                {card.items.map((item, index) => (
                  <li key={`${item.itemId}-${index}`}>
                    {item.text}
                    {item.delivery ? <span className="ui-muted"> · {item.delivery}</span> : null}
                  </li>
                ))}
              </ul>
              {card.short.length > 0 ? (
                <div className="mt-2 rounded-2xl border-2 border-red-400 bg-red-50 p-3" data-order-short>
                  <p className="font-black text-red-800" style={{ margin: 0 }}>
                    ⚠️ Arrived short
                  </p>
                  {card.short.map((line) => (
                    <p key={line} className="font-bold text-red-800" style={{ margin: 0 }}>
                      {line}
                    </p>
                  ))}
                </div>
              ) : null}
              {card.sent && card.step === "bought" ? <p className="ui-muted">Sent. The crew confirms with Supplies arrived.</p> : null}
              {action ? (
                <button
                  type="button"
                  disabled={busy !== ""}
                  onClick={() => void run(action, [card])}
                  className="mt-3 flex min-h-[64px] w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 text-xl font-black text-white shadow-sm active:scale-[0.98] disabled:opacity-50"
                >
                  {busy === action ? "Saving…" : ACTION_LABEL[action]}
                </button>
              ) : null}
              <div className="ui-actions-row" style={{ marginTop: 8 }}>
                <a href={printHref([card.key])} target="_blank" rel="noopener" className="ui-btn ui-btn-second" data-order-print>
                  🖨 Print
                </a>
                {canPin ? (
                  <button type="button" className="ui-btn ui-btn-second" onClick={() => setPinning([card])} data-order-pin>
                    📌 Pin to board
                  </button>
                ) : null}
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer font-bold">Change items one by one</summary>
                <div className="ui-stack" style={{ marginTop: 8 }}>
                  {card.source === "crew" && card.crew ? (
                    <div className="ui-actions-row">
                      <CrewOrderEdit
                        orderId={card.crew.id}
                        status={card.crew.status}
                        mark={card.crew.editedAt ? { editedBy: card.crew.editedBy, editedAt: card.crew.editedAt } : undefined}
                        onSaved={() => void loadExtras()}
                      />
                      <a href={`/crew-link/print/order/${card.crew.id}`} target="_blank" rel="noopener" className="ui-btn ui-btn-second">
                        Print
                      </a>
                    </div>
                  ) : (
                    card.items.map((item, index) =>
                      item.row ? (
                        <ItemStatus key={`${item.itemId}-${index}`} item={item} onChange={async (status) => {
                          setBusy("item");
                          try {
                            await onItemStatus(item.row!, status);
                            await handoffs.reload();
                          } finally {
                            setBusy("");
                          }
                        }} disabled={busy !== ""} />
                      ) : null
                    )
                  )}
                  {card.items.length > 1 ? <p className="ui-muted">The card shows the step of the item furthest behind.</p> : null}
                </div>
              </details>
              <HandoffDetail card={card} items={handoffs.items} settings={handoffs.settings} />
            </article>
          );
        })}
      </div>

      {picked.length > 0 ? (
        <div className="sticky bottom-0 z-30 -mx-4 border-t-2 border-slate-200 bg-white px-4 py-3 shadow-lg" data-bulk-bar>
          <p className="ui-strong" style={{ margin: "0 0 8px" }}>
            {picked.length} selected →
          </p>
          <div className="grid grid-cols-3 gap-2">
            <a href={printHref(picked.map((card) => card.key))} target="_blank" rel="noopener" className="flex min-h-[56px] items-center justify-center rounded-2xl bg-white px-2 text-base font-black text-slate-900 ring-2 ring-slate-300">
              🖨 Print ({picked.length})
            </a>
            {canPin ? (
              <button type="button" disabled={busy !== ""} onClick={() => setPinning(picked)} className="min-h-[56px] rounded-2xl bg-white px-2 text-base font-black text-slate-900 ring-2 ring-slate-300 disabled:opacity-50">
                📌 Pin ({picked.length})
              </button>
            ) : null}
            {(["approved", "bought", "send"] as Action[]).map((bulk) => {
              const list = pickedFor(bulk);
              return (
                <button
                  key={bulk}
                  type="button"
                  disabled={list.length === 0 || busy !== ""}
                  onClick={() => setConfirm({ action: bulk, cards: list })}
                  className="min-h-[56px] rounded-2xl bg-blue-700 px-2 text-base font-black text-white disabled:bg-slate-300 disabled:text-slate-500"
                >
                  {ACTION_LABEL[bulk]}
                  {list.length > 0 ? ` (${list.length})` : ""}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <Sheet
        open={pinning !== null}
        title={pinning && pinning.length > 1 ? `Pin ${pinning.length} orders to the board` : "Pin to board"}
        text={pinning ? `${pinning.map((card) => card.accountName || "No account").join(", ")}. Tap the square it goes in.` : ""}
        onClose={() => (pinBusy ? undefined : setPinning(null))}
        busy={pinBusy !== ""}
      >
        {pinning && pinInfo ? <SquareTiles info={pinInfo} onPick={(spot) => void pinOrders(pinning, spot)} disabled={pinBusy !== ""} busyKey={pinBusy} /> : null}
      </Sheet>

      <ConfirmSheet
        open={confirm !== null}
        title={confirm ? `Do this for ${confirm.cards.length} order${confirm.cards.length === 1 ? "" : "s"}?` : ""}
        text={confirm ? `${ACTION_LABEL[confirm.action]}: ${confirm.cards.map((card) => card.accountName || "No account").join(", ")}` : ""}
        confirmLabel={confirm ? ACTION_LABEL[confirm.action] : ""}
        busy={busy !== ""}
        busyLabel="Saving…"
        onConfirm={async () => {
          const next = confirm;
          setConfirm(null);
          if (next) await run(next.action, next.cards);
        }}
        onCancel={() => setConfirm(null)}
      />
    </section>
  );
}

/** One line's Status: the dropdown and the badge read the same word. */
function ItemStatus({ item, onChange, disabled }: { item: Item; onChange: (status: string) => Promise<void>; disabled: boolean }) {
  // A word that is none of the seven is shown as it is, in both places.
  const options = (ORDER_STATUSES as readonly string[]).includes(item.status) ? ORDER_STATUSES : [...ORDER_STATUSES, item.status];
  return (
    <div className="flex flex-wrap items-center gap-2" data-item-status={item.itemId}>
      <span className="min-w-0 flex-1">{item.text}</span>
      <select value={item.status} disabled={disabled} onChange={(event) => void onChange(event.target.value)} className="ui-input" style={{ maxWidth: 220 }}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <StatusPill kind={statusKind(item.status)}>{item.status}</StatusPill>
    </div>
  );
}

/** Who has the order now and since when, as the step cards showed it (the first open item's tracking). */
function HandoffDetail({ card, items, settings }: { card: Card; items: HandoffItem[]; settings: Parameters<typeof HandoffCard>[0]["settings"] }) {
  const row = items.find((item) => item.kind === "order" && !item.doneAt && card.items.some((entry) => entry.itemId === item.itemId) && item.step === card.step);
  if (!row || card.sent) return null;
  return (
    <div className="mt-2" data-order-handoff>
      <HandoffCard item={row} settings={settings} detail="" />
    </div>
  );
}
