// Exercises lib/pg/crew-supplies.ts (migration 033) against the dev branch:
// the catalog, the list of one account, and editing a sent order. It makes
// its own test item, test account list and test order, checks them, and
// removes them again. The real items and orders must come out untouched.
//   npx tsx scripts/migrate/check-crew-supplies.mts
import { loadEnv } from "./lib/env.mjs";
import { assertDevDatabase } from "./lib/guard.mjs";

loadEnv();
process.env.DATABASE_URL = assertDevDatabase(process.env.MIGRATION_DATABASE_URL);
process.env.OUTBOUND_DRY_RUN = "1";
process.env.DATA_SOURCE_ACCOUNTS = "postgres";

const crew = await import("../../lib/pg/crew-supplies");
const hub = await import("../../lib/teamHubDb");
const { getSql } = await import("../../lib/db");
const sql = getSql();

let failed = false;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` – ${detail}` : ""}`);
};
const rejects = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
};

const ACCOUNT = "zz-check-crew-supplies";
const OTHER = "zz-check-crew-supplies-2";
const counts = async () => (await sql`SELECT (SELECT count(*)::int FROM supply_items) AS items, (SELECT count(*)::int FROM supply_orders) AS orders, (SELECT count(*)::int FROM supply_order_lines) AS lines`)[0] as { items: number; orders: number; lines: number };
const before = await counts();
let itemId = 0;
let extraItemId = 0;
let orderId = 0;

try {
  check("migration 033 is in this database", await crew.crewSuppliesReady());

  // ----- the catalog -----
  const existing = await crew.listCatalogItems(false);
  check("the catalog lists the items that were there", existing.length === before.items || existing.length > 0, `${existing.length} active`);
  const made = await crew.saveCatalogItem({ name: "ZZ check item", brand: "CheckBrand", productLine: "Line A", unit: "gallon" }, "check");
  itemId = made!.id;
  check("add: name, brand, product line and unit are kept", made!.brand === "CheckBrand" && made!.productLine === "Line A" && made!.unit === "gallon" && made!.active);
  const changed = await crew.saveCatalogItem({ id: itemId, name: "ZZ check item 2", brand: "CheckBrand", productLine: "Line B", unit: "case", photoUrl: "https://example.test/p.jpg" }, "check");
  check("edit: the changes are kept", changed!.name === "ZZ check item 2" && changed!.productLine === "Line B" && changed!.photoUrl.endsWith("p.jpg"));
  const kept = await crew.saveCatalogItem({ id: itemId, name: "ZZ check item 2", brand: "CheckBrand", productLine: "Line B", unit: "case" }, "check");
  check("edit with no new photo keeps the photo", kept!.photoUrl.endsWith("p.jpg"));
  check("edit of an unknown id answers null", (await crew.saveCatalogItem({ id: 2_000_000_000, name: "x", brand: "", productLine: "", unit: "" }, "check")) === null);

  // ----- the type and the product code (migration 035) -----
  check("migration 035 is in this database", await crew.catalogTypesReady());
  check("an item starts with no type and no product code", kept!.category === "" && kept!.sku === "");
  const typed = await crew.saveCatalogItem({ id: itemId, name: "ZZ check item 2", brand: "CheckBrand", productLine: "Line B", unit: "case", category: "  ZZ Check Type ", sku: " ZZ-123 " }, "check");
  check("the type and the product code are saved, trimmed", typed!.category === "ZZ Check Type" && typed!.sku === "ZZ-123" && typed!.name === "ZZ check item 2" && typed!.photoUrl.endsWith("p.jpg"));
  check("the catalog list carries them", (await crew.listCatalogItems(true)).some((item) => item.id === itemId && item.category === "ZZ Check Type" && item.sku === "ZZ-123"));
  const withTypes = await crew.saveCatalogItem({ name: "ZZ check item 3", brand: "", productLine: "", unit: "box", category: "ZZ Check Type", sku: "ZZ-456" }, "check");
  extraItemId = withTypes!.id;
  check("a new item can be given both when it is added", withTypes!.category === "ZZ Check Type" && withTypes!.sku === "ZZ-456");
  // What a crew is sent is built from this list (app/api/porter-checklist/[code]/supplies): no product code, no type.
  const crewList = await hub.listSupplyItemsLibrary(true);
  const crewItem = crewList.find((item) => item.id === itemId) as Record<string, unknown> | undefined;
  check("the list the crew screen is built from has no product code and no type", Boolean(crewItem) && !("sku" in crewItem!) && !("category" in crewItem!) && !JSON.stringify(crewItem).includes("ZZ-123"));
  await sql`DELETE FROM supply_items WHERE id = ${extraItemId}`;
  extraItemId = 0;

  // ----- the list of one account -----
  const two = existing.slice(0, 2).map((item) => item.id);
  // ----- the default list (migration 036) -----
  const defaults = existing.filter((item) => item.inDefaultList).length;
  check("migration 036 is in this database", await crew.defaultListReady());
  check("no list yet: the account has no picks of its own", (await crew.pickedItemIdsForCrew(ACCOUNT)) === null);
  check("a new item is NOT on the default list", made!.inDefaultList === false);
  check("no list yet: the crew gets the default list, not the whole catalog", (await crew.activeItemsForAccount(ACCOUNT)).length === defaults && (await crew.activeItemsForAccount(ACCOUNT)).every((item) => item.id !== itemId), `${defaults} of ${existing.length + 1} active`);
  check("an item can be put on the default list", (await crew.setCatalogItemDefault(itemId, true, "check")) && (await crew.activeItemsForAccount(ACCOUNT)).some((item) => item.id === itemId));
  check("and taken off it again", (await crew.setCatalogItemDefault(itemId, false, "check")) && (await crew.activeItemsForAccount(ACCOUNT)).length === defaults);
  check("switching an unknown item answers false", (await crew.setCatalogItemDefault(2_000_000_000, true, "check")) === false);
  await crew.setAccountSupplyIds(ACCOUNT, [...two, itemId], "check");
  check("picked items are saved", (await crew.getAccountSupplyIds(ACCOUNT)).length === two.length + 1);
  check("the crew sees only the picked items", (await crew.pickedItemIdsForCrew(ACCOUNT))?.size === two.length + 1 && (await crew.activeItemsForAccount(ACCOUNT)).length === two.length + 1);
  await crew.setAccountSupplyIds(OTHER, [itemId], "check");
  const lists = await crew.listAccountsWithLists();
  check("accounts with a list are offered for copying", lists.some((entry) => entry.accountId === ACCOUNT && entry.count === two.length + 1) && lists.some((entry) => entry.accountId === OTHER));

  // Remove (hide) the test item: it leaves the crew's list but is not deleted.
  await crew.setCatalogItemActive(itemId, false, "check");
  check("a removed item is hidden from the crew", (await crew.activeItemsForAccount(ACCOUNT)).every((item) => item.id !== itemId));
  check("a removed item is still in the catalog (hidden)", (await crew.listCatalogItems(true)).some((item) => item.id === itemId && !item.active));
  check("an account whose only pick was removed gets the default list again", (await crew.activeItemsForAccount(OTHER)).length === defaults);
  await crew.setCatalogItemActive(itemId, true, "check");
  await crew.setAccountSupplyIds(OTHER, [], "check");
  check("an emptied list is gone", (await crew.getAccountSupplyIds(OTHER)).length === 0);

  // ----- editing a sent order -----
  if (two.length === 2) {
    const [a, b] = two;
    const made = (await sql`INSERT INTO supply_orders (crew_link_account_id, reporter_name, note, other_items) VALUES (${ACCOUNT}, 'Check', '', 'two mops') RETURNING id`) as { id: number }[];
    orderId = made[0].id;
    await sql`INSERT INTO supply_order_lines (order_id, item_id, qty) VALUES (${orderId}, ${a}, 2), (${orderId}, ${b}, 5)`;

    const fresh = await crew.getCrewOrderDetail(orderId);
    check("a new order can be edited and has no original yet", fresh!.canEdit && fresh!.original === null && fresh!.editedAt === "" && fresh!.lines.length === 2);
    check("what can be added is the account's own list", fresh!.addable.length === two.length + 1);
    check("saving with no change writes nothing", (await crew.editCrewOrder(orderId, { lines: [{ itemId: a, qty: 2 }, { itemId: b, qty: 5 }], otherItems: "two mops" }, "Office")).length === 0 && (await crew.getCrewOrderDetail(orderId))!.editedAt === "");

    const changes = await crew.editCrewOrder(orderId, { lines: [{ itemId: a, qty: 3 }, { itemId: itemId, qty: 1 }], otherItems: "three mops" }, "Office");
    check("an edit lists a new quantity, a removed item, an added item and the other supplies", changes.length === 4, changes.join(" | "));
    const after = await crew.getCrewOrderDetail(orderId);
    check("the order now shows the edited version", after!.lines.length === 2 && after!.lines.some((line) => line.itemId === a && line.qty === 3) && after!.lines.some((line) => line.itemId === itemId) && after!.otherItems === "three mops");
    check("it says who edited it and when", after!.editedBy === "Office" && after!.editedAt !== "");
    check("the original request is kept", after!.original !== null && after!.original.lines.length === 2 && after!.original.lines.some((line) => line.itemId === b && line.qty === 5) && after!.original.otherItems === "two mops");

    await crew.editCrewOrder(orderId, { lines: [{ itemId: a, qty: 4 }], otherItems: "" }, "Owner");
    const twice = await crew.getCrewOrderDetail(orderId);
    check("a second edit keeps the FIRST original", twice!.original!.lines.length === 2 && twice!.original!.otherItems === "two mops" && twice!.editedBy === "Owner");
    check("every edit is in the history, newest first", twice!.edits.length === 2 && twice!.edits[0].editedBy === "Owner" && twice!.edits[1].editedBy === "Office");
    check("the edit mark is found for lists", (await crew.editMarksFor([orderId]))[orderId]?.editedBy === "Owner");
    check("the Supply Orders list carries the edited order", (await crew.listCrewLinkOrders()).some((order) => order.id === orderId && order.editedBy === "Owner" && order.lines.length === 1));

    check("an order cannot be emptied", await rejects(() => crew.editCrewOrder(orderId, { lines: [], otherItems: "" }, "Office")));
    check("an item that is not in the catalog cannot be added", await rejects(() => crew.editCrewOrder(orderId, { lines: [{ itemId: 2_000_000_000, qty: 1 }], otherItems: "" }, "Office")));

    await sql`UPDATE supply_orders SET status = 'ordered' WHERE id = ${orderId}`;
    check("an Ordered order can still be edited", (await crew.editCrewOrder(orderId, { lines: [{ itemId: a, qty: 6 }], otherItems: "" }, "Office")).length === 1);
    for (const status of ["delivered", "cancelled"]) {
      await sql`UPDATE supply_orders SET status = ${status} WHERE id = ${orderId}`;
      const closed = await crew.getCrewOrderDetail(orderId);
      check(`a ${status} order is read-only`, !closed!.canEdit && (await rejects(() => crew.editCrewOrder(orderId, { lines: [{ itemId: a, qty: 9 }], otherItems: "" }, "Office"))));
    }
    check("the refused edits changed nothing", (await crew.getCrewOrderDetail(orderId))!.lines[0].qty === 6);
  } else {
    check("order editing (needs two catalog items in this database)", false, "not enough items to test with");
  }
} finally {
  // Take the test rows out again.
  if (orderId) await sql`DELETE FROM supply_orders WHERE id = ${orderId}`;
  await sql`DELETE FROM crew_link_account_supplies WHERE account_id IN (${ACCOUNT}, ${OTHER})`;
  if (extraItemId) await sql`DELETE FROM supply_items WHERE id = ${extraItemId}`;
  if (itemId) await sql`DELETE FROM supply_items WHERE id = ${itemId}`;
}

const after = await counts();
check("the real items, orders and lines are untouched", after.items === before.items && after.orders === before.orders && after.lines === before.lines, JSON.stringify(after));
const leftovers = (await sql`SELECT (SELECT count(*)::int FROM supply_order_edits e WHERE NOT EXISTS (SELECT 1 FROM supply_orders o WHERE o.id = e.order_id)) AS orphan_edits, (SELECT count(*)::int FROM supply_orders WHERE edited_at IS NOT NULL) AS edited_orders`)[0] as { orphan_edits: number; edited_orders: number };
check("no test edits are left behind", leftovers.orphan_edits === 0, JSON.stringify(leftovers));

console.log(failed ? "\nSOME CHECKS FAILED" : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
