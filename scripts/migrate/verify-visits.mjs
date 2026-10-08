// Area 7 verify: Visits and VisitEditLog, Sheets vs Postgres (dev). Read-only.
//   node scripts/migrate/verify-visits.mjs
import { cell } from "./lib/import-helpers.mjs";
import { runVerify } from "./lib/verify-helpers.mjs";

// Same key rule as the import: the ID, row-<n> when blank, <id>#<n> when repeated.
const seen = new Set();
const visitKey = (r, sourceRow) => {
  const id = cell(r, 0).trim();
  let key = id || `row-${sourceRow}`;
  if (seen.has(key)) key = `${id}#${sourceRow}`;
  seen.add(key);
  return key;
};
const row = (_r, sourceRow) => String(sourceRow);
/** { db_column: column index } → field checks that compare the cell text. */
const cells = (map) => Object.fromEntries(Object.entries(map).map(([column, index]) => [column, (r) => cell(r, index)]));

await runVerify("visits", [
  {
    table: "visits",
    sheet: "MAIN",
    tab: "Visits",
    range: "A:M",
    key: visitKey,
    fields: {
      ...cells({
        visit_id: 0,
        account_id_raw: 1,
        account_name: 2,
        visit_date_raw: 3,
        visit_type: 4,
        completed_by: 5,
        condition_raw: 6,
        follow_up_needed: 7,
        follow_up_date_old_raw: 8,
        notes: 9,
        created_at_raw: 10,
        updated_at_raw: 11,
        follow_up_date_raw: 12,
      }),
      sheet_row: row,
    },
    statusColumn: "follow_up_needed",
    dateColumn: "visit_date",
  },
  {
    table: "visit_edit_log",
    sheet: "MAIN",
    tab: "VisitEditLog",
    range: "A:E",
    key: (r) => cell(r, 0),
    keep: (r) => cell(r, 0) !== "",
    fields: { ...cells({ visit_id: 1, edited_by: 2, edited_at_raw: 3, change_summary: 4 }), sheet_row: row },
    dateColumn: "edited_at",
  },
]);
