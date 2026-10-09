// Area 1 import: ChangeLog, GeocodeCache, ExtraServices, Documents,
// DocumentSends → Postgres (dev branch only; Sheets read-only).
//
//   node scripts/migrate/import-catalogs.mjs --dry-run    read, count, report; write nothing
//   node scripts/migrate/import-catalogs.mjs              upsert by legacy_key
//
// Safe to re-run. Rows that vanished from Sheets are reported, never deleted.
import { isBlankRow, readTab } from "./lib/sheets-readonly.mjs";
import { cell, compareKeys, dedupe, existingKeys, sha256, startRun, toDate, toTimestamp, upsertRows } from "./lib/import-helpers.mjs";

const DOCUMENT_CATEGORIES = ["Contract", "Handbook", "Policy", "Other"];
const dryRun = process.argv.includes("--dry-run");
const run = await startRun("catalogs", { dryRun });
const { sql } = run;

/** Data rows with their sheet row number, blank rows dropped and counted. */
async function dataRows(sheet, tab, range) {
  const all = (await readTab(sheet, tab, { range })).slice(1).map((row, i) => ({ row, sourceRow: i + 2 }));
  const kept = all.filter(({ row }) => !isBlankRow(row));
  return { rows: kept, blank: all.length - kept.length };
}

async function importTable(table, sheet, tab, range, toRecord, options) {
  const { rows, blank } = await dataRows(sheet, tab, range);
  const records = [];
  let skipped = 0;
  for (const { row, sourceRow } of rows) {
    const record = toRecord(row, sourceRow);
    if (!record) {
      skipped++;
      continue;
    }
    records.push({ ...record, source_sheet: sheet, source_row: sourceRow });
  }
  const unique = dedupe(run, table, records);
  const before = await existingKeys(sql, table);
  const diff = compareKeys(run, table, unique.map((r) => r.legacy_key), before);
  if (!dryRun) await upsertRows(sql, table, unique, options);
  run.count(table, { sheetRows: rows.length, blank, skipped, imported: unique.length, ...diff });
}

try {
  // ChangeLog has no ID column: the key is the content of the row.
  await importTable("changelog_entries", "PORTAL", "ChangeLog", "A:C", (row, sourceRow) => {
    const dateRaw = cell(row, 0);
    const version = cell(row, 1);
    const description = cell(row, 2);
    const entryDate = toDate(dateRaw);
    const legacyKey = sha256(dateRaw.trim(), version.trim(), description.trim());
    if (dateRaw.trim() && !entryDate) {
      run.issue("changelog_entries", legacyKey, `Row ${sourceRow}: date is not a date. Kept as text.`, { rawValue: dateRaw });
    }
    return { legacy_key: legacyKey, entry_date: entryDate, entry_date_raw: dateRaw, version, description };
  });

  await importTable("geocode_cache", "MAIN", "GeocodeCache", "A:D", (row, sourceRow) => {
    const address = cell(row, 0).trim();
    const latitude = Number(cell(row, 1));
    const longitude = Number(cell(row, 2));
    if (!address || cell(row, 1).trim() === "" || cell(row, 2).trim() === "" || Number.isNaN(latitude) || Number.isNaN(longitude)) {
      run.issue("geocode_cache", address || `row-${sourceRow}`, `Row ${sourceRow}: missing address or coordinates. Skipped (the app ignores it too).`);
      return null;
    }
    return {
      address,
      legacy_key: address,
      latitude,
      longitude,
      geocoded_at: toTimestamp(cell(row, 3)),
      geocoded_at_raw: cell(row, 3),
    };
  });

  await importTable("extra_services", "PORTAL", "ExtraServices", "A:F", (row, sourceRow) => {
    const id = cell(row, 0);
    if (!id) {
      run.issue("extra_services", `row-${sourceRow}`, `Row ${sourceRow}: no Id. Skipped (the app hides it too).`);
      return null;
    }
    const activeRaw = cell(row, 4).trim().toUpperCase();
    if (activeRaw && activeRaw !== "YES" && activeRaw !== "NO") {
      run.issue("extra_services", id, `Active is "${cell(row, 4)}", not Yes/No. Treated as active, like the app does.`, { rawValue: cell(row, 4) });
    }
    return {
      id,
      legacy_key: id,
      name: cell(row, 1),
      description: cell(row, 2),
      image_url: cell(row, 3),
      // Only an explicit "No" hides a service (same rule as fetchExtraServices).
      active: activeRaw !== "NO",
      sort_order: Math.trunc(Number(cell(row, 5))) || 0,
    };
  });

  await importTable("documents", "MAIN", "Documents", "A:H", (row, sourceRow) => {
    const id = cell(row, 0);
    if (!id) {
      run.issue("documents", `row-${sourceRow}`, `Row ${sourceRow}: no ID. Skipped (the app hides it too).`);
      return null;
    }
    const category = cell(row, 2);
    if (!DOCUMENT_CATEGORIES.includes(category)) {
      run.issue("documents", id, `Category "${category}" is not one of ${DOCUMENT_CATEGORIES.join(", ")}. Kept as is.`, { rawValue: category });
    }
    const uploadedAtRaw = cell(row, 6);
    const uploadedAt = toTimestamp(uploadedAtRaw);
    if (uploadedAtRaw.trim() && !uploadedAt) {
      run.issue("documents", id, "UploadedAt is not a date and time. Kept as text.", { rawValue: uploadedAtRaw });
    }
    return {
      id,
      legacy_key: id,
      name: cell(row, 1),
      category,
      file_name: cell(row, 3),
      file_url: cell(row, 4),
      file_size: Math.trunc(Number(cell(row, 5))) || 0,
      uploaded_at: uploadedAt,
      uploaded_at_raw: uploadedAtRaw,
      uploaded_by: cell(row, 7),
    };
  });

  const documentIds = new Set((await readTab("MAIN", "Documents", { range: "A:A" })).slice(1).map((r) => cell(r, 0)).filter(Boolean));
  let orphanSends = 0;
  await importTable(
    "document_sends",
    "MAIN",
    "DocumentSends",
    "A:H",
    (row, sourceRow) => {
      const id = cell(row, 0);
      if (!id) {
        run.issue("document_sends", `row-${sourceRow}`, `Row ${sourceRow}: no ID. Skipped (the app hides it too).`);
        return null;
      }
      // Expected: documents are hard-deleted while their send history stays.
      if (!documentIds.has(cell(row, 1))) orphanSends++;
      const sentAtRaw = cell(row, 6);
      const sentAt = toTimestamp(sentAtRaw);
      if (sentAtRaw.trim() && !sentAt) {
        run.issue("document_sends", id, "SentAt is not a date and time. Kept as text.", { rawValue: sentAtRaw });
      }
      return {
        id,
        legacy_key: id,
        document_id: cell(row, 1),
        document_name: cell(row, 2),
        // subcontractor_id is resolved by Area 3; this import never touches it.
        subcontractor_id_raw: cell(row, 3),
        subcontractor_name: cell(row, 4),
        sent_by: cell(row, 5),
        sent_at: sentAt,
        sent_at_raw: sentAtRaw,
        note: cell(row, 7),
      };
    }
  );
  run.count("document_sends", { forDeletedDocuments: orphanSends });

  await run.finish("ok");
} catch (error) {
  console.error("Import failed:", error);
  await run.finish("failed").catch(() => undefined);
  process.exitCode = 1;
}
