// Area 5 verify: the five Equipment tabs, Sheets vs Postgres (dev). Read-only.
//   node scripts/migrate/verify-equipment.mjs
import { cell } from "./lib/import-helpers.mjs";
import { runVerify } from "./lib/verify-helpers.mjs";

const id = (r) => cell(r, 0);
const hasId = (r) => cell(r, 0) !== "";
const row = (_r, sourceRow) => String(sourceRow);
/** { db_column: column index } → field checks that compare the cell text. */
const cells = (map) => Object.fromEntries(Object.entries(map).map(([column, index]) => [column, (r) => cell(r, index)]));

await runVerify("equipment", [
  {
    table: "equipment_categories",
    sheet: "MAIN",
    tab: "EquipmentCategories",
    range: "A:C",
    key: id,
    keep: hasId,
    fields: { ...cells({ name: 1, active_raw: 2 }), active: (r) => String(cell(r, 2).trim().toUpperCase() !== "NO"), sheet_row: row },
    statusColumn: "active",
  },
  {
    table: "equipment",
    sheet: "MAIN",
    tab: "Equipment",
    range: "A:P",
    key: id,
    keep: hasId,
    fields: {
      ...cells({
        name: 1,
        category_id: 2,
        serial_number: 3,
        purchase_date_raw: 4,
        purchase_cost_raw: 5,
        status_raw: 6,
        current_holder_type: 7,
        current_holder_id: 8,
        current_holder_name: 9,
        condition_notes: 10,
        photo_url: 11,
        item_created_at_raw: 12,
        checked_out_at_raw: 13,
        expected_return_at_raw: 14,
        needs_maintenance_review_raw: 15,
      }),
      sheet_row: row,
    },
    statusColumn: "status_raw",
    dateColumn: "item_created_at",
  },
  {
    table: "equipment_checkouts",
    sheet: "MAIN",
    tab: "EquipmentCheckouts",
    range: "A:Q",
    key: id,
    keep: hasId,
    fields: {
      ...cells({
        equipment_id: 1,
        holder_type: 2,
        holder_id: 3,
        holder_name: 4,
        account_id: 5,
        checked_out_at_raw: 6,
        expected_return_at_raw: 7,
        returned_at_raw: 8,
        condition_at_checkout: 9,
        condition_at_return: 10,
        signed_out_by_staff_id: 11,
        signed_out_by_staff_name: 12,
        signed_in_by_staff_id: 13,
        signed_in_by_staff_name: 14,
        notes: 15,
        work_order_number: 16,
      }),
      sheet_row: row,
    },
    statusColumn: "holder_type",
    dateColumn: "checked_out_at",
  },
  {
    table: "equipment_repairs",
    sheet: "MAIN",
    tab: "EquipmentRepairs",
    range: "A:I",
    key: id,
    keep: hasId,
    fields: {
      ...cells({ equipment_id: 1, started_at_raw: 2, completed_at_raw: 3, description: 4, cost_raw: 5, performed_by: 6, parts_used: 7, status_raw: 8 }),
      sheet_row: row,
    },
    statusColumn: "status_raw",
    dateColumn: "started_at",
  },
  {
    table: "equipment_parts",
    sheet: "MAIN",
    tab: "EquipmentParts",
    range: "A:G",
    key: id,
    keep: hasId,
    fields: {
      ...cells({ part_name: 1, compatible_equipment_id: 2, supplier: 3, unit_cost_raw: 4, stock_qty_raw: 5, low_stock_threshold_raw: 6 }),
      sheet_row: row,
    },
  },
]);
