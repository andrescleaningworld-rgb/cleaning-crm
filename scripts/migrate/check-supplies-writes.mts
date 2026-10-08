// Exercises the Postgres writes in lib/pg/supplies.ts against the dev branch,
// checks the rows, and removes the test rows it made. Team Hub's own supply
// tables must come out untouched.
//   npx tsx scripts/migrate/check-supplies-writes.mts
import { loadEnv } from "./lib/env.mjs";
import { assertDevDatabase } from "./lib/guard.mjs";

loadEnv();
process.env.DATABASE_URL = assertDevDatabase(process.env.MIGRATION_DATABASE_URL);
process.env.OUTBOUND_DRY_RUN = "1";
process.env.DATA_SOURCE_SUPPLIES = "postgres";

const data = await import("../../lib/data/supplies");
const { getSql } = await import("../../lib/db");
const sql = getSql();

let failed = false;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` – ${detail}` : ""}`);
};
const rejects = async (fn: () => Promise<unknown>, message: string) => {
  try {
    await fn();
    return false;
  } catch (e) {
    return e instanceof Error && e.message === message;
  }
};

const NAME = "ZZ Migration Write Test";
const one = async <T,>(text: string, params: unknown[] = []) => ((await sql.query(text, params)) as T[])[0];
const count = async (table: string) => (await one<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).n;
const before = { supplies: await count("sub_supplies"), orders: await count("sub_supply_orders") };
const teamHubBefore = `${await count("supply_items")}/${await count("supply_orders")}/${await count("supply_order_lines")}`;
const lastSupply = (await one<{ n: number }>(`SELECT max(sheet_row)::int AS n FROM sub_supplies`)).n;
const lastOrder = (await one<{ n: number }>(`SELECT max(sheet_row)::int AS n FROM sub_supply_orders`)).n;
const imported = async () => (await one<{ h: string }>(`SELECT md5((SELECT string_agg(supply_item || status || active_raw || description, '|' ORDER BY sheet_row) FROM sub_supplies WHERE source_sheet IS NOT NULL) || (SELECT string_agg(order_id || status || email_status, '|' ORDER BY sheet_row) FROM sub_supply_orders WHERE source_sheet IS NOT NULL)) AS h`)).h;
const hashBefore = await imported();
const realSub = await one<{ email: string; id: string }>(`SELECT email, id FROM subcontractors WHERE btrim(email) <> '' AND (SELECT count(*) FROM subcontractors s2 WHERE lower(btrim(s2.email)) = lower(btrim(subcontractors.email))) = 1 ORDER BY id LIMIT 1`);
const realAccount = await one<{ id: string }>(`SELECT id FROM accounts WHERE id IS NOT NULL ORDER BY pk LIMIT 1`);

try {
  // ----- Supplies
  const added = await data.addSupplyItem({ supplyItem: `${NAME} towels`, category: "Paper", description: "2-ply", itemDescription: "2-ply", unit: "case", status: "Active", active: "yes", currentStock: "4", minimumStock: "2", notes: "" }, "Tester");
  check("addSupplyItem: the new item is last and its id is SUP-<row>", added.rowNumber === lastSupply + 1 && added.id === `SUP-${lastSupply + 1}`);
  let list = await data.getSupplyItemsAdminShape();
  let mine = list.find((i) => i.id === added.id);
  check("it is in the list with the values sent; notes falls back to the description", !!mine && mine.itemName === `${NAME} towels` && mine.name === mine.itemName && mine.category === "Paper" && mine.description === "2-ply" && mine.details === "2-ply" && mine.notes === "2-ply" && mine.unit === "case" && mine.status === "Active" && list.length === before.supplies + 1);
  const stored = await one<{ current_stock_raw: string; minimum_stock_raw: string; last_updated_raw: string; updated_by: string; active_raw: string; source_sheet: string | null }>(`SELECT current_stock_raw, minimum_stock_raw, last_updated_raw, updated_by, active_raw, source_sheet FROM sub_supplies WHERE sheet_row = $1`, [added.rowNumber]);
  check("stock, Last Updated (sheet format) and who saved are stored", stored.current_stock_raw === "4" && stored.minimum_stock_raw === "2" && /^\d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2}:\d{2}$/.test(stored.last_updated_raw) && stored.updated_by === "Tester" && stored.active_raw === "yes" && stored.source_sheet === null, stored.last_updated_raw);

  await data.updateSupplyItem({ supplyId: added.id, rowNumber: added.rowNumber, supplyItem: `${NAME} towels XL`, category: "Misc", description: "3-ply", unit: "box", status: "Office Only", active: "yes", notes: "ask first" });
  mine = (await data.getSupplyItemsAdminShape()).find((i) => i.id === added.id);
  check("updateSupplyItem changes name, category, description, unit, status; a real note is shown as the note", mine?.itemName === `${NAME} towels XL` && mine.category === "Misc" && mine.description === "3-ply" && mine.unit === "box" && mine.status === "Office Only" && mine.notes === "ask first");
  await data.updateSupplyItem({ supplyId: added.id, supplyItem: `${NAME} towels XL`, status: "", active: "yes" });
  mine = (await data.getSupplyItemsAdminShape()).find((i) => i.id === added.id);
  check("an edit found by SUP-<row> alone works; an empty status shows as Active", mine?.status === "Active" && mine.category === "");

  const kept = await one<{ current_stock_raw: string; minimum_stock_raw: string }>(`SELECT current_stock_raw, minimum_stock_raw FROM sub_supplies WHERE sheet_row = $1`, [added.rowNumber]);
  check("edits that send no stock numbers leave the stored ones alone", kept.current_stock_raw === "4" && kept.minimum_stock_raw === "2");

  await data.deactivateSupplyItem({ supplyId: added.id, rowNumber: added.rowNumber, status: "Inactive", active: "no" });
  list = await data.getSupplyItemsAdminShape();
  mine = list.find((i) => i.id === added.id);
  check("deactivateSupplyItem: status Inactive, still in the list, nothing deleted", mine?.status === "Inactive" && list.length === before.supplies + 1);
  check("an edit or removal of an unknown row is refused with the same words as before", (await rejects(() => data.updateSupplyItem({ rowNumber: 999999, supplyItem: "x" }), "Could not find supply item to update.")) && (await rejects(() => data.deactivateSupplyItem({ supplyId: "SUP-999999" }), "Could not find supply item to remove.")) && (await rejects(() => data.deactivateSupplyItem({}), "Could not find supply item to remove.")));
  check("an item with no name is refused", await rejects(() => data.addSupplyItem({ supplyItem: "  " }), "Supply item name is required."));

  // ----- Supply orders
  const first = await data.createSupplyOrder({ orderGroupId: "ZZ-GROUP", subcontractor: NAME, subcontractorEmail: "zz-nobody@example.com", accountName: NAME, accountId: "zz-none", supplyItem: "Trash liners", category: "Paper", description: "33 gal", quantity: "8 boxes", unit: "case", deliveryMode: "Pick Up", notes: "by Friday", status: "New" });
  const second = await data.createSupplyOrder({ orderGroupId: "ZZ-GROUP", subcontractorName: NAME, subcontractorEmail: realSub.email, accountName: "name that matches nothing", accountId: realAccount.id, itemName: "Other thing", quantity: "2", deliveryMode: "Deliver to Account" });
  check("createSupplyOrder: ids look like SUPORD-<14 digits>, rows go after the last one", /^SUPORD-\d{14}(-\d+)?$/.test(first.orderId) && first.rowNumber === lastOrder + 1 && second.rowNumber === lastOrder + 2, `${first.orderId} ${second.orderId}`);
  check("two items saved in the same second get different ids", first.orderId !== second.orderId);
  const orders = await data.getSupplyOrdersShape();
  const o1 = orders.find((o) => o.orderId === first.orderId);
  const o2 = orders.find((o) => o.orderId === second.orderId);
  check("the list is newest first and shows both", orders.length === before.orders + 2 && orders[0].orderId === second.orderId && orders[1].orderId === first.orderId);
  check("values as sent, date as YYYY-MM-DD, the group id, category and description are kept", !!o1 && /^\d{4}-\d{2}-\d{2}$/.test(o1.timestamp) && o1.orderGroupId === "ZZ-GROUP" && o1.subcontractor === NAME && o1.subcontractorName === NAME && o1.supplyItem === "Trash liners" && o1.item === "Trash liners" && o1.category === "Paper" && o1.description === "33 gal" && o1.quantity === "8 boxes" && o1.unit === "case" && o1.deliveryMode === "Pick Up" && o1.notes === "by Friday" && o1.status === "New" && o1.id === o1.orderId);
  check("an order with no status starts as New", o2?.status === "New");
  const links = (await sql.query(`SELECT order_id, subcontractor_id, account_ref, email_status FROM sub_supply_orders WHERE order_id = ANY($1::text[])`, [[first.orderId, second.orderId]])) as { order_id: string; subcontractor_id: string | null; account_ref: string | null; email_status: string }[];
  const l1 = links.find((l) => l.order_id === first.orderId)!;
  const l2 = links.find((l) => l.order_id === second.orderId)!;
  check("unknown sub and account stay unlinked; a real sub email and account ID are linked", l1.subcontractor_id === null && l1.account_ref === null && l2.subcontractor_id === realSub.id && l2.account_ref === realAccount.id);

  await data.markSupplyOrderEmail(first.rowNumber, "office@example.com", "Sent");
  check("markSupplyOrderEmail records where the email went", (await one<{ email_sent_to: string; email_status: string }>(`SELECT email_sent_to, email_status FROM sub_supply_orders WHERE sheet_row = $1`, [first.rowNumber])).email_status === "Sent");

  const byRow = await data.updateSupplyOrderStatus({ rowNumber: first.rowNumber, orderId: first.orderId, status: "Approved" });
  const byId = await data.updateSupplyOrderStatus({ orderId: second.orderId, orderStatus: "Denied" });
  const after = await data.getSupplyOrdersShape();
  check("updateSupplyOrderStatus by row + id, and by id alone", byRow.orderId === first.orderId && byId.status === "Denied" && after.find((o) => o.orderId === first.orderId)?.status === "Approved" && after.find((o) => o.orderId === second.orderId)?.status === "Denied");
  check("a row number that does not belong to that order id falls back to the id; unknown orders and an empty status are refused", (await data.updateSupplyOrderStatus({ rowNumber: 2, orderId: first.orderId, status: "Completed" })).orderId === first.orderId && (await rejects(() => data.updateSupplyOrderStatus({ orderId: "SUPORD-0", status: "Approved" }), "Could not find supply order to update.")) && (await rejects(() => data.updateSupplyOrderStatus({ orderId: first.orderId }), "Status is required.")));
  check("an order with no item is refused", await rejects(() => data.createSupplyOrder({ accountName: NAME }), "Supply item is required."));
  check("no imported row was touched", (await imported()) === hashBefore);
} finally {
  await sql.query(`DELETE FROM sub_supply_orders WHERE subcontractor = $1 AND source_sheet IS NULL`, [NAME]);
  await sql.query(`DELETE FROM sub_supplies WHERE supply_item LIKE $1 AND source_sheet IS NULL`, [`${NAME}%`]);
  check("test rows removed; counts are back to where they started", (await count("sub_supplies")) === before.supplies && (await count("sub_supply_orders")) === before.orders);
  check("no imported row was changed by the test", (await imported()) === hashBefore);
  check("Team Hub's supply tables are untouched", `${await count("supply_items")}/${await count("supply_orders")}/${await count("supply_order_lines")}` === teamHubBefore, teamHubBefore);
}

console.log(failed ? "\nFAILED" : "\nAll write checks passed.");
if (failed) process.exitCode = 1;
