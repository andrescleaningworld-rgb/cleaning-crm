// Which supply order a sub-portal order line belongs to. Plain TS with no
// imports, so the Supply Orders cards (app/supply-orders/order-cards.tsx), the
// print page and the PDF (lib/pg/supply-order-docs.ts, server) all group the
// same way.

const clean = (value: unknown) => String(value ?? "").trim();

/**
 * Lines sent together share orderGroupId; older lines fall back to the same
 * account + sub + time.
 */
export function orderGroupKey(order: { orderGroupId?: unknown; accountName?: unknown; subcontractor?: unknown; timestamp?: unknown }): string {
  const groupId = clean(order.orderGroupId);
  if (groupId) return `group:${groupId}`;
  return `fallback:${clean(order.accountName).toLowerCase()}|${clean(order.subcontractor).toLowerCase()}|${clean(order.timestamp)}`;
}
