"use client";

// The supply orders for the Supplies home and its two order screens (New
// orders, On the way). The same data and the same cards as the Supply Orders
// page (app/supply-orders/order-cards.tsx buildOrderCards): the sub-portal
// order lines, the Crew Link orders, the shelves (what is on its way, what
// arrived different) and the step tracking. Nothing new is stored.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { useHandoffs } from "../components/handoffs";
import { buildOrderCards, fetchCrewOrders, openOf, type Card, type CrewOrder, type SubOrder } from "../supply-orders/order-cards";
import { useShelves, type ShelfDifferent, type ShelfWaiting } from "../supply-orders/shelves-data";
import type { HandoffItem } from "@/lib/handoffs";

const NO_WAITING: ShelfWaiting[] = [];
const NO_DIFFERENT: ShelfDifferent[] = [];
const NO_ITEMS: HandoffItem[] = [];
const ORDERS_FAILED = "The supply orders did not load.";

/** Waiting on the office: new (OK / No), or OK'd earlier and not yet told how it gets there. */
export const isNewOrder = (card: Card) => card.step === "ordered" || (card.step === "approved" && !card.delivery);
/** Something is on its way to the site: "It came ✓" confirms it. */
export const isOnTheWay = (card: Card) => openOf(card).length > 0;

/** Late first, then the one waiting longest. */
const byWaiting = (a: Card, b: Card) => Number(b.late) - Number(a.late) || a.at - b.at;

async function fetchSubOrders(): Promise<SubOrder[]> {
  const response = await fetchWithTimeout("/api/supply-orders", { cache: "no-store" });
  const body = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; message?: string; supplyOrders?: SubOrder[]; orders?: SubOrder[]; data?: SubOrder[] };
  if (!response.ok || body.success === false) throw new Error(body.error || body.message || ORDERS_FAILED);
  return body.supplyOrders ?? body.orders ?? body.data ?? [];
}

export type SupplyCards = {
  newOrders: Card[];
  onTheWay: Card[];
  /** Until the first load is in. */
  loading: boolean;
  /** What did not load ("" = everything did). What loaded stays shown. */
  error: string;
  /** Loads everything again: the orders, the shelves and the step tracking. */
  reload: () => Promise<void>;
};

export function useSupplyCards(): SupplyCards {
  const handoffs = useHandoffs();
  const shelves = useShelves();
  const [orders, setOrders] = useState<SubOrder[]>([]);
  const [crewOrders, setCrewOrders] = useState<CrewOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Only the newest load may change what is shown.
  const latest = useRef(0);

  const loadOrders = useCallback(async () => {
    const id = ++latest.current;
    const [subs, crew] = await Promise.allSettled([fetchSubOrders(), fetchCrewOrders()]);
    if (id !== latest.current) return;
    const problems: string[] = [];
    if (subs.status === "fulfilled") setOrders(subs.value);
    else problems.push(subs.reason instanceof Error ? subs.reason.message : ORDERS_FAILED);
    if (crew.status === "fulfilled") setCrewOrders(crew.value);
    else problems.push(crew.reason instanceof Error ? crew.reason.message : "The Crew Link orders did not load.");
    setError(problems.join(" "));
    setLoading(false);
  }, []);

  useEffect(() => {
    // The first load: fetches, then sets state when the answer arrives (the same as useHandoffs).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadOrders();
  }, [loadOrders]);

  const reloadShelves = shelves.reload;
  const reloadHandoffs = handoffs.reload;
  const reload = useCallback(async () => {
    await Promise.all([loadOrders(), reloadShelves(), reloadHandoffs().catch(() => {})]);
  }, [loadOrders, reloadShelves, reloadHandoffs]);

  const waiting = shelves.data?.waiting ?? NO_WAITING;
  const different = shelves.data?.different ?? NO_DIFFERENT;
  // Late / Waiting on me need the step tracking; the cards themselves do not wait for it.
  const handoffItems = handoffs.state === "ready" ? handoffs.items : NO_ITEMS;
  const cards = useMemo(
    () => buildOrderCards({ orders, crewOrders, waiting, different, handoffItems, handoffSettings: handoffs.settings, handoffMe: handoffs.me }),
    [orders, crewOrders, waiting, different, handoffItems, handoffs.settings, handoffs.me]
  );
  const newOrders = useMemo(() => cards.filter(isNewOrder).sort(byWaiting), [cards]);
  const onTheWay = useMemo(() => cards.filter(isOnTheWay).sort(byWaiting), [cards]);

  return { newOrders, onTheWay, loading, error: [error, shelves.error].filter(Boolean).join(" "), reload };
}
