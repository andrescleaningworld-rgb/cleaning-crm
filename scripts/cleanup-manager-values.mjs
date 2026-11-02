// One-time cleanup of the saved manager values (Nov 2026). Approved list:
//   - accounts saved as "Andres" -> "Andrés"
//   - the 12 accounts below -> one manager each (your picks)
//   - the "CW" row on the Managers list -> Inactive
//   - the one "Claude Test" visit -> deleted
// Visit and account update history is not touched.
//
// DRY RUN by default: shows every change and saves nothing.
//   node --env-file=.env.local scripts/cleanup-manager-values.mjs
// Save, after a backup branch in Neon, all in one transaction:
//   node --env-file=.env.local scripts/cleanup-manager-values.mjs --apply --backup-done
//
// Each account changes only if its manager is still what it was when you
// picked (the "from" below); otherwise nothing at all is saved. An account
// keeps its manager in two places, manager_raw and the saved sheet row
// (unformatted, column 9, which some screens read); both are changed, and
// manager_id is re-linked to the Managers list by name.

import { neon } from "@neondatabase/serverless";

// to: a manager's name, "" for blank, null while not decided yet (saving refuses).
const PICKS = [
  { id: "ferragamo", name: "Ferragamo", from: "Andres , Greg", to: "Andrés" },
  { id: "rose-brand", name: "Rose Brand", from: "Andres , Greg", to: "Andrés" },
  { id: "terrascend", name: "Terrascend", from: "Andres , Greg", to: "Andrés" },
  { id: "corcoran-sawyer-smith", name: "Corcoran Sawyer Smith", from: "Greg , Andres", to: "Greg" },
  { id: "johnson-free-public-library", name: "Johnson Free Public Library", from: "Greg , Andres", to: "Greg" },
  { id: "lasership", name: "Lasership", from: "Greg , Andres", to: "Greg" },
  { id: "pmi-prime", name: "PMI Prime", from: "Greg , Andres", to: "Greg" },
  { id: "ACCT-20260713123855", name: "Cogent Communications", from: "Drew/Greg", to: "Drew" },
  { id: "ACCT-20260716163152", name: "887 Kinderkamack Rd", from: "CW", to: "Greg" },
  { id: "global-home-improvement", name: "Global Home Improvement", from: "CW", to: "Greg" },
  { id: "wick-companies--510-hamilton", name: "Wick Companies - 510 Hamilton", from: "CW", to: "Greg" },
  { id: "annie--ems-bakeshop", name: "Annie & Em's Bakeshop", from: "Cleaning World", to: "" },
];
const SPELLING = { from: "Andres", to: "Andrés" };
const TEST_VISIT = { visitId: "VISIT-20260818205235", completedBy: "Claude Test" };
const MANAGERS_ROW_OFF = "CW";

const apply = process.argv.includes("--apply");
const backupDone = process.argv.includes("--backup-done");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run with: node --env-file=.env.local scripts/cleanup-manager-values.mjs");
  process.exit(1);
}
if (apply && !backupDone) {
  console.error("Make a backup branch in Neon first, then add --backup-done. Nothing was saved.");
  process.exit(1);
}
const sql = neon(url);
console.log(`Database: ${new URL(url).hostname.split(".")[0]} · ${apply ? "SAVING" : "DRY RUN, nothing is saved"}\n`);

const problems = [];
const show = (value) => (value === "" ? "(blank)" : JSON.stringify(value));

// The Managers list rows, to re-link manager_id by name.
const managerRows = await sql`SELECT id, name, status FROM managers`;
const managerIdFor = (name) => {
  const key = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return null;
  const hits = managerRows.filter((row) => row.name.trim().toLowerCase().replace(/\s+/g, " ") === key);
  return hits.length === 1 ? Number(hits[0].id) : null;
};
// What every Manager dropdown offers now: Staff, role Manager, active.
const staffManagers = (await sql`SELECT name FROM staff WHERE role = 'Manager' AND active`).map((row) => row.name.trim());

// 1. "Andres" -> "Andrés"
const spelling = await sql`SELECT id, account_name, (to_jsonb(accounts)->>'deleted_at') IS NOT NULL AS deleted FROM accounts WHERE btrim(manager_raw) = ${SPELLING.from} ORDER BY lower(account_name)`;
console.log(`1. Spelling: ${spelling.length} accounts ${show(SPELLING.from)} -> ${show(SPELLING.to)} (${spelling.filter((row) => row.deleted).length} of them deleted accounts)`);
for (const row of spelling.slice(0, 5)) console.log(`     e.g. ${row.account_name}`);
if (spelling.length > 5) console.log(`     ... and ${spelling.length - 5} more`);

// 2. One manager per account
console.log("\n2. One manager per account");
const current = await sql`SELECT id, account_name, manager_raw FROM accounts WHERE id = ANY(${PICKS.map((pick) => pick.id)})`;
for (const pick of PICKS) {
  const row = current.find((entry) => entry.id === pick.id);
  if (!row) {
    problems.push(`${pick.name} (${pick.id}) is not in the database.`);
    console.log(`   ✗ ${pick.name}: not found`);
    continue;
  }
  const now = row.manager_raw.trim();
  if (now !== pick.from) {
    problems.push(`${pick.name}: its manager is now ${show(now)}, not ${show(pick.from)} as when you picked.`);
    console.log(`   ✗ ${pick.name}: manager is now ${show(now)}, expected ${show(pick.from)}`);
    continue;
  }
  if (pick.to === null) {
    problems.push(`${pick.name}: no manager picked yet.`);
    console.log(`   ? ${pick.name}: ${show(pick.from)} -> NOT DECIDED YET`);
    continue;
  }
  if (pick.to !== "" && !staffManagers.includes(pick.to)) problems.push(`${pick.name}: ${show(pick.to)} is not an active Manager on the Staff list.`);
  console.log(`   ✓ ${pick.name}: ${show(pick.from)} -> ${show(pick.to)}`);
}

// 3. The "CW" row on the Managers list
const cwRows = managerRows.filter((row) => row.name.trim() === MANAGERS_ROW_OFF);
console.log(`\n3. Managers list: ${cwRows.length} row named ${show(MANAGERS_ROW_OFF)}, status ${cwRows.map((row) => show(row.status)).join(", ") || "-"} -> "Inactive"`);
if (cwRows.length !== 1) problems.push(`Expected one Managers row named ${show(MANAGERS_ROW_OFF)}, found ${cwRows.length}.`);

// 4. The test visit
const visits = await sql`SELECT visit_id, account_name, visit_date_raw FROM visits WHERE visit_id = ${TEST_VISIT.visitId} AND btrim(completed_by) = ${TEST_VISIT.completedBy}`;
const editLog = await sql`SELECT count(*)::int AS n FROM visit_edit_log WHERE visit_id = ${TEST_VISIT.visitId}`;
console.log(`\n4. Delete visit ${TEST_VISIT.visitId}: ${visits.length ? `${visits[0].account_name}, ${visits[0].visit_date_raw}` : "not found"} (and ${editLog[0].n} edit history rows)`);
if (visits.length !== 1) problems.push(`Expected the one "${TEST_VISIT.completedBy}" visit, found ${visits.length}.`);

if (problems.length) {
  console.log(`\n${problems.length} thing(s) to settle before saving:`);
  for (const problem of problems) console.log(`   - ${problem}`);
}

if (!apply) {
  console.log(`\nDry run: nothing was saved.${problems.length ? "" : " To save: make a backup branch in Neon, then add --apply --backup-done."}`);
  process.exit(0);
}
if (problems.length) {
  console.log("\nNothing was saved.");
  process.exit(1);
}

// Save: everything in one transaction, or nothing.
const results = await sql.transaction([
  sql`
    UPDATE accounts SET
      manager_raw = ${SPELLING.to},
      manager_id = ${managerIdFor(SPELLING.to)},
      unformatted = CASE WHEN jsonb_typeof(unformatted) = 'array' AND jsonb_array_length(unformatted) > 9
                         THEN jsonb_set(unformatted, '{9}', to_jsonb(${SPELLING.to}::text)) ELSE unformatted END,
      updated_at = now()
    WHERE btrim(manager_raw) = ${SPELLING.from}
    RETURNING id`,
  ...PICKS.map((pick) => sql`
    UPDATE accounts SET
      manager_raw = ${pick.to},
      manager_id = ${managerIdFor(pick.to)},
      unformatted = CASE WHEN jsonb_typeof(unformatted) = 'array' AND jsonb_array_length(unformatted) > 9
                         THEN jsonb_set(unformatted, '{9}', to_jsonb(${pick.to}::text)) ELSE unformatted END,
      updated_at = now()
    WHERE id = ${pick.id} AND btrim(manager_raw) = ${pick.from}
    RETURNING id`),
  sql`UPDATE managers SET status = 'Inactive', updated_at = now() WHERE btrim(name) = ${MANAGERS_ROW_OFF} RETURNING id`,
  sql`DELETE FROM visit_edit_log WHERE visit_id = ${TEST_VISIT.visitId} RETURNING visit_id`,
  sql`DELETE FROM visits WHERE visit_id = ${TEST_VISIT.visitId} AND btrim(completed_by) = ${TEST_VISIT.completedBy} RETURNING visit_id`,
]);

const counts = results.map((rows) => rows.length);
const picked = counts.slice(1, 1 + PICKS.length).reduce((sum, n) => sum + n, 0);
console.log(`\nSaved: ${counts[0]} spelling, ${picked} of ${PICKS.length} picks, ${counts[1 + PICKS.length]} Managers row set Inactive, ${counts[2 + PICKS.length]} edit history rows and ${counts[3 + PICKS.length]} visit deleted.`);
