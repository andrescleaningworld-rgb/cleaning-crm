"use client";

// Crew Link "Supplies": big − / + per item from the shared supply list
// (Settings), an "Other supplies not on the list" box, an optional note,
// and one big "Send order". An order can be write-ins only, but never empty
// (the server enforces the same rule). Same API as before:
// GET/POST /api/porter-checklist/[code]/supplies.
import { useCallback, useEffect, useState } from "react";
import type { CrewLinkStrings } from "./strings";
import { ErrorBox, SendBar } from "./ui";

type SupplyItem = { itemId: number; name: string; unit: string };
type OrderStatus = "new" | "ordered" | "delivered" | "cancelled";
type RecentOrder = {
  id: number;
  status: OrderStatus;
  lines: { itemName: string; qty: number }[];
  otherItems?: string | null;
};

const STATUS_STYLES: Record<OrderStatus, string> = {
  new: "bg-blue-100 text-blue-800",
  ordered: "bg-amber-100 text-amber-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-slate-200 text-slate-600",
};

export default function CrewSupplies({
  apiBase,
  s,
  name,
  onSent,
}: {
  apiBase: string;
  s: CrewLinkStrings;
  name: string;
  onSent: () => void;
}) {
  const suppliesUrl = `${apiBase}/supplies`;
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<SupplyItem[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [otherItems, setOtherItems] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(suppliesUrl, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || s.somethingWrong);
        return;
      }
      setItems(data.items ?? []);
      setRecentOrders(data.recentOrders ?? []);
    } catch {
      setError(s.noSignal);
    } finally {
      setLoading(false);
    }
  }, [suppliesUrl, s.somethingWrong, s.noSignal]);

  useEffect(() => {
    load();
  }, [load]);

  function adjust(itemId: number, delta: number) {
    navigator.vibrate?.(10);
    setQuantities((prev) => ({ ...prev, [itemId]: Math.min(999, Math.max(0, (prev[itemId] ?? 0) + delta)) }));
  }

  const lines = Object.entries(quantities)
    .map(([itemId, qty]) => ({ itemId: Number(itemId), qty }))
    .filter((line) => line.qty > 0);
  const canSend = lines.length > 0 || otherItems.trim().length > 0;

  async function send() {
    if (!canSend) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(suppliesUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reporterName: name, note, otherItems: otherItems.trim(), lines }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || s.somethingWrong);
        return;
      }
      navigator.vibrate?.([15, 60, 15]);
      onSent();
    } catch {
      setError(s.noSignal);
    } finally {
      setSending(false);
    }
  }

  if (loading) return <p className="p-6 text-center text-xl text-slate-600">{s.loading}</p>;

  return (
    <div className="space-y-4">
      {items.length > 0 ? (
        <div className="divide-y divide-slate-100 rounded-2xl bg-white shadow-sm">
          {items.map((item) => {
            const qty = quantities[item.itemId] ?? 0;
            return (
              <div key={item.itemId} className="flex min-h-[80px] items-center justify-between gap-3 px-4 py-3">
                <span className="flex-1">
                  <span className="block text-xl font-semibold text-slate-900">{item.name}</span>
                  <span className="block text-lg text-slate-500">{item.unit}</span>
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => adjust(item.itemId, -1)}
                    disabled={qty === 0}
                    aria-label={`− ${item.name}`}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-3xl font-bold text-slate-700 active:bg-slate-200 disabled:opacity-30"
                  >
                    −
                  </button>
                  <span className={`w-10 text-center text-2xl font-black ${qty > 0 ? "text-blue-700" : "text-slate-400"}`}>{qty}</span>
                  <button
                    type="button"
                    onClick={() => adjust(item.itemId, 1)}
                    aria-label={`+ ${item.name}`}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-700 text-3xl font-bold text-white active:bg-blue-800"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <label className="block rounded-2xl bg-white p-4 shadow-sm">
        <span className="text-lg font-bold text-slate-800">{s.otherSuppliesLabel}</span>
        <textarea
          value={otherItems}
          onChange={(event) => setOtherItems(event.target.value)}
          placeholder={s.otherSuppliesPlaceholder}
          rows={2}
          maxLength={1000}
          className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-lg"
        />
      </label>

      <label className="block rounded-2xl bg-white p-4 shadow-sm">
        <span className="text-lg font-bold text-slate-700">{s.noteForOffice}</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          maxLength={1000}
          className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-lg"
        />
      </label>

      <ErrorBox message={error} />
      <SendBar
        label={s.sendOrder}
        busyLabel={s.sending}
        busy={sending}
        disabled={!canSend}
        onClick={send}
        hint={canSend ? undefined : s.pickSupplies}
      />

      {recentOrders.length > 0 ? (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">{s.recentOrders}</h2>
          <ul className="mt-2 divide-y divide-slate-100">
            {recentOrders.map((order) => (
              <li key={order.id} className="flex items-center justify-between gap-3 py-3">
                <span className="text-lg text-slate-700">
                  {[
                    ...order.lines.map((line) => `${line.itemName} ×${line.qty}`),
                    ...(order.otherItems ? [`${s.otherPrefix}: ${order.otherItems}`] : []),
                  ].join(", ")}
                </span>
                <span className={`shrink-0 rounded-full px-3 py-1 text-lg font-semibold ${STATUS_STYLES[order.status]}`}>
                  {s.orderStatus[order.status]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
