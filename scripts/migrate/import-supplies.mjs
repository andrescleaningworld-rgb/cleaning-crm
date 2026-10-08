// Area 12 import: Supplies and Supply Orders (MAIN) → Postgres (dev branch
// only; Sheets read-only).
//
//   node scripts/migrate/import-supplies.mjs --dry-run    read, count, report; write nothing
//   node scripts/migrate/import-supplies.mjs              upsert by legacy_key
//
// Safe to re-run. Rows that vanished from Sheets are reported, never deleted.
// Run after import-subs and import-accounts: the links are looked up in
// Postgres. Team Hub's own supply tables are not touched.
import { isBlankRow, readTab } from "./lib/sheets-readonly.mjs";
import { cell, compareKeys, existingKeys, startRun, toDate, upsertRows } from "./lib/import-helpers.mjs";

const dryRun = process.argv.includes("--dry-run");
const run = await startRun("supplies", { dryRun });
const { sql } = run;

const norm = (text) => String(text ?? "").trim().toLowerCase();

const accountIds = new Set((await sql.query("SELECT id FROM accounts WHERE id IS NOT NULL")).map((r) => r.id));
const accountsByName = new Map();
for (const r of await sql.query("SELECT id, lower(btrim(account_name)) AS name FROM accounts WHERE id IS NOT NULL AND btrim(account_name) <> ''")) {
  accountsByName.set(r.name, accountsByName.has(r.name) ? null : r.id);
}
const subsByEmail = new Map();
for (const r of await sql.query("SELECT id, lower(btrim(email)) AS email FROM subcontractors WHERE btrim(email) <> ''")) {
  subsByEmail.set(r.email, subsByEmail.has(r.email) ? null : r.id); // null = more than one sub with this email
}

try {
  // ----- Supplies. The item's id in the app is "SUP-<sheet row>".
  const all = (await readTab("MAIN", "Supplies", { range: "A:M" })).slice(1).map((row, i) => ({ row, sourceRow: i + 2 }));
  const rows = all.filter(({ row }) => !isBlankRow(row));
  const names = new Map();
  const supplies = rows.map(({ row, sourceRow }) => {
    const name = norm(cell(row, 0));
    if (!name) run.issue("sub_supplies", `SUP-${sourceRow}`, `Row ${sourceRow}: no Supply Item name. Kept.`);
    else names.set(name, [...(names.get(name) ?? []), sourceRow]);
    return {
      legacy_key: `SUP-${sourceRow}`,
      supply_item: cell(row, 0),
      category: cell(row, 1),
      description: cell(row, 2),
      unit: cell(row, 3),
      status: cell(row, 4),
      notes: cell(row, 5),
      active_raw: cell(row, 6),
      current_stock_raw: cell(row, 7),
      minimum_stock_raw: cell(row, 8),
      last_updated_raw: cell(row, 9),
      updated_by: cell(row, 10),
      low_stock_email_to: cell(row, 11),
      low_stock_email_status: cell(row, 12),
      sheet_row: sourceRow,
      source_sheet: "MAIN",
      source_row: sourceRow,
    };
  });
  for (const list of names.values()) if (list.length > 1) run.issue("sub_supplies", `SUP-${list[0]}`, `Rows ${list.join(", ")} have the same Supply Item name. Both kept.`);

  const before = await existingKeys(sql, "sub_supplies");
  const diff = compareKeys(run, "sub_supplies", supplies.map((r) => r.legacy_key), before);
  if (!dryRun) await upsertRows(sql, "sub_supplies", supplies);
  run.count("sub_supplies", {
    sheetRows: rows.length,
    blank: all.length - rows.length,
    imported: supplies.length,
    ...diff,
    withCategory: supplies.filter((r) => r.category.trim()).length,
    withUnit: supplies.filter((r) => r.unit.trim()).length,
    withStatus: supplies.filter((r) => r.status.trim()).length,
    withActive: supplies.filter((r) => r.active_raw.trim()).length,
  });

  // ----- Supply Orders. One row per ordered item.
  const orderAll = (await readTab("MAIN", "Supply Orders", { range: "A:N" })).slice(1).map((row, i) => ({ row, sourceRow: i + 2 }));
  const orderRows = orderAll.filter(({ row }) => !isBlankRow(row));
  const seen = new Set();
  const orders = [];
  let unknownItems = 0;
  for (const { row, sourceRow } of orderRows) {
    const orderId = cell(row, 1).trim();
    let key = orderId || `row-${sourceRow}`;
    if (!orderId) run.issue("sub_supply_orders", key, `Row ${sourceRow}: no Order ID. Kept.`);
    if (seen.has(key)) {
      run.issue("sub_supply_orders", key, `Row ${sourceRow}: this Order ID is already used by an earlier row. Both kept.`);
      key = `${orderId}#${sourceRow}`;
    }
    seen.add(key);

    const email = norm(cell(row, 3));
    const subId = email ? subsByEmail.get(email) ?? null : null;
    if (!subId) run.issue("sub_supply_orders", key, email ? "The Subcontractor Email matches no single subcontractor. Kept as text, not linked." : "No Subcontractor Email. Not linked.");
    const byId = accountIds.has(cell(row, 5).trim()) ? cell(row, 5).trim() : null;
    const name = norm(cell(row, 4));
    const accountRef = byId ?? (name ? accountsByName.get(name) ?? null : null);
    if (!accountRef) run.issue("sub_supply_orders", key, "Neither the Account ID nor the Account Name matches an account. Kept as text, not linked.");
    if (!toDate(cell(row, 0))) run.issue("sub_supply_orders", key, "Timestamp is not a date. Kept as text.", { rawValue: cell(row, 0) });
    if (norm(cell(row, 6)) && !names.has(norm(cell(row, 6)))) unknownItems++;

    orders.push({
      legacy_key: key,
      timestamp_raw: cell(row, 0),
      ordered_on: toDate(cell(row, 0)),
      order_id: cell(row, 1),
      subcontractor: cell(row, 2),
      subcontractor_email: cell(row, 3),
      subcontractor_id: subId,
      account_name: cell(row, 4),
      account_id_raw: cell(row, 5),
      account_ref: accountRef,
      supply_item: cell(row, 6),
      quantity_raw: cell(row, 7),
      unit: cell(row, 8),
      delivery_mode: cell(row, 9),
      notes: cell(row, 10),
      status: cell(row, 11),
      email_sent_to: cell(row, 12),
      email_status: cell(row, 13),
      sheet_row: sourceRow,
      source_sheet: "MAIN",
      source_row: sourceRow,
    });
  }

  const beforeOrders = await existingKeys(sql, "sub_supply_orders");
  const orderDiff = compareKeys(run, "sub_supply_orders", orders.map((r) => r.legacy_key), beforeOrders);
  if (!dryRun) await upsertRows(sql, "sub_supply_orders", orders);
  const office = new Set(["info@cleaningworldinc.com", "crm@cleaningworldinc.com"]);
  run.count("sub_supply_orders", {
    sheetRows: orderRows.length,
    blank: orderAll.length - orderRows.length,
    imported: orders.length,
    ...orderDiff,
    linkedToSub: orders.filter((r) => r.subcontractor_id).length,
    linkedToAccount: orders.filter((r) => r.account_ref).length,
    itemNotInCatalog: unknownItems,
    quantityNotANumber: orders.filter((r) => r.quantity_raw.trim() && !/^\d+(\.\d+)?$/.test(r.quantity_raw.trim())).length,
    // Where the order email went, without printing the address: is it one of the two office addresses the app already uses?
    emailToOfficeAddress: orders.filter((r) => r.email_sent_to.split(/[,;\s]+/).filter(Boolean).every((a) => office.has(a.toLowerCase())) && r.email_sent_to.trim()).length,
    emailStatusSent: orders.filter((r) => /sent/i.test(r.email_status)).length,
  });

  await run.finish("ok");
} catch (error) {
  console.error("Import failed:", error);
  await run.finish("failed").catch(() => undefined);
  process.exitCode = 1;
}
