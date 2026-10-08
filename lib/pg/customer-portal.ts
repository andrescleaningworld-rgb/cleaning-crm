// Postgres versions of the customer-portal reads/writes in
// lib/googleSheets.ts (the customer-portal tab and the four portal-* request
// tabs). Same function names, arguments, return shapes and ordering, so
// lib/data/customer-portal.ts can switch between the two.
//
// phone and portal_code are what a customer logs in with: nothing here logs
// them.
//
// One difference on purpose, see getCustomerByPhone.

import { getSql } from "@/lib/db";
import { fetchAccountRows } from "@/lib/pg/accounts";
import { normalizePhone } from "@/lib/googleSheets";
import type { MergedPortalAccount, PortalSubmission } from "@/lib/googleSheets";

type PortalTab = PortalSubmission["tab"];

type AccessRow = {
  account_id_raw: string;
  account_name: string;
  service_date_raw: string;
  service_type: string;
  frequency: string;
  cleaning_days: string;
  address: string;
  contact_name: string;
  phone: string;
  email: string;
  scope_of_work: string;
  status: string;
  last_visit_date_raw: string;
  next_scheduled_service: string;
  last_invoice_date_raw: string;
  estimated_monthly_total_raw: string;
  portal_code: string;
  portal_access: string;
  sheet_row: number;
};

// Monthly Revenue (column P) is never selected: it is never sent to a customer.
const ACCESS_COLUMNS = `account_id_raw, account_name, service_date_raw, service_type, frequency, cleaning_days, address,
  contact_name, phone, email, scope_of_work, status, last_visit_date_raw, next_scheduled_service, last_invoice_date_raw,
  estimated_monthly_total_raw, portal_code, portal_access, sheet_row`;

async function fetchAccessRows(): Promise<AccessRow[]> {
  const sql = getSql();
  return (await sql.query(`SELECT ${ACCESS_COLUMNS} FROM portal_access ORDER BY sheet_row`)) as AccessRow[];
}

function rowToCustomer(row: AccessRow) {
  return {
    accountId: row.account_id_raw,
    accountName: row.account_name,
    serviceDate: row.service_date_raw,
    serviceType: row.service_type,
    frequency: row.frequency,
    cleaningDays: row.cleaning_days,
    address: row.address,
    contactName: row.contact_name,
    phone: row.phone,
    email: row.email,
    scopeOfWork: row.scope_of_work,
    status: row.status,
    lastVisitDate: row.last_visit_date_raw,
    nextScheduledService: row.next_scheduled_service,
    lastInvoiceDate: row.last_invoice_date_raw,
    estimatedMonthlyTotal: row.estimated_monthly_total_raw,
    portalCode: row.portal_code,
    portalAccess: row.portal_access,
  };
}

const isYes = (text: string) => text.trim().toUpperCase() === "YES";

// ─── Portal login lookups ────────────────────────────────────────────────────

export async function getCustomerByPortalCode(portalCode: string) {
  const wanted = portalCode.trim().toLowerCase();
  const rows = await fetchAccessRows();
  const row = rows.find((r) => r.portal_code.trim().toLowerCase() === wanted);
  return row ? rowToCustomer(row) : null;
}

export async function getCustomerByPhone(phone: string) {
  const digits = normalizePhone(phone);
  // Different from the Sheets version on purpose: there, text with no digits
  // in it ("abc") matches the first account that has portal access and an
  // empty phone, and hands that account back. Here it matches nobody.
  if (!digits) return null;
  const rows = await fetchAccessRows();
  const row = rows.find((r) => normalizePhone(r.phone) === digits && isYes(r.portal_access));
  return row ? rowToCustomer(row) : null;
}

// ─── Settings → Portal (accounts + their portal row) ────────────────────────

export async function getMergedPortalAccounts(): Promise<MergedPortalAccount[]> {
  const [accountRows, portalRows] = await Promise.all([fetchAccountRows(), fetchAccessRows()]);
  const mainRows = accountRows.map((r) => ({
    id: String(r.id ?? ""),
    account_name: String(r.account_name ?? ""),
    service_type: String(r.service_type ?? ""),
    status: String(r.status ?? ""),
    phone: String(r.phone ?? ""),
  }));

  // Same rule as the Sheets version: by lowercase name, the last row with a name wins.
  const portalByName = new Map<string, AccessRow>();
  for (const row of portalRows) {
    const name = row.account_name.trim().toLowerCase();
    if (name) portalByName.set(name, row);
  }

  return mainRows
    .filter((row) => row.account_name.trim())
    .map((row) => {
      const name = row.account_name.trim();
      const portal = portalByName.get(name.toLowerCase());
      return {
        mainAccountId: row.id.trim(),
        accountName: name,
        serviceType: row.service_type,
        accountStatus: row.status,
        mainPhone: row.phone,
        portalSheetRow: portal?.sheet_row ?? null,
        portalCode: portal?.portal_code ?? "",
        portalAccess: isYes(portal?.portal_access ?? "") ? "YES" : "NO",
        portalPhone: portal?.phone ?? "",
        nextScheduledService: portal?.next_scheduled_service ?? "",
        estimatedMonthlyTotal: portal?.estimated_monthly_total_raw ?? "",
      };
    });
}

function generatePortalCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return "CW-" + Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export async function enablePortalAccount(accountName: string, phone: string, accountId: string): Promise<string> {
  // A random code, never the Account ID (the Sheets version uses the ID,
  // which is printed on every form and is no secret).
  const code = generatePortalCode();
  const sql = getSql();
  await sql.query(
    `WITH next AS (SELECT COALESCE(MAX(sheet_row), 1) + 1 AS n FROM portal_access)
     INSERT INTO portal_access (legacy_key, account_id_raw, account_name, account_ref, phone, portal_code, portal_access, sheet_row)
     SELECT 'pg-row-' || next.n::text, $1::text, $2::text,
       COALESCE(
         (SELECT id FROM accounts WHERE btrim($1::text) <> '' AND id = btrim($1::text) LIMIT 1),
         (SELECT CASE WHEN count(*) = 1 THEN min(id) END FROM accounts WHERE btrim($2::text) <> '' AND lower(btrim(account_name)) = lower(btrim($2::text)))
       ),
       $3::text, $4::text, 'YES', next.n
     FROM next`,
    [accountId, accountName, phone, code]
  );
  return code;
}

export async function updatePortalAccountFields(
  sheetRow: number,
  fields: Partial<{
    phone: string;
    nextScheduledService: string;
    estimatedMonthlyTotal: string;
    portalCode: string;
    portalAccess: string;
  }>
): Promise<void> {
  const columnOf: Record<string, string> = {
    phone: "phone",
    nextScheduledService: "next_scheduled_service",
    estimatedMonthlyTotal: "estimated_monthly_total_raw",
    portalCode: "portal_code",
    portalAccess: "portal_access",
  };
  const entries = Object.entries(fields).filter(([key, value]) => value !== undefined && columnOf[key]);
  if (entries.length === 0) return;

  const sets = entries.map(([key], i) => `${columnOf[key]} = $${i + 2}::text`);
  const sql = getSql();
  await sql.query(`UPDATE portal_access SET ${sets.join(", ")}, updated_at = now() WHERE sheet_row = $1::int`, [
    sheetRow,
    ...entries.map(([, value]) => String(value)),
  ]);
}

export async function listPortalAccounts() {
  const rows = await fetchAccessRows();
  return rows.map((row) => ({
    sheetRow: row.sheet_row,
    accountName: row.account_name,
    portalCode: row.portal_code,
    portalAccess: isYes(row.portal_access) ? "YES" : "NO",
  }));
}

// ─── What customers send from /portal (staff view) ──────────────────────────

const TAB_ORDER: PortalTab[] = ["portal-complaints", "portal-service-requests", "portal-date-changes", "portal-billing-requests"];

type RequestRow = {
  tab: PortalTab;
  account_name: string;
  submitted_date_raw: string;
  field_1: string;
  field_2: string;
  field_3: string;
  status: string;
  staff_notes: string;
  photos: string;
  sheet_row: number;
};

async function fetchRequestRows(): Promise<RequestRow[]> {
  const sql = getSql();
  return (await sql.query(
    `SELECT tab, account_name, submitted_date_raw, field_1, field_2, field_3, status, staff_notes, photos, sheet_row
     FROM portal_requests ORDER BY sheet_row`
  )) as RequestRow[];
}

function buildFields(row: RequestRow): Record<string, string> {
  switch (row.tab) {
    case "portal-complaints":
      return { "Issue Type": row.field_1, Description: row.field_2, "Incident Date": row.field_3, Photos: row.photos };
    case "portal-service-requests":
      return { "Service Requested": row.field_1, Details: row.field_2, "Preferred Date": row.field_3 };
    case "portal-date-changes":
      return { "Current Date": row.field_1, "Requested Date": row.field_2, Reason: row.field_3 };
    case "portal-billing-requests":
      return { "Request Type": row.field_1, Details: row.field_2 };
  }
}

export async function getPortalNewCount(): Promise<number> {
  const rows = await fetchRequestRows();
  return rows.filter((r) => r.status.trim() === "New").length;
}

export async function listPortalSubmissions(): Promise<PortalSubmission[]> {
  const rows = await fetchRequestRows();
  return TAB_ORDER.flatMap((tab) =>
    rows
      .filter((row) => row.tab === tab)
      .map((row): PortalSubmission => ({
        sheetRow: row.sheet_row,
        tab,
        accountName: row.account_name,
        date: row.submitted_date_raw,
        // The sheet gives no cell at all for a row that ends before the
        // status column, and the Sheets version shows that as "New".
        status: row.status === "" && row.staff_notes === "" && row.photos === "" ? "New" : row.status,
        notes: row.staff_notes,
        fields: buildFields(row),
      }))
  )
    .filter((s) => s.accountName)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function updateSubmissionStatus(tab: PortalTab, sheetRow: number, status: string, notes: string) {
  const sql = getSql();
  await sql.query(
    `UPDATE portal_requests SET status = $3::text, staff_notes = $4::text, updated_at = now() WHERE tab = $1::text AND sheet_row = $2::int`,
    [tab, sheetRow, status, notes]
  );
}

/**
 * Saves one request row. `values` is the row exactly as the /api/portal/*
 * routes build it for the sheet:
 *   [accountId, accountName, submitted date, field 1, field 2, (field 3,) status, staff notes, (photos)]
 * Billing requests have no field 3; only complaints have photos.
 */
export async function appendPortalRequest(tab: PortalTab, values: string[]): Promise<void> {
  const v = (i: number) => String(values[i] ?? "");
  const billing = tab === "portal-billing-requests";
  const status = billing ? v(5) : v(6);
  const notes = billing ? v(6) : v(7);
  const field3 = billing ? "" : v(5);
  const photos = tab === "portal-complaints" ? v(8) : "";
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v(2).trim());
  const day = m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;

  const sql = getSql();
  await sql.query(
    `WITH next AS (SELECT COALESCE(MAX(sheet_row), 1) + 1 AS n FROM portal_requests WHERE tab = $1::text)
     INSERT INTO portal_requests (legacy_key, tab, account_id_raw, account_name, account_ref, submitted_date_raw, submitted_date,
       field_1, field_2, field_3, status, staff_notes, photos, sheet_row)
     SELECT 'pg-' || $1::text || ':row-' || next.n::text, $1::text, $2::text, $3::text,
       COALESCE(
         (SELECT id FROM accounts WHERE btrim($2::text) <> '' AND id = btrim($2::text) LIMIT 1),
         (SELECT CASE WHEN count(*) = 1 THEN min(id) END FROM accounts WHERE btrim($3::text) <> '' AND lower(btrim(account_name)) = lower(btrim($3::text)))
       ),
       $4::text, $5::date, $6::text, $7::text, $8::text, $9::text, $10::text, $11::text, next.n
     FROM next`,
    [tab, v(0), v(1), v(2), day, v(3), v(4), field3, status, notes, photos]
  );
}
