"use client";

// Phase 4: "Order supplies" — big rows with +/- steppers, an optional
// order-level note, one big "Send order," and a plain-status recent-orders
// list below it. No offline queue (see ChecklistView's file comment) — a
// failed send just shows "No signal — try again" and nothing is queued.
import { translated, type ContentTranslations } from "@/lib/translationKey";
import WorkerAndTime from "./WorkerAndTime";
import { useCallback, useEffect, useState } from "react";
import type { TeamHubLang } from "../teamHubStrings";
import { teamHubStrings } from "../teamHubStrings";

type SupplyItem = { itemId: number; name: string; unit: string; instanceLabel: string | null };
type RecentOrder = { id: number; status: "new" | "ordered" | "delivered" | "cancelled"; createdAt: string; lines: { itemName: string; unit: string; qty: number }[] };

const STATUS_STYLES: Record<RecentOrder["status"], string> = {
  new: "bg-blue-100 text-blue-800",
  ordered: "bg-amber-100 text-amber-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-slate-200 text-slate-600",
};

// apiBase lets Crew Link (docs/crew-link-spec.md) reuse this exact screen
// against its own public route; Team Hub keeps using its token route.
export default function SuppliesView({
  token,
  lang,
  onBack,
  workerName,
  apiBase,
  reporterName,
}: {
  token: string;
  lang: TeamHubLang;
  onBack: () => void;
  // Team Hub: the signed-in worker, shown with the date/time on the form.
  workerName?: string;
  apiBase?: string;
  // Crew Link only: the name the person typed (Team Hub knows its worker).
  reporterName?: string;
}) {
  const suppliesUrl = `${apiBase ?? `/api/team-hub/${encodeURIComponent(token)}`}/supplies`;
  const s = teamHubStrings(lang).supplies;
  const common = teamHubStrings(lang).common;

  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState("");
  const [items, setItems] = useState<SupplyItem[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [justSent, setJustSent] = useState(false);

  const [translations, setTranslations] = useState<ContentTranslations>({});
  const tr = (text: string) => translated(translations, text, lang);
  const load = useCallback(async () => {
    try {
      const res = await fetch(suppliesUrl, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setBanner(common.somethingWrong);
        return;
      }
      setItems(data.items ?? []);
      setRecentOrders(data.recentOrders ?? []);
      setTranslations(data.translations ?? {});
    } catch {
      setBanner(common.somethingWrong);
    } finally {
      setLoading(false);
    }
  }, [suppliesUrl, common.somethingWrong]);

  useEffect(() => {
    load();
  }, [load]);

  function adjust(itemId: number, delta: number) {
    navigator.vibrate?.(10);
    setQuantities((prev) => {
      const next = Math.max(0, (prev[itemId] ?? 0) + delta);
      return { ...prev, [itemId]: next };
    });
  }

  const totalQty = Object.values(quantities).reduce((a, b) => a + b, 0);

  async function sendOrder() {
    const lines = Object.entries(quantities)
      .map(([itemId, qty]) => ({ itemId: Number(itemId), qty }))
      .filter((l) => l.qty > 0);
    if (lines.length === 0) return;

    setSending(true);
    setBanner("");
    try {
      const res = await fetch(suppliesUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note, lines, ...(reporterName ? { reporterName } : {}) }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setBanner(lang === "en" && data.error ? data.error : common.somethingWrong);
        return;
      }
      navigator.vibrate?.([15, 60, 15]);
      setQuantities({});
      setNote("");
      setJustSent(true);
      await load();
      setTimeout(() => setJustSent(false), 2000);
    } catch {
      setBanner(common.noSignal);
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return <p className="mt-4 text-lg text-slate-500">{common.loading}</p>;
  }

  return (
    <div className="mt-3 space-y-3">
      <button type="button" onClick={onBack} className="text-base font-semibold text-blue-700">
        ← {common.back}
      </button>

      <WorkerAndTime workerName={workerName} lang={lang} />

      {banner && <div className="rounded-xl bg-amber-100 px-4 py-3 text-base font-semibold text-amber-900">{banner}</div>}
      {justSent && <div className="rounded-xl bg-green-100 px-4 py-3 text-base font-semibold text-green-800">✓ {s.orderSent}</div>}

      {items.length === 0 ? (
        <p className="mt-4 text-lg text-slate-500">{s.noItems}</p>
      ) : (
        <>
          <div className="rounded-2xl bg-white shadow-sm divide-y divide-gray-100">
            {items.map((item) => {
              const qty = quantities[item.itemId] ?? 0;
              return (
                <div key={item.itemId} className="flex min-h-[64px] items-center justify-between gap-3 px-4 py-2">
                  <span className="text-lg font-semibold text-slate-800">
                    {item.instanceLabel ? `${tr(item.name)} — ${tr(item.instanceLabel)}` : tr(item.name)}
                    <span className="ml-1 text-sm font-normal text-slate-400">({tr(item.unit)})</span>
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => adjust(item.itemId, -1)}
                      disabled={qty === 0}
                      className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-2xl font-bold text-slate-700 disabled:opacity-40"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-xl font-bold text-slate-900">{qty}</span>
                    <button
                      type="button"
                      onClick={() => adjust(item.itemId, 1)}
                      className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-700 text-2xl font-bold text-white"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={s.notePlaceholder}
            rows={2}
            className="w-full rounded-xl border border-gray-200 bg-white p-3 text-lg"
          />

          <button
            type="button"
            onClick={sendOrder}
            disabled={sending || totalQty === 0}
            className="min-h-[72px] w-full rounded-2xl bg-blue-700 text-xl font-bold text-white disabled:opacity-40"
          >
            {sending ? s.sending : s.sendOrder}
          </button>
        </>
      )}

      {recentOrders.length > 0 && (
        <div className="rounded-2xl bg-white shadow-sm p-4">
          <h3 className="text-base font-bold text-slate-900">{s.recentOrders}</h3>
          <ul className="mt-2 divide-y divide-gray-100">
            {recentOrders.map((order) => (
              <li key={order.id} className="flex items-center justify-between gap-2 py-3">
                <span className="text-base text-slate-700">{order.lines.map((l) => `${tr(l.itemName)} x${l.qty}`).join(", ")}</span>
                <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${STATUS_STYLES[order.status]}`}>
                  {s.status[order.status]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
