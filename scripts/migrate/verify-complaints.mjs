// Area 8 verify: Complaints, Sheets vs Postgres (dev). Read-only.
//   node scripts/migrate/verify-complaints.mjs
import { cell } from "./lib/import-helpers.mjs";
import { runVerify } from "./lib/verify-helpers.mjs";

// Same key rule as the import: the ID, row-<n> when blank, <id>#<n> when repeated.
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

await runVerify("complaints", [
  {
    table: "complaints",
    sheet: "MAIN",
    tab: "Complaints",
    range: "A:P",
    key,
    fields: {
      ...cells({
        complaint_id: 0,
        account_id_raw: 1,
        account_name: 2,
        complaint_date_raw: 3,
        issue: 4,
        priority: 5,
        complaint_validity: 6,
        status: 7,
        reported_by: 8,
        assigned_to: 9,
        last_follow_up_date_raw: 10,
        resolution_date_raw: 11,
        notes: 12,
        created_at_raw: 13,
        updated_at_raw: 14,
        last_follow_up_raw: 15,
      }),
      sheet_row: (_r, sourceRow) => String(sourceRow),
    },
    statusColumn: "status",
    dateColumn: "complaint_date",
  },
]);
