// Area 9 import: To Do and SmsLog (MAIN) → Postgres (dev branch only; Sheets
// read-only).
//
//   node scripts/migrate/import-todos.mjs --dry-run    read, count, report; write nothing
//   node scripts/migrate/import-todos.mjs              upsert by legacy_key
//
// Safe to re-run. Rows that vanished from Sheets are reported, never deleted.
// Run after import-accounts: the link to an account is looked up in Postgres.
// Phone numbers in SmsLog are imported but never printed.
import { isBlankRow, readTab } from "./lib/sheets-readonly.mjs";
import { cell, compareKeys, existingKeys, sha256, startRun, toDate, toTimestamp, upsertRows } from "./lib/import-helpers.mjs";

const dryRun = process.argv.includes("--dry-run");
const run = await startRun("todos", { dryRun });
const { sql } = run;

const norm = (text) => String(text ?? "").trim().toLowerCase();

const accountIds = new Set((await sql.query("SELECT id FROM accounts WHERE id IS NOT NULL")).map((r) => r.id));
const accountsByName = new Map();
for (const r of await sql.query("SELECT id, lower(btrim(account_name)) AS name FROM accounts WHERE id IS NOT NULL AND btrim(account_name) <> ''")) {
  accountsByName.set(r.name, accountsByName.has(r.name) ? null : r.id);
}
const managerNames = new Set((await sql.query("SELECT lower(btrim(name)) AS name FROM managers")).map((r) => r.name).filter(Boolean));

try {
  // ----- To Do. Every non-blank row is kept; the app hides rows with no ID.
  const all = (await readTab("MAIN", "To Do", { range: "A:P" })).slice(1).map((row, i) => ({ row, sourceRow: i + 2 }));
  const rows = all.filter(({ row }) => !isBlankRow(row));
  const seen = new Set();
  const todos = [];
  const unlinkedNames = new Set();
  const unknownAssignees = new Set();
  for (const { row, sourceRow } of rows) {
    const todoId = cell(row, 0).trim();
    let key = todoId || `row-${sourceRow}`;
    if (!todoId) run.issue("todos", key, `Row ${sourceRow}: no To Do ID. Kept; the app does not show this row.`);
    if (seen.has(key)) {
      run.issue("todos", key, `Row ${sourceRow}: this To Do ID is already used by an earlier row. Both kept.`);
      key = `${todoId}#${sourceRow}`;
    }
    seen.add(key);

    const byId = accountIds.has(cell(row, 15).trim()) ? cell(row, 15).trim() : null;
    const name = norm(cell(row, 4));
    const byName = name ? accountsByName.get(name) ?? null : null;
    const accountRef = byId ?? byName;
    if (cell(row, 15).trim() && !byId) run.issue("todos", key, "AccountId matches no account. Kept as text.", { rawValue: cell(row, 15) });
    if (!accountRef && name) unlinkedNames.add(name);
    if (todoId && norm(cell(row, 3)) && !managerNames.has(norm(cell(row, 3)))) unknownAssignees.add(norm(cell(row, 3)));

    for (const [column, index] of [["Created Date", 1], ["Due Date", 2]]) {
      if (cell(row, index).trim() && !toDate(cell(row, index))) run.issue("todos", key, `${column} is not a date. Kept as text.`, { rawValue: cell(row, index) });
    }

    todos.push({
      legacy_key: key,
      todo_id: cell(row, 0),
      created_date_raw: cell(row, 1),
      created_date: toDate(cell(row, 1)),
      due_date_raw: cell(row, 2),
      due_date: toDate(cell(row, 2)),
      assigned_to: cell(row, 3),
      account_name: cell(row, 4),
      account_ref: accountRef,
      task_type: cell(row, 5),
      why: cell(row, 6),
      status: cell(row, 7),
      notes: cell(row, 8),
      group_id: cell(row, 9),
      outcome: cell(row, 10),
      calendar_event_id: cell(row, 11),
      calendar_sync_failed_raw: cell(row, 12),
      sync_to_calendar_raw: cell(row, 13),
      priority_raw: cell(row, 14),
      account_id_raw: cell(row, 15),
      sheet_row: sourceRow,
      source_sheet: "MAIN",
      source_row: sourceRow,
    });
  }
  // One question per name, not one per to-do.
  for (const name of unlinkedNames) {
    const count = todos.filter((t) => norm(t.account_name) === name).length;
    run.issue("todos", `account-name:${name}`, `${count} to-do(s) name an account that ${accountsByName.get(name) === null ? "more than one account has" : "matches no account"}. Kept as text, not linked.`, { rawValue: name });
  }
  for (const name of unknownAssignees) {
    const count = todos.filter((t) => norm(t.assigned_to) === name).length;
    run.issue("todos", `assigned-to:${name}`, `${count} to-do(s) are assigned to a name that is not in the Managers list. Kept as text.`, { rawValue: name });
  }
  {
    const before = await existingKeys(sql, "todos");
    const diff = compareKeys(run, "todos", todos.map((r) => r.legacy_key), before);
    if (!dryRun) await upsertRows(sql, "todos", todos);
    run.count("todos", {
      sheetRows: rows.length,
      blank: all.length - rows.length,
      imported: todos.length,
      ...diff,
      withId: todos.filter((t) => t.todo_id.trim()).length,
      linkedToAccount: todos.filter((t) => t.account_ref).length,
      accountNamesNotLinked: unlinkedNames.size,
      assigneesNotInManagers: unknownAssignees.size,
    });
  }

  // ----- SmsLog. No ID column: the key is the provider's text id, or a hash
  // of the row when that is blank (a failed attempt), with #n for repeats.
  const todoIds = new Set(todos.map((t) => t.todo_id.trim()).filter(Boolean));
  const logAll = (await readTab("MAIN", "SmsLog", { range: "A:G" })).slice(1).map((row, i) => ({ row, sourceRow: i + 2 }));
  const logRows = logAll.filter(({ row }) => !isBlankRow(row));
  const seenLog = new Map();
  const log = [];
  let orphans = 0;
  for (const { row, sourceRow } of logRows) {
    const base = cell(row, 1).trim() ? `text:${cell(row, 1).trim()}` : sha256(cell(row, 0).trim(), cell(row, 2).trim(), cell(row, 3).trim(), cell(row, 4).trim());
    const n = (seenLog.get(base) ?? 0) + 1;
    seenLog.set(base, n);
    const key = n === 1 ? base : `${base}#${n}`;
    if (!todoIds.has(cell(row, 0).trim())) orphans++;
    log.push({
      legacy_key: key,
      todo_id: cell(row, 0),
      text_id: cell(row, 1),
      manager_phone: cell(row, 2),
      status: cell(row, 3),
      sent_at_raw: cell(row, 4),
      sent_at: toTimestamp(cell(row, 4)),
      last_checked_at_raw: cell(row, 5),
      last_checked_at: toTimestamp(cell(row, 5)),
      quota_remaining_raw: cell(row, 6),
      sheet_row: sourceRow,
      source_sheet: "MAIN",
      source_row: sourceRow,
    });
  }
  {
    const before = await existingKeys(sql, "todo_sms_log");
    const diff = compareKeys(run, "todo_sms_log", log.map((r) => r.legacy_key), before);
    if (!dryRun) await upsertRows(sql, "todo_sms_log", log);
    run.count("todo_sms_log", { sheetRows: logRows.length, blank: logAll.length - logRows.length, imported: log.length, ...diff, forToDosNotInTheList: orphans });
  }

  await run.finish("ok");
} catch (error) {
  console.error("Import failed:", error);
  await run.finish("failed").catch(() => undefined);
  process.exitCode = 1;
}
