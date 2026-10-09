// Exercises every Postgres write in lib/pg/people.ts against the dev branch,
// checks the rows, and removes the test rows it made.
//   npx tsx scripts/migrate/check-people-writes.mts
import { loadEnv } from "./lib/env.mjs";
import { assertDevDatabase } from "./lib/guard.mjs";

loadEnv();
process.env.DATABASE_URL = assertDevDatabase(process.env.MIGRATION_DATABASE_URL);
process.env.OUTBOUND_DRY_RUN = "1";
process.env.DATA_SOURCE_PEOPLE = "postgres";

const data = await import("../../lib/data/people");
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
const before = { staff: (await data.fetchStaff()).length, managers: (await data.fetchManagers()).length };
const maxRow = Math.max(...(await data.fetchManagers()).map((m) => m.sheetRow));

try {
  // Staff
  const staffId = await data.appendStaff({ name: MARK, role: "OfficeStaff", active: true });
  check("appendStaff returns an STF- id", /^STF-[\d-]{8}-[a-z0-9]{1,4}$/.test(staffId), staffId);
  const list = await data.fetchStaff();
  check("new staff is last in the list", list[list.length - 1]?.id === staffId);
  check("OfficeStaff + active can sign", (await data.getActiveSigningStaffById(staffId))?.id === staffId);
  await data.updateStaff(staffId, { role: "InsideStaff" });
  let staff = await data.getStaffById(staffId);
  check("partial update changes only the role", staff?.role === "InsideStaff" && staff.name === MARK && staff.active === true);
  check("InsideStaff cannot sign", (await data.getActiveSigningStaffById(staffId)) === null);
  await data.updateStaff(staffId, { role: "Manager", active: false });
  staff = await data.getStaffById(staffId);
  check("deactivate keeps the record", staff?.active === false && staff.role === "Manager");
  check("inactive Manager cannot sign", (await data.getActiveSigningStaffById(staffId)) === null);
  check("update of a missing id says not found", await throwsWith(() => data.updateStaff("STF-nope", { name: "x" }), 'Staff "STF-nope" not found.'));
  check("update with a blank id is refused", await throwsWith(() => data.updateStaff(" ", { name: "x" }), "Missing staff id."));
  check("database refuses a role outside the three", await throwsWith(() => data.updateStaff(staffId, { role: "Boss" as never }), "check"));
  check("no equipment history for a new person (asks Sheets)", (await data.staffHasEquipmentCheckoutHistory(staffId)) === false);
  await data.deleteStaff(staffId);
  check("deleteStaff removes the record", (await data.getStaffById(staffId)) === null);
  check("deleting it again says not found", await throwsWith(() => data.deleteStaff(staffId), `Staff "${staffId}" not found.`));

  // Managers
  const managerId = await data.appendManager({ name: MARK, phone: "5555550100", status: "Active" });
  check("appendManager returns an MGR- id", /^MGR-[\d-]{8}-[a-z0-9]{1,4}$/.test(managerId), managerId);
  let manager = (await data.fetchManagers()).find((m) => m.managerId === managerId);
  check("new manager gets the next row number", manager?.sheetRow === maxRow + 1, `${manager?.sheetRow}`);
  await data.updateManager(manager!.sheetRow, { calendarColorId: "7" });
  manager = (await data.fetchManagers()).find((m) => m.managerId === managerId);
  check("update by row number changes only that field", manager?.calendarColorId === "7" && manager.name === MARK && manager.phone === "5555550100" && manager.status === "Active");
  check("calendar color is found by name, any casing", (await data.getManagerCalendarColorId(` ${MARK.toUpperCase()} `)) === "7");
  await data.updateManager(manager!.sheetRow, { calendarColorId: "" });
  check("clearing the color works (empty string is a value)", (await data.fetchManagers()).find((m) => m.managerId === managerId)?.calendarColorId === "");
  await data.updateManager(manager!.sheetRow, { status: "Inactive" });
  check("status change", (await data.fetchManagers()).find((m) => m.managerId === managerId)?.status === "Inactive");
  await data.updateManager(999999, { name: "x" });
  check("update of a row number that does not exist changes nothing", (await data.fetchManagers()).length === before.managers + 1);
} finally {
  await sql`DELETE FROM staff WHERE source_sheet IS NULL AND name = ${MARK}`;
  await sql`DELETE FROM managers WHERE source_sheet IS NULL AND name = ${MARK}`;
}

check("test rows cleaned up", (await data.fetchStaff()).length === before.staff && (await data.fetchManagers()).length === before.managers);
process.exitCode = failed ? 1 : 0;
