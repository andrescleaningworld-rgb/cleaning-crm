// Crew Link supplies (migration 033):
//
//   the catalog        supply_items itself, the list crews order from. Since
//                      migration 038 each item is the Crew Link face of a
//                      Supplies product (lib/pg/supply-list.ts), managed from
//                      the Supplies page; there is no separate catalog. An
//                      item that is removed is only hidden: past orders keep it.
//   a list per account crew_link_account_supplies: the catalog items picked
//                      for one account's Crew Link. An account with nothing
//                      picked sees the default list: the active items marked
//                      in_default_list (migration 036), not the whole catalog.
//   editing an order   staff can change an order a crew already sent while it
//                      is New or Ordered. The order as the crew sent it is
//                      kept (supply_orders.original_request) and every edit
//                      is written down (supply_order_edits).
//
// How crews place an order is not changed here (lib/teamHubDb.ts).

import { getSql } from "@/lib/db";
import { getSupplyOrderById, getTeamHubSiteById, type TeamHubSupplyOrderStatus } from "@/lib/teamHubDb";
import { lookupAccountSummaries } from "@/lib/teamHubAccountLookup";

const clean = (value: unknown) => String(value ?? "").trim();
const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : value ? String(value) : "");

/* ---------- is migration 033 in this database? ---------- */

let ready = false;

/** True once this database has the catalog fields and the two new tables. Until then the screens hide the feature. */
export async function crewSuppliesReady(): Promise<boolean> {
  if (ready) return true;
  const sql = getSql();
  const rows = (await sql`
    SELECT
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'supply_items' AND column_name = 'brand')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'supply_orders' AND column_name = 'original_request')
      AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crew_link_account_supplies')
      AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'supply_order_edits') AS ok
  `) as { ok: boolean }[];
  ready = rows[0]?.ok === true;
  return ready;
}

/* ---------- the catalog ---------- */

export type CatalogItem = {
  id: number;
  name: string;
  brand: string;
  productLine: string;
  unit: string;
  photoUrl: string;
  /** The type it belongs to ("Toilet paper"...), for grouping. "" = no type yet. */
  category: string;
  /** Our product code. Staff side only: nothing a crew is sent carries it. */
  sku: string;
  /** On the default list: a crew at an account with no list of its own can order it (when it is also active). */
  inDefaultList: boolean;
  /** false = removed from the catalog (hidden). It is never deleted. */
  active: boolean;
};

// category and sku are missing from the row where migration 035 is not in yet.
type ItemRow = { id: number; name: string; brand: string | null; product_line: string | null; unit: string; photo_url: string | null; active: boolean; category?: string | null; sku?: string | null; in_default_list?: boolean | null };

const toItem = (row: ItemRow): CatalogItem => ({
  id: row.id,
  name: clean(row.name),
  brand: clean(row.brand),
  productLine: clean(row.product_line),
  unit: clean(row.unit),
  photoUrl: clean(row.photo_url),
  category: clean(row.category),
  sku: clean(row.sku),
  // No such column yet (before migration 036): every item counts as on the default list, as it always did.
  inDefaultList: row.in_default_list !== false,
  active: row.active === true,
});

export async function listCatalogItems(includeHidden: boolean): Promise<CatalogItem[]> {
  const sql = getSql();
  // Every column, so the type and the product code come along once they exist.
  const rows = (await sql`
    SELECT * FROM supply_items
    WHERE ${includeHidden} OR active
    ORDER BY lower(name), id
  `) as ItemRow[];
  return rows.map(toItem);
}

/* ---------- the list of one account ---------- */

export async function getAccountSupplyIds(accountId: string): Promise<number[]> {
  const sql = getSql();
  const rows = (await sql`SELECT item_id FROM crew_link_account_supplies WHERE account_id = ${accountId} ORDER BY item_id`) as { item_id: number }[];
  return rows.map((row) => row.item_id);
}

/** Makes the account's list exactly these items. An empty list means "the whole catalog" again. */
export async function setAccountSupplyIds(accountId: string, itemIds: number[], by: string): Promise<number[]> {
  const ids = [...new Set(itemIds.filter((id) => Number.isInteger(id)))];
  const sql = getSql();
  await sql.transaction([
    sql`DELETE FROM crew_link_account_supplies WHERE account_id = ${accountId} AND NOT (item_id = ANY(${ids}::int[]))`,
    sql`
      INSERT INTO crew_link_account_supplies (account_id, item_id, added_by)
      SELECT ${accountId}, id, ${by} FROM supply_items WHERE id = ANY(${ids}::int[])
      ON CONFLICT (account_id, item_id) DO NOTHING
    `,
  ]);
  return getAccountSupplyIds(accountId);
}

/** The accounts that have a list of their own, for "Copy list from another account". */
export async function listAccountsWithLists(): Promise<{ accountId: string; accountName: string; count: number }[]> {
  const sql = getSql();
  const rows = (await sql`SELECT account_id, count(*)::int AS n FROM crew_link_account_supplies GROUP BY account_id`) as { account_id: string; n: number }[];
  const names = await lookupAccountSummaries(rows.map((row) => row.account_id));
  return rows
    .map((row) => ({ accountId: row.account_id, accountName: names.get(row.account_id)?.accountName || row.account_id, count: row.n }))
    .sort((a, b) => a.accountName.localeCompare(b.accountName));
}

/**
 * What the crew at this account can order: the items picked for it. With
 * nothing picked (or everything picked removed since), the default list: the
 * active items marked for it. That can be empty.
 */
export async function activeItemsForAccount(accountId: string): Promise<CatalogItem[]> {
  const all = await listCatalogItems(false);
  const defaults = all.filter((item) => item.inDefaultList);
  if (!accountId) return defaults;
  const picked = new Set(await getAccountSupplyIds(accountId));
  const own = all.filter((item) => picked.has(item.id));
  return own.length > 0 ? own : defaults;
}

/** The account's own picks, as ids, for the crew's own screen. Null = no list of its own (the crew gets the default list). Never throws. */
export async function pickedItemIdsForCrew(accountId: string): Promise<Set<number> | null> {
  try {
    if (!(await crewSuppliesReady())) return null;
    const ids = await getAccountSupplyIds(accountId);
    return ids.length > 0 ? new Set(ids) : null;
  } catch (error) {
    console.error("[crew supplies] account list:", error instanceof Error ? error.message : error);
    return null;
  }
}

/* ---------- editing an order a crew already sent ---------- */

export type OrderLine = { itemId: number; itemName: string; unit: string; qty: number };
export type OriginalRequest = { lines: OrderLine[]; otherItems: string };
export type OrderEdit = { editedBy: string; editedAt: string; changes: string[] };
export type EditMark = { editedBy: string; editedAt: string };

export type CrewOrder = {
  id: number;
  source: "crew-link" | "team-hub";
  accountId: string;
  accountName: string;
  status: TeamHubSupplyOrderStatus;
  orderedBy: string;
  createdAt: string;
  note: string;
  otherItems: string;
  lines: OrderLine[];
  /** "" when nobody edited it. */
  editedBy: string;
  editedAt: string;
};

export type CrewOrderDetail = CrewOrder & {
  canEdit: boolean;
  /** The order as the crew sent it. Null when nobody edited it. */
  original: OriginalRequest | null;
  edits: OrderEdit[];
  /** What can be added: the account's own list, or the whole catalog. */
  addable: CatalogItem[];
};

/** An order can be changed while it is New or Ordered; Delivered and Cancelled are read-only. */
export const orderIsOpen = (status: string) => status === "new" || status === "ordered";

const lineText = (line: { qty: number; itemName: string; unit: string }) => `${line.qty} × ${line.itemName} (${line.unit})`;

/** Who edited which of these orders, and when. Orders nobody edited are left out. */
export async function editMarksFor(orderIds: number[]): Promise<Record<number, EditMark>> {
  const ids = orderIds.filter((id) => Number.isInteger(id));
  if (ids.length === 0 || !(await crewSuppliesReady())) return {};
  const sql = getSql();
  const rows = (await sql`SELECT id, edited_by, edited_at FROM supply_orders WHERE id = ANY(${ids}::int[]) AND edited_at IS NOT NULL`) as { id: number; edited_by: string; edited_at: string | Date }[];
  return Object.fromEntries(rows.map((row) => [row.id, { editedBy: clean(row.edited_by), editedAt: iso(row.edited_at) }]));
}

/** Crew Link orders, newest first, for the Supply Orders page. */
export async function listCrewLinkOrders(limit = 100): Promise<CrewOrder[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, crew_link_account_id, status, reporter_name, created_at, note, other_items, edited_by, edited_at
    FROM supply_orders WHERE crew_link_account_id IS NOT NULL
    ORDER BY created_at DESC LIMIT ${limit}
  `) as { id: number; crew_link_account_id: string; status: TeamHubSupplyOrderStatus; reporter_name: string | null; created_at: string | Date; note: string | null; other_items: string | null; edited_by: string | null; edited_at: string | Date | null }[];
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [lineRows, names] = await Promise.all([
    sql`
      SELECT l.order_id, l.item_id, i.name, i.unit, l.qty FROM supply_order_lines l JOIN supply_items i ON i.id = l.item_id
      WHERE l.order_id = ANY(${ids}::int[]) ORDER BY lower(i.name)
    ` as unknown as Promise<{ order_id: number; item_id: number; name: string; unit: string; qty: number }[]>,
    lookupAccountSummaries([...new Set(rows.map((row) => row.crew_link_account_id))]),
  ]);
  return rows.map((row) => ({
    id: row.id,
    source: "crew-link" as const,
    accountId: row.crew_link_account_id,
    accountName: names.get(row.crew_link_account_id)?.accountName || row.crew_link_account_id,
    status: row.status,
    orderedBy: clean(row.reporter_name),
    createdAt: iso(row.created_at),
    note: clean(row.note),
    otherItems: clean(row.other_items),
    lines: lineRows.filter((line) => line.order_id === row.id).map((line) => ({ itemId: line.item_id, itemName: line.name, unit: line.unit, qty: line.qty })),
    editedBy: clean(row.edited_by),
    editedAt: iso(row.edited_at),
  }));
}

/** One order with everything the "Edit order" sheet shows. Null when there is no such order. */
export async function getCrewOrderDetail(orderId: number): Promise<CrewOrderDetail | null> {
  const order = await getSupplyOrderById(orderId);
  if (!order) return null;
  const sql = getSql();
  const accountId = order.crewLinkAccountId ?? (order.siteId !== null ? ((await getTeamHubSiteById(order.siteId))?.accountId ?? "") : "");
  const [extra, edits, names, addable] = await Promise.all([
    sql`SELECT edited_by, edited_at, original_request FROM supply_orders WHERE id = ${orderId}` as unknown as Promise<{ edited_by: string | null; edited_at: string | Date | null; original_request: OriginalRequest | null }[]>,
    sql`SELECT edited_by, edited_at, changes FROM supply_order_edits WHERE order_id = ${orderId} ORDER BY edited_at DESC, id DESC` as unknown as Promise<{ edited_by: string; edited_at: string | Date; changes: unknown }[]>,
    lookupAccountSummaries(accountId ? [accountId] : []),
    // A Team Hub crew has its own picker; staff may add anything from the catalog there.
    order.crewLinkAccountId ? activeItemsForAccount(order.crewLinkAccountId) : listCatalogItems(false),
  ]);
  const original = extra[0]?.original_request ?? null;
  return {
    id: order.id,
    source: order.crewLinkAccountId ? "crew-link" : "team-hub",
    accountId,
    accountName: names.get(accountId)?.accountName || accountId,
    status: order.status,
    orderedBy: clean(order.workerFirstName),
    createdAt: order.createdAt,
    note: order.note,
    otherItems: clean(order.otherItems),
    lines: order.lines.map((line) => ({ itemId: line.itemId, itemName: line.itemName, unit: line.unit, qty: line.qty })),
    editedBy: clean(extra[0]?.edited_by),
    editedAt: iso(extra[0]?.edited_at),
    canEdit: orderIsOpen(order.status),
    original: original && Array.isArray(original.lines) ? { lines: original.lines, otherItems: clean(original.otherItems) } : null,
    edits: edits.map((row) => ({ editedBy: clean(row.edited_by), editedAt: iso(row.edited_at), changes: Array.isArray(row.changes) ? row.changes.map((change) => String(change)) : [] })),
    addable,
  };
}

/**
 * Saves a staff edit of an order: new quantities, items taken off, items
 * added, the "other supplies" text. The first edit keeps a copy of the order
 * as the crew sent it. Returns the list of what changed ([] = nothing did,
 * and nothing was written).
 */
export async function editCrewOrder(orderId: number, input: { lines: { itemId: number; qty: number }[]; otherItems: string }, by: string): Promise<string[]> {
  const order = await getSupplyOrderById(orderId);
  if (!order) throw new Error("That order was not found.");
  if (!orderIsOpen(order.status)) throw new Error("This order is closed, so it cannot be changed.");

  const wanted = new Map<number, number>();
  for (const line of input.lines) {
    const itemId = Number(line.itemId);
    const qty = Math.min(999, Math.floor(Number(line.qty)));
    if (Number.isInteger(itemId) && Number.isFinite(qty) && qty > 0) wanted.set(itemId, qty);
  }
  const otherItems = clean(input.otherItems).slice(0, 1000);
  if (wanted.size === 0 && !otherItems) throw new Error("An order needs at least one item. To drop the whole order, cancel it instead.");

  const sql = getSql();
  const before = new Map(order.lines.map((line) => [line.itemId, line]));
  const newIds = [...wanted.keys()].filter((id) => !before.has(id));
  // An item that is added must be in the catalog and not removed from it.
  const known = newIds.length
    ? ((await sql`SELECT id, name, unit FROM supply_items WHERE id = ANY(${newIds}::int[]) AND active`) as { id: number; name: string; unit: string }[])
    : [];
  if (known.length !== newIds.length) throw new Error("One of the added items is not in the catalog any more. Close this and open it again.");
  const added = new Map(known.map((row) => [row.id, row]));

  const changes: string[] = [];
  for (const line of order.lines) {
    const qty = wanted.get(line.itemId);
    if (qty === undefined) changes.push(`Removed ${lineText(line)}`);
    else if (qty !== line.qty) changes.push(`${line.itemName}: ${line.qty} changed to ${qty}`);
  }
  for (const id of newIds) {
    const item = added.get(id)!;
    changes.push(`Added ${lineText({ qty: wanted.get(id)!, itemName: item.name, unit: item.unit })}`);
  }
  const otherBefore = clean(order.otherItems);
  if (otherItems !== otherBefore) {
    changes.push(!otherBefore ? `Other supplies added: "${otherItems}"` : !otherItems ? `Other supplies removed (was "${otherBefore}")` : `Other supplies changed from "${otherBefore}" to "${otherItems}"`);
  }
  if (changes.length === 0) return [];

  const snapshot: OriginalRequest = {
    lines: order.lines.map((line) => ({ itemId: line.itemId, itemName: line.itemName, unit: line.unit, qty: line.qty })),
    otherItems: otherBefore,
  };
  const ids = [...wanted.keys()];
  const qtys = ids.map((id) => wanted.get(id)!);
  await sql.transaction([
    sql`
      UPDATE supply_orders
      SET original_request = COALESCE(original_request, ${JSON.stringify(snapshot)}::jsonb),
          other_items = ${otherItems || null}, edited_by = ${by}, edited_at = now(), updated_at = now()
      WHERE id = ${orderId}
    `,
    sql`DELETE FROM supply_order_lines WHERE order_id = ${orderId}`,
    sql`INSERT INTO supply_order_lines (order_id, item_id, qty) SELECT ${orderId}, line.item_id, line.qty FROM unnest(${ids}::int[], ${qtys}::int[]) AS line(item_id, qty)`,
    sql`INSERT INTO supply_order_edits (order_id, edited_by, changes) VALUES (${orderId}, ${by}, ${JSON.stringify(changes)}::jsonb)`,
  ]);
  return changes;
}
