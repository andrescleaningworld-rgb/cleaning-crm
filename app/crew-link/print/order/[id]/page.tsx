"use client";

// Printable supply order: account name, who ordered, date/time, every item
// with quantity and unit, the "other supplies" write-in, and the status.
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatCrewDateTime } from "@/lib/crewDateTime";
import CrewPrintSheet, { PrintFact } from "../../CrewPrintSheet";

type OrderStatus = "new" | "ordered" | "delivered" | "cancelled";

type PrintOrder = {
  id: number;
  status: OrderStatus;
  note: string;
  noteEnglish: string | null;
  otherItems: string | null;
  orderedBy: string | null;
  createdAt: string;
  lines: { itemName: string; unit: string; qty: number }[];
};

type OrderResponse = { success?: boolean; error?: string; order?: PrintOrder; accountName?: string };

// Same wording as the Accounts Center queue.
const ORDER_STATUS_LABEL: Record<OrderStatus, string> = { new: "Sent", ordered: "Ordered", delivered: "Delivered", cancelled: "Cancelled" };

export default function CrewLinkPrintOrderPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const [order, setOrder] = useState<PrintOrder | null>(null);
  const [accountName, setAccountName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!Number.isInteger(id)) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/team-hub/supply-orders?id=${id}`, { cache: "no-store" });
        const data = (await res.json()) as OrderResponse;
        if (!res.ok || data.success === false || !data.order) throw new Error(data.error || "Could not load this order.");
        if (cancelled) return;
        setOrder(data.order);
        setAccountName(data.accountName || "");
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load this order.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return <p className="p-8 text-center text-lg font-semibold text-red-700">{error}</p>;
  }
  if (!order) {
    return <p className="p-8 text-center text-lg text-slate-500">Loading order…</p>;
  }

  const noteEnglish = order.noteEnglish && order.noteEnglish.trim() !== order.note.trim() ? order.noteEnglish : "";

  return (
    <CrewPrintSheet accountName={accountName} title="Supply Order">
      <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2 print:grid-cols-2">
        <PrintFact label="Ordered by" value={order.orderedBy ?? "Unknown"} />
        <PrintFact label="Sent" value={formatCrewDateTime(order.createdAt)} />
        <PrintFact label="Status" value={ORDER_STATUS_LABEL[order.status] ?? order.status} />
      </div>

      <table className="w-full border-collapse text-lg">
        <thead>
          <tr className="border-b-2 border-black text-left">
            <th className="py-2 pr-3">Item</th>
            <th className="w-28 py-2 pr-3">Quantity</th>
            <th className="w-36 py-2">Unit</th>
          </tr>
        </thead>
        <tbody>
          {order.lines.map((line, i) => (
            <tr key={i} className="crew-print-row border-b border-black align-top">
              <td className="py-2 pr-3 font-semibold">{line.itemName}</td>
              <td className="py-2 pr-3 font-black">{line.qty}</td>
              <td className="py-2">{line.unit}</td>
            </tr>
          ))}
          {order.lines.length === 0 ? (
            <tr>
              <td colSpan={3} className="py-3">
                No items from the list.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <div className="crew-print-row">
        <h2 className="text-xl font-black">Other supplies</h2>
        <p className="mt-1 whitespace-pre-wrap text-lg">{order.otherItems || "None"}</p>
      </div>

      {order.note ? (
        <div className="crew-print-row">
          <h2 className="text-xl font-black">Note</h2>
          <p className="mt-1 whitespace-pre-wrap text-lg">{order.note}</p>
          {noteEnglish ? <p className="mt-1 whitespace-pre-wrap text-lg">English: {noteEnglish}</p> : null}
        </div>
      ) : null}
    </CrewPrintSheet>
  );
}
