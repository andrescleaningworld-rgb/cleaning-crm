// Area 2 verify: Staff and Managers, Sheets vs Postgres (dev). Read-only.
//   node scripts/migrate/verify-people.mjs
import { cell, sha256 } from "./lib/import-helpers.mjs";
import { runVerify } from "./lib/verify-helpers.mjs";

const ROLES = ["Manager", "OfficeStaff", "InsideStaff"];

await runVerify("people", [
  {
    table: "staff",
    sheet: "MAIN",
    tab: "Staff",
    range: "A:D",
    key: (r) => cell(r, 0),
    keep: (r) => cell(r, 0) !== "",
    fields: {
      name: (r) => cell(r, 1),
      role_raw: (r) => cell(r, 2),
      role: (r) => (ROLES.includes(cell(r, 2).trim()) ? cell(r, 2).trim() : "InsideStaff"),
      active: (r) => String(cell(r, 3).trim().toUpperCase() !== "NO"),
    },
    statusColumn: "role",
  },
  {
    table: "managers",
    sheet: "MAIN",
    tab: "Managers",
    range: "A:G",
    key: (r) => cell(r, 0) || sha256("manager", cell(r, 1).trim(), cell(r, 3).trim()),
    fields: {
      manager_id: (r) => cell(r, 0),
      name: (r) => cell(r, 1),
      email: (r) => cell(r, 2),
      phone: (r) => cell(r, 3),
      status: (r) => cell(r, 4),
      notes: (r) => cell(r, 5),
      calendar_color_id: (r) => cell(r, 6),
      row_no: (_r, sourceRow) => String(sourceRow),
    },
    statusColumn: "status",
  },
]);
