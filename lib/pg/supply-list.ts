// One supply list (migration 038). The Supplies page's products (sub_supplies)
// are the only list. Crew Link (and Team Hub) orders keep pointing at
// supply_items: each product gets one supply_items row, its "Crew Link face"
// (supply_items.sub_supply_id), made the first time the product is picked for
// an account or its Crew Link name is saved. That row carries what only crews
// see: the name they read, the brand, and "on the default list". Unit, photo,
// type and product code always come from the product.
//
// The 21 generic catalog items were taken out of every list by migration 038.
// Their rows stay only so past orders keep their names.

import { getSql } from "@/lib/db";
import { setAccountSupplyIds } from "@/lib/pg/crew-supplies";
import { ACTIVE_ITEM } from "@/lib/pg/supply-active";

const clean = (value: unknown) => String(value ?? "").trim();

/* ---------- is migration 038 in this database? ---------- */

let ready = false;

/** True once this database has one supply list and the two shelves (migration 038). Until then the screens hide them. */
export async function oneListReady(): Promise<boolean> {
  if (ready) return true;
  try {
    const rows = (await getSql()`
      SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'supply_items' AND column_name = 'sub_supply_id')
         AND to_regclass('public.site_shelf') IS NOT NULL
         AND to_regclass('public.supply_deliveries') IS NOT NULL AS ok
    `) as { ok: boolean }[];
    ready = rows[0]?.ok === true;
  } catch {
    ready = false;
  }
  return ready;
}

/* ---------- products ---------- */

export type Product = {
  /** sub_supplies.id */
  id: number;
  /** The Supplies page's row number ("SUP-<row>"). */
  rowNumber: number;
  /** The product's code: the Supplies list's item name ("Tor105065"). Staff only. */
  code: string;
  description: string;
  category: string;
  unit: string;
  photoUrl: string;
  active: boolean;
  /** Office shelf. null = never counted. */
  shelfCount: number | null;
  minLevel: number | null;
  /** Its Crew Link face, when it has one. */
  crewItemId: number | null;
  /** The name crews read. Until it is saved: worked out from the description. */
  crewName: string;
  brand: string;
  inDefaultList: boolean;
};

type ProductRow = {
  id: string | number;
  sheet_row: number;
  supply_item: string;
  description: string;
  category: string;
  unit: string;
  photo_url: string;
  is_active: boolean;
  shelf_count: number | null;
  min_level: number | null;
  item_id: number | null;
  item_name: string | null;
  brand: string | null;
  in_default_list: boolean | null;
};

/** The name a crew reads before the office writes one: the description's first words, else the code. */
export function startingCrewName(description: string, code: string): string {
  const text = clean(description).replace(/\s+/g, " ");
  if (!text) return clean(code);
  if (text.length <= 60) return text;
  const cut = text.slice(0, 60);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 30)).replace(/[\s,;:-]+$/, "")}…`;
}

const SELECT_PRODUCTS = `
  SELECT s.id, s.sheet_row, s.supply_item, s.description, s.category, s.unit, s.photo_url,
         (${ACTIVE_ITEM.replace(/supply_item|status|active_raw/g, (column) => `s.${column}`)}) AS is_active,
         s.shelf_count, s.min_level,
         i.id AS item_id, i.name AS item_name, i.brand, i.in_default_list
  FROM sub_supplies s
  LEFT JOIN supply_items i ON i.sub_supply_id = s.id
  WHERE btrim(s.supply_item) <> ''`;

function toProduct(row: ProductRow): Product {
  const code = clean(row.supply_item);
  const description = clean(row.description);
  return {
    id: Number(row.id),
    rowNumber: row.sheet_row,
    code,
    description,
    category: clean(row.category),
    unit: clean(row.unit),
    photoUrl: clean(row.photo_url),
    active: row.is_active === true,
    shelfCount: row.shelf_count,
    minLevel: row.min_level,
    crewItemId: row.item_id,
    crewName: clean(row.item_name) || startingCrewName(description, code),
    brand: clean(row.brand),
    inDefaultList: row.in_default_list === true,
  };
}

/** Every product, by its crew name. `includeInactive` adds the ones taken off the list. */
export async function listProducts(includeInactive = false): Promise<Product[]> {
  const rows = (await getSql().query(SELECT_PRODUCTS)) as ProductRow[];
  return rows
    .map(toProduct)
    .filter((product) => includeInactive || product.active)
    .sort((a, b) => a.crewName.localeCompare(b.crewName));
}

export async function getProduct(id: number): Promise<Product | null> {
  const rows = (await getSql().query(`${SELECT_PRODUCTS} AND s.id = $1`, [id])) as ProductRow[];
  return rows[0] ? toProduct(rows[0]) : null;
}

/* ---------- the Crew Link face ---------- */

/**
 * The product's crew item: made (from the product) when it has none, put back
 * when the product is in use, and given the product's unit, photo, type and
 * code. Returns its id.
 */
export async function ensureCrewItem(supplyId: number, by: string): Promise<number> {
  const product = await getProduct(supplyId);
  if (!product) throw new Error("That product is not on the Supplies list.");
  const sql = getSql();
  if (product.crewItemId === null) {
    const rows = (await sql`
      INSERT INTO supply_items (name, unit, sort_order, brand, product_line, photo_url, category, sku, in_default_list, active, sub_supply_id, updated_by, updated_at)
      SELECT ${product.crewName}, ${product.unit || "each"}, COALESCE(MAX(sort_order), 0) + 1, '', '', ${product.photoUrl}, ${product.category}, ${product.code}, false, ${product.active}, ${supplyId}, ${by}, now()
      FROM supply_items
      ON CONFLICT (sub_supply_id) WHERE sub_supply_id IS NOT NULL DO UPDATE SET updated_at = now()
      RETURNING id
    `) as { id: number }[];
    return rows[0].id;
  }
  await syncCrewItem(supplyId);
  return product.crewItemId;
}

/** Copies the product's unit, photo, type, code and in-use state onto its crew item (when it has one). Never throws. */
export async function syncCrewItem(supplyId: number): Promise<void> {
  try {
    if (!(await oneListReady())) return;
    await getSql().query(
      `UPDATE supply_items i
       SET unit = COALESCE(NULLIF(btrim(s.unit), ''), i.unit),
           photo_url = CASE WHEN btrim(s.photo_url) <> '' THEN s.photo_url ELSE i.photo_url END,
           category = btrim(s.category), sku = btrim(s.supply_item),
           active = (${ACTIVE_ITEM.replace(/supply_item|status|active_raw/g, (column) => `s.${column}`)}),
           updated_at = now()
       FROM sub_supplies s
       WHERE s.id = $1 AND i.sub_supply_id = s.id`,
      [supplyId]
    );
  } catch (error) {
    console.error("[supply list] sync crew item:", error instanceof Error ? error.message : error);
  }
}

/** The same, for a product known by its Supplies row number (the Supplies page's edits). Never throws. */
export async function syncCrewItemByRow(rowNumber: number): Promise<void> {
  try {
    if (!(await oneListReady())) return;
    const rows = (await getSql()`SELECT id FROM sub_supplies WHERE sheet_row = ${rowNumber}`) as { id: string | number }[];
    if (rows[0]) await syncCrewItem(Number(rows[0].id));
  } catch (error) {
    console.error("[supply list] sync crew item:", error instanceof Error ? error.message : error);
  }
}

/** The office saves what crews see for a product: its name, brand, and whether it is on the default list. */
export async function saveCrewFields(supplyId: number, input: { crewName: string; brand: string; inDefaultList: boolean }, by: string): Promise<Product> {
  const name = clean(input.crewName).slice(0, 120);
  if (!name) throw new Error("Write the name crews will read.");
  const itemId = await ensureCrewItem(supplyId, by);
  await getSql()`
    UPDATE supply_items SET name = ${name}, brand = ${clean(input.brand).slice(0, 80)}, in_default_list = ${input.inDefaultList === true}, updated_by = ${by}, updated_at = now()
    WHERE id = ${itemId}
  `;
  return (await getProduct(supplyId))!;
}

/* ---------- "Pick supplies for this account" ---------- */

/** The products picked for one account's Crew Link (product ids). */
export async function getAccountPicks(accountId: string): Promise<number[]> {
  const rows = (await getSql()`
    SELECT i.sub_supply_id FROM crew_link_account_supplies p JOIN supply_items i ON i.id = p.item_id
    WHERE p.account_id = ${accountId} AND i.sub_supply_id IS NOT NULL ORDER BY i.sub_supply_id
  `) as { sub_supply_id: string | number }[];
  return rows.map((row) => Number(row.sub_supply_id));
}

/** Makes the account's list exactly these products. Nothing ticked: the crew sees the default list. */
export async function setAccountPicks(accountId: string, supplyIds: number[], by: string): Promise<number[]> {
  const ids = [...new Set(supplyIds.filter((id) => Number.isInteger(id) && id > 0))];
  const itemIds: number[] = [];
  for (const id of ids) itemIds.push(await ensureCrewItem(id, by));
  await setAccountSupplyIds(accountId, itemIds, by);
  return getAccountPicks(accountId);
}

/* ---------- a sub-portal order line, by product ---------- */

/**
 * The product a sub-portal order line is for: the product it names ("SUP-<row>"
 * or its id), else the one product whose name matches exactly. Null for a
 * write-in ("Other / Not Listed") or where migration 038 is not in yet.
 */
export async function resolveSupplyId(input: { supplyId?: unknown; supplyItem?: unknown }): Promise<number | null> {
  if (!(await oneListReady())) return null;
  const sql = getSql();
  const given = clean(input.supplyId);
  const row = /^SUP-(\d+)$/i.exec(given)?.[1];
  if (row) {
    const rows = (await sql`SELECT id FROM sub_supplies WHERE sheet_row = ${Number(row)}`) as { id: string | number }[];
    if (rows[0]) return Number(rows[0].id);
  }
  const name = clean(input.supplyItem);
  if (!name) return null;
  const rows = (await sql`SELECT id FROM sub_supplies WHERE lower(btrim(supply_item)) = lower(${name})`) as { id: string | number }[];
  return rows.length === 1 ? Number(rows[0].id) : null;
}
