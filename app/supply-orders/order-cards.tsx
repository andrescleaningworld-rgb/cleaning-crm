"use client";

// Supply Orders -> one card per order, from anywhere: a Crew Link order, a
// sub-portal order (its lines, same order group; older lines: same account,
// sub and time), or an order a manager entered for a sub. The same orders are
// in the Pin Board's Supply orders square. The order moves on the server
// (lib/pg/shelves.ts, POST /api/shelves):
//
//   New            ✓ Approve (approve-sheet.tsx: change numbers, match a
//                  typed-in line to a product, add items, then how we fill
//                  it) or ✗ Decline
//   Approved       "How do we fill it?": 🚚 Vendor ships to site / 🏬 Sub picks
//                  up / 🚐 We deliver (the sub's own Pick Up / Deliver choice
//                  is marked)
//   On its way     whoever is there confirms what came: the crew or the sub
//                  (Supplies arrived), or the office: Delivered ✓ here (each card,
//                  or many at once in the bottom bar), with − / + per item.
//                  From our shelf and not taken on the tablet yet: what came
//                  leaves the warehouse then (lib/pg/shelves.ts confirmArrival).
//   Delivered
//
// What arrived short or extra is red on its card; what came short is
// "⏳ Back order" on it, with Cancel per item (back-order.tsx). Tap a card
// (anywhere but its buttons) to pick it; the bar at the bottom shows only
// while something is picked: Print, Pin, a way to fill, Decline or Delete,
// for many at once, after "Do this for X orders?". 🗑 Delete order asks why
// (DeleteSheet) and hides the order from Supply Orders and the Pin Board; not
// once any of it moved stock (lib/pg/shelves.ts deleteOrder). 🖨 Print opens a clean printable order
// (app/supply-orders/print), 📌 Pin to board puts it on the board.
//
// The step tracking stays one item per order line (handoff_items, kind
// "order"; a Crew Link order is "crew-<id>"), so the In progress / Late /
// Waiting on me counts, My work and the dashboard keep working: after every
// change the cards tell it the new step (syncOrders).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AccountLink from "../components/AccountLink";
import { HandoffCard, postHandoff, useHandoffs } from "../components/handoffs";
import { orderForSync } from "../components/my-work";
import { SquareTiles, pinIsOn, pinRecord, usePinInfo, type BoardSpot } from "../components/pin-to-board";
import { BigButton, ConfirmSheet, Counts, EmptyState, ErrorBox, Field, Sheet, StatusPill, Tips, showToast, type StatusKind } from "@/app/ui";
import { ORDER_STEPS, isLate, isMine, orderStepFromStatus, type HandoffItem } from "@/lib/handoffs";
import { canonicalOrderStatus } from "@/lib/supplyOrderStatus";
import { formatCrewDateTime } from "@/lib/crewDateTime";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import ApproveSheet, { FILL_WORDS, FillButtons, postShelves, type FillChoice, type OrderPick } from "./approve-sheet";
import { BackOrderBox, DifferentBox } from "./back-order";
import type { ShelfDifferent, ShelfWaiting, ShelvesState } from "./shelves-data";
import { BigStepper, rowTone } from "@/app/porter/[code]/CrewArrived";

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
type Waiting = ShelfWaiting;
type Different = ShelfDifferent;

type Item = { itemId: string; text: string; delivery: string; status: string; step: string; row?: SubOrder };
type Card = {
  key: string;
  source: "sub" | "crew";
  /** What the server knows the order by. */
  order: OrderPick;
  accountId: string;
  accountName: string;
  orderedBy: string;
  at: number;
  atText: string;
  items: Item[];
  /** The least-advanced step of its items. "" = out of the flow (denied, cancelled). */
  step: string;
  status: string;
  /** The order's own delivery (not a back order), once it is approved and filled. */
  delivery: Waiting | null;
  /** The sub's own choice on the portal, as a way to fill it. */
  suggested: FillChoice | "";
  /** What a crew confirmed different from the order (short or extra). */
  different: Different[];
  /** What came short and is still on its way. */
  backOrders: Waiting[];
  late: boolean;
  mine: boolean;
  search: string;
};

export type OrderSummary = { total: number; newOrReview: number; approved: number; pending: number; completed: number };

type Bulk = "decline" | "delivered" | FillChoice;
const BULK_LABEL: Record<Bulk, string> = {
  decline: "✗ Decline",
  delivered: "✓ Delivered",
  vendor: `${FILL_WORDS.vendor.icon} ${FILL_WORDS.vendor.label}`,
  pickup: `${FILL_WORDS.pickup.icon} ${FILL_WORDS.pickup.label}`,
  deliver: `${FILL_WORDS.deliver.icon} ${FILL_WORDS.deliver.label}`,
};
const STEP_LABEL = new Map(ORDER_STEPS.map((step) => [step.key, step.label]));
const CREW_STEP: Record<CrewOrder["status"], string> = { new: "ordered", ordered: "bought", delivered: "delivered", cancelled: "" };
const CREW_STATUS: Record<CrewOrder["status"], string> = { new: "New", ordered: "Pending / In Progress", delivered: "Completed", cancelled: "Cancelled" };
const STEP_INDEX = new Map(ORDER_STEPS.map((step, index) => [step.key, index]));
/** Cards drawn at first, and added by each "Show more". */
const PAGE_SIZE = 30;
const NO_SHELVES: Waiting[] = [];
const NO_DIFFERENT: Different[] = [];
const CREW_FAILED = "The Crew Link orders did not load.";
const sameSummary = (a: OrderSummary | null, b: OrderSummary) =>
  a !== null && a.total === b.total && a.newOrReview === b.newOrReview && a.approved === b.approved && a.pending === b.pending && a.completed === b.completed;

const clean = (value: unknown) => String(value ?? "").trim();
const crewItemId = (id: number) => `crew-${id}`;
/** The printable page for these orders, each on its own page. */
const printHref = (keys: string[]) => `/supply-orders/print?${keys.map((key) => `o=${encodeURIComponent(key)}`).join("&")}`;
const parseDate = (text: string) => {
  const ms = Date.parse(text);
  return Number.isNaN(ms) ? 0 : ms;
};
const suggestedFill = (deliveryMode: string): FillChoice | "" => (/pick/i.test(deliveryMode) ? "pickup" : /deliver/i.test(deliveryMode) ? "deliver" : "");

export function statusKind(status: string): StatusKind {
  const lower = canonicalOrderStatus(status).toLowerCase();
  if (lower === "completed" || lower === "approved") return "done";
  if (lower === "pending / in progress") return "waiting";
  if (lower === "needs review" || lower === "denied" || lower === "cancelled") return "needs-you";
  return "off";
}

// Same rule as the print page: lines sent together share orderGroupId;
// older lines fall back to the same account + sub + time.
export function orderGroupKey(order: SubOrder): string {
  const groupId = clean(order.orderGroupId);
  if (groupId) return `group:${groupId}`;
  return `fallback:${clean(order.accountName).toLowerCase()}|${clean(order.subcontractor).toLowerCase()}|${clean(order.timestamp)}`;
}

/** What the card says while the order is on its way. */
function onTheWayText(card: Card): string {
  const delivery = card.delivery;
  if (!delivery) return "Crew, sub or office: ✓ Delivered when it comes.";
  if (delivery.fill === "pickup") return `${FILL_WORDS.pickup.icon} Waiting for the sub at the warehouse.`;
  if (delivery.fill === "deliver" && !delivery.sentAt) return `${FILL_WORDS.deliver.icon} Ready to go: take it on the tablet (Supply Check → For an account).`;
  if (delivery.fill === "deliver") return `${FILL_WORDS.deliver.icon} On the way.`;
  return `${FILL_WORDS.vendor.icon} The vendor ships it.`;
}

/** Everything still on its way for an order: its delivery and its back orders. ✓ Delivered confirms these. */
const openOf = (card: Card): Waiting[] => [...(card.delivery ? [card.delivery] : []), ...card.backOrders];

export default function OrderCards({
  orders,
  loading,
  focusId,
  accountId,
  search,
  statusFilter,
  deliveryFilter,
  newestFirst,
  onChanged,
  onSummary,
  shelves,
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
  /** Something changed on the server: the page reloads its order list. */
  onChanged: () => Promise<void> | void;
  /** The top numbers: how many ORDERS (not lines) are in each status. */
  onSummary?: (summary: OrderSummary) => void;
  /** The page's one /api/shelves load (shelves-data.ts): what is on its way and what arrived different. */
  shelves: ShelvesState;
}) {
  const handoffs = useHandoffs();
  // The cards are built from these, not from the whole handoffs object.
  const { state: handoffState, items: handoffItems, settings: handoffSettings, me: handoffMe, reload: reloadHandoffs } = handoffs;
  const { info: pinInfo } = usePinInfo();
  const [crewOrders, setCrewOrders] = useState<CrewOrder[]>([]);
  // Why the Crew Link orders did not load. "" = they did. What loaded before stays shown.
  const [crewError, setCrewError] = useState("");
  const waiting = shelves.data?.waiting ?? NO_SHELVES;
  const different = shelves.data?.different ?? NO_DIFFERENT;
  const reloadShelves = shelves.reload;
  // "Show more": how many cards are drawn, for the filters it was opened under.
  const [more, setMore] = useState({ key: "", count: PAGE_SIZE });
  const [quick, setQuick] = useState<"all" | "late" | "mine">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");
  const [approving, setApproving] = useState<Card | null>(null);
  const [confirm, setConfirm] = useState<{ action: Bulk; cards: Card[] } | null>(null);
  // ✓ Delivered: the order whose amounts are being checked.
  const [delivering, setDelivering] = useState<Card | null>(null);
  // 🗑 Delete order: the cards waiting for a reason.
  const [deleting, setDeleting] = useState<Card[] | null>(null);
  // "📌 Pin to board": the orders waiting for a square to be picked.
  const [pinning, setPinning] = useState<Card[] | null>(null);
  const [pinBusy, setPinBusy] = useState("");
  const synced = useRef(false);

  // Only the newest Crew Link load may change what is shown.
  const crewLoad = useRef(0);
  const loadCrewOrders = useCallback(async () => {
    const id = ++crewLoad.current;
    try {
      const response = await fetchWithTimeout("/api/admin/crew-supplies?view=orders", { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as { success?: boolean; ready?: boolean; error?: string; orders?: CrewOrder[] };
      if (id !== crewLoad.current) return;
      if (!response.ok || body.success !== true) throw new Error(body.error || CREW_FAILED);
      setCrewOrders(body.ready ? (body.orders ?? []) : []);
      setCrewError("");
    } catch (error) {
      if (id !== crewLoad.current) return;
      setCrewError(error instanceof Error ? error.message : CREW_FAILED);
    }
  }, []);

  /** The shelves. Always called with onChanged(), whose order list reload also reloads the Crew Link orders (below). */
  const loadExtras = reloadShelves;

  useEffect(() => {
    // The Crew Link orders load with the page's order list: at the start, on
    // Refresh and after every change. The shelves load in shelves-data.ts.
    if (loading) void loadCrewOrders();
  }, [loading, loadCrewOrders]);

  /** The step tracking for these orders, from what the cards now say. */
  const syncFor = useCallback(
    (list: { itemId: string; step: string; seed: Record<string, unknown> }[]) => {
      if (list.length === 0) return Promise.resolve();
      return postHandoff({ action: "syncOrders", orders: list.map((entry) => ({ ...entry.seed, itemId: entry.itemId, step: entry.step })) })
        .then(() => reloadHandoffs())
        .catch(() => {});
    },
    [reloadHandoffs]
  );

  // Line the step tracking up with the orders, once per load: sub-portal lines
  // from their Status, Crew Link orders only forward (their own status has no
  // Approved), closed when delivered or cancelled.
  useEffect(() => {
    if (handoffState !== "ready" || loading || synced.current) return;
    synced.current = true;
    const tracked = new Map(handoffItems.filter((item) => item.kind === "order").map((item) => [item.itemId, item]));
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
      .then(() => reloadHandoffs())
      .catch(() => {});
  }, [handoffState, handoffItems, reloadHandoffs, orders, crewOrders, loading]);

  const cards = useMemo<Card[]>(() => {
    if (handoffState !== "ready") return [];
    const tracked = new Map(handoffItems.filter((item) => item.kind === "order").map((item) => [item.itemId, item]));
    const lateOrMine = (itemIds: string[], sent: boolean) => {
      const rows = itemIds.map((id) => tracked.get(id)).filter((row): row is HandoffItem => Boolean(row && !row.doneAt));
      return { late: rows.some((row) => isLate(row, handoffSettings)), mine: !sent && rows.some((row) => isMine(row, handoffSettings, handoffMe)) };
    };
    const leastStep = (items: Item[]) => {
      const inFlow = items.filter((item) => item.step !== "");
      if (inFlow.length === 0) return "";
      return inFlow.reduce((low, item) => ((STEP_INDEX.get(item.step) ?? 0) < (STEP_INDEX.get(low) ?? 0) ? item.step : low), inFlow[0].step);
    };
    const differentFor = (source: string, refs: string[]) => different.filter((entry) => entry.source === source && refs.includes(entry.ref));

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
        return { itemId: sync.itemId, text: `${clean(row.quantity)}${row.unit ? ` ${clean(row.unit)}` : ""} × ${clean(row.supplyItem)}`, delivery: clean(row.deliveryMode), status, step: orderStepFromStatus(status), row };
      });
      // The shelves know a sub order by its group (or, for an older line, its own order id).
      const refs = [...new Set(rows.map((row) => clean(row.orderGroupId) || clean(row.orderId)).filter(Boolean))];
      const mineWaiting = waiting.filter((entry) => entry.source === "sub-order" && refs.includes(entry.ref));
      const delivery = mineWaiting.find((entry) => !entry.backOrder) ?? null;
      const step = leastStep(items);
      out.push({
        key,
        source: "sub",
        order: { source: "sub-order", refs },
        accountId: clean(first.accountId),
        accountName: clean(first.accountName),
        orderedBy: clean(first.subcontractor),
        at: parseDate(clean(first.timestamp)),
        atText: clean(first.timestamp),
        items,
        step,
        status: items.find((item) => item.step === step)?.status ?? items[0].status,
        delivery,
        suggested: suggestedFill(clean(first.deliveryMode)),
        different: differentFor("sub-order", refs),
        backOrders: mineWaiting.filter((entry) => entry.backOrder),
        ...lateOrMine(
          items.map((item) => item.itemId),
          Boolean(delivery)
        ),
        search: [first.accountName, first.accountId, first.subcontractor, first.timestamp, ...rows.flatMap((row) => [row.orderId, row.orderGroupId, row.supplyItem, row.category, row.description, row.quantity, row.unit, row.deliveryMode, row.status, row.notes])]
          .map(clean)
          .join(" ")
          .toLowerCase(),
      });
    }
    for (const order of crewOrders) {
      const itemId = crewItemId(order.id);
      const status = CREW_STATUS[order.status];
      const step = CREW_STEP[order.status];
      const entries = waiting.filter((entry) => entry.source === "crew-order" && entry.ref === String(order.id));
      const delivery = entries.find((entry) => !entry.backOrder) ?? null;
      out.push({
        key: itemId,
        source: "crew",
        order: { source: "crew-order", refs: [String(order.id)] },
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
        delivery,
        suggested: "",
        different: differentFor("crew-order", [String(order.id)]),
        backOrders: entries.filter((entry) => entry.backOrder),
        ...lateOrMine([itemId], Boolean(delivery)),
        search: [order.accountName, order.accountId, order.orderedBy, "crew link", order.otherItems, ...order.lines.map((line) => line.itemName), status].join(" ").toLowerCase(),
      });
    }
    return out;
  }, [handoffState, handoffItems, handoffSettings, handoffMe, orders, crewOrders, waiting, different]);

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
  const inProgress = matching.filter((card) => (card.step !== "" && card.step !== "delivered") || card.backOrders.length > 0);

  // One count per order, by the status of its item furthest behind (the account
  // the page is opened for only; search and filters do not change them).
  const summary = useMemo<OrderSummary>(() => {
    const mineOnly = cards.filter((card) => !accountId || card.accountId.toLowerCase() === accountId.toLowerCase());
    const count = (...statuses: string[]) => mineOnly.filter((card) => statuses.includes(card.status)).length;
    return { total: mineOnly.length, newOrReview: count("New", "Needs Review"), approved: count("Approved"), pending: count("Pending / In Progress"), completed: count("Completed") };
  }, [cards, accountId]);
  // Told to the page only when a number changes: a new object with the same
  // numbers would re-render the page for nothing.
  const sentSummary = useRef<OrderSummary | null>(null);
  useEffect(() => {
    if (sameSummary(sentSummary.current, summary)) return;
    sentSummary.current = summary;
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

  // About 30 cards at a time. A new search, filter or sort starts from 30
  // again; the order opened from My work is always drawn.
  const listKey = [search, statusFilter, deliveryFilter, accountId, quick, newestFirst ? "new" : "old"].join("|");
  const focusIndex = focusId ? shown.findIndex((card) => card.items.some((item) => item.itemId === focusId)) : -1;
  const drawCount = Math.max(more.key === listKey ? more.count : PAGE_SIZE, focusIndex + 1);
  const drawn = shown.length > drawCount ? shown.slice(0, drawCount) : shown;

  useEffect(() => {
    if (!focusId || handoffState !== "ready") return;
    document.querySelector(`[data-order-items~="${CSS.escape(focusId)}"]`)?.scrollIntoView({ block: "center" });
  }, [focusId, handoffState, cards.length]);

  if (handoffState !== "ready") return null;

  /** The step tracking entries for one card, at its new step ("" = closed). */
  const trackingFor = (card: Card, step: string) =>
    card.source === "crew"
      ? [{ itemId: card.key, step, seed: { title: card.accountName || "Supply order", accountId: card.accountId, accountName: card.accountName, createdBy: card.orderedBy, data: { items: card.items.map((item) => item.text).join(", "), subcontractor: "Crew Link" } } }]
      : card.items.filter((item) => item.row).map((item) => ({ itemId: item.itemId, step, seed: orderForSync(item.row!) as Record<string, unknown> }));

  /** After a change: reload everything and move the step tracking. */
  async function afterChange(list: Card[], step: string) {
    await Promise.all([loadExtras(), onChanged()]);
    await syncFor(list.flatMap((card) => trackingFor(card, step)));
  }

  /** Decline, ✓ Delivered (as ordered) or one way to fill, for one card. Returns false when it could not. */
  async function act(card: Card, action: Bulk): Promise<boolean> {
    try {
      if (action === "decline") await postShelves({ action: "decline", order: card.order });
      else if (action === "delivered") {
        for (const entry of openOf(card)) await postShelves({ action: "delivered", key: entry.key, got: entry.lines.map((line) => line.qty) });
      }
      else if (card.step === "ordered") await postShelves({ action: "approve", order: card.order, lines: [], add: [], fill: action });
      else await postShelves({ action: "fill", order: card.order, fill: action });
      return true;
    } catch (error) {
      showToast(`${card.accountName}: ${error instanceof Error ? error.message : "That did not save."}`, "bad");
      return false;
    }
  }

  async function run(action: Bulk, list: Card[]) {
    setBusy(action);
    const done: Card[] = [];
    for (const card of list) if (await act(card, action)) done.push(card);
    await afterChange(done, action === "decline" ? "" : action === "delivered" ? "delivered" : "bought");
    setSelected(new Set());
    setBusy("");
    if (done.length > 0) showToast(`${BULK_LABEL[action]}: ${done.length} order${done.length === 1 ? "" : "s"} ✓`);
  }

  /**
   * ✓ Delivered from the sheet: each open delivery of the order with the
   * amounts as checked. Less than ordered stays open as a back order (the
   * order stays on its way); otherwise it is Delivered.
   */
  async function deliver(card: Card, got: number[][]) {
    setBusy("delivered");
    const entries = openOf(card);
    let short = false;
    try {
      for (const [index, entry] of entries.entries()) {
        const amounts = entry.lines.map((line, at) => got[index]?.[at] ?? line.qty);
        await postShelves({ action: "delivered", key: entry.key, got: amounts });
        if (amounts.some((n, at) => n < entry.lines[at].qty)) short = true;
      }
      setDelivering(null);
      showToast(short ? `${card.accountName}: ✓ Delivered. The rest is a back order.` : `${card.accountName}: ✓ Delivered`);
      await afterChange([card], short ? "bought" : "delivered");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "That did not save.", "bad");
      await Promise.all([loadExtras(), onChanged()]);
    } finally {
      setBusy("");
    }
  }

  /** 🗑 Delete order, for each card, with the reason picked. A card whose stock already moved says so and stays. */
  async function deleteCards(list: Card[], reason: string, note: string) {
    setBusy("delete");
    const done: Card[] = [];
    for (const card of list) {
      try {
        await postShelves({ action: "delete", order: card.order, reason, note });
        done.push(card);
      } catch (error) {
        showToast(`${card.accountName || "Order"}: ${error instanceof Error ? error.message : "It was not deleted."}`, "bad");
      }
    }
    setDeleting(null);
    setSelected((current) => {
      const next = new Set(current);
      for (const card of done) next.delete(card.key);
      return next;
    });
    await afterChange(done, "");
    setBusy("");
    if (done.length > 0) showToast(`🗑 Deleted: ${done.length} order${done.length === 1 ? "" : "s"}`);
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

  // Only cards on screen: a picked card that a filter or "Show more" reset hid is not acted on.
  const picked = drawn.filter((card) => selected.has(card.key));
  /** Who a bulk button works for: ✓ Delivered, orders with something on its way; the rest, new or approved orders (a Crew Link order is new until it is filled). */
  const pickedFor = (action: Bulk) =>
    action === "delivered" ? picked.filter((card) => openOf(card).length > 0) : picked.filter((card) => card.step === "ordered" || (card.step === "approved" && (action !== "decline" || !card.delivery)));
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
        id="order-cards-inbox"
        steps={[
          { target: '[data-tip="order-counts"]', text: "One card per order, from anywhere. Approve or decline; then pick how we fill it. Crew, sub or office: Delivered ✓ when it comes." },
          { target: '[data-tip="order-list"]', text: "Tick several cards to decline them, or fill them the same way, at once." },
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

      {crewError ? <ErrorBox title={crewError} text="Crew Link orders may be missing below." onRetry={() => void loadCrewOrders()} /> : null}

      <div data-tip="order-list" className="ui-stack">
        {loading ? <p className="ui-muted">Loading supply orders…</p> : null}
        {!loading && shown.length === 0 ? (
          <EmptyState
            title={statusFilter !== "All" ? "No orders with that status." : quick === "late" ? "Nothing is late ✓" : quick === "mine" ? "Nothing is waiting on you ✓" : "No orders in progress ✓"}
            text={statusFilter !== "All" ? "Pick All statuses to see the orders in progress." : "New orders from subs, crews and managers show up here."}
          />
        ) : null}
        {drawn.map((card) => {
          const stepLabel = card.step === "" ? card.status : STEP_LABEL.get(card.step) ?? card.step;
          const itemIds = [...new Set(card.items.map((item) => item.itemId))].join(" ");
          const pill = card.backOrders.length > 0 ? "⏳ Back order" : card.step === "bought" && card.delivery?.fill ? `${FILL_WORDS[card.delivery.fill].icon} ${stepLabel}` : stepLabel;
          return (
            <article
              key={card.key}
              className={`ui-card cursor-pointer ${card.late ? "border-2 border-red-400" : ""} ${selected.has(card.key) ? "ring-4 ring-blue-500" : ""}`}
              data-order-card={card.key}
              data-order-items={itemIds}
              data-order-step={card.step}
              data-selected={selected.has(card.key) ? "yes" : undefined}
              onClick={(event) => {
                // Its buttons, links and boxes do their own thing; anywhere else picks the card.
                if ((event.target as HTMLElement).closest("button, a, input, select, textarea, label, summary, dialog")) return;
                toggle(card.key);
              }}
            >
              <div className="ui-card-row" style={{ alignItems: "flex-start" }}>
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="h-6 w-6" checked={selected.has(card.key)} onChange={() => toggle(card.key)} aria-label={`Select the order for ${card.accountName}`} />
                  <span className="ui-strong">{card.accountName ? <AccountLink accountId={card.accountId} name={card.accountName} /> : "No account"}</span>
                </label>
                <span className="flex flex-wrap items-center gap-2">
                  {card.late ? <StatusPill kind="needs-you">Late</StatusPill> : null}
                  <StatusPill kind={card.step === "bought" || card.backOrders.length > 0 ? "waiting" : statusKind(card.status)}>{pill}</StatusPill>
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
              {card.different.map((entry) => (
                <DifferentBox key={entry.id} title={entry.title} lines={entry.lines} />
              ))}
              {card.backOrders.map((entry) => (
                <BackOrderBox key={entry.key} entryKey={entry.key} lines={entry.lines} onChanged={() => void Promise.all([loadExtras(), onChanged()])} />
              ))}

              {card.step === "ordered" ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={busy !== ""}
                    onClick={() => setApproving(card)}
                    className="min-h-[64px] rounded-2xl bg-green-600 px-4 text-xl font-black text-white shadow-sm active:scale-[0.98] disabled:opacity-50"
                    data-order-approve
                  >
                    ✓ Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy !== ""}
                    onClick={() => setConfirm({ action: "decline", cards: [card] })}
                    className="min-h-[64px] rounded-2xl bg-white px-4 text-xl font-black text-red-700 ring-2 ring-red-300 active:scale-[0.98] disabled:opacity-50"
                    data-order-decline
                  >
                    ✗ Decline
                  </button>
                </div>
              ) : null}
              {card.step === "approved" && !card.delivery ? (
                <div className="mt-3 ui-stack">
                  <p className="ui-strong" style={{ margin: 0 }}>
                    How do we fill it?
                  </p>
                  <FillButtons suggested={card.suggested} busy={busy} onPick={(fill) => void run(fill, [card])} />
                </div>
              ) : null}
              {card.step === "bought" && card.backOrders.length === 0 ? <p className="ui-muted">{onTheWayText(card)}</p> : null}
              {openOf(card).length > 0 ? (
                <button
                  type="button"
                  disabled={busy !== ""}
                  onClick={() => setDelivering(card)}
                  className="mt-2 flex min-h-[64px] w-full items-center justify-center rounded-2xl bg-green-600 px-4 text-xl font-black text-white shadow-sm active:scale-[0.98] disabled:opacity-50"
                  data-order-delivered
                >
                  Delivered ✓
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
                <button type="button" className="ui-btn ui-btn-second" disabled={busy !== ""} onClick={() => setDeleting([card])} data-order-delete>
                  🗑 Delete order
                </button>
              </div>
              <HandoffDetail card={card} items={handoffItems} settings={handoffSettings} />
            </article>
          );
        })}
        {shown.length > drawn.length ? (
          <button type="button" className="ui-btn ui-btn-second w-full" onClick={() => setMore({ key: listKey, count: drawn.length + PAGE_SIZE })} data-order-show-more>
            Show more ({shown.length - drawn.length} more)
          </button>
        ) : null}
      </div>

      {picked.length > 0 ? (
        <div className="sticky bottom-0 z-30 -mx-4 border-t-2 border-slate-200 bg-white px-4 py-3 shadow-lg" data-bulk-bar>
          <p className="ui-strong" style={{ margin: "0 0 8px" }}>
            {picked.length} selected →
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <a href={printHref(picked.map((card) => card.key))} target="_blank" rel="noopener" className="flex min-h-[56px] items-center justify-center rounded-2xl bg-white px-2 text-base font-black text-slate-900 ring-2 ring-slate-300">
              🖨 Print ({picked.length})
            </a>
            {canPin ? (
              <button type="button" disabled={busy !== ""} onClick={() => setPinning(picked)} className="min-h-[56px] rounded-2xl bg-white px-2 text-base font-black text-slate-900 ring-2 ring-slate-300 disabled:opacity-50">
                📌 Pin ({picked.length})
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy !== ""}
              onClick={() => setDeleting(picked)}
              className="min-h-[56px] rounded-2xl bg-white px-2 text-base font-black text-red-700 ring-2 ring-red-300 disabled:opacity-50"
              data-bulk-delete
            >
              🗑 Delete ({picked.length})
            </button>
            {(["delivered", "vendor", "pickup", "deliver", "decline"] as Bulk[]).map((bulk) => {
              const list = pickedFor(bulk);
              return (
                <button
                  key={bulk}
                  type="button"
                  disabled={list.length === 0 || busy !== ""}
                  onClick={() => setConfirm({ action: bulk, cards: list })}
                  data-bulk-action={bulk}
                  className={`min-h-[56px] rounded-2xl px-2 text-base font-black disabled:bg-slate-300 disabled:text-slate-500 ${bulk === "decline" ? "bg-white text-red-700 ring-2 ring-red-300" : bulk === "delivered" ? "bg-green-600 text-white" : "bg-blue-700 text-white"}`}
                >
                  {BULK_LABEL[bulk]}
                  {list.length > 0 ? ` (${list.length})` : ""}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <ApproveSheet
        order={approving?.order ?? null}
        title={approving?.accountName || "Supply order"}
        suggested={approving?.suggested ?? ""}
        onClose={() => setApproving(null)}
        onDone={(result) => {
          const card = approving;
          setApproving(null);
          if (card) void afterChange([card], result === "approved" ? "approved" : "bought");
        }}
      />

      <DeleteSheet cards={deleting} busy={busy === "delete"} onCancel={() => setDeleting(null)} onDelete={(reason, note) => deleting && void deleteCards(deleting, reason, note)} />

      <DeliveredSheet card={delivering} busy={busy === "delivered"} onCancel={() => setDelivering(null)} onConfirm={(got) => delivering && void deliver(delivering, got)} />

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
        title={confirm ? (confirm.cards.length === 1 && confirm.action === "decline" ? `Decline the order for ${confirm.cards[0].accountName || "this account"}?` : `Do this for ${confirm.cards.length} order${confirm.cards.length === 1 ? "" : "s"}?`) : ""}
        text={confirm ? `${BULK_LABEL[confirm.action]}: ${confirm.cards.map((card) => card.accountName || "No account").join(", ")}` : ""}
        confirmLabel={confirm ? BULK_LABEL[confirm.action] : ""}
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

/** Who has the order now and since when, as the step cards showed it (the first open item's tracking). */
function HandoffDetail({ card, items, settings }: { card: Card; items: HandoffItem[]; settings: Parameters<typeof HandoffCard>[0]["settings"] }) {
  const row = items.find((item) => item.kind === "order" && !item.doneAt && card.items.some((entry) => entry.itemId === item.itemId) && item.step === card.step);
  if (!row || card.step === "bought") return null;
  return (
    <div className="mt-2" data-order-handoff>
      <HandoffCard item={row} settings={settings} detail="" />
    </div>
  );
}

/**
 * ✓ Delivered: what came, per item, filled in with what was ordered; − / +
 * when more or less came (the same stepper as Crew Link). Less = back order.
 */
function DeliveredSheet({ card, busy, onCancel, onConfirm }: { card: Card | null; busy: boolean; onCancel: () => void; onConfirm: (got: number[][]) => void }) {
  const entries = card ? openOf(card) : [];
  const [got, setGot] = useState<number[][]>([]);

  useEffect(() => {
    // Each opening starts with the ordered amounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGot(card ? openOf(card).map((entry) => entry.lines.map((line) => line.qty)) : []);
  }, [card]);

  const changed = entries.some((entry, index) => entry.lines.some((line, at) => (got[index]?.[at] ?? line.qty) !== line.qty));
  return (
    <Sheet
      open={card !== null}
      title={`Delivered: ${card?.accountName || "this order"}`}
      text={changed ? "Less = back order." : "All as ordered?"}
      onClose={() => (busy ? undefined : onCancel())}
      busy={busy}
      actions={
        <BigButton busy={busy} busyLabel="Saving…" onClick={() => onConfirm(got)}>
          Delivered ✓
        </BigButton>
      }
    >
      <div className="ui-stack" data-delivered-sheet>
        {entries.map((entry, index) => (
          <div key={entry.key} className="ui-stack">
            {entry.backOrder ? <p className="ui-strong" style={{ margin: 0 }}>⏳ Back order</p> : null}
            {entry.lines.map((line, at) => {
              const value = got[index]?.[at] ?? line.qty;
              return (
                <div key={`${entry.key}-${at}`} className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3 ring-1 ring-slate-200 ${rowTone(line.qty, value)}`}>
                  <span className="text-lg font-bold">
                    {line.name}
                    <span className="ui-muted"> · {line.qty}{line.unit ? ` ${line.unit}` : ""}</span>
                  </span>
                  <BigStepper
                    value={value}
                    onChange={(next) =>
                      setGot((current) => current.map((row, r) => (r === index ? row.map((n, c) => (c === at ? next : n)) : row)))
                    }
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Sheet>
  );
}

const DELETE_REASONS = ["Duplicate", "Test", "Old, already handled", "Entered by mistake", "Other"];

/** 🗑 Delete order: "Why?" in big quick picks; Other needs a short note. */
function DeleteSheet({ cards, busy, onCancel, onDelete }: { cards: Card[] | null; busy: boolean; onCancel: () => void; onDelete: (reason: string, note: string) => void }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!cards) return;
    // Each opening starts with nothing picked.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReason("");
    setNote("");
    setError("");
  }, [cards]);

  function go() {
    if (!reason) return setError("Pick why.");
    if (reason === "Other" && note.trim().length < 3) return setError("Write a short note.");
    onDelete(reason, note.trim());
  }

  const many = (cards?.length ?? 0) > 1;
  return (
    <Sheet
      open={cards !== null}
      title={many ? `🗑 Delete ${cards?.length} orders?` : `🗑 Delete the order for ${cards?.[0]?.accountName || "this account"}?`}
      text="It leaves Supply Orders and the Pin Board. The record is kept. Why?"
      onClose={() => (busy ? undefined : onCancel())}
      busy={busy}
      actions={
        <BigButton kind="danger" busy={busy} busyLabel="Deleting…" onClick={go}>
          🗑 Delete
        </BigButton>
      }
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-delete-reasons>
        {DELETE_REASONS.map((entry) => (
          <button
            key={entry}
            type="button"
            aria-pressed={reason === entry}
            onClick={() => {
              setReason(entry);
              setError("");
            }}
            className={`min-h-[64px] rounded-2xl px-4 text-xl font-black ${reason === entry ? "bg-red-700 text-white" : "bg-white text-slate-900 ring-2 ring-slate-300"}`}
          >
            {entry}
          </button>
        ))}
      </div>
      {reason === "Other" ? <Field label="Why?" value={note} onChange={(event) => setNote(event.target.value)} placeholder="A short note" /> : null}
      {error ? <p className="ui-field-error">{error}</p> : null}
    </Sheet>
  );
}
