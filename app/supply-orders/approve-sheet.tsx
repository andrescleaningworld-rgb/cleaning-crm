"use client";

// Supply Orders -> ✓ Approve (lib/pg/shelves.ts approveOrder): the order's
// lines with − / + (0 takes a line off), a product for every typed-in line
// ("paper towels" -> the product, so it can move stock), "+ Add an item",
// then "How do we fill it?" in three big buttons. A sub-portal order can also
// be approved now and filled later; a Crew Link order is filled at once.

import { useEffect, useState } from "react";
import { Sheet, showToast } from "@/app/ui";
import { PickLines, ProductSelect, Stepper, useSupplyProducts, type PickLine } from "../components/supply-pick";

export type FillChoice = "vendor" | "pickup" | "deliver";
export type OrderPick = { source: "crew-order" | "sub-order"; refs: string[] };

/** The three ways to fill an order, as the office reads them. */
export const FILL_WORDS: Record<FillChoice, { icon: string; label: string; hint: string }> = {
  vendor: { icon: "🚚", label: "Ships to site", hint: "The crew confirms on Supplies arrived." },
  pickup: { icon: "🏬", label: "Sub picks up", hint: "At the warehouse." },
  deliver: { icon: "🚐", label: "We bring it", hint: "Take it on the tablet; the crew confirms." },
};

type Line = { lineId: string; label: string; qty: number; unit: string; supplyId: number | null };

export async function postShelves(body: Record<string, unknown>): Promise<void> {
  const response = await fetch("/api/shelves", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
  if (!response.ok || !result.success) throw new Error(result.error || "That did not save. Try again.");
}

export function FillButtons({ suggested, busy, onPick }: { suggested?: FillChoice | ""; busy: string; onPick: (fill: FillChoice) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3" data-fill-buttons>
      {(Object.keys(FILL_WORDS) as FillChoice[]).map((fill) => (
        <button
          key={fill}
          type="button"
          disabled={busy !== ""}
          onClick={() => onPick(fill)}
          data-fill={fill}
          className={`flex min-h-[72px] flex-col items-center justify-center rounded-2xl px-3 text-lg font-black text-white active:scale-[0.98] disabled:opacity-50 ${fill === suggested ? "bg-blue-800 ring-4 ring-blue-300" : "bg-blue-700"}`}
        >
          <span>{busy === fill ? "Saving…" : `${FILL_WORDS[fill].icon} ${FILL_WORDS[fill].label}`}</span>
          {fill === suggested ? <span className="text-sm font-bold">The sub asked for this</span> : null}
        </button>
      ))}
    </div>
  );
}

export default function ApproveSheet({
  order,
  title,
  suggested,
  onClose,
  onDone,
}: {
  /** null = closed. */
  order: OrderPick | null;
  title: string;
  suggested?: FillChoice | "";
  onClose: () => void;
  /** Saved: "approved" (fill later) or how it is filled. */
  onDone: (result: FillChoice | "approved") => void;
}) {
  const products = useSupplyProducts();
  const [lines, setLines] = useState<Line[] | null>(null);
  const [otherItems, setOtherItems] = useState("");
  const [added, setAdded] = useState<PickLine[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!order) return;
    let alive = true;
    setLines(null);
    setAdded([]);
    setError("");
    const query = new URLSearchParams({ view: "approve", source: order.source });
    for (const ref of order.refs) query.append("refs", ref);
    fetch(`/api/shelves?${query}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { success?: boolean; lines?: Line[]; otherItems?: string; error?: string }) => {
        if (!alive) return;
        if (!body.success) throw new Error(body.error || "That order did not load.");
        setLines(body.lines ?? []);
        setOtherItems(body.otherItems ?? "");
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : "That order did not load."));
    return () => {
      alive = false;
    };
  }, [order]);

  async function save(fill: FillChoice | "") {
    if (!order || !lines) return;
    setBusy(fill || "approved");
    setError("");
    try {
      await postShelves({ action: "approve", order, lines: lines.map(({ lineId, qty, supplyId }) => ({ lineId, qty, supplyId })), add: added, fill });
      showToast(fill ? `Approved: ${FILL_WORDS[fill].label} ✓` : "Approved ✓");
      onDone(fill || "approved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Try again.");
    } finally {
      setBusy("");
    }
  }

  const loading = order !== null && (lines === null || products === null) && !error;
  return (
    <Sheet open={order !== null} title={`✓ Approve: ${title}`} text="Change a number if needed, then pick how we fill it." onClose={() => (busy ? undefined : onClose())} busy={busy !== ""}>
      {loading ? <p className="ui-muted">Loading…</p> : null}
      {lines && products ? (
        <div className="ui-stack" data-approve-sheet>
          {lines.map((line) => (
            <div key={line.lineId} className={`rounded-2xl p-3 ${line.qty === 0 ? "bg-slate-100 opacity-60" : "bg-white ring-1 ring-slate-200"}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-lg font-black">{line.label}</span>
                  {line.unit ? <span className="ui-muted">{line.unit}</span> : null}
                </span>
                <Stepper value={line.qty} label={line.label} onChange={(qty) => setLines((current) => (current ?? []).map((entry) => (entry.lineId === line.lineId ? { ...entry, qty } : entry)))} />
              </div>
              {line.lineId.startsWith("sub:") ? (
                <div className="mt-2">
                  {line.supplyId === null ? <p className="ui-strong" style={{ margin: "0 0 4px" }}>Typed in. Which product is it?</p> : null}
                  <ProductSelect
                    products={products}
                    value={line.supplyId}
                    placeholder="Typed in: pick the product (or leave it)"
                    onChange={(supplyId) => setLines((current) => (current ?? []).map((entry) => (entry.lineId === line.lineId ? { ...entry, supplyId } : entry)))}
                  />
                </div>
              ) : null}
            </div>
          ))}
          {otherItems ? (
            <p className="rounded-2xl bg-amber-50 p-3">
              <span className="ui-strong">Also typed: </span>
              {otherItems}
              <span className="ui-muted"> · add the products below</span>
            </p>
          ) : null}
          <PickLines products={products} lines={added} onChange={setAdded} addLabel="+ Add an item" />
          {error ? <p className="ui-field-error">{error}</p> : null}
          <p className="ui-strong" style={{ margin: "8px 0 0" }}>
            How do we fill it?
          </p>
          <FillButtons suggested={suggested} busy={busy} onPick={(fill) => void save(fill)} />
          {order?.source === "sub-order" ? (
            <button type="button" className="ui-btn ui-btn-second" disabled={busy !== ""} onClick={() => void save("")}>
              {busy === "approved" ? "Saving…" : "Approve now, pick later"}
            </button>
          ) : null}
        </div>
      ) : null}
      {error && !lines ? <p className="ui-field-error">{error}</p> : null}
    </Sheet>
  );
}
