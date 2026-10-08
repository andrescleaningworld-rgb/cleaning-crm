// Area 13 verify: Sub Portal Issues and Photos, Sheets vs Postgres (dev).
// Read-only.
//   node scripts/migrate/verify-sub-portal.mjs
import { cell } from "./lib/import-helpers.mjs";
import { runVerify } from "./lib/verify-helpers.mjs";

/** { db_column: column index } → field checks that compare the cell text. */
const cells = (map) => Object.fromEntries(Object.entries(map).map(([column, index]) => [column, (r) => cell(r, index)]));

// Same key rule as the import: the row's own id, else / on a repeat the row number.
const keyBy = (idIndex) => {
  const seen = new Set();
  return (r, sourceRow) => {
    const id = cell(r, idIndex).trim();
    let k = id || `row-${sourceRow}`;
    if (seen.has(k)) k = `${id}#${sourceRow}`;
    seen.add(k);
    return k;
  };
};

await runVerify("sub-portal", [
  {
    table: "sub_portal_issues",
    sheet: "MAIN",
    tab: "Sub Portal Issues",
    range: "A:L",
    key: keyBy(1),
    fields: {
      ...cells({
        timestamp_raw: 0,
        issue_id: 1,
        subcontractor_email: 2,
        subcontractor_name: 3,
        account_id_raw: 4,
        account_name: 5,
        issue_type: 6,
        urgency: 7,
        description: 8,
        photo_count_raw: 9,
        status: 10,
        notes: 11,
      }),
      sheet_row: (_r, sourceRow) => String(sourceRow),
    },
    statusColumn: "status",
    dateColumn: "reported_on",
  },
  {
    table: "photos",
    sheet: "MAIN",
    tab: "Photos",
    range: "A:N",
    key: keyBy(1),
    fields: {
      ...cells({
        timestamp_raw: 0,
        photo_id: 1,
        account_id_raw: 2,
        account_name: 3,
        source_type: 4,
        source_id: 5,
        uploaded_by: 6,
        user_role: 7,
        file_name: 8,
        drive_file_id: 9,
        drive_url: 10,
        folder_url: 11,
        notes: 12,
        status: 13,
      }),
      sheet_row: (_r, sourceRow) => String(sourceRow),
    },
    statusColumn: "source_type",
    dateColumn: "taken_on",
  },
]);
