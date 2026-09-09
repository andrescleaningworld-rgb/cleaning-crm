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
// share the same date/account/subcontractor (see getPrintGroupForOrder in
// page.tsx) — order date, account, subcontractor, delivery mode, and address
// come from the group as a whole rather than per line item.
export default function SupplyOrderPrintView({
  orderDate,
  accountName,
  accountId,
  subcontractor,
  subcontractorEmail,
  deliveryMode,
  deliveryAddress,
  orderGroupId,
  items,
}: {
  orderDate: string;
  accountName: string;
  accountId: string;
  subcontractor: string;
  subcontractorEmail: string;
  deliveryMode: string;
  deliveryAddress: string;
  orderGroupId: string;
  items: PrintOrderItem[];
}) {
  const orderIds = Array.from(
    new Set(items.map((item) => cleanText(item.orderId)).filter(Boolean))
  );

  return (
    <div className="supply-order-print-view">
      <div className="mb-4 flex items-baseline justify-between border-b-2 border-slate-800 pb-2">
        <h1 className="text-xl font-bold">Cleaning World — Supply Order</h1>
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

        <div className="col-span-2">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Reference Order ID{orderIds.length === 1 ? "" : "s"}
          </p>
          <p className="font-semibold">
            {orderIds.length > 0 ? orderIds.join(", ") : "-"}
          </p>
          {orderGroupId ? (
            <p className="text-xs text-slate-500">Order group: {orderGroupId}</p>
          ) : null}
        </div>
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
    </div>
  );
}
