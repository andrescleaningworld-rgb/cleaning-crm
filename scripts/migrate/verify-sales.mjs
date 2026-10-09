// Area 10 verify: "Sales & Commissions", Sheets vs Postgres (dev). Read-only.
//   node scripts/migrate/verify-sales.mjs
import { cell } from "./lib/import-helpers.mjs";
import { runVerify } from "./lib/verify-helpers.mjs";

// Same key rule as the import.
const seen = new Set();
const key = (r, sourceRow) => {
  const id = cell(r, 0).trim();
  let k = id || `row-${sourceRow}`;
  if (seen.has(k)) k = `${id}#${sourceRow}`;
  seen.add(k);
  return k;
};
/** { db_column: column index } → field checks that compare the cell text. */
const cells = (map) => Object.fromEntries(Object.entries(map).map(([column, index]) => [column, (r) => cell(r, index)]));

await runVerify("sales", [
  {
    table: "sales",
    sheet: "MAIN",
    tab: "Sales & Commissions",
    range: "A:T",
    key,
    fields: {
      ...cells({
        sale_id: 0,
        account_id_raw: 1,
        account_name: 2,
        sale_date_raw: 3,
        service_sold: 4,
        work_order_estimate_number: 5,
        sold_by: 6,
        amount_sold_raw: 7,
        commission_percent_raw: 8,
        commission_amount_raw: 9,
        status: 10,
        notes: 11,
        created_at_raw: 12,
        updated_at_raw: 13,
        service_type: 14,
        manager: 15,
        amount_raw: 16,
        commission_amount_old_raw: 17,
        recurring_start_date_raw: 18,
        recurring_end_date_raw: 19,
      }),
      sheet_row: (_r, sourceRow) => String(sourceRow),
    },
    statusColumn: "status",
    dateColumn: "sale_date",
  },
]);
