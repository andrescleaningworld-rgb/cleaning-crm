// Area 9 verify: To Do and SmsLog, Sheets vs Postgres (dev). Read-only.
//   node scripts/migrate/verify-todos.mjs
import { cell, sha256 } from "./lib/import-helpers.mjs";
import { runVerify } from "./lib/verify-helpers.mjs";

// Same key rules as the import.
const seen = new Set();
const todoKey = (r, sourceRow) => {
  const id = cell(r, 0).trim();
  let key = id || `row-${sourceRow}`;
  if (seen.has(key)) key = `${id}#${sourceRow}`;
  seen.add(key);
  return key;
};
const seenLog = new Map();
const logKey = (r) => {
  const base = cell(r, 1).trim() ? `text:${cell(r, 1).trim()}` : sha256(cell(r, 0).trim(), cell(r, 2).trim(), cell(r, 3).trim(), cell(r, 4).trim());
  const n = (seenLog.get(base) ?? 0) + 1;
  seenLog.set(base, n);
  return n === 1 ? base : `${base}#${n}`;
};
const row = (_r, sourceRow) => String(sourceRow);
/** { db_column: column index } → field checks that compare the cell text. */
const cells = (map) => Object.fromEntries(Object.entries(map).map(([column, index]) => [column, (r) => cell(r, index)]));

await runVerify("todos", [
  {
    table: "todos",
    sheet: "MAIN",
    tab: "To Do",
    range: "A:P",
    key: todoKey,
    fields: {
      ...cells({
        todo_id: 0,
        created_date_raw: 1,
        due_date_raw: 2,
        assigned_to: 3,
        account_name: 4,
        task_type: 5,
        why: 6,
        status: 7,
        notes: 8,
        group_id: 9,
        outcome: 10,
        calendar_event_id: 11,
        calendar_sync_failed_raw: 12,
        sync_to_calendar_raw: 13,
        priority_raw: 14,
        account_id_raw: 15,
      }),
      sheet_row: row,
    },
    statusColumn: "status",
    dateColumn: "due_date",
  },
  {
    table: "todo_sms_log",
    sheet: "MAIN",
    tab: "SmsLog",
    range: "A:G",
    key: logKey,
    fields: {
      ...cells({ todo_id: 0, text_id: 1, manager_phone: 2, status: 3, sent_at_raw: 4, last_checked_at_raw: 5, quota_remaining_raw: 6 }),
      sheet_row: row,
    },
    statusColumn: "status",
    dateColumn: "sent_at",
  },
]);
