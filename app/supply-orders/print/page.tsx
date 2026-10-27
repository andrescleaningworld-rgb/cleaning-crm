"use client";

// A clean printable supply order, the same as its PDF (lib/pdf/supply-order.tsx):
// "Cleaning World Inc." with the logo, "Supply Order", the order date, the
// account and its delivery address, who asked for it, and the items with
// quantity and unit, plus the "Other supplies" line and the note. The office
// copy also shows anything that arrived different (short or extra). One or
// many: /supply-orders/print?o=<order>&o=<order>, each order on its own page.
// Opened from an order card's 🖨 Print, the sticky bar, or a pinned paper's
// "📄 Open order" (lib/pg/board-pins.ts), so it is always made fresh. Staff
// only (not in proxy.ts's public paths). The orders come from the same place
// as the PDF (GET /api/supply-orders/pdf?format=json).

import { useEffect, useState } from "react";
import { CrewPrintStyles } from "@/app/crew-link/print/CrewPrintSheet";
import type { SupplyOrderDoc } from "@/lib/pg/supply-order-docs";
import { downloadSupplyOrderPdf, supplyOrderPdfUrl } from "../order-pdf";

const clean = (value: unknown) => String(value ?? "").trim();

export default function SupplyOrderPrintPage() {
  const [keys, setKeys] = useState<string[]>([]);
  const [orders, setOrders] = useState<SupplyOrderDoc[] | null>(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).getAll("o").map(clean).filter(Boolean);
    // The orders in the address, read once when the page opens (the browser only).
    setKeys(wanted);
    if (wanted.length === 0) {
      setError("That order was not found. It may have been removed.");
      return;
    }
    let alive = true;
    (async () => {
      try {
        const response = await fetch(`${supplyOrderPdfUrl(wanted)}&format=json`, { cache: "no-store" });
        const body = (await response.json().catch(() => ({}))) as { success?: boolean; orders?: SupplyOrderDoc[]; error?: string };
        if (!response.ok || body.success !== true) throw new Error(body.error || "The order did not load. Try again.");
        if (!alive) return;
        const list = body.orders ?? [];
        if (list.length === 0) setError("That order was not found. It may have been removed.");
        setOrders(list);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "The order did not load. Try again.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function download() {
    setDownloading(true);
    try {
      await downloadSupplyOrderPdf(keys);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The PDF could not be made. Try again.");
    } finally {
      setDownloading(false);
    }
  }

  if (error && (!orders || orders.length === 0)) return <p className="p-8 text-center text-lg font-semibold text-red-700">{error}</p>;
  if (!orders) return <p className="p-8 text-center text-lg text-slate-500">Loading the order…</p>;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-6 flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={() => window.print()} className="flex min-h-[64px] items-center gap-3 rounded-2xl bg-blue-700 px-8 text-xl font-bold text-white shadow-sm hover:bg-blue-800">
          <span aria-hidden="true">🖨️</span> Print
        </button>
        <button type="button" onClick={() => void download()} disabled={downloading} className="flex min-h-[64px] items-center gap-3 rounded-2xl bg-white px-8 text-xl font-bold text-blue-800 shadow-sm ring-2 ring-blue-700 hover:bg-blue-50 disabled:opacity-60" data-order-download>
          <span aria-hidden="true">⬇</span> {downloading ? "Making the PDF…" : "Download PDF"}
        </button>
      </div>
      {error ? <p className="no-print mb-4 text-center font-semibold text-red-700">{error}</p> : null}
      {/* Opt in to printing — globals.css hides everything else on paper. Each order starts a new page. */}
      <CrewPrintStyles />
      <style>{`@media print { .supply-order-page { break-after: page; } .supply-order-page:last-child { break-after: auto; } }`}</style>
      <div className="crew-print-view">
        {orders.map((order) => (
          <section key={order.key} className="supply-order-page mb-10 space-y-5 text-black" data-print-order={order.key}>
            <div className="flex items-center justify-between gap-4 border-b-4 border-black pb-4">
              {/* The wordmark logo (510 × 95), shown large so it stays clear on paper. */}
              {/* eslint-disable-next-line @next/next/no-img-element -- a printout; the plain file prints sharpest */}
              <img src="/cw-logo.jpg" alt="Cleaning World Inc." className="h-auto w-64 max-w-[55%]" />
              <div className="text-right">
                <p className="text-lg font-black">Cleaning World Inc.</p>
                <p className="text-sm">90 Burlews Ct, Hackensack, NJ 07601</p>
                <p className="text-sm">201-487-1313</p>
              </div>
            </div>
            <h1 className="text-3xl font-black">Supply Order</h1>
            <div className="grid grid-cols-2 gap-4 text-base">
              <p>
                <span className="block text-xs font-bold uppercase">Account</span>
                <span className="text-xl font-black">{order.accountName || "Not on file"}</span>
              </p>
              <p>
                <span className="block text-xs font-bold uppercase">Order date</span>
                {order.date || "Not on file"}
              </p>
              <p>
                <span className="block text-xs font-bold uppercase">Delivery address</span>
                {order.address || "Not on file"}
              </p>
              <p>
                <span className="block text-xs font-bold uppercase">Requested by</span>
                {order.requestedBy || "Not on file"}
              </p>
            </div>
            <table className="w-full border-collapse text-lg">
              <thead>
                <tr className="border-b-2 border-black text-left text-sm uppercase">
                  <th className="py-2 pr-3">Qty</th>
                  <th className="py-2 pr-3">Unit</th>
                  <th className="py-2">Item</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((line, index) => (
                  <tr key={`${line.item}-${index}`} className="crew-print-row border-b border-slate-400">
                    <td className="py-2 pr-3 font-bold">{line.qty || "—"}</td>
                    <td className="py-2 pr-3">{line.unit || "—"}</td>
                    <td className="py-2">{line.item}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {order.other ? (
              <p>
                <span className="font-bold">Other supplies:</span> {order.other}
              </p>
            ) : null}
            {order.note ? (
              <p>
                <span className="font-bold">Note:</span> {order.note}
              </p>
            ) : null}
            {order.different.length > 0 ? (
              <div className="rounded-xl border-2 border-black p-3">
                <p className="font-black">⚠ Wrong amount: arrived different from the order</p>
                {order.different.map((line) => (
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
