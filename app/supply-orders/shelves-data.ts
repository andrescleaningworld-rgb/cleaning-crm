"use client";

// One /api/shelves load for the whole Supply Orders page. The page owns it and
// hands it to Deliveries (the panels above the cards) and to the order cards,
// which used to fetch the same thing each on their own.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import type { FillChoice } from "./approve-sheet";
import type { BackOrderLine } from "./back-order";

/** Something on its way to a site (lib/pg/shelves.ts Waiting). */
export type ShelfWaiting = {
  key: string;
  source: "crew-order" | "sub-order" | "office";
  ref: string;
  backOrder?: boolean;
  fill?: FillChoice | "";
  accountId: string;
  accountName: string;
  at: string;
  sentAt: string;
  lines: BackOrderLine[];
};

/** A delivery that arrived short or with extra (lib/pg/shelves.ts DifferentDelivery). */
export type ShelfDifferent = { id: number; source: string; ref: string; accountId: string; accountName: string; by: string; at: string; title: string; lines: string[] };

export type ShelvesData = { waiting: ShelfWaiting[]; different: ShelfDifferent[] };

export type ShelvesState = {
  /** null until loaded, or where the shelves are not turned on (migrations 038, 039). */
  data: ShelvesData | null;
  /** Why the last load failed. "" = it did not. What loaded before stays shown. */
  error: string;
  reload: () => Promise<void>;
};

const FAILED = "The deliveries and back orders did not load.";

export function useShelves(): ShelvesState {
  const [data, setData] = useState<ShelvesData | null>(null);
  const [error, setError] = useState("");
  // Only the newest load may change what is shown.
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const id = ++latest.current;
    try {
      const response = await fetchWithTimeout("/api/shelves", { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as { success?: boolean; ready?: boolean; error?: string } & Partial<ShelvesData>;
      if (id !== latest.current) return;
      if (!response.ok || body.success !== true) throw new Error(body.error || FAILED);
      setData(body.ready ? { waiting: body.waiting ?? [], different: body.different ?? [] } : null);
      setError("");
    } catch (err) {
      if (id !== latest.current) return;
      setError(err instanceof Error ? err.message : FAILED);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return useMemo(() => ({ data, error, reload }), [data, error, reload]);
}
