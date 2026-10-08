// Area 6 verify: SubSchedules, ScheduleExceptions and subcontractor-visits,
// Sheets vs Postgres (dev). Read-only.
//   node scripts/migrate/verify-scheduling.mjs
import { cell } from "./lib/import-helpers.mjs";
import { runVerify } from "./lib/verify-helpers.mjs";

// Same key rule as the import: the ID, row-<n> when blank, <id>#<n> when repeated.
const keyer = () => {
  const seen = new Set();
  return (r, sourceRow) => {
    const id = cell(r, 0);
    let key = id || `row-${sourceRow}`;
    if (seen.has(key)) key = `${id}#${sourceRow}`;
    seen.add(key);
    return key;
  };
};
const row = (_r, sourceRow) => String(sourceRow);
/** { db_column: column index } → field checks that compare the cell text. */
const cells = (map) => Object.fromEntries(Object.entries(map).map(([column, index]) => [column, (r) => cell(r, index)]));

await runVerify("scheduling", [
  {
    table: "sub_schedules",
    sheet: "MAIN",
    tab: "SubSchedules",
    range: "A:P",
    key: keyer(),
    fields: {
      ...cells({
        schedule_id: 0,
        account_id: 1,
        sub_id_raw: 2,
        day_of_week: 3,
        time_window: 4,
        recurring: 5,
        effective_start_raw: 6,
        effective_end_raw: 7,
        status: 8,
        submitted_by: 9,
        submitted_date_raw: 10,
        last_edited_by: 11,
        last_edited_date_raw: 12,
        frequency: 13,
        monthly_occurrence: 14,
        submitted_via: 15,
      }),
      sheet_row: row,
    },
    statusColumn: "status",
    dateColumn: "effective_start",
  },
  {
    table: "schedule_exceptions",
    sheet: "MAIN",
    tab: "ScheduleExceptions",
    range: "A:I",
    key: keyer(),
    fields: {
      ...cells({ exception_id: 0, account_id: 1, original_date_raw: 2, type: 3, new_date_raw: 4, new_time_window: 5, reason: 6, created_by: 7, created_date_raw: 8 }),
      sheet_row: row,
    },
    statusColumn: "type",
    dateColumn: "original_date",
  },
  {
    table: "subcontractor_visits",
    sheet: "PORTAL",
    tab: "subcontractor-visits",
    range: "A:G",
    key: keyer(),
    fields: {
      ...cells({ visit_id: 0, account_name: 1, sub_email: 2, sub_name: 3, visit_date_raw: 4, arrival_time: 5, notes: 6 }),
      sheet_row: row,
    },
    dateColumn: "visit_date",
  },
]);
