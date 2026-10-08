// Area 5 import: EquipmentCategories, Equipment, EquipmentCheckouts,
// EquipmentRepairs, EquipmentParts → Postgres (dev branch only; Sheets
// read-only).
//
//   node scripts/migrate/import-equipment.mjs --dry-run    read, count, report; write nothing
//   node scripts/migrate/import-equipment.mjs              upsert by legacy_key
//
// Safe to re-run. Rows that vanished from Sheets are reported, never deleted.
import { isBlankRow, readTab } from "./lib/sheets-readonly.mjs";
import { cell, compareKeys, dedupe, existingKeys, startRun, toDate, toTimestamp, upsertRows } from "./lib/import-helpers.mjs";

const dryRun = process.argv.includes("--dry-run");
const run = await startRun("equipment", { dryRun });
const { sql } = run;

/** A number, or null when the cell is blank or not a number. Formatted money ("$1,200.00") is accepted. */
const toNumber = (raw) => {
  const text = String(raw ?? "").replace(/[$,\s]/g, "");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

async function importTable(table, tab, range, toRecord) {
  const all = (await readTab("MAIN", tab, { range })).slice(1).map((row, i) => ({ row, sourceRow: i + 2 }));
  const rows = all.filter(({ row }) => !isBlankRow(row));
  const records = [];
  let skipped = 0;
  for (const { row, sourceRow } of rows) {
    const id = cell(row, 0);
    if (!id) {
      // The app hides rows without an ID too.
      run.issue(table, `row-${sourceRow}`, `Row ${sourceRow}: no ID. Skipped (the app hides it too).`);
      skipped++;
      continue;
    }
    records.push({ id, legacy_key: id, ...toRecord(row, sourceRow, id), sheet_row: sourceRow, source_sheet: "MAIN", source_row: sourceRow });
  }
  const unique = dedupe(run, table, records);
  const before = await existingKeys(sql, table);
  const diff = compareKeys(run, table, unique.map((r) => r.legacy_key), before);
  if (!dryRun) await upsertRows(sql, table, unique);
  run.count(table, { sheetRows: rows.length, blank: all.length - rows.length, skipped, imported: unique.length, ...diff });
  return unique;
}

/** Notes a date/time cell that holds text which is not a date. The text is kept either way. */
const checkedTime = (table, id, column, raw) => {
  const value = toTimestamp(raw);
  if (String(raw).trim() && !value) run.issue(table, id, `${column} is not a date and time. Kept as text.`, { rawValue: raw });
  return value;
};

try {
  const categories = await importTable("equipment_categories", "EquipmentCategories", "A:C", (row) => ({
    name: cell(row, 1),
    active_raw: cell(row, 2),
    // Same rule as the app: anything but "No" is active.
    active: cell(row, 2).trim().toUpperCase() !== "NO",
  }));

  const categoryIds = new Set(categories.map((c) => c.id));
  const equipment = await importTable("equipment", "Equipment", "A:P", (row, _sourceRow, id) => {
    if (cell(row, 2) && !categoryIds.has(cell(row, 2))) {
      run.issue("equipment", id, "CategoryId points at a category that is not in EquipmentCategories. Kept as it is.", { rawValue: cell(row, 2) });
    }
    return {
      name: cell(row, 1),
      category_id: cell(row, 2),
      serial_number: cell(row, 3),
      purchase_date_raw: cell(row, 4),
      purchase_date: toDate(cell(row, 4)),
      purchase_cost_raw: cell(row, 5),
      purchase_cost: toNumber(cell(row, 5)),
      status_raw: cell(row, 6),
      current_holder_type: cell(row, 7),
      current_holder_id: cell(row, 8),
      current_holder_name: cell(row, 9),
      condition_notes: cell(row, 10),
      photo_url: cell(row, 11),
      item_created_at_raw: cell(row, 12),
      item_created_at: checkedTime("equipment", id, "CreatedAt", cell(row, 12)),
      checked_out_at_raw: cell(row, 13),
      checked_out_at: checkedTime("equipment", id, "CheckedOutAt", cell(row, 13)),
      expected_return_at_raw: cell(row, 14),
      expected_return_at: checkedTime("equipment", id, "ExpectedReturnAt", cell(row, 14)),
      needs_maintenance_review_raw: cell(row, 15),
    };
  });

  const equipmentIds = new Set(equipment.map((e) => e.id));
  const orphan = (table, id, equipmentId) => {
    if (equipmentId && !equipmentIds.has(equipmentId)) {
      run.issue(table, id, "EquipmentId points at an item that is not in Equipment. Kept as it is.", { rawValue: equipmentId });
    }
  };

  await importTable("equipment_checkouts", "EquipmentCheckouts", "A:Q", (row, _sourceRow, id) => {
    orphan("equipment_checkouts", id, cell(row, 1));
    return {
      equipment_id: cell(row, 1),
      holder_type: cell(row, 2),
      holder_id: cell(row, 3),
      holder_name: cell(row, 4),
      account_id: cell(row, 5),
      checked_out_at_raw: cell(row, 6),
      checked_out_at: checkedTime("equipment_checkouts", id, "CheckedOutAt", cell(row, 6)),
      expected_return_at_raw: cell(row, 7),
      expected_return_at: checkedTime("equipment_checkouts", id, "ExpectedReturnAt", cell(row, 7)),
      returned_at_raw: cell(row, 8),
      returned_at: checkedTime("equipment_checkouts", id, "ReturnedAt", cell(row, 8)),
      condition_at_checkout: cell(row, 9),
      condition_at_return: cell(row, 10),
      signed_out_by_staff_id: cell(row, 11),
      signed_out_by_staff_name: cell(row, 12),
      signed_in_by_staff_id: cell(row, 13),
      signed_in_by_staff_name: cell(row, 14),
      notes: cell(row, 15),
      work_order_number: cell(row, 16),
    };
  });

  await importTable("equipment_repairs", "EquipmentRepairs", "A:I", (row, _sourceRow, id) => {
    orphan("equipment_repairs", id, cell(row, 1));
    return {
      equipment_id: cell(row, 1),
      started_at_raw: cell(row, 2),
      started_at: checkedTime("equipment_repairs", id, "StartedAt", cell(row, 2)),
      completed_at_raw: cell(row, 3),
      completed_at: checkedTime("equipment_repairs", id, "CompletedAt", cell(row, 3)),
      description: cell(row, 4),
      cost_raw: cell(row, 5),
      cost: toNumber(cell(row, 5)),
      performed_by: cell(row, 6),
      parts_used: cell(row, 7),
      status_raw: cell(row, 8),
    };
  });

  await importTable("equipment_parts", "EquipmentParts", "A:G", (row) => ({
    part_name: cell(row, 1),
    compatible_equipment_id: cell(row, 2),
    supplier: cell(row, 3),
    unit_cost_raw: cell(row, 4),
    unit_cost: toNumber(cell(row, 4)),
    stock_qty_raw: cell(row, 5),
    stock_qty: toNumber(cell(row, 5)),
    low_stock_threshold_raw: cell(row, 6),
    low_stock_threshold: toNumber(cell(row, 6)),
  }));

  await run.finish("ok");
} catch (error) {
  console.error("Import failed:", error);
  await run.finish("failed").catch(() => undefined);
  process.exitCode = 1;
}
