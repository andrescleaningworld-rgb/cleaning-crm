// Area 2 import: Staff, Managers → Postgres (dev branch only; Sheets read-only).
//
//   node scripts/migrate/import-people.mjs --dry-run
//   node scripts/migrate/import-people.mjs
//
// Safe to re-run. Never deletes. managers.staff_id is set only from a
// migration_overrides row (area 'people', kind 'manager_staff', legacy_key =
// manager legacy key, resolved_id = staff id); a same-name Staff record is
// only suggested as a question.
import { isBlankRow, readTab } from "./lib/sheets-readonly.mjs";
import { cell, compareKeys, dedupe, existingKeys, sha256, startRun, upsertRows } from "./lib/import-helpers.mjs";

const STAFF_ROLES = ["Manager", "OfficeStaff", "InsideStaff"];
const dryRun = process.argv.includes("--dry-run");
const run = await startRun("people", { dryRun });
const { sql } = run;

const norm = (text) => String(text ?? "").trim().toLowerCase().replace(/\s+/g, " ");

async function dataRows(sheet, tab, range) {
  const all = (await readTab(sheet, tab, { range })).slice(1).map((row, i) => ({ row, sourceRow: i + 2 }));
  const kept = all.filter(({ row }) => !isBlankRow(row));
  return { rows: kept, blank: all.length - kept.length };
}

try {
  /* ---------- Staff ---------- */
  const staffTab = await dataRows("MAIN", "Staff", "A:D");
  let staffSkipped = 0;
  const staffRecords = [];
  for (const { row, sourceRow } of staffTab.rows) {
    const id = cell(row, 0);
    if (!id) {
      staffSkipped++;
      run.issue("staff", `row-${sourceRow}`, `Row ${sourceRow}: no ID. Skipped (the app hides it too).`);
      continue;
    }
    const roleRaw = cell(row, 2);
    const role = STAFF_ROLES.includes(roleRaw.trim()) ? roleRaw.trim() : "InsideStaff";
    if (!STAFF_ROLES.includes(roleRaw.trim())) {
      run.issue("staff", id, `Role "${roleRaw}" is not one of ${STAFF_ROLES.join(", ")}. The app treats it as InsideStaff; kept that way.`, { rawValue: roleRaw });
    }
    const activeRaw = cell(row, 3).trim().toUpperCase();
    if (activeRaw && activeRaw !== "YES" && activeRaw !== "NO") {
      run.issue("staff", id, `Active is "${cell(row, 3)}", not Yes/No. Treated as active, like the app does.`, { rawValue: cell(row, 3) });
    }
    staffRecords.push({
      id,
      legacy_key: id,
      name: cell(row, 1),
      role,
      role_raw: roleRaw,
      active: activeRaw !== "NO",
      source_sheet: "MAIN",
      source_row: sourceRow,
    });
  }
  const staff = dedupe(run, "staff", staffRecords);
  const staffDiff = compareKeys(run, "staff", staff.map((r) => r.legacy_key), await existingKeys(sql, "staff"));
  if (!dryRun) await upsertRows(sql, "staff", staff);
  run.count("staff", { sheetRows: staffTab.rows.length, blank: staffTab.blank, skipped: staffSkipped, imported: staff.length, ...staffDiff });

  // Two staff with the same name: logins and sign-offs pick by id, so this
  // is only a heads-up.
  const staffByName = new Map();
  for (const s of staff) staffByName.set(norm(s.name), [...(staffByName.get(norm(s.name)) ?? []), s]);
  for (const [name, list] of staffByName) {
    if (name && list.length > 1) {
      run.issue("staff", list.map((s) => s.id).join("+"), `${list.length} Staff records share the name "${list[0].name}". Are they the same person?`, {
        candidates: list.map((s) => ({ id: s.id, role: s.role, active: s.active })),
      });
    }
  }

  /* ---------- Managers ---------- */
  const overrides = new Map(
    (await sql`SELECT legacy_key, resolved_id FROM migration_overrides WHERE area = 'people' AND kind = 'manager_staff'`).map((o) => [o.legacy_key, o.resolved_id])
  );
  const staffIds = new Set(staff.map((s) => s.id));
  const managerTab = await dataRows("MAIN", "Managers", "A:G");
  const managerRecords = [];
  let linked = 0;
  for (const { row, sourceRow } of managerTab.rows) {
    const managerId = cell(row, 0);
    const name = cell(row, 1);
    // The app lists every Managers row, with or without an ID.
    const legacyKey = managerId || sha256("manager", name.trim(), cell(row, 3).trim());
    if (!managerId) {
      run.issue("managers", legacyKey, `Row ${sourceRow} ("${name}") has no Manager ID. Imported; keyed by name + phone.`);
    }

    let staffId = null;
    if (overrides.has(legacyKey)) {
      const answer = overrides.get(legacyKey);
      if (answer && !staffIds.has(answer)) {
        run.issue("managers", legacyKey, `Your answer links "${name}" to Staff ${answer}, which does not exist. Left unlinked.`);
      } else {
        staffId = answer || null;
        if (staffId) linked++;
      }
    } else {
      const sameName = staffByName.get(norm(name)) ?? [];
      run.issue(
        "managers",
        legacyKey,
        sameName.length === 1
          ? `Is manager "${name}" the same person as Staff "${sameName[0].name}" (${sameName[0].id}, ${sameName[0].role})? Not linked until you say yes.`
          : sameName.length > 1
            ? `Manager "${name}" matches ${sameName.length} Staff records by name. Which one is it, if any?`
            : `Manager "${name}" has no Staff record with the same name. Which Staff record is it, if any?`,
        { rawValue: name, candidates: sameName.map((s) => ({ id: s.id, name: s.name, role: s.role, active: s.active })) }
      );
    }

    managerRecords.push({
      legacy_key: legacyKey,
      manager_id: managerId,
      name,
      email: cell(row, 2),
      phone: cell(row, 3),
      status: cell(row, 4),
      notes: cell(row, 5),
      calendar_color_id: cell(row, 6),
      staff_id: staffId,
      row_no: sourceRow,
      source_sheet: "MAIN",
      source_row: sourceRow,
    });
  }
  const managers = dedupe(run, "managers", managerRecords);
  const managerDiff = compareKeys(run, "managers", managers.map((r) => r.legacy_key), await existingKeys(sql, "managers"));
  if (!dryRun) await upsertRows(sql, "managers", managers);
  run.count("managers", { sheetRows: managerTab.rows.length, blank: managerTab.blank, skipped: 0, imported: managers.length, ...managerDiff, linkedToStaff: linked });

  /* ---------- Who points at Staff from the existing Postgres tables ---------- */
  // Reported only. Foreign keys are NOT added here: while Staff still lives
  // in Sheets, a new staff member exists there first, and a foreign key
  // would reject their login row / PIN / vehicle in production.
  for (const [table, column] of [["manager_accounts", "staff_id"], ["equipment_staff_pins", "staff_id"], ["vehicles", "driver_staff_id"]]) {
    const refs = await sql.query(`SELECT DISTINCT ${column} AS ref FROM ${table} WHERE ${column} IS NOT NULL AND ${column} <> ''`);
    const orphans = refs.map((r) => r.ref).filter((ref) => !staffIds.has(ref));
    run.count(`${table}.${column}`, { distinct: refs.length, matchStaff: refs.length - orphans.length, noStaffRecord: orphans.length });
    for (const ref of orphans) {
      run.issue(table, ref, `${table}.${column} = ${ref}, but there is no Staff record with that ID.`);
    }
  }

  await run.finish("ok");
} catch (error) {
  console.error("Import failed:", error);
  await run.finish("failed").catch(() => undefined);
  process.exitCode = 1;
}
