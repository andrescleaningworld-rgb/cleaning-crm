"use client";

// Supply Orders -> what arrived different from the order (lib/pg/shelves.ts,
// migration 039):
//
//   DifferentBox   "⚠️ Arrived short / extra": the crew's numbers against the
//                  order (also a paper in the Pin Board's Supply orders square)
//   BackOrderBox   "⏳ Back order": what came short and is still on its way
//                  to the crew. Each item has Cancel, which asks where it is:
//                  "Put back on our shelf" or "Lost / never coming".
//
// Used on an order's own card (order-cards.tsx) and, for deliveries the
// office sent with no order, in deliveries.tsx.

import { useState } from "react";
import { Sheet, showToast } from "@/app/ui";

export type BackOrderLine = { supplyId: number | null; name: string; unit: string; qty: number };

export function DifferentBox({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="mt-2 rounded-2xl border-2 border-red-400 bg-red-50 p-3" data-order-different>
      <p className="font-black text-red-800" style={{ margin: 0 }}>
        ⚠️ {title}
      </p>
      {lines.map((line, index) => (
        <p key={`${line}-${index}`} className="font-bold text-red-800" style={{ margin: 0 }}>
          {line}
        </p>
      ))}
    </div>
  );
}

export function BackOrderBox({ entryKey, lines, onChanged }: { entryKey: string; lines: BackOrderLine[]; onChanged: () => void }) {
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [busy, setBusy] = useState("");
  const line = cancelling === null ? null : lines[cancelling];

  async function cancel(choice: "shelf" | "lost") {
    if (cancelling === null) return;
    setBusy(choice);
    try {
      const response = await fetch("/api/shelves", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancelBack", key: entryKey, index: cancelling, choice }) });
      const result = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || !result.success) {
        showToast(result.error || "That did not save. Try again.", "bad");
        return;
      }
      showToast(choice === "shelf" ? "Cancelled. Put back on our shelf." : "Cancelled. Marked lost.");
      setCancelling(null);
      onChanged();
    } catch {
      showToast("No connection. Try again.", "bad");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mt-2 rounded-2xl border-2 border-amber-400 bg-amber-50 p-3" data-back-order={entryKey}>
      <p className="font-black text-amber-900" style={{ margin: 0 }}>
        ⏳ Back order: still on its way
      </p>
      {lines.map((item, index) => (
        <div key={`${item.name}-${index}`} className="flex items-center justify-between gap-2" style={{ marginTop: 4 }}>
          <span className="font-bold text-amber-900">
            {item.qty} × {item.name}
            {item.unit ? ` (${item.unit})` : ""}
          </span>
          <button type="button" className="ui-btn ui-btn-second" onClick={() => setCancelling(index)} data-back-order-cancel={index}>
            Cancel
          </button>
        </div>
      ))}
      <p className="ui-muted" style={{ margin: "4px 0 0" }}>
        The crew confirms it with Supplies arrived when it comes.
      </p>

      <Sheet open={line !== null} title={line ? `Cancel ${line.qty} × ${line.name}?` : ""} text="It comes off the back order. Where is it?" onClose={() => (busy ? undefined : setCancelling(null))} busy={busy !== ""}>
        <div className="ui-stack">
          <button
            type="button"
            disabled={busy !== ""}
            onClick={() => void cancel("shelf")}
            className="flex min-h-[64px] w-full items-center justify-center rounded-2xl bg-blue-700 px-4 text-xl font-black text-white active:scale-[0.98] disabled:opacity-50"
            data-back-order-choice="shelf"
          >
            {busy === "shelf" ? "Saving…" : "📥 Put back on our shelf"}
          </button>
          <button
            type="button"
            disabled={busy !== ""}
            onClick={() => void cancel("lost")}
            className="flex min-h-[64px] w-full items-center justify-center rounded-2xl bg-slate-700 px-4 text-xl font-black text-white active:scale-[0.98] disabled:opacity-50"
            data-back-order-choice="lost"
          >
            {busy === "lost" ? "Saving…" : "✗ Lost / never coming"}
          </button>
        </div>
      </Sheet>
    </div>
  );
}
