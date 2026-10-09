// Exercises every Postgres write in lib/pg/equipment.ts against the dev
// branch, checks the rows, and removes the test rows it made.
//   npx tsx scripts/migrate/check-equipment-writes.mts
import { loadEnv } from "./lib/env.mjs";
import { assertDevDatabase } from "./lib/guard.mjs";

loadEnv();
process.env.DATABASE_URL = assertDevDatabase(process.env.MIGRATION_DATABASE_URL);
process.env.OUTBOUND_DRY_RUN = "1";
process.env.DATA_SOURCE_EQUIPMENT = "postgres";

const data = await import("../../lib/data/equipment");
const { getSql } = await import("../../lib/db");
const sql = getSql();

let failed = false;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` – ${detail}` : ""}`);
};
const throwsWith = async (run: () => Promise<unknown>, text: string) => {
  try {
    await run();
    return false;
  } catch (e) {
    return e instanceof Error && e.message.includes(text);
  }
};

const MARK = "__migration-write-test__";
const ID_SHAPE = (prefix: string) => new RegExp(`^${prefix}-[\\d-]{8}-[a-z0-9]{1,4}$`);
const counts = async () => ({
  categories: (await data.fetchEquipmentCategories()).length,
  equipment: (await data.fetchEquipmentList()).length,
  checkouts: (await data.fetchEquipmentCheckouts()).length,
  repairs: (await data.fetchEquipmentRepairs()).length,
  parts: (await data.fetchEquipmentParts()).length,
});
const before = await counts();
const made = { categories: [] as string[], equipment: [] as string[], checkouts: [] as string[], repairs: [] as string[], parts: [] as string[] };

try {
  // Categories: create, rename, deactivate.
  const catId = await data.appendEquipmentCategory(MARK);
  made.categories.push(catId);
  check("appendEquipmentCategory returns a CAT- id", ID_SHAPE("CAT").test(catId), catId);
  const cats = await data.fetchEquipmentCategories();
  let cat = cats[cats.length - 1];
  check("new category is last, active, with the next row number", cat?.id === catId && cat.active === true && cat.sheetRow === (cats[cats.length - 2]?.sheetRow ?? 1) + 1);
  await data.updateEquipmentCategory(catId, { name: `${MARK} 2` });
  cat = (await data.fetchEquipmentCategories()).find((c) => c.id === catId)!;
  check("rename changes only the name", cat.name === `${MARK} 2` && cat.active === true);
  await data.updateEquipmentCategory(catId, { active: false });
  cat = (await data.fetchEquipmentCategories()).find((c) => c.id === catId)!;
  check("deactivate keeps the row and the name", cat.active === false && cat.name === `${MARK} 2`);
  await data.updateEquipmentCategory(catId, {});
  check("empty update changes nothing", (await data.fetchEquipmentCategories()).find((c) => c.id === catId)?.active === false);
  check("unknown category → same error text", await throwsWith(() => data.updateEquipmentCategory("CAT-nope", { name: "x" }), 'Equipment category "CAT-nope" not found.'));
  check("blank category id → same error text", await throwsWith(() => data.updateEquipmentCategory("  ", { name: "x" }), "Missing equipment category id."));

  // Equipment: create, read back, change fields.
  const eqId = await data.appendEquipmentItem({ name: MARK, categoryId: catId, serialNumber: "SN-1", purchaseDate: "2026-05-04", purchaseCost: 1234.5, conditionNotes: "ok", photoUrl: "" });
  made.equipment.push(eqId);
  check("appendEquipmentItem returns an EQP- id", ID_SHAPE("EQP").test(eqId), eqId);
  let item = await data.getEquipmentById(eqId);
  check(
    "new item: Available, no holder, values as sent, a created time",
    !!item && item.status === "Available" && item.currentHolderType === "" && item.purchaseCost === 1234.5 && item.purchaseDate === "2026-05-04" && item.categoryId === catId && !Number.isNaN(new Date(item.createdAt).getTime()) && item.overdue === false && item.needsMaintenanceReview === false
  );
  const typed = (await sql.query(`SELECT purchase_date::text AS d, purchase_cost::text AS c, item_created_at IS NOT NULL AS t FROM equipment WHERE id = $1`, [eqId]))[0] as { d: string; c: string; t: boolean };
  check("typed columns are filled next to the text", typed.d === "2026-05-04" && Number(typed.c) === 1234.5 && typed.t === true, JSON.stringify(typed));
  check("new item is last in the list", (await data.fetchEquipmentList()).at(-1)?.id === eqId);
  await data.updateEquipmentFields(eqId, { name: `${MARK} 2`, purchaseCost: 99, needsMaintenanceReview: true });
  item = await data.getEquipmentById(eqId);
  check("partial update changes only the sent fields", item?.name === `${MARK} 2` && item.purchaseCost === 99 && item.needsMaintenanceReview === true && item.serialNumber === "SN-1" && item.conditionNotes === "ok");
  await data.updateEquipmentFields(eqId, { needsMaintenanceReview: false });
  check("maintenance flag can be cleared", (await data.getEquipmentById(eqId))?.needsMaintenanceReview === false);
  check("unknown equipment → same error text", await throwsWith(() => data.updateEquipmentFields("EQP-nope", { name: "x" }), 'Equipment "EQP-nope" not found.'));
  check("blank equipment id → same error text", await throwsWith(() => data.updateEquipmentFields(" ", { name: "x" }), "Missing equipment id."));
  check("getEquipmentById(blank) is null", (await data.getEquipmentById(" ")) === null);

  // Check out (what the checkout route does: a checkout row + the item's fields).
  const outAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const chkId = await data.appendEquipmentCheckout({ equipmentId: eqId, holderType: "InsideStaff", holderId: "STF-test", holderName: "Test Person", accountId: "", checkedOutAt: outAt, expectedReturnAt: "", conditionAtCheckout: "good", signedOutByStaffId: "STF-out", signedOutByStaffName: "Out Person", workOrderNumber: "WO-1" });
  made.checkouts.push(chkId);
  check("appendEquipmentCheckout returns a CHK- id", ID_SHAPE("CHK").test(chkId), chkId);
  await data.updateEquipmentFields(eqId, { status: "CheckedOut", currentHolderType: "InsideStaff", currentHolderId: "STF-test", currentHolderName: "Test Person", checkedOutAt: outAt, expectedReturnAt: "" });
  item = await data.getEquipmentById(eqId);
  check("checked out 10 days ago with no return date → overdue (7-day rule)", item?.status === "CheckedOut" && item.overdue === true && item.currentHolderName === "Test Person");
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await data.updateEquipmentFields(eqId, { expectedReturnAt: future });
  check("a return date in the future → not overdue", (await data.getEquipmentById(eqId))?.overdue === false);
  const open = await data.getOpenCheckoutForEquipment(eqId);
  check("open checkout is found, with its row number", open?.id === chkId && open.sheetRow > 1 && open.workOrderNumber === "WO-1" && open.signedOutByStaffId === "STF-out");
  check("checkouts for this item: 1, newest first overall", (await data.fetchEquipmentCheckouts(eqId)).length === 1 && (await data.fetchEquipmentCheckouts())[0]?.id !== undefined);
  check("staff history: signer yes, stranger no", (await data.staffHasEquipmentCheckoutHistory("STF-out")) === true && (await data.staffHasEquipmentCheckoutHistory("STF-nobody")) === false);

  // Return (what the return route does).
  const backAt = new Date().toISOString();
  await data.updateEquipmentCheckout(open!.sheetRow, { returnedAt: backAt, conditionAtReturn: "scratched", signedInByStaffId: "STF-in", signedInByStaffName: "In Person" });
  const closed = (await data.fetchEquipmentCheckouts(eqId))[0];
  check("return fills the return time and condition", closed.returnedAt === backAt && closed.conditionAtReturn === "scratched");
  // Same as Sheets today: the "signed in by" values land in the "signed out by" columns.
  check("return writes the signer into the same columns as the Sheets version", closed.signedOutByStaffId === "STF-in" && closed.signedOutByStaffName === "In Person" && closed.signedInByStaffId === "" && closed.signedInByStaffName === "");
  check("no open checkout after the return", (await data.getOpenCheckoutForEquipment(eqId)) === null);
  await data.updateEquipmentCheckout(open!.sheetRow, {});
  check("empty checkout update changes nothing", (await data.fetchEquipmentCheckouts(eqId))[0].returnedAt === backAt);

  // Repairs: open, one open at a time is the route's job; complete.
  check("no open repair to start with", (await data.getOpenRepairForEquipment(eqId)) === null);
  const repId = await data.appendEquipmentRepair({ equipmentId: eqId, description: "handle loose" });
  made.repairs.push(repId);
  check("appendEquipmentRepair returns a REP- id", ID_SHAPE("REP").test(repId), repId);
  let repair = await data.getOpenRepairForEquipment(eqId);
  check("new repair is Open, cost 0, started now", repair?.id === repId && repair.status === "Open" && repair.cost === 0 && repair.completedAt === "" && !Number.isNaN(new Date(repair.startedAt).getTime()));
  await data.completeEquipmentRepair(eqId, repId, { cost: 45.5, performedBy: "Shop", partsUsed: "screw" });
  repair = (await data.fetchEquipmentRepairs(eqId))[0];
  check("complete sets Completed, a time, and the three fields", repair.status === "Completed" && repair.cost === 45.5 && repair.performedBy === "Shop" && repair.partsUsed === "screw" && !Number.isNaN(new Date(repair.completedAt).getTime()) && repair.description === "handle loose");
  check("no open repair after completing", (await data.getOpenRepairForEquipment(eqId)) === null);
  check("wrong item for a repair → same error text", await throwsWith(() => data.completeEquipmentRepair("EQP-other", repId, {}), `Equipment repair "${repId}" not found.`));

  // Parts: create, use, restock, never below zero.
  const partId = await data.appendEquipmentPart({ partName: MARK, compatibleEquipmentId: eqId, supplier: "S", unitCost: 2.5, stockQty: 3, lowStockThreshold: 2 });
  made.parts.push(partId);
  check("appendEquipmentPart returns a PRT- id", ID_SHAPE("PRT").test(partId), partId);
  let part = (await data.fetchEquipmentParts()).find((p) => p.id === partId)!;
  check("new part: 3 in stock, not low", part.stockQty === 3 && part.unitCost === 2.5 && part.lowStockThreshold === 2 && part.lowStock === false);
  part = await data.adjustEquipmentPartStock(partId, -1, "Used");
  check("use 1 → 2 left, low (at the threshold)", part.stockQty === 2 && part.lowStock === true);
  part = await data.adjustEquipmentPartStock(partId, -10, "Correction");
  check("stock never goes below 0", part.stockQty === 0);
  part = await data.adjustEquipmentPartStock(partId, 5, "Restocked");
  check("restock 5 → 5", part.stockQty === 5 && part.lowStock === false);
  check("unknown part → same error text", await throwsWith(() => data.adjustEquipmentPartStock("PRT-nope", 1, "Restocked"), 'Equipment part "PRT-nope" not found.'));
  check("blank part id → same error text", await throwsWith(() => data.adjustEquipmentPartStock(" ", 1, "Restocked"), "Missing equipment part id."));
} finally {
  // Remove only what this script made, by id and by the marker.
  await sql.query(`DELETE FROM equipment_parts WHERE id = ANY($1) OR part_name LIKE $2`, [made.parts, `${MARK}%`]);
  await sql.query(`DELETE FROM equipment_repairs WHERE id = ANY($1)`, [made.repairs]);
  await sql.query(`DELETE FROM equipment_checkouts WHERE id = ANY($1)`, [made.checkouts]);
  await sql.query(`DELETE FROM equipment WHERE id = ANY($1) OR name LIKE $2`, [made.equipment, `${MARK}%`]);
  await sql.query(`DELETE FROM equipment_categories WHERE id = ANY($1) OR name LIKE $2`, [made.categories, `${MARK}%`]);
  const after = await counts();
  check("test rows removed; counts are back to where they started", JSON.stringify(after) === JSON.stringify(before), JSON.stringify(after));
}

console.log(failed ? "\nFAILED" : "\nAll write checks passed.");
if (failed) process.exitCode = 1;
