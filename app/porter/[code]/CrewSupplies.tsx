"use client";

// Crew Link "Supplies": one big card per product (photo, name, brand, unit,
// big − / +), grouped under the product's type, then an "Other supplies not
// on the list" box, an optional note, and one big "Send order". The products
// are the ones picked for this account (Supplies -> Catalog), or the whole
// catalog when nothing is picked. A crew is never shown a product code, a
// price or anything about the account. An order can be write-ins only, but never empty
// (the server enforces the same rule). Same API as before:
// GET/POST /api/porter-checklist/[code]/supplies.
import { useCallback, useEffect, useState } from "react";
import type { TeamHubLang } from "@/app/team-hub/teamHubStrings";
import { translated, type ContentTranslations } from "@/lib/translationKey";
import type { CrewLinkStrings } from "./strings";
import { ErrorBox, SendBar, WhoAndWhen } from "./ui";

// brand, photoUrl and type are "" when the item has none.
type SupplyItem = { itemId: number; name: string; unit: string; brand?: string; photoUrl?: string; type?: string };
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
  lang,
  name,
  onNameChange,
  onSent,
}: {
  apiBase: string;
  s: CrewLinkStrings;
  lang: TeamHubLang;
  name: string;
  onNameChange: (name: string) => void;
  onSent: () => void;
}) {
  const suppliesUrl = `${apiBase}/supplies`;
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<SupplyItem[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [translations, setTranslations] = useState<ContentTranslations>({});
  const tr = (text: string) => translated(translations, text, lang);
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
        setError(s.somethingWrong);
        return;
      }
      setItems(data.items ?? []);
      setRecentOrders(data.recentOrders ?? []);
      setTranslations(data.translations ?? {});
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

  // The cards under their type, types in the order they first come up; items with no type last.
  const groups: { type: string; items: SupplyItem[] }[] = [];
  for (const item of items) {
    const type = (item.type ?? "").trim();
    const group = groups.find((entry) => entry.type === type);
    if (group) group.items.push(item);
    else groups.push({ type, items: [item] });
  }
  groups.sort((a, b) => Number(a.type === "") - Number(b.type === ""));
  // A heading only helps when there is more than one kind of thing on the screen.
  const showHeadings = groups.some((group) => group.type !== "");

  const lines = Object.entries(quantities)
    .map(([itemId, qty]) => ({ itemId: Number(itemId), qty }))
    .filter((line) => line.qty > 0);
  const hasItems = lines.length > 0 || otherItems.trim().length > 0;
  const nameMissing = !name.trim();
  const canSend = hasItems && !nameMissing;

  async function send() {
    if (!canSend) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(suppliesUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reporterName: name.trim(), note, otherItems: otherItems.trim(), lines }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(lang === "en" && data.error ? data.error : s.somethingWrong);
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
      <WhoAndWhen s={s} lang={lang} name={name} onNameChange={onNameChange} />

      {groups.map((group) => (
        <section key={group.type || "none"} className="space-y-3" data-supply-type={group.type}>
          {showHeadings ? <h2 className="px-1 pt-1 text-xl font-black text-slate-900">{group.type ? tr(group.type) : s.supplies}</h2> : null}
          {group.items.map((item) => {
            const qty = quantities[item.itemId] ?? 0;
            return (
              // One product. Later this card also gets a "How many left?" counter as another row under the − / +.
              <div key={item.itemId} className={`rounded-2xl border-2 bg-white p-4 shadow-sm ${qty > 0 ? "border-blue-700" : "border-transparent"}`} data-supply-item={item.itemId}>
                <div className="flex items-center gap-4">
                  {item.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a stored photo of the product, shown small
                    <img src={item.photoUrl} alt="" loading="lazy" className="h-20 w-20 shrink-0 rounded-xl bg-slate-100 object-cover" />
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block text-xl font-bold leading-tight text-slate-900">{tr(item.name)}</span>
                    {item.brand ? <span className="block text-lg font-semibold text-slate-700">{item.brand}</span> : null}
                    <span className="block text-lg text-slate-500">{tr(item.unit)}</span>
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => adjust(item.itemId, -1)}
                    disabled={qty === 0}
                    aria-label={`− ${tr(item.name)}`}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-3xl font-bold text-slate-700 active:bg-slate-200 disabled:opacity-30"
                  >
                    −
                  </button>
                  <span className={`w-12 text-center text-3xl font-black ${qty > 0 ? "text-blue-700" : "text-slate-400"}`}>{qty}</span>
                  <button
                    type="button"
                    onClick={() => adjust(item.itemId, 1)}
                    aria-label={`+ ${tr(item.name)}`}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-700 text-3xl font-bold text-white active:bg-blue-800"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      ))}

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
        hint={!hasItems ? s.pickSupplies : nameMissing ? s.writeYourName : undefined}
      />

      {recentOrders.length > 0 ? (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">{s.recentOrders}</h2>
          <ul className="mt-2 divide-y divide-slate-100">
            {recentOrders.map((order) => (
              <li key={order.id} className="flex items-center justify-between gap-3 py-3">
                <span className="text-lg text-slate-700">
                  {[
                    ...order.lines.map((line) => `${tr(line.itemName)} ×${line.qty}`),
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
