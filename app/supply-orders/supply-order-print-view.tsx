type PrintOrderItem = {
  orderId?: string;
  supplyItem?: string;
  category?: string;
  description?: string;
  itemDescription?: string;
  quantity?: string;
  unit?: string;
  notes?: string;
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function getItemDescription(item: PrintOrderItem): string {
  return cleanText(item.description || item.itemDescription);
}

// Rendered into the .supply-order-print-view opt-in container (see the
// @media print rules in page.tsx) so it's the only thing visible when
// window.print() runs, regardless of what's on screen. All items passed in
// share the same date/account/subcontractor (see buildOrderGroups in
// page.tsx) — order date, account, subcontractor, delivery mode, and address
// come from the group as a whole rather than per line item. Header styling
// (logo box, dark blue banner) mirrors app/accounts/[id]/account-packet-
// print-view.tsx's branded packet, reusing the same /cw-logo.jpg asset and
// --cw-blue-dark/--cw-border CSS variables from globals.css rather than
// introducing a new logo or color.
export default function SupplyOrderPrintView({
  poReference,
  orderDate,
  accountName,
  accountId,
  subcontractor,
  subcontractorEmail,
  deliveryMode,
  deliveryAddress,
  items,
}: {
  poReference: string;
  orderDate: string;
  accountName: string;
  accountId: string;
  subcontractor: string;
  subcontractorEmail: string;
  deliveryMode: string;
  deliveryAddress: string;
  items: PrintOrderItem[];
}) {
  const orderIds = Array.from(
    new Set(items.map((item) => cleanText(item.orderId)).filter(Boolean))
  );

  return (
    <div className="supply-order-print-view">
      <div
        className="mb-5 flex items-center justify-between gap-4 px-1 py-4"
        style={{ background: "var(--cw-blue-dark)", color: "#fff" }}
      >
        <div className="flex items-center gap-3 rounded-lg bg-white px-3 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- print-only static image, next/image adds no value here */}
          <img src="/cw-logo.jpg" alt="Cleaning World Inc." className="h-9 w-auto" />
        </div>

        <div className="text-right">
          <h1 className="text-lg font-black">Purchase Order</h1>
          <p className="mt-1 text-xs font-semibold opacity-90">Cleaning World Inc.</p>
        </div>
      </div>

      <div
        className="mb-4 flex items-baseline justify-between border-b pb-2"
        style={{ borderColor: "var(--cw-border)" }}
      >
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            PO Reference #
          </p>
          <p className="text-sm font-semibold">{poReference || "-"}</p>
        </div>

        <div className="text-right text-xs text-slate-600">
          <p>Generated {new Date().toLocaleDateString()}</p>
          <p>
            {items.length} item{items.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Order Date
          </p>
          <p className="font-semibold">{orderDate || "-"}</p>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Account
          </p>
          <p className="font-semibold">{accountName || "-"}</p>
          {accountId ? <p className="text-xs text-slate-500">{accountId}</p> : null}
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Subcontractor
          </p>
          <p className="font-semibold">{subcontractor || "-"}</p>
          {subcontractorEmail ? (
            <p className="text-xs text-slate-500">{subcontractorEmail}</p>
          ) : null}
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Delivery Mode
          </p>
          <p className="font-semibold">{deliveryMode || "-"}</p>
        </div>

        <div className="col-span-2">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Delivery Address
          </p>
          <p className="font-semibold">{deliveryAddress || "-"}</p>
        </div>

        {orderIds.length > 0 ? (
          <div className="col-span-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Line Item Order ID{orderIds.length === 1 ? "" : "s"}
            </p>
            <p className="font-semibold">{orderIds.join(", ")}</p>
          </div>
        ) : null}
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-slate-800 text-left">
            <th className="py-2 pr-2">Item</th>
            <th className="py-2 pr-2">Category</th>
            <th className="py-2 pr-2">Quantity</th>
            <th className="py-2 pr-2">Notes</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr
              key={item.orderId || index}
              className="supply-order-print-row border-b border-slate-300 align-top"
            >
              <td className="py-2 pr-2">
                <div className="font-semibold">{item.supplyItem || "-"}</div>
                {getItemDescription(item) ? (
                  <div className="text-xs text-slate-600">{getItemDescription(item)}</div>
                ) : null}
              </td>
              <td className="py-2 pr-2">{item.category || "-"}</td>
              <td className="py-2 pr-2">
                {item.quantity || "-"}
                {item.unit ? ` ${item.unit}` : ""}
              </td>
              <td className="py-2 pr-2">{item.notes || "-"}</td>
            </tr>
          ))}
          {items.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-4 text-center text-slate-500">
                No items to print.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <div
        className="mt-6 flex items-end justify-between border-t pt-3 text-[8.5px] text-slate-500"
        style={{ borderColor: "var(--cw-border)" }}
      >
        <div>
          <p className="font-bold text-slate-700">Cleaning World Inc.</p>
          <p>90 Burlews Ct, Hackensack, NJ 07601</p>
          <p>201-487-1313</p>
        </div>
      </div>
    </div>
  );
}
