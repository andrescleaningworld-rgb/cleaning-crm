// The one list of words a sub-portal supply order's Status can be, and the one
// place older or other words are turned into them. Plain TS, no imports, so
// the Supply Orders page, the step tracking (lib/handoffs.ts) and every server
// save use the same rule.
//
// Why: the dropdown on the Supply Orders page only knows these seven words,
// but supply control saved "Picked", "Bought" and "Delivered". A <select>
// whose value is not one of its options shows its first option ("New"),
// while the badge next to it showed the saved word ("Delivered"). The step
// tracking did not know those words either, and closed such orders as if
// they were cancelled. Now every save writes one of these words, and every
// screen reads a saved word through canonicalOrderStatus.

export const ORDER_STATUSES = ["New", "Needs Review", "Approved", "Pending / In Progress", "Completed", "Denied", "Cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const SAME: Record<string, OrderStatus> = {
  "": "New",
  new: "New",
  ordered: "New",
  "needs review": "Needs Review",
  review: "Needs Review",
  approved: "Approved",
  "pending / in progress": "Pending / In Progress",
  pending: "Pending / In Progress",
  "in progress": "Pending / In Progress",
  picked: "Pending / In Progress",
  bought: "Pending / In Progress",
  sent: "Pending / In Progress",
  completed: "Completed",
  complete: "Completed",
  delivered: "Completed",
  done: "Completed",
  closed: "Completed",
  denied: "Denied",
  cancelled: "Cancelled",
  canceled: "Cancelled",
};

/**
 * The saved Status as one of ORDER_STATUSES. A word that is none of them and
 * no known older word is given back as it was (trimmed), so it is never hidden:
 * the page then shows it in the dropdown and the badge alike.
 */
export function canonicalOrderStatus(raw: unknown): string {
  const text = String(raw ?? "").trim();
  return SAME[text.toLowerCase()] ?? text;
}

export const isKnownOrderStatus = (raw: unknown): boolean => String(raw ?? "").trim().toLowerCase() in SAME;
