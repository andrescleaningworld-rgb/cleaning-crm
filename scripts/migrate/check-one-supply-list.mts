// Exercises one supply list and the two shelves (migrations 038 and 039:
// lib/pg/supply-list.ts, lib/pg/shelves.ts, back orders) against the dev branch. It uses a
// made-up account, two real products, its own test orders, and takes every
// test row out again: the office shelf counts, products, orders and moves
// that were there must come out exactly as they were.
//   npx tsx scripts/migrate/check-one-supply-list.mts
import { loadEnv } from "./lib/env.mjs";
import { assertDevDatabase } from "./lib/guard.mjs";

loadEnv();
process.env.DATABASE_URL = assertDevDatabase(process.env.MIGRATION_DATABASE_URL);
process.env.OUTBOUND_DRY_RUN = "1";
process.env.DATA_SOURCE_ACCOUNTS = "postgres";

const list = await import("../../lib/pg/supply-list");
const shelves = await import("../../lib/pg/shelves");
const crew = await import("../../lib/pg/crew-supplies");
const supplies = await import("../../lib/pg/supplies");
const control = await import("../../lib/pg/supply-control");
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

const ACCOUNT = "zz-check-shelves";
const ACCOUNT_NAME = "ZZ Check Shelves";
const totals = async () =>
  (await sql`SELECT
    (SELECT count(*)::int FROM sub_supplies) AS products,
    (SELECT count(*)::int FROM supply_orders) AS crew_orders,
    (SELECT count(*)::int FROM supply_order_lines) AS crew_lines,
    (SELECT count(*)::int FROM sub_supply_orders) AS sub_lines,
    (SELECT count(*)::int FROM supply_moves) AS moves,
    (SELECT count(*)::int FROM supply_deliveries) AS deliveries,
    (SELECT count(*)::int FROM site_shelf) AS site_rows,
    (SELECT count(*)::int FROM supply_items) AS items`)[0] as Record<string, number>;
const before = await totals();

check("migration 038 is in this database", await list.oneListReady());
const products = await list.listProducts(false);
check("the Supplies products are the list", products.length > 1, `${products.length} in use`);
const [p1, p2] = products;
const shelfBefore = (await sql`SELECT id, shelf_count, updated_by, updated_at::text FROM sub_supplies WHERE id = ANY(${[p1.id, p2.id]}::bigint[])`) as { id: string | number; shelf_count: number | null; updated_by: string; updated_at: string }[];
const crewBefore = new Set(((await sql`SELECT sub_supply_id FROM supply_items WHERE sub_supply_id = ANY(${[p1.id, p2.id]}::bigint[])`) as { sub_supply_id: string | number }[]).map((row) => Number(row.sub_supply_id)));
// The crew items those two products already had (practice: hidden copies): put back exactly afterwards.
type ItemSnap = { id: number; name: string; brand: string; active: boolean; in_default_list: boolean; unit: string; photo_url: string; category: string; sku: string; updated_by: string; updated_at: string | null };
const itemsBefore = (await sql`SELECT id, name, brand, active, in_default_list, unit, photo_url, category, sku, updated_by, updated_at::text FROM supply_items WHERE sub_supply_id = ANY(${[p1.id, p2.id]}::bigint[])`) as ItemSnap[];
let crewOrderId = 0;
// p2 gets a made-up cost for the lost check (most dev products have none); put back in finally.
let p2CostBefore: { id: number; cost: string | null } | null = null;

try {
  // ----- one list: picks -----
  check("a product's crew name starts from its description", p1.crewName.length > 0);
  const picked = await list.setAccountPicks(ACCOUNT, [p1.id, p2.id], "check");
  check("picking two products saves them", picked.length === 2 && picked.includes(p1.id) && picked.includes(p2.id));
  const crewSees = await crew.activeItemsForAccount(ACCOUNT);
  const crewIds = new Set(((await sql`SELECT id FROM supply_items WHERE sub_supply_id = ANY(${[p1.id, p2.id]}::bigint[])`) as { id: number }[]).map((row) => row.id));
  check("the crew's Order screen shows exactly those products", crewSees.length === 2 && crewSees.every((item) => crewIds.has(item.id)));
  check("the generic catalog items are on no list", (await sql`SELECT count(*)::int AS n FROM supply_items WHERE sub_supply_id IS NULL AND (active OR in_default_list)`)[0].n === 0);
  const saved = await list.saveCrewFields(p1.id, { crewName: "ZZ Check Paper Towel", brand: "ZZBrand", inDefaultList: false }, "check");
  check("the office can rename what crews read, and set the brand", saved.crewName === "ZZ Check Paper Towel" && saved.brand === "ZZBrand");
  check("a crew name cannot be empty", await rejects(() => list.saveCrewFields(p1.id, { crewName: " ", brand: "", inDefaultList: false }, "check")));

  // ----- sub-portal orders by product ID -----
  const byName = await supplies.createSupplyOrder({ supplyItem: p2.code, quantity: "2", unit: p2.unit, accountName: ACCOUNT_NAME, accountId: ACCOUNT, orderGroupId: "ZZ-CHECK-GROUP", subcontractor: "ZZ Sub", status: "New" });
  const byRow = await supplies.createSupplyOrder({ supplyItem: "anything", supplyId: `SUP-${p1.rowNumber}`, quantity: "1", accountName: ACCOUNT_NAME, accountId: ACCOUNT, orderGroupId: "ZZ-CHECK-GROUP", subcontractor: "ZZ Sub", status: "New" });
  const writeIn = await supplies.createSupplyOrder({ supplyItem: "Other / Not Listed - zz test", quantity: "1", accountName: ACCOUNT_NAME, accountId: ACCOUNT, orderGroupId: "ZZ-CHECK-GROUP-2", subcontractor: "ZZ Sub", status: "Needs Review" });
  const idOf = async (row: number) => ((await sql`SELECT supply_id FROM sub_supply_orders WHERE sheet_row = ${row}`) as { supply_id: string | number | null }[])[0].supply_id;
  check("a sub order line by name gets the product's ID", Number(await idOf(byName.rowNumber)) === p2.id);
  check("a sub order line with the product sent gets that product's ID", Number(await idOf(byRow.rowNumber)) === p1.id);
  check("a write-in line has no product", (await idOf(writeIn.rowNumber)) === null);

  // ----- + Stock came in (migration 040) -----
  const office = async (id: number) => ((await sql`SELECT shelf_count FROM sub_supplies WHERE id = ${id}`) as { shelf_count: number | null }[])[0].shelf_count ?? 0;
  const held = async (id: number) => ((await sql`SELECT warehouse_qty FROM site_shelf WHERE account_id = ${ACCOUNT} AND supply_id = ${id}`) as { warehouse_qty: number }[])[0]?.warehouse_qty ?? 0;
  const atSite = async (id: number) => ((await sql`SELECT qty FROM site_shelf WHERE account_id = ${ACCOUNT} AND supply_id = ${id}`) as { qty: number }[])[0]?.qty ?? 0;
  check("migrations 039 and 040 are in this database", await shelves.shelvesReady());
  const startA = await office(p1.id);
  await shelves.stockCameIn({ lines: [{ supplyId: p1.id, qty: 10 }], vendor: "ZZ Vendor", by: "check" });
  check("📥 Stock came in adds to the warehouse", (await office(p1.id)) === startA + 10);
  check("📥 needs something that came in", await rejects(() => shelves.stockCameIn({ lines: [{ supplyId: p1.id, qty: 0 }], vendor: "", by: "check" })));
  const officeP2 = await office(p2.id);
  await shelves.stockCameIn({ lines: [{ supplyId: p2.id, qty: 1 }], vendor: "", ownerAccountId: ACCOUNT, ownerAccountName: ACCOUNT_NAME, by: "check" });
  check("🏷 bought for a customer: kept at the warehouse for them", (await held(p2.id)) === 1 && (await office(p2.id)) === officeP2);
  check("🏷 it is not at their site yet", (await atSite(p2.id)) === 0 && !(await shelves.siteShelves(ACCOUNT))[0]?.tiles.some((tile) => tile.supplyId === p2.id));

  // ----- a Crew Link order: New, then ✓ Approve + 🚐 We deliver -----
  const [itemA, itemB] = [...crewIds];
  crewOrderId = ((await sql`INSERT INTO supply_orders (crew_link_account_id, reporter_name, note) VALUES (${ACCOUNT}, 'ZZ Crew', '') RETURNING id`) as { id: number }[])[0].id;
  await sql`INSERT INTO supply_order_lines (order_id, item_id, qty) VALUES (${crewOrderId}, ${itemA}, 3), (${crewOrderId}, ${itemB}, 2)`;
  const crewStatus = async () => ((await sql`SELECT status FROM supply_orders WHERE id = ${crewOrderId}`) as { status: string }[])[0].status;
  let waiting = await shelves.waiting(ACCOUNT);
  check("a new Crew Link order is not on its way yet (it needs approving)", !waiting.some((entry) => entry.source === "crew-order" && entry.ref === String(crewOrderId)));
  check("a new sub-portal order is not on its way either", !waiting.some((entry) => entry.ref === "ZZ-CHECK-GROUP"));
  const crewOrder = { source: "crew-order" as const, refs: [String(crewOrderId)] };
  const sheet = await shelves.approveSheet(crewOrder);
  check("✓ the Approve sheet shows the crew's lines, with their products", sheet.lines.length === 2 && sheet.lines.every((line) => line.supplyId === p1.id || line.supplyId === p2.id));
  check("✓ a Crew Link order needs a way to fill it", await rejects(() => shelves.approveOrder({ order: crewOrder, lines: [], add: [], fill: "", by: "check" })));
  await shelves.approveOrder({ order: crewOrder, lines: sheet.lines.map((line) => ({ lineId: line.lineId, qty: line.supplyId === p1.id ? line.qty + 1 : line.qty, supplyId: line.supplyId })), add: [], fill: "deliver", by: "check" });
  check("✓ approved: the Crew Link order is Ordered", (await crewStatus()) === "ordered");
  check("✓ a changed number is an edit, written down", ((await sql`SELECT count(*)::int AS n FROM supply_order_edits WHERE order_id = ${crewOrderId}`)[0] as { n: number }).n === 1);
  check("✓ an approved order cannot be approved twice", await rejects(() => shelves.approveOrder({ order: crewOrder, lines: [], add: [], fill: "vendor", by: "check" })));
  waiting = await shelves.waiting(ACCOUNT);
  const ready = waiting.find((entry) => entry.source === "crew-order" && entry.ref === String(crewOrderId))!;
  const ordered = new Map((ready?.lines ?? []).map((line) => [line.supplyId, line.qty]));
  const lineFor = (supplyId: number) => ordered.get(supplyId) ?? 0;
  check("🚐 We deliver: it waits for the tablet, not the crew", ready?.fill === "deliver" && !ready.sentAt && !(await shelves.crewShelfView(ACCOUNT)).waiting.some((entry) => entry.key === ready.key));
  check("✓ the new number is on the delivery", lineFor(p1.id) === 4);

  // ----- taken on the tablet -----
  const officeA = await office(p1.id);
  const heldBefore = await held(p2.id);
  const officeB = await office(p2.id);
  await shelves.sendToSite({ key: ready.key, by: "check", source: "tablet" });
  check("🚐 taken on the tablet: off the warehouse", (await office(p1.id)) === Math.max(officeA - lineFor(p1.id), 0));
  check("🏷 their own stock at the warehouse goes first", (await held(p2.id)) === Math.max(heldBefore - lineFor(p2.id), 0) && (await office(p2.id)) === Math.max(officeB - Math.max(lineFor(p2.id) - heldBefore, 0), 0));
  check("🚐 the same order cannot be taken twice", await rejects(() => shelves.sendToSite({ key: ready.key, by: "check" })));
  waiting = await shelves.waiting(ACCOUNT);
  const sent = waiting.find((entry) => entry.source === "crew-order" && entry.ref === String(crewOrderId));
  check("🚚 now it waits for the crew", Boolean(sent?.sentAt) && (await shelves.crewShelfView(ACCOUNT)).waiting.some((entry) => entry.key === sent!.key));
  check("📝 the history knows it was the tablet", ((await sql`SELECT count(*)::int AS n FROM supply_moves WHERE account_id = ${ACCOUNT} AND kind = 'send' AND source = 'tablet'`)[0] as { n: number }).n > 0);

  // ----- 3. Supplies arrived (one short: a back order) -----
  const got = sent!.lines.map((line) => (line.supplyId === p2.id ? line.qty - 1 : line.qty));
  const arrived = await shelves.confirmArrival({ accountId: ACCOUNT, key: sent!.key, got, by: "ZZ Crew" });
  check("📦 a short item is reported", arrived.short.length === 1 && arrived.short[0].supplyId === p2.id && arrived.extra.length === 0);
  const site = async (id: number) => ((await sql`SELECT qty FROM site_shelf WHERE account_id = ${ACCOUNT} AND supply_id = ${id}`) as { qty: number }[])[0]?.qty ?? 0;
  check("📦 only what came is on the site shelf", (await site(p1.id)) === lineFor(p1.id) && (await site(p2.id)) === lineFor(p2.id) - 1);
  check("📦 the Crew Link order is not Delivered yet (Back order)", (await crewStatus()) === "ordered");
  check("📦 the office sees it as different (short)", (await shelves.differentDeliveries()).some((entry) => entry.accountId === ACCOUNT && entry.short && !entry.extra && entry.lines.length === 1 && entry.lines[0].includes("1 on back order")));
  const paper = (await sql`SELECT count(*)::int AS n FROM handoff_items WHERE account_id = ${ACCOUNT} AND board_pinned_at IS NOT NULL AND COALESCE(board_square, '') = '' AND data->>'box' = 'supply'`)[0] as { n: number };
  console.log(`info  Pin Board paper in the Supply orders square: ${paper.n} (0 when the board is switched off here)`);
  check("📦 a confirmed delivery is not waiting any more", !(await shelves.waiting(ACCOUNT)).some((entry) => entry.key === sent!.key));
  const back = (await shelves.waiting(ACCOUNT)).find((entry) => entry.backOrder && entry.source === "crew-order");
  check("⏳ the missing 1 waits as a back order of the same order", Boolean(back) && back!.ref === String(crewOrderId) && back!.lines.length === 1 && back!.lines[0].supplyId === p2.id && back!.lines[0].qty === 1 && Boolean(back!.sentAt));
  check("⏳ the crew sees it on its way", (await shelves.crewShelfView(ACCOUNT)).waiting.some((entry) => entry.key === back!.key && entry.backOrder));
  check("⏳ a second tap on the same delivery does nothing", await rejects(() => shelves.confirmArrival({ accountId: ACCOUNT, key: sent!.key, got, by: "ZZ Crew" })));

  // ----- the back order arrives, with one extra -----
  const p2Before = await site(p2.id);
  const late = await shelves.confirmArrival({ accountId: ACCOUNT, key: back!.key, got: [2], by: "ZZ Crew" });
  check("📦 extra is reported", late.extra.length === 1 && late.short.length === 0);
  check("📦 the extra goes on the site shelf too", (await site(p2.id)) === p2Before + 2);
  check("📦 now the Crew Link order is Delivered", (await crewStatus()) === "delivered");
  check("📦 the office sees it as different (extra)", (await shelves.differentDeliveries()).some((entry) => entry.accountId === ACCOUNT && entry.extra && entry.title === "Arrived extra" && entry.lines[0].includes("1 extra")));
  check("📦 no new back order after a full one", !(await shelves.waiting(ACCOUNT)).some((entry) => entry.backOrder && entry.source === "crew-order"));

  // ----- the sub-portal order: approved now, filled later (vendor ships) -----
  const subOrder = { source: "sub-order" as const, refs: ["ZZ-CHECK-GROUP"] };
  const subStatuses = async (group: string) => ((await sql`SELECT DISTINCT status FROM sub_supply_orders WHERE order_group_id = ${group}`) as { status: string }[]).map((row) => row.status).sort().join(",");
  await shelves.approveOrder({ order: subOrder, lines: [], add: [], fill: "", by: "check" });
  check("✓ a sub-portal order can be approved now and filled later", (await subStatuses("ZZ-CHECK-GROUP")) === "Approved" && !(await shelves.waiting(ACCOUNT)).some((entry) => entry.ref === "ZZ-CHECK-GROUP"));
  await shelves.chooseFill({ order: subOrder, fill: "vendor", by: "check" });
  const subEntry = (await shelves.waiting(ACCOUNT)).find((entry) => entry.source === "sub-order" && entry.ref === "ZZ-CHECK-GROUP" && !entry.backOrder)!;
  check("🚚 Vendor ships: the order is on its way, and the crew sees it at once", (await subStatuses("ZZ-CHECK-GROUP")) === "Pending / In Progress" && subEntry?.fill === "vendor" && (await shelves.crewShelfView(ACCOUNT)).waiting.some((entry) => entry.key === subEntry.key));

  // ----- one item never came, then "Lost / never coming" -----
  const siteA = await site(p1.id);
  await shelves.confirmArrival({ accountId: ACCOUNT, key: subEntry.key, got: subEntry.lines.map((line) => (line.supplyId === p2.id ? 0 : line.qty)), by: "ZZ Sub" });
  check("📦 a sub-portal order: what came is on the site shelf", (await site(p1.id)) === siteA + 1);
  const subOpen = async () => ((await sql`SELECT count(*)::int AS n FROM sub_supply_orders WHERE order_group_id = 'ZZ-CHECK-GROUP' AND status <> 'Completed'`)[0] as { n: number }).n;
  check("⏳ the sub-portal order is not Completed while something is on back order", (await subOpen()) > 0);
  const subBack = (await shelves.waiting(ACCOUNT)).find((entry) => entry.backOrder && entry.source === "sub-order");
  check("⏳ the sub-portal back order waits", Boolean(subBack) && subBack!.ref === "ZZ-CHECK-GROUP" && subBack!.lines[0].supplyId === p2.id);
  check("⏳ cancel needs a real choice", await rejects(() => shelves.cancelBackOrder({ key: subBack!.key, index: 0, choice: "maybe" as "lost", by: "check" })));
  const officeLost = await office(p2.id);
  const lost = await shelves.cancelBackOrder({ key: subBack!.key, index: 0, choice: "lost", by: "check" });
  check("✗ lost: the back order is closed", lost.closed && !(await shelves.waiting(ACCOUNT)).some((entry) => entry.key === subBack!.key));
  check("✗ lost: the office shelf does not change", (await office(p2.id)) === officeLost);
  check("✗ lost: the move is kept", ((await sql`SELECT count(*)::int AS n FROM supply_moves WHERE account_id = ${ACCOUNT} AND kind = 'lost'`)[0] as { n: number }).n === 1);
  check("✗ lost: the sub-portal order is Completed (something came)", (await subOpen()) === 0);
  check("✗ a cancelled back order cannot be cancelled again", await rejects(() => shelves.cancelBackOrder({ key: subBack!.key, index: 0, choice: "lost", by: "check" })));

  // ----- a typed-in line matched to a product; 🏬 the sub picks it up -----
  const typed = { source: "sub-order" as const, refs: ["ZZ-CHECK-GROUP-2"] };
  const typedSheet = await shelves.approveSheet(typed);
  check("✓ the Approve sheet shows a typed-in line, with no product yet", typedSheet.lines.length === 1 && typedSheet.lines[0].supplyId === null && typedSheet.lines[0].label === "zz test");
  const typedApproved = await shelves.approveOrder({ order: typed, lines: [{ lineId: typedSheet.lines[0].lineId, qty: 2, supplyId: p1.id }], add: [], fill: "pickup", by: "check" });
  check("✓ Approve says what it changed (for the activity log)", typedApproved.changes.includes("zz test: 1 -> 2") && typedApproved.changes.some((change) => change.startsWith("zz test: product ")));
  check("✓ the typed-in line now points at the product, with the new number", Number(await idOf(writeIn.rowNumber)) === p1.id && ((await sql`SELECT quantity_raw FROM sub_supply_orders WHERE sheet_row = ${writeIn.rowNumber}`)[0] as { quantity_raw: string }).quantity_raw === "2");
  const pick = (await shelves.waiting(ACCOUNT)).find((entry) => entry.ref === "ZZ-CHECK-GROUP-2")!;
  check("🏬 a pick-up waits for the office, not the crew", pick?.fill === "pickup" && !(await shelves.crewShelfView(ACCOUNT)).waiting.some((entry) => entry.key === pick.key));
  const pickOffice = await office(p1.id);
  const pickSite = await site(p1.id);
  await shelves.pickedUp({ key: pick.key, by: "check" });
  check("✓ Picked up: off the warehouse, onto the site", (await office(p1.id)) === Math.max(pickOffice - 2, 0) && (await site(p1.id)) === pickSite + 2);
  check("✓ Picked up: the order is Completed", (await subStatuses("ZZ-CHECK-GROUP-2")) === "Completed");

  // ----- ✗ Decline; a manager's order for a sub -----
  await supplies.createSupplyOrder({ supplyItem: p1.code, quantity: "1", accountName: ACCOUNT_NAME, accountId: ACCOUNT, orderGroupId: "ZZ-CHECK-GROUP-3", subcontractor: "ZZ Sub", status: "New" });
  await shelves.declineOrder({ order: { source: "sub-order", refs: ["ZZ-CHECK-GROUP-3"] }, by: "check" });
  check("✗ Decline: the order is Denied", (await subStatuses("ZZ-CHECK-GROUP-3")) === "Denied");
  const call = await shelves.orderForSub({ accountId: ACCOUNT, accountName: ACCOUNT_NAME, sub: "ZZ Sub", lines: [{ supplyId: p2.id, qty: 2 }], note: "ZZ called", by: "check" });
  check("📞 a manager's order for a sub lands Approved, with its product", (await subStatuses(call.groupId)) === "Approved" && ((await sql`SELECT supply_id FROM sub_supply_orders WHERE order_group_id = ${call.groupId}`)[0] as { supply_id: string | number }).supply_id == p2.id);
  check("📞 it needs the sub", await rejects(() => shelves.orderForSub({ accountId: ACCOUNT, accountName: ACCOUNT_NAME, sub: "", lines: [{ supplyId: p2.id, qty: 1 }], note: "", by: "check" })));

  // ----- Site stock: + Add delivery, a corrected count -----
  const beforeAdd = await site(p1.id);
  await shelves.addSiteDelivery({ accountId: ACCOUNT, accountName: ACCOUNT_NAME, lines: [{ supplyId: p1.id, qty: 3 }], note: "ZZ dropped off", by: "check" });
  check("+ Add delivery puts it on the site", (await site(p1.id)) === beforeAdd + 3);
  check("a corrected count needs a reason", await rejects(() => shelves.setSiteCount({ accountId: ACCOUNT, accountName: ACCOUNT_NAME, supplyId: p1.id, qty: 1, reason: "", by: "check" })));
  await shelves.setSiteCount({ accountId: ACCOUNT, accountName: ACCOUNT_NAME, supplyId: p1.id, qty: 1, reason: "ZZ counted on site", by: "check" });
  check("a corrected count is saved, with its reason in the history", (await site(p1.id)) === 1 && ((await sql`SELECT count(*)::int AS n FROM supply_moves WHERE account_id = ${ACCOUNT} AND kind = 'site-set' AND source = 'office' AND note LIKE '%ZZ counted on site%'`)[0] as { n: number }).n === 1);

  // ----- 4. Case empty -----
  const siteNow = await site(p1.id);
  const left = await shelves.caseEmpty({ accountId: ACCOUNT, supplyId: p1.id, by: "ZZ Crew" });
  check("🗑 one tap takes one case off the site shelf", left.qty === siteNow - 1 && (await site(p1.id)) === siteNow - 1);
  check("🗑 an empty shelf cannot go below 0", await rejects(() => shelves.caseEmpty({ accountId: ACCOUNT, supplyId: 2_000_000_000, by: "ZZ Crew" })));

  // ----- the office sends with no order -----
  await shelves.sendToSite({ accountId: ACCOUNT, accountName: ACCOUNT_NAME, lines: [{ supplyId: p2.id, qty: 1 }], by: "check" });
  const officeSend = (await shelves.waiting(ACCOUNT)).find((entry) => entry.source === "office");
  check("🚚 a send with no order waits for the crew", Boolean(officeSend) && officeSend!.lines[0].supplyId === p2.id);

  // ----- nothing of it came, then "Put back on our shelf" -----
  const p2Site = await site(p2.id);
  await shelves.confirmArrival({ accountId: ACCOUNT, key: officeSend!.key, got: [0], by: "ZZ Crew" });
  check("📦 nothing came: nothing goes on the site shelf", (await site(p2.id)) === p2Site);
  const officeBack = (await shelves.waiting(ACCOUNT)).find((entry) => entry.backOrder && entry.source === "office");
  check("⏳ an office send that came short waits as a back order", Boolean(officeBack) && officeBack!.lines[0].qty === 1);
  const officeShelfBefore = await office(p2.id);
  const back2 = await shelves.cancelBackOrder({ key: officeBack!.key, index: 0, choice: "shelf", by: "check" });
  check("📥 put back: it is on the office shelf again", back2.closed && (await office(p2.id)) === officeShelfBefore + 1);
  check("📥 put back: the back order is closed", !(await shelves.waiting(ACCOUNT)).some((entry) => entry.key === officeBack!.key));

  // ----- sent from our shelf, never came, "Lost / never coming": a Cleaning World loss, not the customer's -----
  const spend = async () => (await control.monthSpend("")).rows.find((entry) => entry.accountId === ACCOUNT)?.amount ?? 0;
  p2CostBefore = { id: p2.id, cost: ((await sql`SELECT unit_cost::text AS cost FROM sub_supplies WHERE id = ${p2.id}`) as { cost: string | null }[])[0].cost };
  await sql`UPDATE sub_supplies SET unit_cost = 2.50 WHERE id = ${p2.id}`;
  const spendBefore = await spend();
  await shelves.sendToSite({ accountId: ACCOUNT, accountName: ACCOUNT_NAME, lines: [{ supplyId: p2.id, qty: 2 }], by: "check" });
  const spendSent = await spend();
  const lostSend = (await shelves.waiting(ACCOUNT)).find((entry) => entry.source === "office" && !entry.backOrder)!;
  await shelves.confirmArrival({ accountId: ACCOUNT, key: lostSend.key, got: [0], by: "ZZ Crew" });
  const lostBack = (await shelves.waiting(ACCOUNT)).find((entry) => entry.backOrder && entry.source === "office")!;
  const officeBeforeLost = await office(p2.id);
  await shelves.cancelBackOrder({ key: lostBack.key, index: 0, choice: "lost", by: "check" });
  console.log(`info  site spend this month: ${spendBefore} before the send, ${spendSent} sent, ${await spend()} after lost`);
  check("✗ lost: sending it charged the customer", spendSent === spendBefore + 5);
  check("✗ lost: the customer's spend is back to before the send", (await spend()) === spendBefore);
  check("✗ lost: the office shelf does not get it back", (await office(p2.id)) === officeBeforeLost);
  const p2Cost = ((await sql`SELECT unit_cost::text AS cost FROM sub_supplies WHERE id = ${p2.id}`) as { cost: string | null }[])[0].cost;
  const lossMove = (await sql`SELECT qty, unit_cost::text AS unit_cost FROM supply_moves WHERE account_id = ${ACCOUNT} AND kind = 'lost' AND supply_id = ${p2.id} ORDER BY id DESC LIMIT 1`) as { qty: number; unit_cost: string | null }[];
  check("✗ lost: the history keeps it as a Cleaning World loss, with its cost", lossMove[0]?.qty === 2 && lossMove[0].unit_cost === p2Cost);

  // ----- what crews and the office see -----
  const view = await shelves.crewShelfView(ACCOUNT);
  check("the crew view has the site shelf", view.shelf.length === 2);
  check("the crew view carries no product code", !JSON.stringify(view).includes(p1.code) || p1.code === p1.crewName);
  check("colors: red 0, yellow 1, green 2+", shelves.siteLevel(0) === "red" && shelves.siteLevel(1) === "yellow" && shelves.siteLevel(2) === "green");
  check("office colors: red at or below the minimum, yellow up to twice", shelves.officeLevel(3, 3) === "red" && shelves.officeLevel(6, 3) === "yellow" && shelves.officeLevel(7, 3) === "green" && shelves.officeLevel(null, 3) === "none");
  check("the office sees this site's shelf", (await shelves.siteShelves()).some((entry) => entry.accountId === ACCOUNT && entry.tiles.length === 2));
} finally {
  // Take every test row out again.
  if (p2CostBefore) await sql`UPDATE sub_supplies SET unit_cost = ${p2CostBefore.cost}::numeric WHERE id = ${p2CostBefore.id}`;
  await sql`DELETE FROM supply_deliveries WHERE account_id = ${ACCOUNT}`;
  await sql`DELETE FROM site_shelf WHERE account_id = ${ACCOUNT}`;
  await sql`DELETE FROM supply_moves WHERE account_id = ${ACCOUNT} OR (staff_name = 'check' AND kind = 'receive')`;
  await sql`DELETE FROM sub_supply_orders WHERE account_id_raw = ${ACCOUNT}`;
  if (crewOrderId) await sql`DELETE FROM supply_order_edits WHERE order_id = ${crewOrderId}`;
  if (crewOrderId) await sql`DELETE FROM supply_orders WHERE id = ${crewOrderId}`;
  await sql`DELETE FROM crew_link_account_supplies WHERE account_id = ${ACCOUNT}`;
  await sql`DELETE FROM handoff_items WHERE account_id = ${ACCOUNT}`;
  for (const row of shelfBefore) await sql`UPDATE sub_supplies SET shelf_count = ${row.shelf_count}, updated_by = ${row.updated_by}, updated_at = ${row.updated_at}::timestamptz WHERE id = ${Number(row.id)}`;
  for (const item of itemsBefore) {
    await sql`UPDATE supply_items SET name = ${item.name}, brand = ${item.brand}, active = ${item.active}, in_default_list = ${item.in_default_list}, unit = ${item.unit}, photo_url = ${item.photo_url}, category = ${item.category}, sku = ${item.sku}, updated_by = ${item.updated_by}, updated_at = ${item.updated_at}::timestamptz WHERE id = ${item.id}`;
  }
  // Crew items this check made for the two products: gone again (the ones that were there are put back above).
  const madeHere = [p1.id, p2.id].filter((id) => !crewBefore.has(id));
  if (madeHere.length) await sql`DELETE FROM supply_items WHERE sub_supply_id = ANY(${madeHere}::bigint[])`;
}

const after = await totals();
check("everything that was there is exactly as it was", JSON.stringify(after) === JSON.stringify(before), JSON.stringify(after));
const counts = (await sql`SELECT id, shelf_count FROM sub_supplies WHERE id = ANY(${[p1.id, p2.id]}::bigint[]) ORDER BY id`) as { id: string | number; shelf_count: number | null }[];
check("the office shelf counts are back to what they were", JSON.stringify(counts.map((row) => row.shelf_count)) === JSON.stringify(shelfBefore.sort((a, b) => Number(a.id) - Number(b.id)).map((row) => row.shelf_count)));

console.log(failed ? "\nSOME CHECKS FAILED" : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
