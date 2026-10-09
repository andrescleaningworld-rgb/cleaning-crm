// The office email for a new supply order when supplies run on Postgres
// (Apps Script sent its own before). Used by the Supply Orders route and by
// the subcontractor portal.

import { sendInternalNotification } from "@/lib/email";
import { markSupplyOrderEmail, type NewSupplyOrder } from "@/lib/data/supplies";

// The email only says what is waiting and links straight to it; the details
// are on the order itself. `origin` is the site the order was placed on
// (https://...), so the link opens the same site.
export async function emailNewSupplyOrder(order: NewSupplyOrder, origin = ""): Promise<void> {
  const what = [[order.quantity, order.unit].filter(Boolean).join(" "), order.supplyItem].filter(Boolean).join(" ");
  const base = origin || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  const sent = await sendInternalNotification(`Supply order waiting: ${order.accountName || order.supplyItem}`, [
    "A supply order is waiting for the account's manager to approve it.",
    `${what || "Supplies"} for ${order.accountName || "an account"}${order.subcontractor ? `, ordered by ${order.subcontractor}` : ""}.`,
    base ? `Open it: ${base}/supply-orders?order=${encodeURIComponent(order.orderId)}` : `Open Supply Orders in the app. Order ID: ${order.orderId}`,
  ]).catch(() => false);
  await markSupplyOrderEmail(order.rowNumber, "info@cleaningworldinc.com, crm@cleaningworldinc.com", sent ? "Sent" : "Not sent").catch(() => undefined);
}
