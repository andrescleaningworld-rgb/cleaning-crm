// Exercises every Postgres write in lib/pg/subs.ts against the dev branch,
// checks the rows, and removes the test rows it made.
//   npx tsx scripts/migrate/check-subs-writes.mts
import { loadEnv } from "./lib/env.mjs";
import { assertDevDatabase } from "./lib/guard.mjs";

loadEnv();
process.env.DATABASE_URL = assertDevDatabase(process.env.MIGRATION_DATABASE_URL);
process.env.OUTBOUND_DRY_RUN = "1";
process.env.DATA_SOURCE_SUBS = "postgres";

const data = await import("../../lib/data/subs");
const { getSql } = await import("../../lib/db");
const sql = getSql();

let failed = false;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` – ${detail}` : ""}`);
};
const throwsWith = async (run: () => Promise<unknown>, text: string) => {
  try {
    await run();
    return false;
  } catch (e) {
    return e instanceof Error && e.message.includes(text);
  }
};

const MARK = "__migration-write-test__";
const before = await data.getAllSubcontractorsRaw();
const maxRow = Math.max(...before.map((s) => Number(/^SUB-ROW-(\d+)$/.exec(s.id)?.[1] ?? 0)));
const snapshot = JSON.stringify(before);

try {
  // Add (replaces the Apps Script action).
  const created = await data.addSubcontractor({
    action: "ignored",
    companyName: MARK,
    contactName: "Test Person",
    phone: "5555550100",
    email: "test@example.invalid",
    insuranceExpiration: "12/31/2027",
    status: "Active",
    score: "99", // form-only fields the sheet has no column for
    accountsAssigned: "3",
    id: "SUB-ROW-1", // must never be taken from the form
  });
  check("new sub gets the next row-position id", created.id === `SUB-ROW-${maxRow + 1}`, created.id);
  check("new sub gets a new permanent id", /^SUB-\d{3}$/.test(created.subcontractorId) && created.subcontractorId !== "SUB-001", created.subcontractorId);
  const list = await data.getAllSubcontractorsRaw();
  const added = list[list.length - 1];
  check("it is last in the list with its fields", added.id === created.id && added.companyName === MARK && added.contactName === "Test Person" && added.phone === "5555550100" && added.status === "Active" && added.insuranceExpiration === "12/31/2027");
  check("form-only fields are not stored", !("score" in added) && !("accountsAssigned" in added));
  const [row] = await sql`SELECT insurance_expiration::text AS d, display_id_raw, fingerprint FROM subcontractors WHERE id = ${created.subcontractorId}`;
  check("typed insurance date and display id are set", row.d === "2027-12-31" && row.display_id_raw === `SUB-${String(maxRow).padStart(3, "0")}`, `${row.d} ${row.display_id_raw}`);

  // Update.
  const updated = await data.updateSubcontractor(created.id, { phone: "5555550199", notes: "note", unknownField: "x", id: "SUB-ROW-2", "Subcontractor ID": "SUB-999" });
  check("update returns the row keyed by sheet headers", updated.Phone === "5555550199" && updated.Notes === "note" && updated["Company Name"] === MARK && updated["Subcontractor ID"] === row.display_id_raw);
  const after = (await data.getAllSubcontractorsRaw()).find((s) => s.id === created.id)!;
  check("only the sent fields changed", after.phone === "5555550199" && after.notes === "note" && after.contactName === "Test Person" && after.email === "test@example.invalid");
  check("lower-case id works too", (await data.updateSubcontractor(created.id.toLowerCase(), { status: "Paused" })).Status === "Paused");
  await data.updateSubcontractor(created.id, { email: "new@example.invalid" });
  const [fp] = await sql`SELECT fingerprint FROM subcontractors WHERE id = ${created.subcontractorId}`;
  check("fingerprint follows an email change", fp.fingerprint !== row.fingerprint);
  check("clearing a field works (empty string is a value)", (await data.updateSubcontractor(created.id, { notes: "" })).Notes === "");
  check("update with no known fields returns the row unchanged", (await data.updateSubcontractor(created.id, { nope: 1 })).Email === "new@example.invalid");
  check("missing row says not found", await throwsWith(() => data.updateSubcontractor("SUB-ROW-99999", { phone: "1" }), 'Subcontractor "SUB-ROW-99999" not found.'));
  check("blank id is refused", await throwsWith(() => data.updateSubcontractor("  ", { phone: "1" }), "Missing subcontractor id."));

  // The Apps Script-shaped list.
  const shape = (await data.getSubcontractorsAppsScriptShape()).find((s) => s.companyName === MARK)!;
  check("Apps Script-shaped list: label, status as saved, id", shape.displayName === `Test Person — ${MARK}` && shape.status === "Paused" && shape.id === created.id);
  check("texting uses the normal Phone column", shape.phone === "5555550199", shape.phone);
  await sql`UPDATE subcontractors SET phone = '', extra_phone_raw = '5555550111' WHERE id = ${created.subcontractorId}`;
  check("…and falls back to the second Phone column when the first is empty", (await data.getSubcontractorsAppsScriptShape()).find((s) => s.companyName === MARK)!.phone === "5555550111");
  const withPhone = (await data.getSubcontractorsAppsScriptShape()).filter((s) => s.phone && s.companyName !== MARK).length;
  check("subs that can now be texted", withPhone > 8, `${withPhone} of 39 (was 8)`);
} finally {
  await sql`DELETE FROM subcontractors WHERE source_sheet IS NULL AND company_name = ${MARK}`;
}

check("test rows cleaned up and nothing else changed", JSON.stringify(await data.getAllSubcontractorsRaw()) === snapshot);
process.exitCode = failed ? 1 : 0;
