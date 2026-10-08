// Area 11 import: customer-portal + the three portal-* request tabs (PORTAL)
// → Postgres (dev branch only; Sheets read-only).
//
//   node scripts/migrate/import-customer-portal.mjs --dry-run    read, count, report; write nothing
//   node scripts/migrate/import-customer-portal.mjs              upsert by legacy_key
//
// Safe to re-run. Rows that vanished from Sheets are reported, never deleted.
// Run after import-accounts: the link to an account is looked up in Postgres.
// Phones and portal codes are what customers log in with: imported, never
// printed, and never put into migration_issues.
import { isBlankRow, readTab } from "./lib/sheets-readonly.mjs";
import { cell, compareKeys, existingKeys, startRun, toDate, upsertRows } from "./lib/import-helpers.mjs";

const dryRun = process.argv.includes("--dry-run");
const run = await startRun("customer-portal", { dryRun });
const { sql } = run;

const norm = (text) => String(text ?? "").trim().toLowerCase();
/** Same rule as normalizePhone in lib/googleSheets.ts. */
const digits = (phone) => {
  const d = String(phone ?? "").replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
};

const accountIds = new Set((await sql.query("SELECT id FROM accounts WHERE id IS NOT NULL")).map((r) => r.id));
const accountsByName = new Map();
for (const r of await sql.query("SELECT id, lower(btrim(account_name)) AS name FROM accounts WHERE id IS NOT NULL AND btrim(account_name) <> ''")) {
  accountsByName.set(r.name, accountsByName.has(r.name) ? null : r.id);
}
const linkAccount = (idText, nameText) => {
  const id = String(idText ?? "").trim();
  if (accountIds.has(id)) return id;
  const name = norm(nameText);
  return name ? accountsByName.get(name) ?? null : null;
};

// Tab → which columns hold status / notes / photos (same as PORTAL_TABS in lib/googleSheets.ts).
const REQUEST_TABS = [
  { tab: "portal-complaints", range: "A:I", status: 6, notes: 7, photos: 8, fields: [3, 4, 5] },
  { tab: "portal-service-requests", range: "A:H", status: 6, notes: 7, photos: null, fields: [3, 4, 5] },
  { tab: "portal-date-changes", range: "A:H", status: 6, notes: 7, photos: null, fields: [3, 4, 5] },
];

try {
  // ----- customer-portal. Every non-blank row is kept.
  const all = (await readTab("PORTAL", "customer-portal", { range: "A:S" })).slice(1).map((row, i) => ({ row, sourceRow: i + 2 }));
  const rows = all.filter(({ row }) => !isBlankRow(row));
  const access = [];
  const byName = new Map();
  const byCode = new Map();
  const byPhoneYes = new Map();
  let unlinked = 0;
  let idDiffers = 0;
  let noPhone = 0;
  let noPhoneYes = 0;
  let noCode = 0;
  let oddAccess = 0;
  let codeIsAccountId = 0;
  for (const { row, sourceRow } of rows) {
    const key = `row-${sourceRow}`;
    const accountRef = linkAccount(cell(row, 0), cell(row, 1));
    if (!accountRef) {
      unlinked++;
      run.issue("portal_access", key, `Row ${sourceRow}: neither the Account ID nor the Account Name matches exactly one account. Kept, not linked.`);
    } else if (cell(row, 0).trim() && cell(row, 0).trim() !== accountRef) idDiffers++;

    const name = norm(cell(row, 1));
    if (name) byName.set(name, [...(byName.get(name) ?? []), sourceRow]);
    const code = norm(cell(row, 17));
    if (code) byCode.set(code, [...(byCode.get(code) ?? []), sourceRow]);
    else noCode++;
    const accessText = cell(row, 18).trim().toUpperCase();
    if (accessText !== "YES" && accessText !== "NO") oddAccess++;
    const phone = digits(cell(row, 8));
    if (!phone) {
      noPhone++;
      if (accessText === "YES") noPhoneYes++;
    } else if (accessText === "YES") byPhoneYes.set(phone, [...(byPhoneYes.get(phone) ?? []), sourceRow]);
    if (cell(row, 17).trim() && cell(row, 17).trim() === cell(row, 0).trim()) codeIsAccountId++;

    access.push({
      legacy_key: key,
      account_id_raw: cell(row, 0),
      account_name: cell(row, 1),
      account_ref: accountRef,
      service_date_raw: cell(row, 2),
      service_type: cell(row, 3),
      frequency: cell(row, 4),
      cleaning_days: cell(row, 5),
      address: cell(row, 6),
      contact_name: cell(row, 7),
      phone: cell(row, 8),
      email: cell(row, 9),
      scope_of_work: cell(row, 10),
      status: cell(row, 11),
      last_visit_date_raw: cell(row, 12),
      next_scheduled_service: cell(row, 13),
      last_invoice_date_raw: cell(row, 14),
      monthly_revenue_raw: cell(row, 15),
      estimated_monthly_total_raw: cell(row, 16),
      portal_code: cell(row, 17),
      portal_access: cell(row, 18),
      sheet_row: sourceRow,
      source_sheet: "PORTAL",
      source_row: sourceRow,
    });
  }
  // Rows only (no names, phones or codes) in the issue text.
  for (const list of byName.values()) if (list.length > 1) run.issue("portal_access", `row-${list[0]}`, `Rows ${list.join(", ")} have the same Account Name. Settings → Portal shows the last one; the customer login uses the first that matches.`);
  for (const list of byCode.values()) if (list.length > 1) run.issue("portal_access", `row-${list[0]}`, `Rows ${list.join(", ")} have the same Portal Code. A login with that code always lands on row ${list[0]}.`);
  let sharedPhoneRows = 0;
  for (const list of byPhoneYes.values()) {
    if (list.length < 2) continue;
    sharedPhoneRows += list.length;
    run.issue("portal_access", `row-${list[0]}`, `Rows ${list.join(", ")} have portal access and the same phone. A login with that phone always looks at row ${list[0]} first, so the others cannot log in to /portal.`);
  }

  const before = await existingKeys(sql, "portal_access");
  const diff = compareKeys(run, "portal_access", access.map((r) => r.legacy_key), before);
  if (!dryRun) await upsertRows(sql, "portal_access", access);
  run.count("portal_access", {
    sheetRows: rows.length,
    blank: all.length - rows.length,
    imported: access.length,
    ...diff,
    linkedToAccount: access.length - unlinked,
    notLinked: unlinked,
    idColumnDiffersFromLink: idDiffers,
    accessYes: access.filter((r) => r.portal_access.trim().toUpperCase() === "YES").length,
    accessNeitherYesNorNo: oddAccess,
    noPhone,
    noPhoneButAccessYes: noPhoneYes,
    noCode,
    codeSameAsAccountId: codeIsAccountId,
    rowsSharingAPhoneWithAccess: sharedPhoneRows,
  });

  // ----- the request tabs (portal-billing-requests has no tab in the sheet).
  const requests = [];
  const perTab = {};
  for (const spec of REQUEST_TABS) {
    const tabAll = (await readTab("PORTAL", spec.tab, { range: spec.range })).slice(1).map((row, i) => ({ row, sourceRow: i + 2 }));
    const tabRows = tabAll.filter(({ row }) => !isBlankRow(row));
    perTab[spec.tab] = tabRows.length;
    for (const { row, sourceRow } of tabRows) {
      requests.push({
        legacy_key: `${spec.tab}:row-${sourceRow}`,
        tab: spec.tab,
        account_id_raw: cell(row, 0),
        account_name: cell(row, 1),
        account_ref: linkAccount(cell(row, 0), cell(row, 1)),
        submitted_date_raw: cell(row, 2),
        submitted_date: toDate(cell(row, 2)),
        field_1: cell(row, spec.fields[0]),
        field_2: cell(row, spec.fields[1]),
        field_3: cell(row, spec.fields[2]),
        status: cell(row, spec.status),
        staff_notes: cell(row, spec.notes),
        photos: spec.photos === null ? "" : cell(row, spec.photos),
        sheet_row: sourceRow,
        source_sheet: "PORTAL",
        source_row: sourceRow,
      });
    }
  }
  const beforeRequests = await existingKeys(sql, "portal_requests");
  const requestDiff = compareKeys(run, "portal_requests", requests.map((r) => r.legacy_key), beforeRequests);
  if (!dryRun) await upsertRows(sql, "portal_requests", requests);
  run.count("portal_requests", { ...perTab, imported: requests.length, ...requestDiff });

  await run.finish("ok");
} catch (error) {
  console.error("Import failed:", error);
  await run.finish("failed").catch(() => undefined);
  process.exitCode = 1;
}
