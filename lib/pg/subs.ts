// Postgres versions of the Subcontractors and Subcontractor Activity Log
// reads/writes in lib/googleSheets.ts, plus addSubcontractor, which in the
// Sheets world is done by the Apps Script backend. Same return shapes,
// ordering and error messages, so lib/data/subs.ts can switch between them.
//
// Ids: the app still speaks row-position ids ("SUB-ROW-<n>"). Here that is
// the legacy_row_id column, which never changes once a sub is in Postgres.
// The permanent id (subcontractors.id, "SUB-0NN") is used for links between
// tables; screens move to it when their area is redesigned.

import crypto from "node:crypto";
import { getSql } from "@/lib/db";
import type { RawSubcontractorRow, SubcontractorActivityLogEntry } from "@/lib/googleSheets";

const SHEET_ORDER = "source_row NULLS LAST, created_at, id";

// Field name the app sends → column. Same list as SUBCONTRACTOR_FIELD_ALIASES
// in lib/googleSheets.ts; anything else is ignored, never guessed.
const FIELD_COLUMNS: Record<string, string> = {
  companyName: "company_name",
  contactName: "contact_name",
  phone: "phone",
  email: "email",
  address: "address",
  areasServiced: "areas_serviced",
  servicesProvided: "services_provided",
  employeeCapacity: "employee_capacity",
  insuranceExpiration: "insurance_expiration_raw",
  status: "status",
  notes: "notes",
};

type SubRow = Record<string, string | number | null> & {
  id: string;
  legacy_row_id: string;
  display_id_raw: string;
};

const norm = (text: unknown) => String(text ?? "").trim().toLowerCase().replace(/\s+/g, " ");

// Must match fingerprintOf in scripts/migrate/import-subs.mjs.
function fingerprintOf(contact: string, company: string, email: string): string {
  return crypto.createHash("sha256").update([norm(contact), norm(company), norm(email)].join("\u001f")).digest("hex");
}

// YYYY-MM-DD or M/D/YYYY → YYYY-MM-DD; anything else has no typed date.
function toDate(raw: string): string | null {
  const text = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

/* ---------- reads ---------- */

export async function getAllSubcontractorsRaw(): Promise<RawSubcontractorRow[]> {
  const sql = getSql();
  const rows = (await sql.query(`SELECT * FROM subcontractors ORDER BY ${SHEET_ORDER}`)) as SubRow[];
  return rows.map((row) => {
    const result: RawSubcontractorRow = { id: row.legacy_row_id };
    for (const [field, column] of Object.entries(FIELD_COLUMNS)) {
      result[field] = String(row[column] ?? "").trim();
    }
    return result;
  });
}

// "M/D/YYYY H:MM:SS" (what the sheet shows) → local "YYYY-MM-DDTHH:mm:ss",
// same as parseSheetDateTime in lib/googleSheets.ts.
function parseSheetDateTime(text: string): string {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/.exec(text.trim());
  if (!match) return text;
  const [, m, d, y, h, min, s] = match;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${h.padStart(2, "0")}:${min}:${s}`;
}

export async function getSubcontractorActivityLog(): Promise<SubcontractorActivityLogEntry[]> {
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT logged_at_raw, subcontractor_email, subcontractor_name, action_type, details
     FROM sub_activity_log ORDER BY ${SHEET_ORDER}`
  )) as { logged_at_raw: string; subcontractor_email: string; subcontractor_name: string; action_type: string; details: string }[];
  return rows.map((row) => ({
    timestamp: parseSheetDateTime(row.logged_at_raw),
    subcontractorEmail: row.subcontractor_email.trim(),
    subcontractorName: row.subcontractor_name.trim(),
    actionType: row.action_type.trim(),
    details: row.details.trim(),
  }));
}

/* ---------- writes ---------- */

// The record updateSubcontractor returns in Sheets is keyed by the tab's
// header texts (first column with a given header wins).
function toHeaderRecord(row: SubRow): Record<string, string> {
  const text = (column: string) => String(row[column] ?? "");
  return {
    "Subcontractor ID": text("display_id_raw"),
    "Contact Name": text("contact_name"),
    "Company Name": text("company_name"),
    Address: text("address"),
    Phone: text("phone"),
    Email: text("email"),
    "Areas Serviced": text("areas_serviced"),
    "Services Provided": text("services_provided"),
    "Employee Capacity": text("employee_capacity"),
    "Insurance Document Name": text("insurance_document_name"),
    "Insurance expiration Date": text("insurance_expiration_raw"),
    Status: text("status"),
    Notes: text("notes"),
    "Created At": text("created_at_raw"),
    "Updated At": text("updated_at_raw"),
    ID: text("extra_id_raw"),
    "Insurance Expiration": text("extra_insurance_raw"),
  };
}

function pickFields(fields: Record<string, unknown>): { column: string; value: string }[] {
  const picked: { column: string; value: string }[] = [];
  for (const [key, rawValue] of Object.entries(fields)) {
    if (rawValue === undefined) continue;
    const column = FIELD_COLUMNS[key];
    if (!column) continue; // includes "id": the id is never writable
    picked.push({ column, value: String(rawValue ?? "") });
  }
  return picked;
}

export async function updateSubcontractor(id: string, fields: Record<string, unknown>): Promise<Record<string, string>> {
  const targetId = id.trim();
  if (!targetId) throw new Error("Missing subcontractor id.");

  const sql = getSql();
  // "SUB-ROW-<n>" (any casing) is the app's id; a column-A style id
  // ("SUB-012") is accepted as a fallback, like the Sheets version.
  const rowMatch = /^SUB-ROW-(\d+)$/i.exec(targetId);
  const found = (rowMatch
    ? await sql`SELECT * FROM subcontractors WHERE legacy_row_id = ${`SUB-ROW-${Number(rowMatch[1])}`}`
    : await sql`SELECT * FROM subcontractors WHERE display_id_raw = ${targetId} ORDER BY source_row NULLS LAST LIMIT 1`) as SubRow[];
  if (found.length === 0) throw new Error(`Subcontractor "${targetId}" not found.`);
  const current = found[0];

  const writes = pickFields(fields);
  if (writes.length === 0) return toHeaderRecord(current);

  const next: SubRow = { ...current };
  for (const { column, value } of writes) next[column] = value;

  const assignments = writes.map(({ column }, i) => `${column} = $${i + 1}`);
  const params: (string | null)[] = writes.map(({ value }) => value);
  // Keep the derived columns in step with what was written.
  if (writes.some((w) => w.column === "insurance_expiration_raw")) {
    params.push(toDate(String(next.insurance_expiration_raw ?? "")));
    assignments.push(`insurance_expiration = $${params.length}`);
  }
  params.push(fingerprintOf(String(next.contact_name ?? ""), String(next.company_name ?? ""), String(next.email ?? "")));
  assignments.push(`fingerprint = $${params.length}`);
  params.push(current.id);

  await sql.query(`UPDATE subcontractors SET ${assignments.join(", ")}, updated_at = now() WHERE id = $${params.length}`, params);
  return toHeaderRecord(next);
}

// Replaces the Apps Script "addSubcontractor" action. Its source is not in
// the repo; this is rebuilt from what the form sends and what the rows it
// produced look like: the profile fields, nothing in Created At / Updated
// At, and the next row at the bottom. No email or text is sent (none is
// known to be sent today).
//
// The new sub gets the next permanent id and the next row-position id, which
// is where Sheets would have put the row.
export async function addSubcontractor(fields: Record<string, unknown>): Promise<{ id: string; subcontractorId: string }> {
  const sql = getSql();
  const values: Record<string, string> = {};
  for (const { column, value } of pickFields(fields)) values[column] = value;
  const text = (column: string) => values[column] ?? "";

  const inserted = (await sql.query(
    `WITH next AS (
       SELECT
         COALESCE(MAX(NULLIF(regexp_replace(id, '^SUB-', ''), id)::int) FILTER (WHERE id ~ '^SUB-[0-9]+$'), 0) + 1 AS id_no,
         COALESCE(MAX(regexp_replace(legacy_row_id, '^SUB-ROW-', '')::int) FILTER (WHERE legacy_row_id ~ '^SUB-ROW-[0-9]+$'), 1) + 1 AS row_no
       FROM subcontractors
     )
     INSERT INTO subcontractors
       (id, legacy_key, legacy_row_id, display_id_raw, fingerprint, contact_name, company_name, address, phone, email,
        areas_serviced, services_provided, employee_capacity, insurance_expiration, insurance_expiration_raw, status, notes)
     SELECT
       'SUB-' || lpad(id_no::text, 3, '0'), 'SUB-' || lpad(id_no::text, 3, '0'),
       'SUB-ROW-' || row_no, 'SUB-' || lpad((row_no - 1)::text, 3, '0'),
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
     FROM next
     RETURNING id, legacy_row_id`,
    [
      fingerprintOf(text("contact_name"), text("company_name"), text("email")),
      text("contact_name"),
      text("company_name"),
      text("address"),
      text("phone"),
      text("email"),
      text("areas_serviced"),
      text("services_provided"),
      text("employee_capacity"),
      toDate(text("insurance_expiration_raw")),
      text("insurance_expiration_raw"),
      text("status"),
      text("notes"),
    ]
  )) as { id: string; legacy_row_id: string }[];

  return { id: inserted[0].legacy_row_id, subcontractorId: inserted[0].id };
}

/* ---------- the list the Apps Script "getSubcontractors" action returns ---------- */

// Two callers still take their subcontractor list from Apps Script: the
// name → phone/email lookup behind SMS and email notifications
// (app/api/subcontractors/route.ts) and the admin account PDF. This builds
// the same list from Postgres. The mapping was worked out by comparing the
// live Apps Script answer with the sheet, row by row (39 of 39 on every
// field), and is checked by scripts/migrate/parity/subs.mts:
//
//   id / subcontractorId   the far-right "ID" column if filled, else SUB-ROW-<n>
//   phone                  the normal (first) "Phone" column, falling back to
//                          the second one when it is empty. This is the ONE
//                          deliberate difference from Apps Script, which
//                          reads only the second column and so reaches 8 of
//                          39 subs. Approved by Andres on 2026-10-08, for the
//                          Postgres version only.
//   status                 blank counts as "Active"
//   name                   contact, or company when there is no contact
//   displayName / dropdownLabel   "<contact> — <company>"
//
// The score fields Apps Script also sends (score, complaints, …) are left
// out: both callers ignore them.
export type AppsScriptSubcontractor = Record<
  | "id"
  | "subcontractorId"
  | "companyName"
  | "contactName"
  | "name"
  | "subcontractor"
  | "displayName"
  | "dropdownLabel"
  | "phone"
  | "email"
  | "address"
  | "areasServiced"
  | "servicesProvided"
  | "employeeCapacity"
  | "insuranceExpiration"
  | "status"
  | "notes",
  string
>;

export async function getSubcontractorsAppsScriptShape(): Promise<AppsScriptSubcontractor[]> {
  const sql = getSql();
  const rows = (await sql.query(`SELECT * FROM subcontractors ORDER BY ${SHEET_ORDER}`)) as SubRow[];
  return rows.map((row) => {
    const text = (column: string) => String(row[column] ?? "").trim();
    const id = text("extra_id_raw") || row.legacy_row_id;
    const contact = text("contact_name");
    const company = text("company_name");
    const label = `${contact} — ${company}`;
    return {
      id,
      subcontractorId: id,
      companyName: company,
      contactName: contact,
      name: contact || company,
      subcontractor: company,
      displayName: label,
      dropdownLabel: label,
      phone: text("phone") || text("extra_phone_raw"),
      email: text("email"),
      address: text("address"),
      areasServiced: text("areas_serviced"),
      servicesProvided: text("services_provided"),
      employeeCapacity: text("employee_capacity"),
      insuranceExpiration: text("extra_insurance_raw") || text("insurance_expiration_raw"),
      status: text("status") || "Active",
      notes: text("notes"),
    };
  });
}
