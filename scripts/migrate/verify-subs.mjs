// Area 3 verify: Subcontractors and the Subcontractor Activity Log, Sheets vs
// Postgres (dev). Read-only.
//   node scripts/migrate/verify-subs.mjs
import { sha256 } from "./lib/import-helpers.mjs";
import { runVerify } from "./lib/verify-helpers.mjs";
import { readTab } from "./lib/sheets-readonly.mjs";

const norm = (text) => String(text ?? "").trim().toLowerCase().replace(/\s+/g, " ");

// Columns are found by header text, first match wins, like the app does.
const header = (await readTab("MAIN", "Subcontractors", { range: "1:1" }))[0] ?? [];
const positions = new Map();
header.forEach((h, i) => positions.set(norm(h), [...(positions.get(norm(h)) ?? []), i]));
const at = (row, name, nth = 0) => {
  const i = positions.get(name)?.[nth] ?? -1;
  return i === -1 ? "" : String(row[i] ?? "");
};
const insurance = (r) => at(r, "insurance expiration date") || at(r, "insurance expiration");

// The nth identical log line gets "#n" on its key, same as the import.
const seenLog = new Map();
const logKey = (r) => {
  const base = sha256(String(r[0] ?? "").trim(), norm(r[1]), String(r[3] ?? "").trim(), String(r[4] ?? "").trim());
  const n = (seenLog.get(base) ?? 0) + 1;
  seenLog.set(base, n);
  return n === 1 ? base : `${base}#${n}`;
};
await runVerify("subs", [
  {
    table: "subcontractors",
    sheet: "MAIN",
    tab: "Subcontractors",
    range: "A:Z",
    keyColumn: "legacy_row_id",
    key: (_r, sourceRow) => `SUB-ROW-${sourceRow}`,
    keep: (r) => r.slice(1).some((c) => String(c ?? "").trim() !== ""),
    fields: {
      display_id_raw: (r) => at(r, "subcontractor id"),
      contact_name: (r) => at(r, "contact name"),
      company_name: (r) => at(r, "company name"),
      address: (r) => at(r, "address"),
      phone: (r) => at(r, "phone"),
      email: (r) => at(r, "email"),
      areas_serviced: (r) => at(r, "areas serviced"),
      services_provided: (r) => at(r, "services provided"),
      employee_capacity: (r) => at(r, "employee capacity"),
      insurance_document_name: (r) => at(r, "insurance document name"),
      insurance_expiration_raw: (r) => insurance(r),
      status: (r) => at(r, "status"),
      notes: (r) => at(r, "notes"),
      created_at_raw: (r) => at(r, "created at"),
      updated_at_raw: (r) => at(r, "updated at"),
      extra_id_raw: (r) => at(r, "id"),
      extra_phone_raw: (r) => at(r, "phone", 1),
      source_row: (_r, sourceRow) => String(sourceRow),
    },
    statusColumn: "status",
    dateColumn: "insurance_expiration",
  },
  {
    table: "sub_activity_log",
    sheet: "MAIN",
    tab: "Subcontractor Activity Log",
    range: "A:E",
    readOptions: { unformatted: true },
    key: (r) => logKey(r),
    fields: {
      logged_at_raw: (r) => String(r[0] ?? ""),
      subcontractor_email: (r) => String(r[1] ?? ""),
      subcontractor_name: (r) => String(r[2] ?? ""),
      action_type: (r) => String(r[3] ?? ""),
      details: (r) => String(r[4] ?? ""),
    },
    statusColumn: "action_type",
    dateColumn: "logged_at",
  },
]);
