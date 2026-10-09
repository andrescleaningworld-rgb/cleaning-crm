// The office email for a new supply order when supplies run on Postgres
// (Apps Script sent its own before). Used by the Supply Orders route and by
// the subcontractor portal.

import { sendInternalNotification } from "@/lib/email";
import { markSupplyOrderEmail, type NewSupplyOrder } from "@/lib/data/supplies";

export async function emailNewSupplyOrder(order: NewSupplyOrder): Promise<void> {
  const sent = await sendInternalNotification(`New supply order: ${order.supplyItem}`, [
    `Order ID: ${order.orderId}`,
    `Subcontractor: ${order.subcontractor || "Not given"}`,
    `Subcontractor email: ${order.subcontractorEmail || "Not given"}`,
    `Account: ${order.accountName || "Not given"}`,
    `Item: ${order.supplyItem}`,
    `Quantity: ${[order.quantity, order.unit].filter(Boolean).join(" ") || "Not given"}`,
    `Delivery: ${order.deliveryMode || "Not given"}`,
    `Notes: ${order.notes || "None"}`,
    `Status: ${order.status}`,
  ]).catch(() => false);
  await markSupplyOrderEmail(order.rowNumber, "info@cleaningworldinc.com, crm@cleaningworldinc.com", sent ? "Sent" : "Not sent").catch(() => undefined);
}
