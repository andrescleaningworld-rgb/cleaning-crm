"use client";

// A clean printable supply order: account, address, date, who ordered, the
// items with quantity and delivery mode, the status, and anything that
// arrived different (short or extra). One or many: /supply-orders/print?o=<order>&o=<order>, each
// order on its own page. Opened from an order card's 🖨 Print, the sticky
// bar, or a pinned paper's "📄 Open order" (lib/pg/board-pins.ts), so it is
// always made fresh. Staff only (not in proxy.ts's public paths). The same
// print shell as the Crew Link printouts.

import { useEffect, useState } from "react";
import Image from "next/image";
import { CrewPrintStyles, PrintButton } from "@/app/crew-link/print/CrewPrintSheet";
import { orderGroupKey, type SubOrder } from "../order-cards";
import { canonicalOrderStatus } from "@/lib/supplyOrderStatus";
import { formatCrewDateTime } from "@/lib/crewDateTime";

type CrewOrder = { id: number; accountId: string; accountName: string; status: string; orderedBy: string; createdAt: string; note: string; otherItems: string; lines: { itemName: string; unit: string; qty: number }[] };
type Short = { source: string; ref: string; lines: string[] };
type Account = { accountId?: string; accountName?: string; address?: string; city?: string; state?: string; zip?: string };
type Line = { qty: string; item: string; delivery: string; status: string };
type PrintOrder = { key: string; source: string; accountName: string; address: string; date: string; orderedBy: string; lines: Line[]; status: string; note: string; short: string[] };

const CREW_STATUS: Record<string, string> = { new: "New", ordered: "Pending / In Progress", delivered: "Completed", cancelled: "Cancelled" };
const clean = (value: unknown) => String(value ?? "").trim();

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  return (await response.json().catch(() => ({}))) as T;
}

function addressOf(accounts: Account[], accountId: string, accountName: string): string {
  const account = accounts.find((entry) => (accountId && clean(entry.accountId) === accountId) || (accountName && clean(entry.accountName).toLowerCase() === accountName.toLowerCase()));
  if (!account) return "";
  return [account.address, [account.city, account.state].map(clean).filter(Boolean).join(", "), account.zip].map(clean).filter(Boolean).join(" ");
}

export default function SupplyOrderPrintPage() {
  const [orders, setOrders] = useState<PrintOrder[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const keys = new URLSearchParams(window.location.search).getAll("o").map(clean).filter(Boolean);
    let alive = true;
    (async () => {
      try {
        const [subs, crew, shelves, accounts] = await Promise.all([
          getJson<{ supplyOrders?: SubOrder[] }>("/api/supply-orders"),
          getJson<{ orders?: CrewOrder[] }>("/api/admin/crew-supplies?view=orders"),
          getJson<{ different?: Short[] }>("/api/shelves"),
          getJson<{ accounts?: Account[] }>("/api/accounts"),
        ]);
        const subRows = subs.supplyOrders ?? [];
        const crewOrders = crew.orders ?? [];
        const shortList = shelves.different ?? [];
        const accountList = accounts.accounts ?? [];
        const made: PrintOrder[] = [];
        for (const key of keys) {
          if (key.startsWith("crew-")) {
            const order = crewOrders.find((entry) => `crew-${entry.id}` === key);
            if (!order) continue;
            const status = CREW_STATUS[order.status] ?? order.status;
            made.push({
              key,
              source: "Crew Link",
              accountName: order.accountName,
              address: addressOf(accountList, order.accountId, order.accountName),
              date: formatCrewDateTime(order.createdAt),
              orderedBy: order.orderedBy,
              lines: [...order.lines.map((line) => ({ qty: `${line.qty} ${line.unit}`, item: line.itemName, delivery: "", status })), ...(order.otherItems ? [{ qty: "", item: `Other: ${order.otherItems}`, delivery: "", status }] : [])],
              status,
              note: clean(order.note),
              short: shortList.filter((entry) => entry.source === "crew-order" && entry.ref === String(order.id)).flatMap((entry) => entry.lines),
            });
            continue;
          }
          const rows = subRows.filter((row) => orderGroupKey(row) === key);
          if (rows.length === 0) continue;
          const first = rows[0];
          const refs = rows.map((row) => clean(row.orderGroupId) || clean(row.orderId));
          const statuses = [...new Set(rows.map((row) => canonicalOrderStatus(row.status)))];
          made.push({
            key,
            source: "Sub portal",
            accountName: clean(first.accountName),
            address: addressOf(accountList, clean(first.accountId), clean(first.accountName)),
            date: clean(first.timestamp),
            orderedBy: clean(first.subcontractor),
            lines: rows.map((row) => ({ qty: `${clean(row.quantity)}${row.unit ? ` ${clean(row.unit)}` : ""}`, item: clean(row.supplyItem), delivery: clean(row.deliveryMode), status: canonicalOrderStatus(row.status) })),
            status: statuses.join(" / "),
            note: [...new Set(rows.map((row) => clean(row.notes)).filter(Boolean))].join(" · "),
            short: shortList.filter((entry) => entry.source === "sub-order" && refs.includes(entry.ref)).flatMap((entry) => entry.lines),
          });
        }
        if (!alive) return;
        if (made.length === 0) setError("That order was not found. It may have been removed.");
        setOrders(made);
      } catch {
        if (alive) setError("The order did not load. Try again.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (error && (!orders || orders.length === 0)) return <p className="p-8 text-center text-lg font-semibold text-red-700">{error}</p>;
  if (!orders) return <p className="p-8 text-center text-lg text-slate-500">Loading the order…</p>;

  return (
    <div className="mx-auto max-w-3xl">
      <PrintButton />
      {/* Opt in to printing — globals.css hides everything else on paper. Each order starts a new page. */}
      <CrewPrintStyles />
      <style>{`@media print { .supply-order-page { break-after: page; } .supply-order-page:last-child { break-after: auto; } }`}</style>
      <div className="crew-print-view">
        {orders.map((order) => (
          <section key={order.key} className="supply-order-page mb-10 space-y-4 text-black" data-print-order={order.key}>
            <div className="flex items-center justify-between gap-3 border-b-2 border-black pb-3">
              <div className="flex items-center gap-3">
                <Image src="/logo-CW-single-phone-optimized.png" alt="Cleaning World" width={44} height={44} className="h-11 w-11 object-contain" />
                <div>
                  <p className="text-2xl font-black">Supply order</p>
                  <p className="text-sm">{order.source}</p>
                </div>
              </div>
              <p className="text-right text-lg font-bold">{order.status}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-base">
              <p>
                <span className="block text-xs font-bold uppercase">Account</span>
                <span className="text-lg font-black">{order.accountName || "No account"}</span>
              </p>
              <p>
                <span className="block text-xs font-bold uppercase">Address</span>
                {order.address || "Not on file"}
              </p>
              <p>
                <span className="block text-xs font-bold uppercase">Date</span>
                {order.date || "Not on file"}
              </p>
              <p>
                <span className="block text-xs font-bold uppercase">Ordered by</span>
                {order.orderedBy || "Not on file"}
              </p>
            </div>
            <table className="w-full border-collapse text-base">
              <thead>
                <tr className="border-b-2 border-black text-left">
                  <th className="py-2 pr-3">Qty</th>
                  <th className="py-2 pr-3">Item</th>
                  <th className="py-2 pr-3">Delivery</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((line, index) => (
                  <tr key={`${line.item}-${index}`} className="crew-print-row border-b border-slate-400">
                    <td className="py-2 pr-3 font-bold">{line.qty}</td>
                    <td className="py-2 pr-3">{line.item}</td>
                    <td className="py-2 pr-3">{line.delivery || "—"}</td>
                    <td className="py-2">{line.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {order.note ? (
              <p>
                <span className="font-bold">Notes:</span> {order.note}
              </p>
            ) : null}
            {order.short.length > 0 ? (
              <div className="rounded-xl border-2 border-black p-3">
                <p className="font-black">⚠ Arrived different from the order</p>
                {order.short.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}
