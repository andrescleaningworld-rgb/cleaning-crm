// Postgres versions of the Accounts and OnboardingChecklist reads/writes in
// lib/googleSheets.ts. Same names, arguments, return shapes, ordering and
// error messages, so lib/data/accounts.ts can switch between the two.
//
// SECRETS: key/alarm info, alarm code, revenue, sub pay and margin live in
// this table. Each function below returns exactly the fields its Sheets
// twin returns and no more; the customer-facing shape (rowToMainAccount)
// never includes any of them.

import { getSql } from "@/lib/db";
import type {
  AccountFieldsUpdateResult,
  AccountSummary,
  RawAccountForSubEnrichment,
} from "@/lib/googleSheets";
import {
  createEmptyChecklistItems,
  isChecklistComplete,
  ONBOARDING_ITEM_KEYS,
  type OnboardingChecklistItems,
  type OnboardingChecklistState,
} from "@/lib/onboardingChecklist";
import { normalizeSubName, resolveAssignedSubKey } from "@/lib/subAccountMatching";

const SHEET_ORDER = "source_row NULLS LAST, created_at, pk";

// The Accounts tab's 35 columns in sheet order: header text → the column
// here that holds what the cell shows. Index = sheet column (A = 0).
export const ACCOUNT_COLUMNS: readonly (readonly [header: string, column: string])[] = [
  ["Account ID", "id"],
  ["Account Name", "account_name"],
  ["Start Date", "start_date_raw"],
  ["Service Type", "service_type"],
  ["Frequency", "frequency"],
  ["Cleaning Days", "cleaning_days"],
  ["Key / Alarm / Access Info", "key_alarm_access_info"],
  ["Monthly Revenue", "monthly_revenue_raw"],
  ["Subcontractor", "subcontractor_raw"],
  ["Manager", "manager_raw"],
  ["Monthly Subcontractor Pay", "monthly_sub_pay_raw"],
  ["Address", "address"],
  ["Contact Name", "contact_name"],
  ["Phone", "phone"],
  ["Scope of Work", "scope_of_work"],
  ["Notes", "notes"],
  ["Status", "status"],
  ["Cancelled Date", "cancelled_date_raw"],
  ["Last Updated / Time Stamp", "last_updated_raw"],
  ["Account Health", "account_health"],
  ["Email", "email"],
  ["Gross Margin", "gross_margin_raw"],
  ["Gross Margin %", "gross_margin_pct_raw"],
  ["Last Visit Date", "last_visit_date_raw"],
  ["Last Complaint Date", "last_complaint_date_raw"],
  ["Last Follow-Up Date", "last_follow_up_date_raw"],
  ["Open Complaints", "open_complaints_raw"],
  ["Open / Inactive Notes", "open_inactive_notes"],
  ["Latitude", "latitude_raw"],
  ["Longitude", "longitude_raw"],
  ["Has Key", "has_key"],
  ["Alarm Code", "alarm_code"],
  ["City", "city"],
  ["Zip", "zip"],
  ["Checklist Needed", "checklist_needed"],
];

// Field name the app sends → header. Same list as ACCOUNT_FIELD_ALIASES in
// lib/googleSheets.ts; anything else is ignored, never guessed.
const FIELD_HEADERS: Record<string, string> = {
  accountName: "Account Name",
  startDate: "Start Date",
  serviceType: "Service Type",
  frequency: "Frequency",
  cleaningDays: "Cleaning Days",
  keyAlarmAccessInfo: "Key / Alarm / Access Info",
  monthlyRevenue: "Monthly Revenue",
  subcontractor: "Subcontractor",
  manager: "Manager",
  monthlySubcontractorPay: "Monthly Subcontractor Pay",
  address: "Address",
  contactName: "Contact Name",
  phone: "Phone",
  scopeOfWork: "Scope of Work",
  notes: "Notes",
  status: "Status",
  cancelledDate: "Cancelled Date",
  accountHealth: "Account Health",
  email: "Email",
  grossMargin: "Gross Margin",
  grossMarginPercent: "Gross Margin %",
  latitude: "Latitude",
  longitude: "Longitude",
  hasKey: "Has Key",
  alarmCode: "Alarm Code",
  city: "City",
  zip: "Zip",
};

const COLUMN_OF_HEADER = new Map(ACCOUNT_COLUMNS.map(([header, column]) => [header, column]));
const INDEX_OF_HEADER = new Map(ACCOUNT_COLUMNS.map(([header], index) => [header, index]));

export type AccountRow = Record<string, unknown> & {
  pk: number;
  id: string | null;
  unformatted: string[];
};

const text = (row: AccountRow, column: string) => String(row[column] ?? "");

export async function fetchAccountRows(): Promise<AccountRow[]> {
  const sql = getSql();
  return (await sql.query(`SELECT * FROM accounts ORDER BY ${SHEET_ORDER}`)) as AccountRow[];
}

/* ---------- typed values kept next to the text ---------- */

export const toMoney = (raw: string): string | null => {
  const cleaned = raw.replace(/[$,\s]/g, "");
  return cleaned !== "" && !Number.isNaN(Number(cleaned)) ? Number(cleaned).toFixed(2) : null;
};

export const toDate = (raw: string): string | null => {
  const value = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(value);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
};

const toNumber = (raw: string): number | null => (raw.trim() !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : null);

// What a Sheets cell would HOLD after this text is typed into it: a plain
// number for anything that reads as a number or an amount, else the text.
export function heldValue(raw: string): string {
  const cleaned = raw.replace(/[$,\s]/g, "");
  return raw.trim() !== "" && cleaned !== "" && !Number.isNaN(Number(cleaned)) ? String(Number(cleaned)) : raw;
}

/** Subcontractor text → sub id, by the app's own rule; null when it fits nobody or more than one. */
export async function resolveSubcontractorId(raw: string): Promise<string | null> {
  if (!raw.trim()) return null;
  const sql = getSql();
  const subs = (await sql`SELECT id, contact_name, company_name FROM subcontractors`) as { id: string; contact_name: string; company_name: string }[];
  const key = resolveAssignedSubKey(
    raw,
    subs.map((s) => ({ key: s.id, company: normalizeSubName(s.company_name), contact: normalizeSubName(s.contact_name) }))
  );
  return key || null;
}

/** Manager text → managers.id, exact name only (case and spaces ignored). */
export async function resolveManagerId(raw: string): Promise<number | null> {
  const name = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!name) return null;
  const sql = getSql();
  const hits = (await sql`SELECT id FROM managers WHERE lower(regexp_replace(btrim(name), '\\s+', ' ', 'g')) = ${name}`) as { id: number }[];
  return hits.length === 1 ? hits[0].id : null;
}

/**
 * SET clauses + params for writing display texts by header, keeping the
 * typed columns, the links and the `unformatted` row in step. `current` is
 * the row before the write (its `unformatted` array is updated in place).
 */
export async function buildAccountWrite(
  current: Pick<AccountRow, "unformatted">,
  writes: { header: string; value: string }[]
): Promise<{ assignments: string[]; params: unknown[] }> {
  const assignments: string[] = [];
  const params: unknown[] = [];
  const set = (column: string, value: unknown) => {
    params.push(value);
    assignments.push(`${column} = $${params.length}`);
  };
  const unformatted = Array.from({ length: ACCOUNT_COLUMNS.length }, (_, i) => String(current.unformatted?.[i] ?? ""));

  for (const { header, value } of writes) {
    const column = COLUMN_OF_HEADER.get(header);
    if (!column || column === "id") continue;
    set(column, value);
    unformatted[INDEX_OF_HEADER.get(header)!] = heldValue(value);
    switch (header) {
      case "Start Date":
        set("start_date", toDate(value));
        break;
      case "Cancelled Date":
        set("cancelled_date", toDate(value));
        break;
      case "Monthly Revenue":
        set("monthly_revenue", toMoney(value));
        break;
      case "Monthly Subcontractor Pay":
        set("monthly_sub_pay", toMoney(value));
        break;
      case "Gross Margin":
        set("gross_margin", toMoney(value));
        break;
      case "Latitude":
        set("latitude", toNumber(value));
        break;
      case "Longitude":
        set("longitude", toNumber(value));
        break;
      case "Status":
        set("status_key", value.trim().toLowerCase().replace(/\s+/g, " "));
        break;
      case "Subcontractor":
        set("subcontractor_id", await resolveSubcontractorId(value));
        break;
      case "Manager":
        set("manager_id", await resolveManagerId(value));
        break;
    }
  }
  if (assignments.length) {
    params.push(JSON.stringify(unformatted));
    assignments.push(`unformatted = $${params.length}::jsonb`);
  }
  return { assignments, params };
}

/* ---------- the customer-safe account shape ---------- */

function toMainAccount(row: AccountRow) {
  return {
    accountId: text(row, "id"),
    accountName: text(row, "account_name"),
    startDate: text(row, "start_date_raw"),
    serviceType: text(row, "service_type"),
    frequency: text(row, "frequency"),
    cleaningDays: text(row, "cleaning_days"),
    address: text(row, "address"),
    contactName: text(row, "contact_name"),
    phone: text(row, "phone"),
    managerName: text(row, "manager_raw"),
    scopeOfWork: text(row, "scope_of_work"),
    status: text(row, "status"),
    lastVisitDate: text(row, "last_visit_date_raw"),
    checklistNeeded: text(row, "checklist_needed").trim() === "Yes",
  };
}

export async function getMainAccountById(accountId: string) {
  const target = accountId.trim();
  const rows = await fetchAccountRows();
  const row = rows.find((r) => text(r, "id").trim() === target);
  return row ? toMainAccount(row) : null;
}

export async function fetchAllMainAccounts() {
  const rows = await fetchAccountRows();
  return rows.filter((r) => text(r, "id").trim()).map(toMainAccount);
}

export async function getMainAccountByName(name: string) {
  const normalized = name.trim().toLowerCase();
  const rows = await fetchAccountRows();
  const row = rows.find((r) => text(r, "account_name").trim().toLowerCase() === normalized);
  return row ? toMainAccount(row) : null;
}

export async function setAccountChecklistNeeded(accountId: string, needed: boolean): Promise<void> {
  const sql = getSql();
  const value = needed ? "Yes" : "No";
  const index = INDEX_OF_HEADER.get("Checklist Needed")!;
  const updated = await sql`
    UPDATE accounts
    SET checklist_needed = ${value},
        unformatted = jsonb_set(
          CASE WHEN jsonb_array_length(unformatted) >= ${index + 1} THEN unformatted
               ELSE (SELECT jsonb_agg(COALESCE(unformatted -> i, '""'::jsonb)) FROM generate_series(0, ${index}) AS i) END,
          ${`{${index}}`}::text[], to_jsonb(${value}::text)),
        updated_at = now()
    WHERE btrim(id) = ${accountId.trim()}
    RETURNING pk
  `;
  if (updated.length === 0) {
    throw new Error(`setAccountChecklistNeeded: account "${accountId}" not found in Accounts sheet`);
  }
}

/* ---------- staff-side reads ---------- */

// Internal Sub Center view only (assignment + revenue per sub); never sent
// to the customer portal.
export async function getAllAccountsForSubEnrichment(): Promise<RawAccountForSubEnrichment[]> {
  const rows = await fetchAccountRows();
  return rows.map((row) => ({
    Subcontractor: text(row, "subcontractor_raw"),
    status: text(row, "status"),
    "Monthly Revenue": text(row, "monthly_revenue_raw"),
    "Monthly Subcontractor Pay": text(row, "monthly_sub_pay_raw"),
  }));
}

function toSummary(row: AccountRow): AccountSummary {
  return {
    accountId: text(row, "id").trim(),
    accountName: text(row, "account_name"),
    managerName: text(row, "manager_raw"),
    address: text(row, "address"),
    subcontractorRaw: text(row, "subcontractor_raw"),
  };
}

// NEVER call from a public (no-login) route — see lib/siteLinkDb.ts.
export async function getAccountSummaryById(accountId: string): Promise<AccountSummary | null> {
  const targetId = accountId.trim();
  if (!targetId) return null;
  const sql = getSql();
  const rows = (await sql.query(`SELECT * FROM accounts WHERE btrim(id) = $1 ORDER BY ${SHEET_ORDER} LIMIT 1`, [targetId])) as AccountRow[];
  return rows.length ? toSummary(rows[0]) : null;
}

export async function getAccountSummariesByIds(accountIds: string[]): Promise<Map<string, AccountSummary>> {
  const targetIds = [...new Set(accountIds.map((id) => id.trim()).filter(Boolean))];
  const result = new Map<string, AccountSummary>();
  if (targetIds.length === 0) return result;
  const sql = getSql();
  const rows = (await sql.query(`SELECT * FROM accounts WHERE btrim(id) = ANY($1::text[]) ORDER BY ${SHEET_ORDER}`, [targetIds])) as AccountRow[];
  for (const row of rows) result.set(text(row, "id").trim(), toSummary(row));
  return result;
}

/* ---------- the edit page's Save ---------- */

function toHeaderRecord(row: AccountRow): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [header, column] of ACCOUNT_COLUMNS) record[header] = text(row, column);
  return record;
}

export async function updateAccountFieldsDirect(
  accountId: string,
  fields: Record<string, unknown>
): Promise<AccountFieldsUpdateResult> {
  const targetId = accountId.trim();
  if (!targetId) throw new Error("Missing account id.");

  const sql = getSql();
  const found = (await sql.query(`SELECT * FROM accounts WHERE btrim(id) = $1 ORDER BY ${SHEET_ORDER} LIMIT 1`, [targetId])) as AccountRow[];
  if (found.length === 0) throw new Error(`Account "${targetId}" not found.`);
  const current = found[0];

  // startDate / monthlySubcontractorPay have client-side aliases for the
  // same field; whichever the caller set wins (same as the Sheets version).
  const resolvedFields: Record<string, unknown> = { ...fields };
  if (resolvedFields.startDate === undefined) {
    if (fields.accountStartDate !== undefined) resolvedFields.startDate = fields.accountStartDate;
    else if (fields.serviceStartDate !== undefined) resolvedFields.startDate = fields.serviceStartDate;
  }
  if (resolvedFields.monthlySubcontractorPay === undefined && fields.subcontractorPay !== undefined) {
    resolvedFields.monthlySubcontractorPay = fields.subcontractorPay;
  }

  const writes: { header: string; value: string }[] = [];
  for (const [key, rawValue] of Object.entries(resolvedFields)) {
    if (rawValue === undefined) continue;
    if (key === "id" || key === "accountId" || key === "rowNumber") continue;
    const header = FIELD_HEADERS[key];
    if (!header) continue; // unrecognized field — ignore rather than guess a column
    writes.push({ header, value: String(rawValue ?? "") });
  }

  const before = toHeaderRecord(current);
  const after = { ...before };
  for (const { header, value } of writes) after[header] = value;

  if (writes.length > 0) {
    const { assignments, params } = await buildAccountWrite(current, writes);
    params.push(current.pk);
    await sql.query(`UPDATE accounts SET ${assignments.join(", ")}, updated_at = now() WHERE pk = $${params.length}`, params);
  }

  return { before, after };
}

/* ---------- OnboardingChecklist ---------- */

type OnboardingRow = {
  account_id: string;
  account_name: string;
  items_raw: string;
  started_at_raw: string;
  last_updated_at_raw: string;
  completed_at_raw: string;
  auto_stable_applied_at_raw: string;
};

// Never throws on a corrupt/empty value — falls back to all-unchecked, same
// as parseOnboardingItemsJson in lib/googleSheets.ts.
function parseItems(raw: string): OnboardingChecklistItems {
  const items = createEmptyChecklistItems();
  if (!raw) return items;
  try {
    const parsed = JSON.parse(raw) as Record<
      string,
      { checked?: unknown; note?: unknown; completedAt?: unknown; fieldOverwriteNote?: unknown }
    >;
    for (const key of ONBOARDING_ITEM_KEYS) {
      const entry = parsed[key];
      if (!entry) continue;
      items[key] = {
        checked: Boolean(entry.checked),
        note: typeof entry.note === "string" ? entry.note : "",
        completedAt: typeof entry.completedAt === "string" ? entry.completedAt : null,
        fieldOverwriteNote: typeof entry.fieldOverwriteNote === "string" ? entry.fieldOverwriteNote : null,
      };
    }
  } catch {
    // Corrupt value — keep the all-unchecked default rather than throwing.
  }
  return items;
}

function toChecklist(row: OnboardingRow): OnboardingChecklistState {
  return {
    accountId: row.account_id,
    accountName: row.account_name,
    items: parseItems(row.items_raw),
    startedAt: row.started_at_raw,
    lastUpdatedAt: row.last_updated_at_raw,
    completedAt: row.completed_at_raw,
    autoStableAppliedAt: row.auto_stable_applied_at_raw,
  };
}

async function findChecklistRow(accountId: string): Promise<OnboardingRow | null> {
  const sql = getSql();
  const rows = (await sql`SELECT * FROM onboarding_checklists WHERE btrim(account_id) = ${accountId} LIMIT 1`) as OnboardingRow[];
  return rows[0] ?? null;
}

export async function fetchOnboardingChecklist(accountId: string): Promise<OnboardingChecklistState | null> {
  const target = accountId.trim();
  if (!target) return null;
  const row = await findChecklistRow(target);
  return row ? toChecklist(row) : null;
}

export async function setOnboardingChecklistItem(input: {
  accountId: string;
  accountName: string;
  itemKey: string;
  checked: boolean;
  note: string;
  fieldOverwriteNote?: string | null;
}): Promise<OnboardingChecklistState> {
  const accountId = input.accountId.trim();
  if (!accountId) throw new Error("Missing accountId.");
  if (!ONBOARDING_ITEM_KEYS.includes(input.itemKey)) {
    throw new Error(`Unknown checklist item "${input.itemKey}".`);
  }

  const existingRow = await findChecklistRow(accountId);
  const existing = existingRow ? toChecklist(existingRow) : null;

  const now = new Date().toISOString();
  const items: OnboardingChecklistItems = existing ? { ...existing.items } : createEmptyChecklistItems();
  const previousCompletedAt = items[input.itemKey]?.completedAt ?? null;
  const previousFieldOverwriteNote = items[input.itemKey]?.fieldOverwriteNote ?? null;

  items[input.itemKey] = {
    checked: input.checked,
    note: input.note,
    completedAt: input.checked ? previousCompletedAt ?? now : null,
    fieldOverwriteNote: input.fieldOverwriteNote !== undefined ? input.fieldOverwriteNote : previousFieldOverwriteNote,
  };

  const startedAt = existing?.startedAt || now;
  const completedAt = isChecklistComplete(items) ? existing?.completedAt || now : "";
  const accountName = input.accountName || existing?.accountName || "";
  const itemsJson = JSON.stringify(items);
  const autoStable = existing?.autoStableAppliedAt ?? "";
  const stamp = (value: string) => (value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toISOString() : null);

  const sql = getSql();
  // The key of an existing row is kept as stored, so a second click updates
  // the same row.
  const key = existingRow?.account_id ?? accountId;
  await sql`
    INSERT INTO onboarding_checklists
      (account_id, legacy_key, account_name, items, items_raw, started_at, started_at_raw, last_updated_at, last_updated_at_raw,
       completed_at, completed_at_raw, auto_stable_applied_at_raw)
    VALUES (${key}, ${key}, ${accountName}, ${itemsJson}::jsonb, ${itemsJson}, ${stamp(startedAt)}, ${startedAt}, ${now}, ${now},
            ${stamp(completedAt)}, ${completedAt}, ${autoStable})
    ON CONFLICT (account_id) DO UPDATE SET
      account_name = EXCLUDED.account_name, items = EXCLUDED.items, items_raw = EXCLUDED.items_raw,
      started_at = EXCLUDED.started_at, started_at_raw = EXCLUDED.started_at_raw,
      last_updated_at = EXCLUDED.last_updated_at, last_updated_at_raw = EXCLUDED.last_updated_at_raw,
      completed_at = EXCLUDED.completed_at, completed_at_raw = EXCLUDED.completed_at_raw, updated_at = now()
  `;

  return {
    accountId,
    accountName,
    items: parseItems(itemsJson),
    startedAt,
    lastUpdatedAt: now,
    completedAt,
    autoStableAppliedAt: autoStable,
  };
}

export async function markOnboardingAutoStableApplied(accountId: string): Promise<void> {
  const target = accountId.trim();
  if (!target) return;
  const now = new Date().toISOString();
  const sql = getSql();
  await sql`
    UPDATE onboarding_checklists
    SET auto_stable_applied_at = ${now}, auto_stable_applied_at_raw = ${now}, updated_at = now()
    WHERE btrim(account_id) = ${target}
  `;
}

/* ---------- the lists the Apps Script account reads return ---------- */

// Every staff screen takes its account list from the Apps Script actions
// getAccounts / getAllAccounts / getMapAccounts (through
// fetchAccountsForAction in app/api/accounts/route.ts). This rebuilds those
// lists from Postgres. The rules were worked out by comparing the live Apps
// Script answers with the sheet and are checked by
// scripts/migrate/parity/accounts.mts:
//
//   - only rows with an Account Name, in sheet order; rowNumber = sheet row
//   - every value is what the cell HOLDS, as text (1560, not "$1,560");
//     and trimmed; anything falsy is "" — so 0 and an unticked checkbox are
//     "", a ticked one is "true"
//   - accountStartDate is YYYY-MM-DD; cancelledDate (getAllAccounts only) is
//     the JavaScript Date text, "Wed Dec 09 2026 00:00:00 GMT-0500 (Eastern Standard Time)"
//   - state is always ""; latitude/longitude come twice (also capitalized)
//   - getMapAccounts: only rows with a latitude, and only the map fields
//
// Staff-only: this carries key/alarm info, revenue and pay, exactly like
// the Apps Script lists do.
export type AppsScriptAccountsAction = "getAccounts" | "getAllAccounts" | "getMapAccounts";

// Checkbox cells arrive from the Sheets API as true / false; text is trimmed,
// as Apps Script does.
function held(row: AccountRow, index: number): string {
  const value = String(row.unformatted?.[index] ?? "").trim();
  if (/^true$/i.test(value)) return "true";
  if (/^false$/i.test(value)) return "";
  if (value !== "" && Number(value) === 0) return "";
  return value;
}

const parseSheetDate = (value: string): { y: number; m: number; d: number } | null => {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  return match ? { y: Number(match[3]), m: Number(match[1]), d: Number(match[2]) } : null;
};

function startDateText(value: string): string {
  const date = parseSheetDate(value);
  return date ? `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}` : value;
}

// Midnight in New York on a calendar day, written the way String(date) in
// Apps Script writes it (the script runs in Eastern time).
function appsScriptDateText(value: string): string {
  const date = parseSheetDate(value);
  if (!date) return value;
  const noonUtc = new Date(Date.UTC(date.y, date.m - 1, date.d, 12));
  const zone = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "longOffset" })
    .formatToParts(noonUtc)
    .find((part) => part.type === "timeZoneName")?.value; // "GMT-04:00"
  const daylight = zone === "GMT-04:00";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][noonUtc.getUTCDay()];
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.m - 1];
  return `${weekday} ${month} ${String(date.d).padStart(2, "0")} ${date.y} 00:00:00 GMT${daylight ? "-0400" : "-0500"} (Eastern ${daylight ? "Daylight" : "Standard"} Time)`;
}

function toAppsScriptAccount(row: AccountRow, action: AppsScriptAccountsAction): Record<string, string | number> {
  const map = {
    id: held(row, 0),
    accountId: held(row, 0),
    accountName: held(row, 1),
    address: held(row, 11),
    city: held(row, 32),
    state: "",
    zip: held(row, 33),
    latitude: held(row, 28),
    longitude: held(row, 29),
    Latitude: held(row, 28),
    Longitude: held(row, 29),
  };
  if (action === "getMapAccounts") {
    return { ...map, status: held(row, 16), manager: held(row, 9), subcontractor: held(row, 8), accountHealth: held(row, 19) };
  }
  return {
    // Rows created in Postgres have no sheet row; 0 marks that.
    rowNumber: Number(row.source_row ?? 0),
    ...map,
    manager: held(row, 9),
    subcontractor: held(row, 8),
    status: held(row, 16),
    ...(action === "getAllAccounts" ? { cancelledDate: appsScriptDateText(held(row, 17)) } : {}),
    accountHealth: held(row, 19),
    accountStartDate: startDateText(held(row, 2)),
    monthlyRevenue: held(row, 7),
    monthlySubcontractorPay: held(row, 10),
    subcontractorPay: held(row, 10),
    grossMargin: held(row, 21),
    grossMarginPercent: held(row, 22),
    hasKey: held(row, 30),
    alarmCode: held(row, 31),
    keyAlarmAccessInfo: held(row, 6),
    contactName: held(row, 12),
    phone: held(row, 13),
    email: held(row, 20),
    serviceType: held(row, 3),
    frequency: held(row, 4),
    cleaningDays: held(row, 5),
    scopeOfWork: held(row, 14),
    notes: held(row, 15),
  };
}

export async function getAccountsAppsScriptShape(action: string): Promise<Record<string, string | number>[]> {
  // The route aliases ("accounts", "allAccounts", "mapAccounts") mean the same three lists.
  const kind: AppsScriptAccountsAction =
    action === "getMapAccounts" || action === "mapAccounts" ? "getMapAccounts" : action === "getAccounts" || action === "accounts" ? "getAccounts" : "getAllAccounts";
  const rows = await fetchAccountRows();
  return rows
    .filter((row) => held(row, 1).trim() !== "")
    .filter((row) => kind !== "getMapAccounts" || held(row, 28).trim() !== "")
    .map((row) => toAppsScriptAccount(row, kind));
}

/* ---------- add / update (the Apps Script addAccount and updateAccount) ---------- */

// The field names the forms send → header, for the two saves Apps Script
// does today. FIELD_HEADERS plus the aliases the screens use for the same
// column.
const PAYLOAD_HEADERS: Record<string, string> = {
  ...FIELD_HEADERS,
  accountStartDate: "Start Date",
  serviceStartDate: "Start Date",
  subcontractorPay: "Monthly Subcontractor Pay",
};

function payloadWrites(payload: Record<string, unknown>): { header: string; value: string }[] {
  const byHeader = new Map<string, string>();
  for (const [key, rawValue] of Object.entries(payload)) {
    if (rawValue === undefined || rawValue === null) continue;
    const header = PAYLOAD_HEADERS[key];
    // First name for a column wins (startDate before its aliases).
    if (!header || byHeader.has(header)) continue;
    byHeader.set(header, String(rawValue));
  }
  return [...byHeader].map(([header, value]) => ({ header, value }));
}

function newYorkParts(options: Intl.DateTimeFormatOptions): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", ...options })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value])
  );
}

// "M/D/YYYY H:MM:SS" in New York time, the format of the Last Updated column.
function nowStamp(): string {
  const p = newYorkParts({ year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });
  return `${p.month}/${p.day}/${p.year} ${Number(p.hour)}:${p.minute}:${p.second}`;
}

// Replaces the Apps Script addAccount action. Its source is not in the
// repo. Rebuilt from the form and from the 31 newest accounts in the sheet:
//   - the ID is "ACCT-" + 14 digits (the moment it was made, New York time)
//   - the form fields go to their columns; "state" has no column and is
//     dropped, as today
//   - Last Updated is stamped
// Gross Margin / Gross Margin % are stored only if the form sends them:
// the sheet has them on 18 of those 31 accounts, so what Apps Script does
// is not certain, and no screen reads them from this column.
// No email or text is sent here; the route sends the "new account assigned"
// text to the sub itself, as before.
export async function addAccount(payload: Record<string, unknown>): Promise<{ accountId: string }> {
  const sql = getSql();
  const p = newYorkParts({ year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  let accountId = `ACCT-${p.year}${p.month}${p.day}${p.hour}${p.minute}${p.second}`;
  // Two accounts in the same second: step forward until the ID is free.
  while (((await sql`SELECT 1 FROM accounts WHERE id = ${accountId}`) as unknown[]).length > 0) {
    accountId = `ACCT-${String(Number(accountId.slice(5)) + 1).padStart(14, "0")}`;
  }

  const writes = [...payloadWrites(payload), { header: "Last Updated / Time Stamp", value: nowStamp() }];
  const { assignments, params } = await buildAccountWrite({ unformatted: [] }, writes);
  // Column A of the held row is the ID.
  const unformattedIndex = assignments.findIndex((a) => a.startsWith("unformatted ="));
  const unformatted = JSON.parse(String(params[unformattedIndex])) as string[];
  unformatted[0] = accountId;
  params[unformattedIndex] = JSON.stringify(unformatted);

  const columns = assignments.map((a) => a.split(" = ")[0]);
  const placeholders = assignments.map((a) => a.split(" = ")[1]);
  params.push(accountId);
  await sql.query(
    `INSERT INTO accounts (${columns.join(", ")}, id, legacy_key) VALUES (${placeholders.join(", ")}, $${params.length}, $${params.length})`,
    params
  );
  return { accountId };
}

// Replaces the Apps Script updateAccount action, which overwrites the whole
// record from the payload. Here only the fields whose value actually
// differs from what the account list shows are written, so a save never
// rewrites "$1,560" as "1560" in columns nobody touched. Last Updated is
// stamped when something changed.
export async function updateAccountFromPayload(
  accountId: string,
  payload: Record<string, unknown>
): Promise<{ accountId: string; changed: string[] }> {
  const targetId = accountId.trim();
  if (!targetId) throw new Error("Missing account id.");
  const sql = getSql();
  const found = (await sql.query(`SELECT * FROM accounts WHERE btrim(id) = $1 ORDER BY ${SHEET_ORDER} LIMIT 1`, [targetId])) as AccountRow[];
  if (found.length === 0) throw new Error(`Account "${targetId}" not found.`);
  const current = found[0];
  const shown = toAppsScriptAccount(current, "getAllAccounts");

  const writes = Object.entries(payload).flatMap(([key, rawValue]) => {
    const header = PAYLOAD_HEADERS[key];
    if (!header || rawValue === undefined || rawValue === null) return [];
    // Unchanged from what the list (or the cell itself) shows: leave it alone.
    const value = String(rawValue);
    const column = COLUMN_OF_HEADER.get(header)!;
    if (value === String(shown[key] ?? "") || value === text(current, column)) return [];
    return [{ header, value }];
  });
  const unique = [...new Map(writes.map((w) => [w.header, w])).values()];
  if (unique.length === 0) return { accountId: targetId, changed: [] };

  const { assignments, params } = await buildAccountWrite(current, [...unique, { header: "Last Updated / Time Stamp", value: nowStamp() }]);
  params.push(current.pk);
  await sql.query(`UPDATE accounts SET ${assignments.join(", ")}, updated_at = now() WHERE pk = $${params.length}`, params);
  return { accountId: targetId, changed: unique.map((w) => w.header) };
}
