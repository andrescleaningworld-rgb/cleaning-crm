import { google } from "googleapis";
import { DEFAULT_TO_DO_PRIORITY, normalizeToDoPriority, type ToDoPriority } from "./toDoPriority";

const SHEET_TAB = "customer-portal";
const SHEET_ID = process.env.GOOGLE_SHEET_ID!;

// ─── In-memory row cache ─────────────────────────────────────────────────────

const CACHE_TTL_MS = 60_000; // 60 seconds
const FETCH_TIMEOUT_MS = 9_000; // 9 seconds

const rowCache = new Map<string, { rows: string[][]; expiresAt: number }>();

function getCached(key: string): string[][] | null {
  const entry = rowCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { rowCache.delete(key); return null; }
  return entry.rows;
}

function setCache(key: string, rows: string[][]): void {
  rowCache.set(key, { rows, expiresAt: Date.now() + CACHE_TTL_MS });
}

function invalidateCache(key: string): void {
  rowCache.delete(key);
}

function withTimeout<T>(ms: number, fn: () => Promise<T>): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Google Sheets request timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// Column indices (0-based)
const COL = {
  ACCOUNT_ID: 0,         // A
  ACCOUNT_NAME: 1,       // B
  SERVICE_DATE: 2,       // C
  SERVICE_TYPE: 3,       // D
  FREQUENCY: 4,          // E
  CLEANING_DAYS: 5,      // F
  ADDRESS: 6,            // G
  CONTACT_NAME: 7,       // H
  PHONE: 8,              // I
  EMAIL: 9,              // J
  SCOPE_OF_WORK: 10,     // K
  STATUS: 11,            // L
  LAST_VISIT_DATE: 12,   // M
  NEXT_SCHEDULED: 13,    // N
  LAST_INVOICE_DATE: 14, // O
  // P (index 15) = Monthly Revenue — never returned
  ESTIMATED_MONTHLY: 16, // Q
  PORTAL_CODE: 17,       // R
  PORTAL_ACCESS: 18,     // S
} as const;

function getAuthClient() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

async function fetchAllRows(): Promise<string[][]> {
  const cacheKey = `portal-main`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const rows = await withTimeout(FETCH_TIMEOUT_MS, async () => {
    const auth = getAuthClient();
    const sheets = google.sheets({ version: "v4", auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_TAB}!A:S`,
    });
    return (response.data.values ?? []).slice(1) as string[][];
  });

  setCache(cacheKey, rows);
  return rows;
}

function rowToCustomer(row: string[]) {
  return {
    accountId: row[COL.ACCOUNT_ID] ?? "",
    accountName: row[COL.ACCOUNT_NAME] ?? "",
    serviceDate: row[COL.SERVICE_DATE] ?? "",
    serviceType: row[COL.SERVICE_TYPE] ?? "",
    frequency: row[COL.FREQUENCY] ?? "",
    cleaningDays: row[COL.CLEANING_DAYS] ?? "",
    address: row[COL.ADDRESS] ?? "",
    contactName: row[COL.CONTACT_NAME] ?? "",
    phone: row[COL.PHONE] ?? "",
    email: row[COL.EMAIL] ?? "",
    scopeOfWork: row[COL.SCOPE_OF_WORK] ?? "",
    status: row[COL.STATUS] ?? "",
    lastVisitDate: row[COL.LAST_VISIT_DATE] ?? "",
    nextScheduledService: row[COL.NEXT_SCHEDULED] ?? "",
    lastInvoiceDate: row[COL.LAST_INVOICE_DATE] ?? "",
    estimatedMonthlyTotal: row[COL.ESTIMATED_MONTHLY] ?? "",
    portalCode: row[COL.PORTAL_CODE] ?? "",
    portalAccess: row[COL.PORTAL_ACCESS] ?? "",
  };
}

// ─── Main accounts sheet (read-only, separate spreadsheet) ──────────────────

const MAIN_COL = {
  ACCOUNT_ID: 0,      // A
  ACCOUNT_NAME: 1,    // B
  START_DATE: 2,      // C
  SERVICE_TYPE: 3,    // D
  FREQUENCY: 4,       // E
  CLEANING_DAYS: 5,   // F
  // G=6  Key/Alarm — NEVER expose
  // H=7  Monthly Revenue — NEVER expose
  // I=8  Subcontractor — staff only
  MANAGER: 9,         // J — name only is safe to expose to customers
  // K=10 Monthly Sub Pay — NEVER expose
  ADDRESS: 11,        // L
  CONTACT_NAME: 12,   // M
  PHONE: 13,          // N
  SCOPE_OF_WORK: 14,  // O
  // P=15 Staff Notes — staff only
  STATUS: 16,         // Q
  // R=17 Cancelled Date — staff only
  // S=18 Last Updated — staff only
  // T=19 Account Health — staff only
  // U=20 Email
  // V=21 Gross Margin — NEVER expose
  // W=22 Gross Margin % — NEVER expose
  LAST_VISIT_DATE: 23, // X
} as const;

function getMainAuthClient() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

async function fetchMainRows(): Promise<string[][]> {
  const cacheKey = `main-accounts`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const rows = await withTimeout(FETCH_TIMEOUT_MS, async () => {
    const sheets = google.sheets({ version: "v4", auth: getMainAuthClient() });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
      range: "Accounts!A:X",
    });
    return (response.data.values ?? []).slice(1) as string[][];
  });

  setCache(cacheKey, rows);
  return rows;
}

function rowToMainAccount(row: string[]) {
  return {
    accountId:     row[MAIN_COL.ACCOUNT_ID]     ?? "",
    accountName:   row[MAIN_COL.ACCOUNT_NAME]   ?? "",
    startDate:     row[MAIN_COL.START_DATE]     ?? "",
    serviceType:   row[MAIN_COL.SERVICE_TYPE]   ?? "",
    frequency:     row[MAIN_COL.FREQUENCY]      ?? "",
    cleaningDays:  row[MAIN_COL.CLEANING_DAYS]  ?? "",
    address:       row[MAIN_COL.ADDRESS]        ?? "",
    contactName:   row[MAIN_COL.CONTACT_NAME]   ?? "",
    phone:         row[MAIN_COL.PHONE]          ?? "",
    managerName:   row[MAIN_COL.MANAGER]        ?? "",
    scopeOfWork:   row[MAIN_COL.SCOPE_OF_WORK]  ?? "",
    status:        row[MAIN_COL.STATUS]         ?? "",
    lastVisitDate: row[MAIN_COL.LAST_VISIT_DATE] ?? "",
  };
}

export async function getMainAccountById(accountId: string) {
  const rows = await fetchMainRows();
  const row = rows.find((r) => r[MAIN_COL.ACCOUNT_ID]?.trim() === accountId.trim());
  return row ? rowToMainAccount(row) : null;
}

export async function getMainAccountByName(name: string) {
  const normalized = name.trim().toLowerCase();
  const rows = await fetchMainRows();
  const row = rows.find((r) => r[MAIN_COL.ACCOUNT_NAME]?.trim().toLowerCase() === normalized);
  return row ? rowToMainAccount(row) : null;
}

// ─── Portal form submissions ─────────────────────────────────────────────────

export async function appendToSheet(tab: string, values: string[]): Promise<void> {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A:Z`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });
  // Invalidate cache for the written tab and the main portal cache if it's the portal sheet
  invalidateCache(`tab-${tab}`);
  if (tab === SHEET_TAB) invalidateCache(`portal-main`);
}

// SubSchedules/ScheduleExceptions live in the main Accounts spreadsheet
// (GOOGLE_MAIN_SHEET_ID), not the customer-portal one (GOOGLE_SHEET_ID) —
// this writes to that spreadsheet instead of appendToSheet's SHEET_ID.
async function appendToMainSheet(tab: string, values: string[]): Promise<void> {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
    range: `${tab}!A:Z`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });
  invalidateCache(`tab-${tab}`);
}

export async function getCustomerByPortalCode(portalCode: string) {
  const rows = await fetchAllRows();
  const row = rows.find(
    (r) => r[COL.PORTAL_CODE]?.trim().toLowerCase() === portalCode.trim().toLowerCase()
  );
  if (!row) return null;
  return rowToCustomer(row);
}

// ─── Portal admin — merged view (main sheet + customer-portal tab) ───────────

function generatePortalCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return "CW-" + Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export type MergedPortalAccount = {
  mainAccountId: string;
  accountName: string;
  serviceType: string;
  accountStatus: string;
  mainPhone: string;
  // null means this account has no row in the customer-portal tab yet
  portalSheetRow: number | null;
  portalCode: string;
  portalAccess: "YES" | "NO";
  portalPhone: string;
  nextScheduledService: string;
  estimatedMonthlyTotal: string;
};

export async function getMergedPortalAccounts(): Promise<MergedPortalAccount[]> {
  const [mainRows, portalRows] = await Promise.all([
    fetchMainRows(),
    fetchAllRows(),
  ]);

  // Index portal rows by lowercase account name for O(1) lookup
  const portalByName = new Map<string, { row: string[]; sheetRow: number }>();
  portalRows.forEach((row, i) => {
    const name = row[COL.ACCOUNT_NAME]?.trim().toLowerCase();
    if (name) portalByName.set(name, { row, sheetRow: i + 2 });
  });

  return mainRows
    .filter((row) => row[MAIN_COL.ACCOUNT_NAME]?.trim())
    .map((row) => {
      const name = (row[MAIN_COL.ACCOUNT_NAME] ?? "").trim();
      const portal = portalByName.get(name.toLowerCase());
      return {
        mainAccountId: (row[MAIN_COL.ACCOUNT_ID] ?? "").trim(),
        accountName: name,
        serviceType: row[MAIN_COL.SERVICE_TYPE] ?? "",
        accountStatus: row[MAIN_COL.STATUS] ?? "",
        mainPhone: row[MAIN_COL.PHONE] ?? "",
        portalSheetRow: portal?.sheetRow ?? null,
        portalCode:   portal?.row[COL.PORTAL_CODE]  ?? "",
        portalAccess: (portal?.row[COL.PORTAL_ACCESS] ?? "").trim().toUpperCase() === "YES" ? "YES" : "NO",
        portalPhone:  portal?.row[COL.PHONE] ?? "",
        nextScheduledService: portal?.row[COL.NEXT_SCHEDULED] ?? "",
        estimatedMonthlyTotal: portal?.row[COL.ESTIMATED_MONTHLY] ?? "",
      };
    });
}

export async function enablePortalAccount(accountName: string, phone: string, accountId: string): Promise<string> {
  // Portal code defaults to the account ID — staff can override via "Generate New Code" if needed
  const code = accountId || generatePortalCode();
  const row = Array(19).fill("") as string[];
  row[COL.ACCOUNT_ID]    = accountId;
  row[COL.ACCOUNT_NAME]  = accountName;
  row[COL.PHONE]         = phone;
  row[COL.PORTAL_CODE]   = code;
  row[COL.PORTAL_ACCESS] = "YES";
  await appendToSheet(SHEET_TAB, row);
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
  invalidateCache(`portal-main`);
  const colMap: Record<string, string> = {
    phone:                "I",
    nextScheduledService: "N",
    estimatedMonthlyTotal:"Q",
    portalCode:           "R",
    portalAccess:         "S",
  };

  const data = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([key, value]) => ({
      range: `${SHEET_TAB}!${colMap[key]}${sheetRow}`,
      values: [[value]],
    }));

  if (data.length === 0) return;

  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: "USER_ENTERED", data },
  });
}

// ─── Portal admin (read + write customer-portal tab) ────────────────────────

export async function listPortalAccounts() {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!A:S`,
  });
  const all = (response.data.values ?? []) as string[][];
  return all.slice(1).map((row, i) => ({
    sheetRow: i + 2, // 1-indexed, +1 for header
    accountName: row[COL.ACCOUNT_NAME] ?? "",
    portalCode:  row[COL.PORTAL_CODE]  ?? "",
    portalAccess: (row[COL.PORTAL_ACCESS] ?? "").trim().toUpperCase() === "YES" ? "YES" : "NO",
  }));
}

export async function updatePortalCell(sheetRow: number, col: "R" | "S", value: string) {
  invalidateCache(`portal-main`);
  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!${col}${sheetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[value]] },
  });
}

export async function addPortalAccount(accountName: string, portalCode: string) {
  // Append a row with just the name, code, and access — other fields left blank
  // so the dashboard falls back to main-sheet data for everything else
  const row = Array(19).fill("") as string[];
  row[COL.ACCOUNT_NAME]  = accountName;
  row[COL.PORTAL_CODE]   = portalCode;
  row[COL.PORTAL_ACCESS] = "YES";
  await appendToSheet(SHEET_TAB, row);
}

// ─── Portal submissions (staff view) ────────────────────────────────────────

// Status column letter differs for billing requests
const PORTAL_TABS = {
  "portal-complaints":       { statusCol: "G", notesCol: "H", statusIdx: 6, notesIdx: 7 },
  "portal-service-requests": { statusCol: "G", notesCol: "H", statusIdx: 6, notesIdx: 7 },
  "portal-date-changes":     { statusCol: "G", notesCol: "H", statusIdx: 6, notesIdx: 7 },
  "portal-billing-requests": { statusCol: "F", notesCol: "G", statusIdx: 5, notesIdx: 6 },
} as const;

type PortalTabName = keyof typeof PORTAL_TABS;

async function fetchTabRows(tab: string): Promise<string[][]> {
  const cacheKey = `tab-${tab}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const rows = await withTimeout(FETCH_TIMEOUT_MS, async () => {
    const auth = getAuthClient();
    const sheets = google.sheets({ version: "v4", auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${tab}!A:I`,
    });
    return ((res.data.values ?? []).slice(1)) as string[][];
  });

  setCache(cacheKey, rows);
  return rows;
}

export async function getPortalNewCount(): Promise<number> {
  const counts = await Promise.all(
    Object.entries(PORTAL_TABS).map(async ([tab, cfg]) => {
      const rows = await fetchTabRows(tab).catch(() => []);
      return rows.filter((r) => r[cfg.statusIdx]?.trim() === "New").length;
    })
  );
  return counts.reduce((a, b) => a + b, 0);
}

export type PortalSubmission = {
  sheetRow: number;
  tab: PortalTabName;
  accountName: string;
  date: string;
  status: string;
  notes: string;
  fields: Record<string, string>;
};

export async function listPortalSubmissions(): Promise<PortalSubmission[]> {
  const results = await Promise.all(
    Object.entries(PORTAL_TABS).map(async ([tab, cfg]) => {
      const rows = await fetchTabRows(tab).catch(() => []);
      return rows.map((row, i): PortalSubmission => ({
        sheetRow: i + 2,
        tab: tab as PortalTabName,
        accountName: row[1] ?? "",
        date: row[2] ?? "",
        status: row[cfg.statusIdx] ?? "New",
        notes: row[cfg.notesIdx] ?? "",
        fields: buildFields(tab as PortalTabName, row),
      }));
    })
  );
  return results
    .flat()
    .filter((s) => s.accountName)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function buildFields(tab: PortalTabName, row: string[]): Record<string, string> {
  switch (tab) {
    case "portal-complaints":
      return { "Issue Type": row[3] ?? "", Description: row[4] ?? "", "Incident Date": row[5] ?? "", Photos: row[8] ?? "" };
    case "portal-service-requests":
      return { "Service Requested": row[3] ?? "", Details: row[4] ?? "", "Preferred Date": row[5] ?? "" };
    case "portal-date-changes":
      return { "Current Date": row[3] ?? "", "Requested Date": row[4] ?? "", Reason: row[5] ?? "" };
    case "portal-billing-requests":
      return { "Request Type": row[3] ?? "", Details: row[4] ?? "" };
  }
}

export async function updateSubmissionStatus(tab: PortalTabName, sheetRow: number, status: string, notes: string) {
  invalidateCache(`tab-${tab}`);
  const cfg = PORTAL_TABS[tab];
  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        { range: `${tab}!${cfg.statusCol}${sheetRow}`, values: [[status]] },
        { range: `${tab}!${cfg.notesCol}${sheetRow}`, values: [[notes]] },
      ],
    },
  });
}

// ─── Portal auth lookups ─────────────────────────────────────────────────────

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  return digits;
}

export async function getCustomerByPhone(phone: string) {
  const digits = normalizePhone(phone);
  const rows = await fetchAllRows();
  const row = rows.find(
    (r) =>
      normalizePhone(r[COL.PHONE] ?? "") === digits &&
      r[COL.PORTAL_ACCESS]?.trim().toUpperCase() === "YES"
  );
  if (!row) return null;
  return rowToCustomer(row);
}

// ─── Subcontractor visit log ──────────────────────────────────────────────────

const VISITS_TAB = "subcontractor-visits";
const VISITS_RANGE = `'${VISITS_TAB}'`; // hyphenated tab names must be quoted in A1 notation

const VISIT_COL = {
  VISIT_ID:     0, // A
  ACCOUNT_NAME: 1, // B
  SUB_EMAIL:    2, // C
  SUB_NAME:     3, // D
  VISIT_DATE:   4, // E  YYYY-MM-DD
  ARRIVAL_TIME: 5, // F  HH:MM
  NOTES:        6, // G
} as const;

export type SubcontractorVisit = {
  visitId: string;
  accountName: string;
  subEmail: string;
  subName: string;
  visitDate: string;
  arrivalTime: string;
  notes: string;
};

export type SubcontractorVisitWithRow = SubcontractorVisit & { sheetRow: number };

export async function getAllSubcontractorVisits(): Promise<SubcontractorVisitWithRow[]> {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${VISITS_RANGE}!A:G`,
  });
  const rows = ((res.data.values ?? []) as string[][]).slice(1);
  return rows
    .map((r, i) => ({
      sheetRow:    i + 2,
      visitId:     r[VISIT_COL.VISIT_ID]     ?? "",
      accountName: r[VISIT_COL.ACCOUNT_NAME] ?? "",
      subEmail:    r[VISIT_COL.SUB_EMAIL]    ?? "",
      subName:     r[VISIT_COL.SUB_NAME]     ?? "",
      visitDate:   r[VISIT_COL.VISIT_DATE]   ?? "",
      arrivalTime: r[VISIT_COL.ARRIVAL_TIME] ?? "",
      notes:       r[VISIT_COL.NOTES]        ?? "",
    }))
    .filter((v) => v.visitDate || v.visitId);
}

export async function updateSubcontractorVisit(
  sheetRow: number,
  fields: Partial<{
    accountName: string;
    subName: string;
    visitDate: string;
    arrivalTime: string;
    notes: string;
  }>,
): Promise<void> {
  invalidateCache(`tab-${VISITS_TAB}`);
  const colLetters: Record<string, string> = {
    accountName: "B",
    subName:     "D",
    visitDate:   "E",
    arrivalTime: "F",
    notes:       "G",
  };
  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  const data = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([key, value]) => ({
      range: `${VISITS_RANGE}!${colLetters[key]}${sheetRow}`,
      values: [[value]],
    }));
  if (data.length === 0) return;
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: "USER_ENTERED", data },
  });
}

export async function deleteSubcontractorVisit(sheetRow: number): Promise<void> {
  invalidateCache(`tab-${VISITS_TAB}`);
  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `${VISITS_RANGE}!A${sheetRow}:G${sheetRow}`,
  });
}

export async function logSubcontractorVisit(data: {
  accountName: string;
  subEmail: string;
  subName: string;
  visitDate: string;
  arrivalTime: string;
  notes: string;
}): Promise<string> {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const visitId = `VIS-${data.visitDate.replace(/-/g, "")}-${stamp.slice(-8)}`;
  // appendToSheet builds its range as `${tab}!A:Z`, so the tab name passed in
  // must already be quoted here (unlike the other call sites, which build
  // their own range string around VISITS_RANGE directly).
  await appendToSheet(VISITS_RANGE, [
    visitId,
    data.accountName,
    data.subEmail,
    data.subName,
    data.visitDate,
    data.arrivalTime,
    data.notes,
  ]);
  return visitId;
}

// ─── Customer-facing scheduled visits ─────────────────────────────────────────
// Written by /api/portal/schedule-visit; separate sheet from subcontractor logs.

const CUSTOMER_VISITS_SHEET_ID = "10MDGlN8pVKVcthd2MA5ygsBLVI3nN3DF98i_cF-Pqjs";
const CUSTOMER_VISITS_TAB = "Visits";

const CUSTOMER_VISIT_COL = {
  ACCOUNT_NAME: 1, // B
  VISIT_DATE:   5, // F  YYYY-MM-DD
  TIME_WINDOW:  6, // G  Morning | Midday | Afternoon | Evening
  STATUS:       7, // H
} as const;

export type CustomerVisit = {
  visitDate: string;
  timeWindow: string;
  status: string;
};

export async function getVisitsByAccountName(accountName: string): Promise<CustomerVisit[]> {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CUSTOMER_VISITS_SHEET_ID,
    range: `${CUSTOMER_VISITS_TAB}!A:I`,
  });
  const rows = ((res.data.values ?? []) as string[][]).slice(1);
  const accountLower = accountName.trim().toLowerCase();
  return rows
    .map((r) => ({
      accountName: r[CUSTOMER_VISIT_COL.ACCOUNT_NAME] ?? "",
      visitDate:   r[CUSTOMER_VISIT_COL.VISIT_DATE]   ?? "",
      timeWindow:  r[CUSTOMER_VISIT_COL.TIME_WINDOW]  ?? "",
      status:      r[CUSTOMER_VISIT_COL.STATUS]       ?? "",
    }))
    .filter((v) => v.accountName.trim().toLowerCase() === accountLower && v.visitDate)
    .map(({ visitDate, timeWindow, status }) => ({ visitDate, timeWindow, status }));
}

export async function getSubcontractorVisits(
  subEmail: string,
  accountName?: string,
): Promise<SubcontractorVisitWithRow[]> {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${VISITS_RANGE}!A:G`,
  });
  const rows = ((res.data.values ?? []) as string[][]).slice(1);
  const emailLower = subEmail.trim().toLowerCase();
  const accountLower = accountName?.trim().toLowerCase();
  return rows
    .map((r, i) => ({
      sheetRow:    i + 2,
      visitId:     r[VISIT_COL.VISIT_ID]     ?? "",
      accountName: r[VISIT_COL.ACCOUNT_NAME] ?? "",
      subEmail:    r[VISIT_COL.SUB_EMAIL]    ?? "",
      subName:     r[VISIT_COL.SUB_NAME]     ?? "",
      visitDate:   r[VISIT_COL.VISIT_DATE]   ?? "",
      arrivalTime: r[VISIT_COL.ARRIVAL_TIME] ?? "",
      notes:       r[VISIT_COL.NOTES]        ?? "",
    }))
    .filter((r) => r.subEmail.trim().toLowerCase() === emailLower)
    .filter((r) => !accountLower || r.accountName.trim().toLowerCase() === accountLower);
}

// ─── Subcontractor schedules ──────────────────────────────────────────────────

const SUB_SCHEDULES_TAB = "SubSchedules";

const SUB_SCHEDULE_COL = {
  SCHEDULE_ID:         0, // A
  ACCOUNT_ID:          1, // B
  SUB_ID:              2, // C
  DAY_OF_WEEK:         3, // D
  TIME_WINDOW:         4, // E
  RECURRING:           5, // F
  EFFECTIVE_START:     6, // G
  EFFECTIVE_END:       7, // H
  STATUS:              8, // I
  SUBMITTED_BY:        9, // J
  SUBMITTED_DATE:      10, // K
  LAST_EDITED_BY:      11, // L
  LAST_EDITED_DATE:    12, // M
  FREQUENCY:           13, // N
  MONTHLY_OCCURRENCE:  14, // O
} as const;

// Recurring ("Y"/"N") is kept as a legacy field for historical rows and is
// no longer written by new code — Frequency is the source of truth for
// recurrence generation (see lib/scheduleRecurrence.ts).
export type SubSchedule = {
  sheetRow: number;
  scheduleId: string;
  accountId: string;
  subId: string;
  dayOfWeek: string;
  timeWindow: string;
  recurring: string;
  effectiveStart: string;
  effectiveEnd: string;
  status: string;
  submittedBy: string;
  submittedDate: string;
  lastEditedBy: string;
  lastEditedDate: string;
  frequency: string;
  monthlyOccurrence: string;
};

async function fetchSubScheduleRows(): Promise<string[][]> {
  const cacheKey = `tab-${SUB_SCHEDULES_TAB}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const rows = await withTimeout(FETCH_TIMEOUT_MS, async () => {
    const auth = getAuthClient();
    const sheets = google.sheets({ version: "v4", auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
      range: `${SUB_SCHEDULES_TAB}!A:O`,
    });
    return (response.data.values ?? []).slice(1) as string[][];
  });

  setCache(cacheKey, rows);
  return rows;
}

export async function fetchSubSchedules(): Promise<SubSchedule[]> {
  const rows = await fetchSubScheduleRows();
  return rows.map((r, i) => ({
    sheetRow:       i + 2,
    scheduleId:     r[SUB_SCHEDULE_COL.SCHEDULE_ID]      ?? "",
    accountId:      r[SUB_SCHEDULE_COL.ACCOUNT_ID]       ?? "",
    subId:          r[SUB_SCHEDULE_COL.SUB_ID]           ?? "",
    dayOfWeek:      r[SUB_SCHEDULE_COL.DAY_OF_WEEK]      ?? "",
    timeWindow:     r[SUB_SCHEDULE_COL.TIME_WINDOW]      ?? "",
    recurring:      r[SUB_SCHEDULE_COL.RECURRING]        ?? "",
    effectiveStart: r[SUB_SCHEDULE_COL.EFFECTIVE_START]  ?? "",
    effectiveEnd:   r[SUB_SCHEDULE_COL.EFFECTIVE_END]    ?? "",
    status:         r[SUB_SCHEDULE_COL.STATUS]           ?? "",
    submittedBy:    r[SUB_SCHEDULE_COL.SUBMITTED_BY]     ?? "",
    submittedDate:  r[SUB_SCHEDULE_COL.SUBMITTED_DATE]   ?? "",
    lastEditedBy:   r[SUB_SCHEDULE_COL.LAST_EDITED_BY]   ?? "",
    lastEditedDate: r[SUB_SCHEDULE_COL.LAST_EDITED_DATE] ?? "",
    frequency:         r[SUB_SCHEDULE_COL.FREQUENCY]           ?? "",
    monthlyOccurrence: r[SUB_SCHEDULE_COL.MONTHLY_OCCURRENCE] ?? "",
  }));
}

export async function appendSubSchedule(data: {
  accountId: string;
  subId: string;
  dayOfWeek: string;
  timeWindow: string;
  recurring: string;
  effectiveStart: string;
  effectiveEnd: string;
  status: string;
  submittedBy: string;
  frequency?: string;
  monthlyOccurrence?: string;
}): Promise<string> {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const rand = Math.random().toString(36).slice(2, 6);
  const scheduleId = `SCH-${data.accountId}-${stamp.slice(-8)}-${rand}`;
  const today = new Date().toISOString().slice(0, 10);
  await appendToMainSheet(SUB_SCHEDULES_TAB, [
    scheduleId,
    data.accountId,
    data.subId,
    data.dayOfWeek,
    data.timeWindow,
    data.recurring,
    data.effectiveStart,
    data.effectiveEnd,
    data.status,
    data.submittedBy,
    today,
    "",
    "",
    data.frequency ?? "",
    data.monthlyOccurrence ?? "",
  ]);
  return scheduleId;
}

// SubmittedBy/SubmittedDate/ScheduleID/AccountID/SubID are intentionally not
// editable here — admin edits must preserve the original submission info.
export async function updateSubSchedule(
  sheetRow: number,
  fields: Partial<{
    dayOfWeek: string;
    timeWindow: string;
    recurring: string;
    effectiveStart: string;
    effectiveEnd: string;
    status: string;
    lastEditedBy: string;
    lastEditedDate: string;
    frequency: string;
    monthlyOccurrence: string;
  }>
): Promise<void> {
  invalidateCache(`tab-${SUB_SCHEDULES_TAB}`);
  const colLetters: Record<string, string> = {
    dayOfWeek: "D",
    timeWindow: "E",
    recurring: "F",
    effectiveStart: "G",
    effectiveEnd: "H",
    status: "I",
    lastEditedBy: "L",
    lastEditedDate: "M",
    frequency: "N",
    monthlyOccurrence: "O",
  };

  const data = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([key, value]) => ({
      range: `${SUB_SCHEDULES_TAB}!${colLetters[key]}${sheetRow}`,
      values: [[value]],
    }));

  if (data.length === 0) return;

  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
    requestBody: { valueInputOption: "USER_ENTERED", data },
  });
}

// Pattern-affecting edits (Frequency, DayOfWeek/Weekdays, MonthlyOccurrence,
// TimeWindow) are versioned rather than patched in place: the existing row
// is closed out with EffectiveEnd = effectiveDate - 1 day and Status =
// "Superseded", and a new row is appended starting at EffectiveStart =
// effectiveDate. Dates before effectiveDate keep generating from the
// closed-out row exactly as they did before the edit — nothing before the
// change is rewritten. "Superseded" is distinct from "Inactive" (manual
// deactivation via the Deactivate action) so the two cases stay
// distinguishable in the UI/history. Non-pattern edits (Status, a manual
// EffectiveStart/EffectiveEnd adjustment) should keep using updateSubSchedule
// instead, which patches the row in place.
export async function applySchedulePatternChange(
  scheduleId: string,
  newPattern: {
    dayOfWeek: string;
    timeWindow: string;
    frequency: string;
    monthlyOccurrence: string;
    status?: string;
  },
  effectiveDate: string,
  editedBy: string
): Promise<string> {
  const schedules = await fetchSubSchedules();
  const current = schedules.find((s) => s.scheduleId === scheduleId);
  if (!current) {
    throw new Error(`SubSchedule ${scheduleId} not found`);
  }
  if (current.effectiveStart && effectiveDate <= current.effectiveStart) {
    throw new Error(
      `effectiveDate (${effectiveDate}) must be after this schedule's current EffectiveStart (${current.effectiveStart})`
    );
  }

  const dayBefore = new Date(`${effectiveDate}T00:00:00`);
  dayBefore.setDate(dayBefore.getDate() - 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  const effectiveEnd = `${dayBefore.getFullYear()}-${pad(dayBefore.getMonth() + 1)}-${pad(dayBefore.getDate())}`;

  await updateSubSchedule(current.sheetRow, {
    effectiveEnd,
    status: "Superseded",
    lastEditedBy: editedBy,
    lastEditedDate: new Date().toISOString(),
  });

  const recurring = newPattern.frequency === "AS_NEEDED" ? "N" : "Y";
  const newScheduleId = await appendSubSchedule({
    accountId: current.accountId,
    subId: current.subId,
    dayOfWeek: newPattern.dayOfWeek,
    timeWindow: newPattern.timeWindow,
    recurring,
    effectiveStart: effectiveDate,
    effectiveEnd: current.effectiveEnd, // carries the account's original end date forward unchanged
    status: newPattern.status ?? current.status,
    submittedBy: current.submittedBy,
    frequency: newPattern.frequency,
    monthlyOccurrence: newPattern.monthlyOccurrence,
  });

  return newScheduleId;
}

// ─── Schedule exceptions ───────────────────────────────────────────────────────

const SCHEDULE_EXCEPTIONS_TAB = "ScheduleExceptions";

const SCHEDULE_EXCEPTION_COL = {
  EXCEPTION_ID:    0, // A
  ACCOUNT_ID:      1, // B
  ORIGINAL_DATE:   2, // C
  TYPE:            3, // D
  NEW_DATE:        4, // E
  NEW_TIME_WINDOW: 5, // F
  REASON:          6, // G
  CREATED_BY:      7, // H
  CREATED_DATE:    8, // I
} as const;

export type ScheduleException = {
  sheetRow: number;
  exceptionId: string;
  accountId: string;
  originalDate: string;
  type: string;
  newDate: string;
  newTimeWindow: string;
  reason: string;
  createdBy: string;
  createdDate: string;
};

async function fetchScheduleExceptionRows(): Promise<string[][]> {
  const cacheKey = `tab-${SCHEDULE_EXCEPTIONS_TAB}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const rows = await withTimeout(FETCH_TIMEOUT_MS, async () => {
    const auth = getAuthClient();
    const sheets = google.sheets({ version: "v4", auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
      range: `${SCHEDULE_EXCEPTIONS_TAB}!A:I`,
    });
    return (response.data.values ?? []).slice(1) as string[][];
  });

  setCache(cacheKey, rows);
  return rows;
}

export async function fetchScheduleExceptions(): Promise<ScheduleException[]> {
  const rows = await fetchScheduleExceptionRows();
  return rows.map((r, i) => ({
    sheetRow:      i + 2,
    exceptionId:   r[SCHEDULE_EXCEPTION_COL.EXCEPTION_ID]    ?? "",
    accountId:     r[SCHEDULE_EXCEPTION_COL.ACCOUNT_ID]      ?? "",
    originalDate:  r[SCHEDULE_EXCEPTION_COL.ORIGINAL_DATE]   ?? "",
    type:          r[SCHEDULE_EXCEPTION_COL.TYPE]            ?? "",
    newDate:       r[SCHEDULE_EXCEPTION_COL.NEW_DATE]        ?? "",
    newTimeWindow: r[SCHEDULE_EXCEPTION_COL.NEW_TIME_WINDOW] ?? "",
    reason:        r[SCHEDULE_EXCEPTION_COL.REASON]          ?? "",
    createdBy:     r[SCHEDULE_EXCEPTION_COL.CREATED_BY]      ?? "",
    createdDate:   r[SCHEDULE_EXCEPTION_COL.CREATED_DATE]    ?? "",
  }));
}

const ACTIVITY_LOG_TAB = "Subcontractor Activity Log";

export type SubcontractorActivityLogEntry = {
  timestamp: string;
  subcontractorEmail: string;
  subcontractorName: string;
  actionType: string;
  details: string;
};

// The Apps Script's getSubcontractorActivityLog action serializes this
// column as a date-only string ("2026-07-13"), which JS parses as UTC
// midnight and then renders as the wrong local time — every row from the
// same day collapses to the same displayed instant. Reading the tab
// directly avoids that lossy round trip and keeps the real time-of-day.
function parseSheetDateTime(text: string): string {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/.exec(text.trim());
  if (!match) return text;
  const [, m, d, y, h, min, s] = match;
  // No trailing "Z" — a bare "YYYY-MM-DDTHH:mm:ss" string parses as local
  // time in JS, matching the wall-clock time the sheet already displays.
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${h.padStart(2, "0")}:${min}:${s}`;
}

export async function getSubcontractorActivityLog(): Promise<SubcontractorActivityLogEntry[]> {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
    range: `${ACTIVITY_LOG_TAB}!A2:E`,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });

  const rows = (res.data.values ?? []) as string[][];

  return rows
    .filter((r) => r.some((cell) => String(cell ?? "").trim()))
    .map((r) => ({
      timestamp: parseSheetDateTime(String(r[0] ?? "")),
      subcontractorEmail: String(r[1] ?? "").trim(),
      subcontractorName: String(r[2] ?? "").trim(),
      actionType: String(r[3] ?? "").trim(),
      details: String(r[4] ?? "").trim(),
    }));
}

export async function appendScheduleException(data: {
  accountId: string;
  originalDate: string;
  type: string;
  newDate: string;
  newTimeWindow: string;
  reason: string;
  createdBy: string;
}): Promise<string> {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const exceptionId = `EXC-${data.accountId}-${stamp.slice(-8)}`;
  const today = new Date().toISOString().slice(0, 10);
  await appendToMainSheet(SCHEDULE_EXCEPTIONS_TAB, [
    exceptionId,
    data.accountId,
    data.originalDate,
    data.type,
    data.newDate,
    data.newTimeWindow,
    data.reason,
    data.createdBy,
    today,
  ]);
  return exceptionId;
}

// CreatedBy/CreatedDate/ExceptionID/AccountID are intentionally not editable
// here — admin edits must preserve the original submission info.
export async function updateScheduleException(
  sheetRow: number,
  fields: Partial<{
    originalDate: string;
    type: string;
    newDate: string;
    newTimeWindow: string;
    reason: string;
  }>
): Promise<void> {
  invalidateCache(`tab-${SCHEDULE_EXCEPTIONS_TAB}`);
  const colLetters: Record<string, string> = {
    originalDate: "C",
    type: "D",
    newDate: "E",
    newTimeWindow: "F",
    reason: "G",
  };

  const data = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([key, value]) => ({
      range: `${SCHEDULE_EXCEPTIONS_TAB}!${colLetters[key]}${sheetRow}`,
      values: [[value]],
    }));

  if (data.length === 0) return;

  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
    requestBody: { valueInputOption: "USER_ENTERED", data },
  });
}

export async function deleteScheduleException(sheetRow: number): Promise<void> {
  invalidateCache(`tab-${SCHEDULE_EXCEPTIONS_TAB}`);
  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.clear({
    spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
    range: `${SCHEDULE_EXCEPTIONS_TAB}!A${sheetRow}:I${sheetRow}`,
  });
}

// ─── To-Dos ──────────────────────────────────────────────────────────────
// Migrated off the Apps Script backend (strangler-fig, same as
// updateSubcontractor below). Confirmed against the Apps Script source
// before migrating: To Do ID is a timestamp-based generated string (not
// row-position-derived, so it's a stable lookup key), Created Date is a
// plain server-stamped value (not a sheet formula), and neither addToDo nor
// updateToDoStatus has side effects (no emails, no dedup) — a direct-write
// port carries no hidden behavior to replicate. Lives in the same
// spreadsheet as Managers/SubSchedules/Subcontractors (GOOGLE_MAIN_SHEET_ID).

const TO_DO_TAB = "To Do";
const TO_DO_RANGE = `'${TO_DO_TAB}'`; // tab name has a space, must be quoted in A1 notation

const TO_DO_COL = {
  ID:           0, // A
  CREATED_DATE: 1, // B
  DUE_DATE:     2, // C
  ASSIGNED_TO:  3, // D
  ACCOUNT:      4, // E
  TASK_TYPE:    5, // F
  WHY:          6, // G
  STATUS:       7, // H
  NOTES:        8, // I
  // Client-generated (crypto.randomUUID()), shared by every to-do created
  // together from the "recurring visit" multi-account form — lets the UI
  // group and badge them ("Recurring (3 accounts)"). Blank for ordinary
  // to-dos and for every row written before this column existed.
  GROUP_ID:     9, // J
  // Deeper-detail writeup (what was actually found/done on a visit),
  // distinct from NOTES (a short, frequently-edited "latest update") and
  // WHY (the reason the to-do was created, set once). Blank for every row
  // written before this column existed.
  OUTCOME:      10, // K
  // Google Calendar event id for this to-do's synced event (see
  // lib/googleCalendar.ts) — blank for to-dos with "Sync to Calendar"
  // unchecked, for to-dos with no due date, and for every row written
  // before Calendar sync existed. This is bookkeeping for OUR OWN write
  // target, not a read-back from Calendar: sync stays strictly one-way
  // (app → Calendar).
  CALENDAR_EVENT_ID: 11, // L
  // "TRUE" when the most recent Calendar sync attempt for this to-do (create
  // or status-update) failed — surfaced as a non-blocking badge in the UI so
  // a Calendar outage/misconfig doesn't fail silently. Blank for to-dos that
  // were never calendar-eligible, that synced successfully, and for every
  // row written before this column existed.
  CALENDAR_SYNC_FAILED: 12, // M
  // User-controlled per-to-do Calendar opt-out (replaces the old task-type
  // eligibility set). Read as an OPT-OUT flag — "FALSE" means don't sync,
  // anything else (including blank, for every row written before this
  // column existed) means sync — so pre-existing rows default to synced
  // without needing a backfill write. New rows always write an explicit
  // "TRUE"/"FALSE", never blank, keeping the pattern symmetric going forward.
  SYNC_TO_CALENDAR: 13, // N
  // Low/Medium/High tier (see lib/toDoPriority.ts). Read with a
  // default-on-missing-or-invalid fallback (normalizeToDoPriority), same
  // reasoning as SYNC_TO_CALENDAR above — every row written before this
  // column existed reads as "Medium" with no backfill needed. New rows
  // always write one of the three valid strings, never blank.
  PRIORITY: 14, // O
} as const;

export type ToDo = {
  sheetRow: number;
  id: string;
  createdDate: string;
  dueDate: string;
  assignedTo: string;
  accountName: string;
  taskType: string;
  why: string;
  status: string;
  notes: string;
  groupId: string;
  outcome: string;
  calendarEventId: string;
  calendarSyncFailed: boolean;
  syncToCalendar: boolean;
  priority: ToDoPriority;
};

// Unlike the other tabs in this file, To-Do reads deliberately skip the
// shared 60s row cache: it's a small, action-driven list where users expect
// a create/status-update to show up immediately, and the in-memory cache is
// per serverless instance — a write on one instance doesn't invalidate the
// cache on whichever instance happens to serve the next read, which reads
// as "my to-dos didn't save" even though they did.
async function fetchToDoRows(): Promise<string[][]> {
  const rows = await withTimeout(FETCH_TIMEOUT_MS, async () => {
    const auth = getAuthClient();
    const sheets = google.sheets({ version: "v4", auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
      range: `${TO_DO_RANGE}!A:O`,
    });
    return (response.data.values ?? []).slice(1) as string[][];
  });

  return rows;
}

export async function fetchToDos(): Promise<ToDo[]> {
  const rows = await fetchToDoRows();
  return rows
    .map((r, i) => ({
      sheetRow:           i + 2,
      id:                 r[TO_DO_COL.ID]                   ?? "",
      createdDate:        r[TO_DO_COL.CREATED_DATE]         ?? "",
      dueDate:            r[TO_DO_COL.DUE_DATE]             ?? "",
      assignedTo:         r[TO_DO_COL.ASSIGNED_TO]          ?? "",
      accountName:        r[TO_DO_COL.ACCOUNT]              ?? "",
      taskType:           r[TO_DO_COL.TASK_TYPE]            ?? "",
      why:                r[TO_DO_COL.WHY]                  ?? "",
      status:             r[TO_DO_COL.STATUS]               ?? "",
      notes:              r[TO_DO_COL.NOTES]                ?? "",
      groupId:            r[TO_DO_COL.GROUP_ID]             ?? "",
      outcome:            r[TO_DO_COL.OUTCOME]              ?? "",
      calendarEventId:    r[TO_DO_COL.CALENDAR_EVENT_ID]    ?? "",
      calendarSyncFailed: r[TO_DO_COL.CALENDAR_SYNC_FAILED] === "TRUE",
      syncToCalendar:     r[TO_DO_COL.SYNC_TO_CALENDAR]     !== "FALSE",
      priority:           normalizeToDoPriority(r[TO_DO_COL.PRIORITY]),
    }))
    .filter((t) => t.id);
}

// Returns just the generated To Do ID, matching this file's other append*
// functions (appendManager, appendSubSchedule, appendScheduleException,
// logSubcontractorVisit) — callers reload the list rather than relying on a
// full record back.
type ToDoInput = {
  dueDate: string;
  assignedTo: string;
  accountName: string;
  taskType: string;
  why: string;
  status: string;
  notes: string;
  groupId?: string;
  // Set by the caller AFTER creating the Calendar event (see
  // lib/googleCalendar.ts's createCalendarEventForToDo) so the id lands in
  // the same row-append as everything else, rather than a second write.
  calendarEventId?: string;
  // Same timing as calendarEventId above — the caller already knows whether
  // the create-time sync attempt failed before this row is ever written.
  calendarSyncFailed?: boolean;
  // User's "Sync to Calendar" choice for this to-do. Optional on the type,
  // but buildToDoRow below treats anything other than an explicit `false`
  // as true — never silently defaults a caller that omits this to "off".
  syncToCalendar?: boolean;
  // Optional on the type, but buildToDoRow below always resolves it via
  // normalizeToDoPriority (missing/invalid -> "Medium"), so a written row
  // never has a blank priority cell.
  priority?: ToDoPriority;
};

function buildToDoRow(id: string, createdDate: string, data: ToDoInput): string[] {
  return [
    id,
    createdDate,
    data.dueDate,
    data.assignedTo,
    data.accountName,
    data.taskType,
    data.why,
    data.status,
    data.notes,
    data.groupId ?? "",
    "", // OUTCOME — only ever set later, via updateToDoOutcome
    data.calendarEventId ?? "",
    data.calendarSyncFailed ? "TRUE" : "",
    data.syncToCalendar === false ? "FALSE" : "TRUE",
    normalizeToDoPriority(data.priority),
  ];
}

// Finds the sheet row immediately after the last row containing ANY data,
// scanned across the tab's FULL column width (A:Z, not just A:N) rather
// than relying on Sheets' own values.append() table-detection. append()
// determines where — and critically, at WHICH COLUMN — to write a new row
// by inspecting the current last row; when that row has a gap (one or more
// blank cells followed by more populated cells further right), append()
// misidentifies the table's left edge as wherever that trailing data
// starts and silently writes the new row there instead of at column A.
// A normal to-do has exactly this shape once Calendar sync populates
// calendarEventId (L) while groupId/outcome (J/K) stay blank — confirmed
// reproducible in an isolated test tab, and confirmed already corrupting
// real rows in production (two real to-dos landed in columns L onward,
// invisible to fetchToDos, which only reads A:N and requires a non-blank
// ID in column A). Reading the full A:Z width (not just A:N) also means
// this keeps computing the correct next row even before any already-
// corrupted legacy rows get manually repaired.
async function findNextToDoRow(sheets: ReturnType<typeof google.sheets>): Promise<number> {
  const res = await withTimeout(FETCH_TIMEOUT_MS, () =>
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
      range: `${TO_DO_RANGE}!A:Z`,
    })
  );
  const rows = (res.data.values ?? []) as string[][];
  return rows.length + 1; // 1-indexed sheet row right after the last one with data
}

export async function appendToDo(data: ToDoInput): Promise<string> {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const id = `TODO-${stamp}`;
  // yyyy-MM-dd, matching this file's other created/submitted-date fields
  // (appendSubSchedule's submittedDate, appendScheduleException's
  // createdDate) and the old Apps Script behavior this replaced.
  const createdDate = new Date().toISOString().slice(0, 10);

  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  const targetRow = await findNextToDoRow(sheets);

  // A targeted update() to an explicitly computed row has no ambiguity
  // about which column to start at — see findNextToDoRow's comment for why
  // values.append() is unsafe here.
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
    range: `${TO_DO_RANGE}!A${targetRow}:O${targetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [buildToDoRow(id, createdDate, data)] },
  });

  return id;
}

// Bulk "one independent to-do per selected account" creation (the multi-
// account Visit form) MUST go through a single values.update call with all
// rows in one requestBody, not N concurrent per-account calls: computing
// one target row and writing N rows to it in one request avoids N separate
// calls each independently (and possibly concurrently) computing "the next
// row" and colliding. Each call still reports success to its caller when
// this happens, so the failure is invisible to Promise.allSettled-style
// per-request error handling; only a single serialized write avoids it.
export async function appendToDos(entries: ToDoInput[]): Promise<string[]> {
  if (entries.length === 0) return [];

  const baseStamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const createdDate = new Date().toISOString().slice(0, 10);
  // Every row in the batch would otherwise share the same second-resolution
  // stamp as appendToDo's id — suffix with the row's index to keep ids
  // unique within one batch.
  const ids = entries.map((_, index) => `TODO-${baseStamp}-${index}`);

  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  const targetRow = await findNextToDoRow(sheets);
  const lastRow = targetRow + entries.length - 1;

  // Same targeted-update reasoning as appendToDo above — see
  // findNextToDoRow's comment.
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
    range: `${TO_DO_RANGE}!A${targetRow}:O${lastRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: entries.map((data, index) => buildToDoRow(ids[index], createdDate, data)) },
  });

  return ids;
}

// Shared by updateToDoStatus/updateToDoOutcome — both need the current
// sheet row for a given To Do ID before they can target a single-cell
// range, and neither can rely on a cached row index since a row's position
// shifts if rows above it are ever added/removed. Returns the full row too
// since updateToDoStatus needs accountName/why/calendarEventId to decide
// whether (and how) to push a Calendar update.
async function findToDoRow(
  sheets: ReturnType<typeof google.sheets>,
  targetId: string
): Promise<{ sheetRow: number; row: string[] }> {
  const res = await withTimeout(FETCH_TIMEOUT_MS, () =>
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
      range: `${TO_DO_RANGE}!A:O`,
    })
  );

  const rows = ((res.data.values ?? []) as string[][]).slice(1);
  const rowIndex = rows.findIndex((r) => (r[TO_DO_COL.ID] ?? "").trim() === targetId);
  if (rowIndex === -1) {
    throw new Error(`To-do "${targetId}" not found.`);
  }
  return { sheetRow: rowIndex + 2, row: rows[rowIndex] }; // header row + 1-based sheet rows
}

// Bulk-edit's equivalent of findToDoRow above — one sheet read for N ids
// instead of N separate reads, same reasoning as appendToDos batching N
// writes into one request. Missing ids are simply absent from the returned
// map rather than throwing, so one bad id in a bulk selection doesn't fail
// the whole batch.
async function findToDoRows(
  sheets: ReturnType<typeof google.sheets>,
  targetIds: string[]
): Promise<Map<string, { sheetRow: number; row: string[] }>> {
  const res = await withTimeout(FETCH_TIMEOUT_MS, () =>
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
      range: `${TO_DO_RANGE}!A:O`,
    })
  );

  const rows = ((res.data.values ?? []) as string[][]).slice(1);
  const wanted = new Set(targetIds);
  const found = new Map<string, { sheetRow: number; row: string[] }>();

  rows.forEach((row, index) => {
    const id = (row[TO_DO_COL.ID] ?? "").trim();
    if (wanted.has(id)) found.set(id, { sheetRow: index + 2, row });
  });

  return found;
}

export type ToDoStatusUpdateResult = {
  accountName: string;
  why: string;
  calendarEventId: string;
};

export async function updateToDoStatus(
  toDoId: string,
  status: string,
  notes: string
): Promise<ToDoStatusUpdateResult> {
  const targetId = toDoId.trim();
  if (!targetId) throw new Error("Missing to-do id.");

  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  const { sheetRow, row } = await findToDoRow(sheets, targetId);

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        { range: `${TO_DO_RANGE}!H${sheetRow}`, values: [[status]] },
        { range: `${TO_DO_RANGE}!I${sheetRow}`, values: [[notes]] },
      ],
    },
  });

  return {
    accountName: row[TO_DO_COL.ACCOUNT] ?? "",
    why: row[TO_DO_COL.WHY] ?? "",
    calendarEventId: row[TO_DO_COL.CALENDAR_EVENT_ID] ?? "",
  };
}

// Separate write from updateToDoStatus because the Calendar patch it's
// reporting on only happens (in the API route) after updateToDoStatus
// already returned — the outcome isn't known in time to fold into that
// same batchUpdate.
export async function setToDoCalendarSyncFailed(toDoId: string, failed: boolean): Promise<void> {
  const targetId = toDoId.trim();
  if (!targetId) throw new Error("Missing to-do id.");

  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  const { sheetRow } = await findToDoRow(sheets, targetId);

  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
    range: `${TO_DO_RANGE}!M${sheetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[failed ? "TRUE" : ""]] },
  });
}

// Same reasoning as setToDoCalendarSyncFailed above, but for the edit flow
// (see updateToDo below), which can also need to write a changed/cleared
// calendarEventId (column L) after the API route decides whether to
// create, patch, or cancel a Calendar event — that decision happens after
// updateToDo's own field write, so it can't be folded into the same call.
export async function setToDoCalendarFields(
  toDoId: string,
  fields: { calendarEventId?: string; calendarSyncFailed?: boolean }
): Promise<void> {
  const targetId = toDoId.trim();
  if (!targetId) throw new Error("Missing to-do id.");

  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  const { sheetRow } = await findToDoRow(sheets, targetId);

  const data: { range: string; values: string[][] }[] = [];
  if (fields.calendarEventId !== undefined) {
    data.push({ range: `${TO_DO_RANGE}!L${sheetRow}`, values: [[fields.calendarEventId]] });
  }
  if (fields.calendarSyncFailed !== undefined) {
    data.push({ range: `${TO_DO_RANGE}!M${sheetRow}`, values: [[fields.calendarSyncFailed ? "TRUE" : ""]] });
  }
  if (data.length === 0) return;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
    requestBody: { valueInputOption: "USER_ENTERED", data },
  });
}

export type ToDoEditInput = {
  dueDate?: string;
  assignedTo?: string;
  taskType?: string;
  status?: string;
  notes?: string;
  syncToCalendar?: boolean;
  priority?: ToDoPriority;
};

export type ToDoEditResult = {
  accountName: string;
  why: string;
  // Resolved values: the new value where the edit changed it, the existing
  // sheet value otherwise — the API route needs these (not just the diff)
  // to recompute Calendar eligibility against the to-do's full current state.
  taskType: string;
  dueDate: string;
  assignedTo: string;
  status: string;
  notes: string;
  syncToCalendar: boolean;
  priority: ToDoPriority;
  // Pre-edit value, so the route can tell whether a Calendar event already
  // existed before deciding whether to create/patch/cancel one.
  previousCalendarEventId: string;
};

// Full-field edit (Assigned To / Type / Due Date / Status / Notes) for a
// to-do that already exists — unlike updateToDoStatus, which only ever
// touches status+notes, this can change anything that Calendar eligibility
// depends on. Only the fields present in `updates` are written; omitted
// fields keep their current sheet value untouched (same "partial update"
// contract app/api/to-do/route.ts's bulk-edit action relies on for item 3).
export async function updateToDo(toDoId: string, updates: ToDoEditInput): Promise<ToDoEditResult> {
  const targetId = toDoId.trim();
  if (!targetId) throw new Error("Missing to-do id.");

  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  const { sheetRow, row } = await findToDoRow(sheets, targetId);

  const data: { range: string; values: string[][] }[] = [];
  if (updates.dueDate !== undefined) data.push({ range: `${TO_DO_RANGE}!C${sheetRow}`, values: [[updates.dueDate]] });
  if (updates.assignedTo !== undefined) data.push({ range: `${TO_DO_RANGE}!D${sheetRow}`, values: [[updates.assignedTo]] });
  if (updates.taskType !== undefined) data.push({ range: `${TO_DO_RANGE}!F${sheetRow}`, values: [[updates.taskType]] });
  if (updates.status !== undefined) data.push({ range: `${TO_DO_RANGE}!H${sheetRow}`, values: [[updates.status]] });
  if (updates.notes !== undefined) data.push({ range: `${TO_DO_RANGE}!I${sheetRow}`, values: [[updates.notes]] });
  if (updates.syncToCalendar !== undefined) data.push({ range: `${TO_DO_RANGE}!N${sheetRow}`, values: [[updates.syncToCalendar ? "TRUE" : "FALSE"]] });
  if (updates.priority !== undefined) data.push({ range: `${TO_DO_RANGE}!O${sheetRow}`, values: [[updates.priority]] });

  if (data.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
      requestBody: { valueInputOption: "USER_ENTERED", data },
    });
  }

  return {
    accountName: row[TO_DO_COL.ACCOUNT] ?? "",
    why: row[TO_DO_COL.WHY] ?? "",
    taskType: updates.taskType ?? row[TO_DO_COL.TASK_TYPE] ?? "",
    dueDate: updates.dueDate ?? row[TO_DO_COL.DUE_DATE] ?? "",
    assignedTo: updates.assignedTo ?? row[TO_DO_COL.ASSIGNED_TO] ?? "",
    status: updates.status ?? row[TO_DO_COL.STATUS] ?? "",
    notes: updates.notes ?? row[TO_DO_COL.NOTES] ?? "",
    syncToCalendar: updates.syncToCalendar !== undefined ? updates.syncToCalendar : row[TO_DO_COL.SYNC_TO_CALENDAR] !== "FALSE",
    priority: updates.priority ?? normalizeToDoPriority(row[TO_DO_COL.PRIORITY]),
    previousCalendarEventId: row[TO_DO_COL.CALENDAR_EVENT_ID] ?? "",
  };
}

export type ToDoBulkEditEntry = {
  toDoId: string;
  updates: ToDoEditInput;
};

export type ToDoBulkEditResult = ToDoEditResult & {
  toDoId: string;
  sheetRow: number;
  notFound?: boolean;
};

// Bulk equivalent of updateToDo — every entry's field writes are folded
// into ONE spreadsheets.values.batchUpdate call (same reasoning as
// appendToDos), rather than looping updateToDo per row. Each entry can
// carry different `updates` (matters for future use), though today's only
// caller (app/api/to-do/route.ts's updateToDos action) applies the same
// partial update to every selected id. An id that no longer exists in the
// sheet is reported back via `notFound` rather than failing the batch.
export async function updateToDosBatch(entries: ToDoBulkEditEntry[]): Promise<ToDoBulkEditResult[]> {
  const targetIds = entries.map((entry) => entry.toDoId.trim()).filter(Boolean);
  if (targetIds.length === 0) return [];

  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  const rowsById = await findToDoRows(sheets, targetIds);

  const data: { range: string; values: string[][] }[] = [];
  const results: ToDoBulkEditResult[] = [];

  for (const entry of entries) {
    const targetId = entry.toDoId.trim();
    const found = rowsById.get(targetId);
    if (!found) {
      results.push({
        toDoId: targetId,
        sheetRow: -1,
        accountName: "",
        why: "",
        taskType: "",
        dueDate: "",
        assignedTo: "",
        status: "",
        notes: "",
        // Inert placeholder — this entry is filtered out (notFound) before
        // ever reaching Calendar reconciliation, so the value itself is
        // never used; it's only here to satisfy ToDoEditResult's shape.
        syncToCalendar: true,
        priority: DEFAULT_TO_DO_PRIORITY,
        previousCalendarEventId: "",
        notFound: true,
      });
      continue;
    }

    const { sheetRow, row } = found;
    const { updates } = entry;

    if (updates.dueDate !== undefined) data.push({ range: `${TO_DO_RANGE}!C${sheetRow}`, values: [[updates.dueDate]] });
    if (updates.assignedTo !== undefined) data.push({ range: `${TO_DO_RANGE}!D${sheetRow}`, values: [[updates.assignedTo]] });
    if (updates.taskType !== undefined) data.push({ range: `${TO_DO_RANGE}!F${sheetRow}`, values: [[updates.taskType]] });
    if (updates.status !== undefined) data.push({ range: `${TO_DO_RANGE}!H${sheetRow}`, values: [[updates.status]] });
    if (updates.notes !== undefined) data.push({ range: `${TO_DO_RANGE}!I${sheetRow}`, values: [[updates.notes]] });
    if (updates.syncToCalendar !== undefined) data.push({ range: `${TO_DO_RANGE}!N${sheetRow}`, values: [[updates.syncToCalendar ? "TRUE" : "FALSE"]] });
    if (updates.priority !== undefined) data.push({ range: `${TO_DO_RANGE}!O${sheetRow}`, values: [[updates.priority]] });

    results.push({
      toDoId: targetId,
      sheetRow,
      accountName: row[TO_DO_COL.ACCOUNT] ?? "",
      why: row[TO_DO_COL.WHY] ?? "",
      taskType: updates.taskType ?? row[TO_DO_COL.TASK_TYPE] ?? "",
      dueDate: updates.dueDate ?? row[TO_DO_COL.DUE_DATE] ?? "",
      assignedTo: updates.assignedTo ?? row[TO_DO_COL.ASSIGNED_TO] ?? "",
      status: updates.status ?? row[TO_DO_COL.STATUS] ?? "",
      notes: updates.notes ?? row[TO_DO_COL.NOTES] ?? "",
      syncToCalendar: updates.syncToCalendar !== undefined ? updates.syncToCalendar : row[TO_DO_COL.SYNC_TO_CALENDAR] !== "FALSE",
      priority: updates.priority ?? normalizeToDoPriority(row[TO_DO_COL.PRIORITY]),
      previousCalendarEventId: row[TO_DO_COL.CALENDAR_EVENT_ID] ?? "",
    });
  }

  if (data.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
      requestBody: { valueInputOption: "USER_ENTERED", data },
    });
  }

  return results;
}

// Batch counterpart to setToDoCalendarFields, keyed by sheetRow (already
// known from updateToDosBatch's results) rather than toDoId, so this skips
// a second findToDoRow(s) lookup entirely — one combined batchUpdate for
// every row's post-Calendar-sync outcome instead of N single-cell writes.
export async function setToDoCalendarFieldsBatch(
  entries: { sheetRow: number; calendarEventId?: string; calendarSyncFailed?: boolean }[]
): Promise<void> {
  const data: { range: string; values: string[][] }[] = [];

  for (const entry of entries) {
    if (entry.sheetRow < 0) continue; // notFound placeholder — nothing to write
    if (entry.calendarEventId !== undefined) {
      data.push({ range: `${TO_DO_RANGE}!L${entry.sheetRow}`, values: [[entry.calendarEventId]] });
    }
    if (entry.calendarSyncFailed !== undefined) {
      data.push({ range: `${TO_DO_RANGE}!M${entry.sheetRow}`, values: [[entry.calendarSyncFailed ? "TRUE" : ""]] });
    }
  }
  if (data.length === 0) return;

  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
    requestBody: { valueInputOption: "USER_ENTERED", data },
  });
}

// Deeper-detail writeup (what was actually found/done), separate from the
// short "latest update" notes above — see the OUTCOME column comment.
export async function updateToDoOutcome(toDoId: string, outcome: string): Promise<void> {
  const targetId = toDoId.trim();
  if (!targetId) throw new Error("Missing to-do id.");

  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  const { sheetRow } = await findToDoRow(sheets, targetId);

  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
    range: `${TO_DO_RANGE}!K${sheetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[outcome]] },
  });
}

// ─── Extra/Specialty Services ────────────────────────────────────────────────
// Admin-managed catalog of specialty services customers can request from the
// portal (Phase 1: backend only — see app/api/extra-services). Lives in the
// same spreadsheet as customer-portal/portal-* tabs (GOOGLE_SHEET_ID), not
// the main Accounts one, since this data is customer-portal-facing.

const EXTRA_SERVICES_TAB = "ExtraServices";

const EXTRA_SERVICE_COL = {
  ID:          0, // A
  NAME:        1, // B
  DESCRIPTION: 2, // C
  IMAGE_URL:   3, // D — Vercel Blob URL
  ACTIVE:      4, // E — "Yes"/"No"; hides a service from the portal without deleting it
  SORT_ORDER:  5, // F — controls display order
} as const;

export type ExtraService = {
  sheetRow: number;
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  active: boolean;
  sortOrder: number;
};

async function fetchExtraServiceRows(): Promise<string[][]> {
  const cacheKey = `tab-${EXTRA_SERVICES_TAB}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const rows = await withTimeout(FETCH_TIMEOUT_MS, async () => {
    const auth = getAuthClient();
    const sheets = google.sheets({ version: "v4", auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${EXTRA_SERVICES_TAB}!A:F`,
    });
    return (response.data.values ?? []).slice(1) as string[][];
  });

  setCache(cacheKey, rows);
  return rows;
}

export async function fetchExtraServices(): Promise<ExtraService[]> {
  const rows = await fetchExtraServiceRows();
  return rows
    .map((r, i) => ({
      sheetRow:    i + 2,
      id:          r[EXTRA_SERVICE_COL.ID]          ?? "",
      name:        r[EXTRA_SERVICE_COL.NAME]         ?? "",
      description: r[EXTRA_SERVICE_COL.DESCRIPTION]  ?? "",
      imageUrl:    r[EXTRA_SERVICE_COL.IMAGE_URL]    ?? "",
      // Missing/blank Active is treated as active, matching this app's
      // general "blank status = Active" convention (see app/to-do/page.tsx's
      // loadManagers) — only an explicit "No" hides a service.
      active:      (r[EXTRA_SERVICE_COL.ACTIVE] ?? "").trim().toUpperCase() !== "NO",
      sortOrder:   Number(r[EXTRA_SERVICE_COL.SORT_ORDER]) || 0,
    }))
    .filter((s) => s.id);
}

export async function getExtraServiceById(id: string): Promise<ExtraService | null> {
  const targetId = id.trim();
  if (!targetId) return null;
  const services = await fetchExtraServices();
  return services.find((s) => s.id === targetId) ?? null;
}

// Shared by updateExtraService — always a fresh (uncached) read, since a
// row's position can shift between requests and this needs the CURRENT
// sheet row, not a possibly-stale cached one (same reasoning as To-Do's
// findToDoRow).
async function findExtraServiceRow(
  sheets: ReturnType<typeof google.sheets>,
  targetId: string
): Promise<{ sheetRow: number; row: string[] }> {
  const res = await withTimeout(FETCH_TIMEOUT_MS, () =>
    sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${EXTRA_SERVICES_TAB}!A:F`,
    })
  );

  const rows = ((res.data.values ?? []) as string[][]).slice(1);
  const rowIndex = rows.findIndex((r) => (r[EXTRA_SERVICE_COL.ID] ?? "").trim() === targetId);
  if (rowIndex === -1) {
    throw new Error(`Extra service "${targetId}" not found.`);
  }
  return { sheetRow: rowIndex + 2, row: rows[rowIndex] };
}

export type ExtraServiceInput = {
  name: string;
  description: string;
  imageUrl: string;
  active: boolean;
  sortOrder: number;
};

function buildExtraServiceRow(id: string, data: ExtraServiceInput): string[] {
  return [
    id,
    data.name,
    data.description,
    data.imageUrl,
    data.active ? "Yes" : "No",
    String(data.sortOrder),
  ];
}

export async function appendExtraService(data: ExtraServiceInput): Promise<string> {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const rand = Math.random().toString(36).slice(2, 6);
  const id = `SVC-${stamp.slice(-8)}-${rand}`;
  await appendToSheet(EXTRA_SERVICES_TAB, buildExtraServiceRow(id, data));
  return id;
}

export type ExtraServiceUpdateInput = Partial<{
  name: string;
  description: string;
  imageUrl: string;
  active: boolean;
  sortOrder: number;
}>;

// Partial update by id (not sheetRow) — only the fields present in `fields`
// are written; omitted fields keep their current sheet value untouched,
// same "partial update" contract as updateToDo/updateManager.
export async function updateExtraService(id: string, fields: ExtraServiceUpdateInput): Promise<void> {
  const targetId = id.trim();
  if (!targetId) throw new Error("Missing extra service id.");

  invalidateCache(`tab-${EXTRA_SERVICES_TAB}`);

  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  const { sheetRow } = await findExtraServiceRow(sheets, targetId);

  const data: { range: string; values: string[][] }[] = [];
  if (fields.name !== undefined) {
    data.push({ range: `${EXTRA_SERVICES_TAB}!B${sheetRow}`, values: [[fields.name]] });
  }
  if (fields.description !== undefined) {
    data.push({ range: `${EXTRA_SERVICES_TAB}!C${sheetRow}`, values: [[fields.description]] });
  }
  if (fields.imageUrl !== undefined) {
    data.push({ range: `${EXTRA_SERVICES_TAB}!D${sheetRow}`, values: [[fields.imageUrl]] });
  }
  if (fields.active !== undefined) {
    data.push({ range: `${EXTRA_SERVICES_TAB}!E${sheetRow}`, values: [[fields.active ? "Yes" : "No"]] });
  }
  if (fields.sortOrder !== undefined) {
    data.push({ range: `${EXTRA_SERVICES_TAB}!F${sheetRow}`, values: [[String(fields.sortOrder)]] });
  }

  if (data.length === 0) return;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: "USER_ENTERED", data },
  });
}

// ─── SMS Log (per-to-do Textbelt notification attempts) ────────────────────

const SMS_LOG_TAB = "SmsLog";
const SMS_LOG_RANGE = `'${SMS_LOG_TAB}'`;

const SMS_LOG_COL = {
  TO_DO_ID:        0, // A
  TEXT_ID:         1, // B — Textbelt's id for this specific send; blank when
                       //     the attempt errored before Textbelt ever
                       //     returned one (see sendSms's textId comment).
  MANAGER_PHONE:   2, // C
  STATUS:          3, // D — "sent" at write time, then whatever
                       //     GET /status/:textId last reported
                       //     (DELIVERED/SENT/SENDING/FAILED/UNKNOWN), or
                       //     "failed" for a pre-Textbelt error (no textId).
  SENT_AT:         4, // E
  LAST_CHECKED_AT: 5, // F — blank until the first status check.
} as const;

export type SmsLogEntry = {
  sheetRow: number;
  toDoId: string;
  textId: string;
  managerPhone: string;
  status: string;
  sentAt: string;
  lastCheckedAt: string;
};

// Deliberately uncached, same reasoning as fetchToDoRows — a resend or a
// status check must see the row it just wrote/updated, not a stale
// per-instance cache serving another invocation's snapshot.
async function fetchSmsLogRows(): Promise<string[][]> {
  const rows = await withTimeout(FETCH_TIMEOUT_MS, async () => {
    const auth = getAuthClient();
    const sheets = google.sheets({ version: "v4", auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
      range: `${SMS_LOG_RANGE}!A:F`,
    });
    return (response.data.values ?? []).slice(1) as string[][];
  });
  return rows;
}

function rowToSmsLogEntry(row: string[], sheetRow: number): SmsLogEntry {
  return {
    sheetRow,
    toDoId:        row[SMS_LOG_COL.TO_DO_ID]        ?? "",
    textId:        row[SMS_LOG_COL.TEXT_ID]         ?? "",
    managerPhone:  row[SMS_LOG_COL.MANAGER_PHONE]   ?? "",
    status:        row[SMS_LOG_COL.STATUS]          ?? "",
    sentAt:        row[SMS_LOG_COL.SENT_AT]         ?? "",
    lastCheckedAt: row[SMS_LOG_COL.LAST_CHECKED_AT] ?? "",
  };
}

// Every attempt for a to-do, most recent first — a resend keeps full
// history (a new row per attempt, never overwriting a prior one), so both
// the UI's badge (latest attempt) and the resend rate-limit (any recent
// attempt) need the whole list, not just one row.
export async function fetchSmsLogForToDo(toDoId: string): Promise<SmsLogEntry[]> {
  const target = toDoId.trim();
  if (!target) return [];

  const rows = await fetchSmsLogRows();
  return rows
    .map((row, i) => rowToSmsLogEntry(row, i + 2))
    .filter((entry) => entry.toDoId === target)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

// Same append-collision hazard findNextToDoRow's comment documents for the
// To Do tab (values.append() misreads the table's left edge when the last
// row has a gap) — LastCheckedAt is blank until the first status check,
// which is exactly that shape, so this uses the same
// find-next-row-then-targeted-update approach rather than values.append().
async function findNextSmsLogRow(sheets: ReturnType<typeof google.sheets>): Promise<number> {
  const res = await withTimeout(FETCH_TIMEOUT_MS, () =>
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
      range: `${SMS_LOG_RANGE}!A:Z`,
    })
  );
  const rows = (res.data.values ?? []) as string[][];
  return rows.length + 1;
}

export async function appendSmsLog(entry: {
  toDoId: string;
  textId: string;
  managerPhone: string;
  status: string;
}): Promise<void> {
  const sentAt = new Date().toISOString();

  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  const targetRow = await findNextSmsLogRow(sheets);

  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
    range: `${SMS_LOG_RANGE}!A${targetRow}:F${targetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[entry.toDoId, entry.textId, entry.managerPhone, entry.status, sentAt, ""]],
    },
  });
}

// Keyed by TextId (unique per Textbelt send) rather than ToDoId — a to-do
// can have multiple attempts (resends), so "the row for this to-do" would
// be ambiguous about which attempt to update. No-ops for a pre-Textbelt
// failure row (blank textId, nothing to look up).
export async function updateSmsLogStatus(textId: string, status: string): Promise<void> {
  const target = textId.trim();
  if (!target) return;

  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });

  const res = await withTimeout(FETCH_TIMEOUT_MS, () =>
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
      range: `${SMS_LOG_RANGE}!A:F`,
    })
  );
  const rows = ((res.data.values ?? []) as string[][]).slice(1);
  const rowIndex = rows.findIndex((r) => (r[SMS_LOG_COL.TEXT_ID] ?? "").trim() === target);
  if (rowIndex === -1) return;

  const sheetRow = rowIndex + 2;
  const lastCheckedAt = new Date().toISOString();

  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
    range: `${SMS_LOG_RANGE}!D${sheetRow}:F${sheetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[status, rows[rowIndex][SMS_LOG_COL.SENT_AT] ?? "", lastCheckedAt]],
    },
  });
}

// ─── Managers ──────────────────────────────────────────────────────────────

const MANAGERS_TAB = "Managers";

// Matches the Managers tab's existing header row (Manager ID, Manager Name,
// Email, Phone, Status, Notes) — Email/Notes aren't used by this pass.
const MANAGER_COL = {
  MANAGER_ID: 0, // A
  NAME:       1, // B
  EMAIL:      2, // C (unused for now)
  PHONE:      3, // D
  STATUS:     4, // E
  NOTES:      5, // F (unused for now)
  // Google Calendar's fixed event colorId ("1"-"11"), manually assigned per
  // manager in Settings — drives the color of that manager's synced to-do
  // events. Blank means "no color assigned," which leaves colorId unset on
  // the event (Calendar falls back to the calendar's default color).
  CALENDAR_COLOR_ID: 6, // G
} as const;

export type Manager = {
  sheetRow: number;
  managerId: string;
  name: string;
  phone: string;
  status: string;
  calendarColorId: string;
};

async function fetchManagerRows(): Promise<string[][]> {
  const cacheKey = `tab-${MANAGERS_TAB}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const rows = await withTimeout(FETCH_TIMEOUT_MS, async () => {
    const auth = getAuthClient();
    const sheets = google.sheets({ version: "v4", auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
      range: `${MANAGERS_TAB}!A:G`,
    });
    return (response.data.values ?? []).slice(1) as string[][];
  });

  setCache(cacheKey, rows);
  return rows;
}

export async function fetchManagers(): Promise<Manager[]> {
  const rows = await fetchManagerRows();
  return rows.map((r, i) => ({
    sheetRow:        i + 2,
    managerId:       r[MANAGER_COL.MANAGER_ID]       ?? "",
    name:            r[MANAGER_COL.NAME]             ?? "",
    phone:           r[MANAGER_COL.PHONE]            ?? "",
    status:          r[MANAGER_COL.STATUS]           ?? "",
    calendarColorId: r[MANAGER_COL.CALENDAR_COLOR_ID] ?? "",
  }));
}

// Used by lib/googleCalendar.ts to color a synced to-do's event by its
// assignee. Matches on trimmed, case-insensitive name — the to-do form's
// "Assigned To" dropdown is populated straight from this same list, so this
// is normally an exact match; the case-insensitive fallback just guards
// against incidental whitespace/casing drift rather than any real fuzzy
// matching need.
export async function getManagerCalendarColorId(assignedTo: string): Promise<string | undefined> {
  const target = assignedTo.trim().toLowerCase();
  if (!target) return undefined;

  const managers = await fetchManagers();
  const match = managers.find((manager) => manager.name.trim().toLowerCase() === target);
  return match?.calendarColorId || undefined;
}

export async function appendManager(data: {
  name: string;
  phone: string;
  status: string;
}): Promise<string> {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const rand = Math.random().toString(36).slice(2, 6);
  const managerId = `MGR-${stamp.slice(-8)}-${rand}`;
  const row = Array(7).fill("");
  row[MANAGER_COL.MANAGER_ID] = managerId;
  row[MANAGER_COL.NAME] = data.name;
  row[MANAGER_COL.PHONE] = data.phone;
  row[MANAGER_COL.STATUS] = data.status;
  await appendToMainSheet(MANAGERS_TAB, row);
  return managerId;
}

export async function updateManager(
  sheetRow: number,
  fields: Partial<{
    name: string;
    phone: string;
    status: string;
    calendarColorId: string;
  }>
): Promise<void> {
  invalidateCache(`tab-${MANAGERS_TAB}`);
  const colLetters: Record<string, string> = {
    name: "B",
    phone: "D",
    status: "E",
    calendarColorId: "G",
  };

  const data = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([key, value]) => ({
      range: `${MANAGERS_TAB}!${colLetters[key]}${sheetRow}`,
      values: [[value]],
    }));

  if (data.length === 0) return;

  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
    requestBody: { valueInputOption: "USER_ENTERED", data },
  });
}

// ─── Subcontractors (main roster tab) ────────────────────────────────────────
// Column A ("Subcontractor ID") is a single ARRAYFORMULA in A2 that spills
// computed IDs (SUB-001, SUB-002, ...) down the whole column based on row
// position. Writing anything into column A — even the correct, unchanged ID —
// blocks the spill and breaks the formula (#REF!) for every row below it.
// updateSubcontractor must NEVER write to column A; it only reads it to find
// the target row. Lives in the same spreadsheet as Managers/SubSchedules
// (GOOGLE_MAIN_SHEET_ID), not the customer-portal one.

const SUBCONTRACTORS_TAB = "Subcontractors";

// Maps the field names the app sends to every header text this sheet has
// used for that field (matched case/whitespace-insensitively). The sheet
// has a couple of duplicate legacy header columns near the end (a second
// "Phone" and "Insurance Expiration") — header lookup keeps the first
// (leftmost) match, which is always the primary column.
const SUBCONTRACTOR_FIELD_ALIASES: Record<string, string[]> = {
  companyName: ["company name"],
  contactName: ["contact name"],
  phone: ["phone"],
  email: ["email"],
  address: ["address"],
  areasServiced: ["areas serviced"],
  servicesProvided: ["services provided"],
  employeeCapacity: ["employee capacity"],
  insuranceExpiration: ["insurance expiration date", "insurance expiration"],
  status: ["status"],
  notes: ["notes"],
};

function columnIndexToLetter(index: number): string {
  let letter = "";
  let n = index;
  while (n >= 0) {
    letter = String.fromCharCode((n % 26) + 65) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}

export async function updateSubcontractor(
  id: string,
  fields: Record<string, unknown>
): Promise<Record<string, string>> {
  const targetId = id.trim();
  if (!targetId) throw new Error("Missing subcontractor id.");

  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });

  const res = await withTimeout(FETCH_TIMEOUT_MS, () =>
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
      range: `${SUBCONTRACTORS_TAB}!A:Z`,
    })
  );

  const allRows = (res.data.values ?? []) as string[][];
  const headerRow = allRows[0] ?? [];
  const dataRows = allRows.slice(1);

  // The frontend's subcontractor "id" comes straight through from Apps
  // Script's getSubcontractors action, which has always identified rows as
  // "SUB-ROW-<sheet row number>" — a stable, row-position-based locator
  // that is separate from column A's ARRAYFORMULA-computed display ID
  // (e.g. sheet row 15 shows "SUB-014" in column A, not "SUB-ROW-15").
  // Matching targetId against column A text (the previous approach here)
  // never matches anything, so every save failed with "not found". Parse
  // the row number straight out of the id instead; column A is still never
  // read for this lookup and never written to.
  const rowMatch = targetId.match(/^SUB-ROW-(\d+)$/i);
  const rowIndex = rowMatch
    ? parseInt(rowMatch[1], 10) - 2 // header row + 1-based sheet rows
    : dataRows.findIndex((r) => (r[0] ?? "").trim() === targetId); // fallback for a raw column-A-style id
  if (rowIndex < 0 || rowIndex >= dataRows.length) {
    throw new Error(`Subcontractor "${targetId}" not found.`);
  }
  const sheetRow = rowIndex + 2; // header row + 1-based sheet rows

  // Normalize headers once; first occurrence of a name wins so duplicate/
  // legacy columns later in the row are never the write target.
  const normalizedHeaderCols = new Map<string, number>();
  headerRow.forEach((header, colIndex) => {
    const normalized = String(header ?? "").trim().toLowerCase();
    if (!normalized || normalizedHeaderCols.has(normalized)) return;
    normalizedHeaderCols.set(normalized, colIndex);
  });

  const writes: { colIndex: number; value: string }[] = [];

  for (const [key, rawValue] of Object.entries(fields)) {
    if (rawValue === undefined) continue;
    // "id"/"Subcontractor ID" must never resolve to a write — column A is
    // the ARRAYFORMULA-driven ID and is read-only from this function's POV.
    if (key === "id" || key === "Subcontractor ID") continue;

    const aliases = SUBCONTRACTOR_FIELD_ALIASES[key];
    if (!aliases) continue; // unrecognized field — ignore rather than guess a column

    let colIndex: number | undefined;
    for (const alias of aliases) {
      if (normalizedHeaderCols.has(alias)) {
        colIndex = normalizedHeaderCols.get(alias);
        break;
      }
    }
    if (colIndex === undefined || colIndex === 0) continue;

    writes.push({ colIndex, value: String(rawValue ?? "") });
  }

  if (writes.length > 0) {
    const data = writes.map(({ colIndex, value }) => ({
      range: `${SUBCONTRACTORS_TAB}!${columnIndexToLetter(colIndex)}${sheetRow}`,
      values: [[value]],
    }));

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
      requestBody: { valueInputOption: "USER_ENTERED", data },
    });
  }

  const mergedRow = [...(dataRows[rowIndex] ?? [])];
  for (const { colIndex, value } of writes) mergedRow[colIndex] = value;

  const updatedRow: Record<string, string> = {};
  headerRow.forEach((header, colIndex) => {
    const key = String(header ?? "").trim();
    if (!key || key in updatedRow) return; // keep first occurrence, same as write mapping
    updatedRow[key] = mergedRow[colIndex] ?? "";
  });

  return updatedRow;
}

// ─── Geocode cache ───────────────────────────────────────────────────────────
// Shared by the Map page (Leaflet -> Google Maps migration) and the Coverage
// page's "nearby subcontractor" matching — both turn addresses/towns into
// lat/lng via the Google Geocoding API and should share one cache instead of
// each re-geocoding (and re-billing) the same strings. Lives in the same
// spreadsheet as Managers/SubSchedules/ScheduleExceptions (GOOGLE_MAIN_SHEET_ID).

const GEOCODE_CACHE_TAB = "GeocodeCache";

const GEOCODE_CACHE_COL = {
  ADDRESS: 0,     // A — exact string that was geocoded
  LATITUDE: 1,    // B
  LONGITUDE: 2,   // C
  GEOCODED_AT: 3, // D — ISO timestamp
} as const;

export type GeocodeCacheEntry = {
  latitude: number;
  longitude: number;
};

async function fetchGeocodeCacheRows(): Promise<string[][]> {
  const cacheKey = `tab-${GEOCODE_CACHE_TAB}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const rows = await withTimeout(FETCH_TIMEOUT_MS, async () => {
    const auth = getAuthClient();
    const sheets = google.sheets({ version: "v4", auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
      range: `${GEOCODE_CACHE_TAB}!A:D`,
    });
    return (response.data.values ?? []).slice(1) as string[][];
  });

  setCache(cacheKey, rows);
  return rows;
}

// Exact-match lookup — the cache key is the literal address string that was
// geocoded (trimmed only, no normalization), matching how it will be written.
export async function getGeocodeCacheEntry(address: string): Promise<GeocodeCacheEntry | null> {
  const normalized = address.trim();
  if (!normalized) return null;

  const rows = await fetchGeocodeCacheRows();
  const row = rows.find((r) => (r[GEOCODE_CACHE_COL.ADDRESS] ?? "").trim() === normalized);
  if (!row) return null;

  const latitude = Number(row[GEOCODE_CACHE_COL.LATITUDE]);
  const longitude = Number(row[GEOCODE_CACHE_COL.LONGITUDE]);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;

  return { latitude, longitude };
}

export async function appendGeocodeCacheEntry(
  address: string,
  latitude: number,
  longitude: number
): Promise<void> {
  await appendToMainSheet(GEOCODE_CACHE_TAB, [
    address.trim(),
    String(latitude),
    String(longitude),
    new Date().toISOString(),
  ]);
}
