// Area 12 verify: Supplies and Supply Orders, Sheets vs Postgres (dev).
// Read-only.
//   node scripts/migrate/verify-supplies.mjs
import { cell } from "./lib/import-helpers.mjs";
import { runVerify } from "./lib/verify-helpers.mjs";

/** { db_column: column index } → field checks that compare the cell text. */
const cells = (map) => Object.fromEntries(Object.entries(map).map(([column, index]) => [column, (r) => cell(r, index)]));

// Same key rule as the import.
const seen = new Set();
const orderKey = (r, sourceRow) => {
  const id = cell(r, 1).trim();
  let k = id || `row-${sourceRow}`;
  if (seen.has(k)) k = `${id}#${sourceRow}`;
  seen.add(k);
  return k;
};

await runVerify("supplies", [
  {
    table: "sub_supplies",
    sheet: "MAIN",
    tab: "Supplies",
    range: "A:M",
    key: (_r, sourceRow) => `SUP-${sourceRow}`,
    fields: {
      ...cells({
        supply_item: 0,
        category: 1,
        description: 2,
        unit: 3,
        status: 4,
        notes: 5,
        active_raw: 6,
        current_stock_raw: 7,
        minimum_stock_raw: 8,
        last_updated_raw: 9,
        updated_by: 10,
        low_stock_email_to: 11,
        low_stock_email_status: 12,
      }),
      sheet_row: (_r, sourceRow) => String(sourceRow),
    },
    statusColumn: "category",
  },
  {
    table: "sub_supply_orders",
    sheet: "MAIN",
    tab: "Supply Orders",
    range: "A:N",
    key: orderKey,
    fields: {
      ...cells({
        timestamp_raw: 0,
        order_id: 1,
        subcontractor: 2,
        subcontractor_email: 3,
        account_name: 4,
        account_id_raw: 5,
        supply_item: 6,
        quantity_raw: 7,
        unit: 8,
        delivery_mode: 9,
        notes: 10,
        status: 11,
        email_sent_to: 12,
        email_status: 13,
      }),
      sheet_row: (_r, sourceRow) => String(sourceRow),
    },
    statusColumn: "status",
    dateColumn: "ordered_on",
  },
]);
