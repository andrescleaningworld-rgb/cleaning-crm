// Area 13 import: Sub Portal Issues and Photos (MAIN) → Postgres (dev branch
// only; Sheets read-only).
//
//   node scripts/migrate/import-sub-portal.mjs --dry-run    read, count, report; write nothing
//   node scripts/migrate/import-sub-portal.mjs              upsert by legacy_key
//
// Safe to re-run. Rows that vanished from Sheets are reported, never deleted.
// Run after import-subs and import-accounts: the links are looked up in
// Postgres. The portal's activity log was imported with the subs (Area 3).
import { isBlankRow, readTab } from "./lib/sheets-readonly.mjs";
import { cell, compareKeys, existingKeys, startRun, toDate, upsertRows } from "./lib/import-helpers.mjs";

const dryRun = process.argv.includes("--dry-run");
const run = await startRun("sub-portal", { dryRun });
const { sql } = run;

const norm = (text) => String(text ?? "").trim().toLowerCase();

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
const subsByEmail = new Map();
for (const r of await sql.query("SELECT id, lower(btrim(email)) AS email FROM subcontractors WHERE btrim(email) <> ''")) {
  subsByEmail.set(r.email, subsByEmail.has(r.email) ? null : r.id); // null = more than one sub with this email
}

/** Keys by the row's own id; a repeated or missing id falls back to the row number. */
function keyer(run, table, idLabel) {
  const seen = new Set();
  return (id, sourceRow) => {
    let key = id || `row-${sourceRow}`;
    if (!id) run.issue(table, key, `Row ${sourceRow}: no ${idLabel}. Kept.`);
    if (seen.has(key)) {
      run.issue(table, key, `Row ${sourceRow}: this ${idLabel} is already used by an earlier row. Both kept.`);
      key = `${id}#${sourceRow}`;
    }
    seen.add(key);
    return key;
  };
}

try {
  // ----- Sub Portal Issues
  const issueAll = (await readTab("MAIN", "Sub Portal Issues", { range: "A:L" })).slice(1).map((row, i) => ({ row, sourceRow: i + 2 }));
  const issueRows = issueAll.filter(({ row }) => !isBlankRow(row));
  const issueKey = keyer(run, "sub_portal_issues", "Issue ID");
  const issues = issueRows.map(({ row, sourceRow }) => {
    const key = issueKey(cell(row, 1).trim(), sourceRow);
    const email = norm(cell(row, 2));
    const subId = email ? subsByEmail.get(email) ?? null : null;
    if (!subId) run.issue("sub_portal_issues", key, "The Subcontractor Email matches no single subcontractor. Kept as text, not linked.");
    const accountRef = linkAccount(cell(row, 4), cell(row, 5));
    if (!accountRef) run.issue("sub_portal_issues", key, "Neither the Account ID nor the Account Name matches an account. Kept as text, not linked.");
    return {
      legacy_key: key,
      timestamp_raw: cell(row, 0),
      reported_on: toDate(cell(row, 0)),
      issue_id: cell(row, 1),
      subcontractor_email: cell(row, 2),
      subcontractor_name: cell(row, 3),
      subcontractor_id: subId,
      account_id_raw: cell(row, 4),
      account_name: cell(row, 5),
      account_ref: accountRef,
      issue_type: cell(row, 6),
      urgency: cell(row, 7),
      description: cell(row, 8),
      photo_count_raw: cell(row, 9),
      status: cell(row, 10),
      notes: cell(row, 11),
      sheet_row: sourceRow,
      source_sheet: "MAIN",
      source_row: sourceRow,
    };
  });
  const beforeIssues = await existingKeys(sql, "sub_portal_issues");
  const issueDiff = compareKeys(run, "sub_portal_issues", issues.map((r) => r.legacy_key), beforeIssues);
  if (!dryRun) await upsertRows(sql, "sub_portal_issues", issues);
  run.count("sub_portal_issues", {
    sheetRows: issueRows.length,
    blank: issueAll.length - issueRows.length,
    imported: issues.length,
    ...issueDiff,
    linkedToSub: issues.filter((r) => r.subcontractor_id).length,
    linkedToAccount: issues.filter((r) => r.account_ref).length,
    statusNew: issues.filter((r) => norm(r.status) === "new").length,
  });

  // ----- Photos (a copy for the record; the app still lists photos through Apps Script)
  const photoAll = (await readTab("MAIN", "Photos", { range: "A:N" })).slice(1).map((row, i) => ({ row, sourceRow: i + 2 }));
  const photoRows = photoAll.filter(({ row }) => !isBlankRow(row));
  const photoKey = keyer(run, "photos", "Photo ID");
  const photos = photoRows.map(({ row, sourceRow }) => ({
    legacy_key: photoKey(cell(row, 1).trim(), sourceRow),
    timestamp_raw: cell(row, 0),
    taken_on: toDate(cell(row, 0)),
    photo_id: cell(row, 1),
    account_id_raw: cell(row, 2),
    account_name: cell(row, 3),
    account_ref: linkAccount(cell(row, 2), cell(row, 3)),
    source_type: cell(row, 4),
    source_id: cell(row, 5),
    uploaded_by: cell(row, 6),
    user_role: cell(row, 7),
    file_name: cell(row, 8),
    drive_file_id: cell(row, 9),
    drive_url: cell(row, 10),
    folder_url: cell(row, 11),
    notes: cell(row, 12),
    status: cell(row, 13),
    sheet_row: sourceRow,
    source_sheet: "MAIN",
    source_row: sourceRow,
  }));
  // Does each photo's source exist? (complaint id / issue id)
  const complaintIds = new Set((await sql.query("SELECT btrim(complaint_id) AS id FROM complaints")).map((r) => r.id));
  const issueIds = new Set(issues.map((r) => r.issue_id.trim()));
  let orphan = 0;
  for (const p of photos) {
    const known = norm(p.source_type) === "complaint" ? complaintIds.has(p.source_id.trim()) : norm(p.source_type) === "sub portal issue" ? issueIds.has(p.source_id.trim()) : false;
    if (!known) {
      orphan++;
      run.issue("photos", p.legacy_key, `The photo's source (${p.source_type || "no type"}) is not a complaint or issue that exists today. Kept.`);
    }
  }
  const beforePhotos = await existingKeys(sql, "photos");
  const photoDiff = compareKeys(run, "photos", photos.map((r) => r.legacy_key), beforePhotos);
  if (!dryRun) await upsertRows(sql, "photos", photos);
  run.count("photos", {
    sheetRows: photoRows.length,
    blank: photoAll.length - photoRows.length,
    imported: photos.length,
    ...photoDiff,
    linkedToAccount: photos.filter((r) => r.account_ref).length,
    sourceNotFound: orphan,
  });

  await run.finish("ok");
} catch (error) {
  console.error("Import failed:", error);
  await run.finish("failed").catch(() => undefined);
  process.exitCode = 1;
}
