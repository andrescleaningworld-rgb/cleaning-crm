import { google } from "googleapis";
import { DEFAULT_TO_DO_PRIORITY, normalizeToDoPriority, type ToDoPriority } from "./toDoPriority";
import {
  createEmptyChecklistItems,
  isChecklistComplete,
  ONBOARDING_ITEM_KEYS,
  type OnboardingChecklistItems,
  type OnboardingChecklistState,
} from "./onboardingChecklist";

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
  // Links this to-do to a specific account by id rather than by name alone
  // (accountName above stays the human-facing/searchable field). Added for
  // the onboarding-checklist wizard's to-do trigger: a "New Account
  // Onboarding" to-do needs to open the checklist for ONE specific account
  // without guessing from the name, which can collide or drift if the
  // account is later renamed. Blank for every to-do created before this
  // column existed and for to-dos with no account — callers fall back to
  // resolving accountName against the loaded accounts list in that case.
  ACCOUNT_ID: 15, // P
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
  accountId: string;
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
      range: `${TO_DO_RANGE}!A:P`,
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
      accountId:          r[TO_DO_COL.ACCOUNT_ID]           ?? "",
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
  // See TO_DO_COL.ACCOUNT_ID above — optional, blank writes an empty cell
  // (a Reminder or any to-do created before this field existed on the
  // caller's form).
  accountId?: string;
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
    data.accountId ?? "",
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
    range: `${TO_DO_RANGE}!A${targetRow}:P${targetRow}`,
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
    range: `${TO_DO_RANGE}!A${targetRow}:P${lastRow}`,
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
      range: `${TO_DO_RANGE}!A:P`,
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
      range: `${TO_DO_RANGE}!A:P`,
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
  // Pre-edit assignee, so the route can tell a genuine reassignment (fires
  // an SMS) apart from an edit that happened to touch other fields while
  // leaving Assigned To untouched (must not re-notify).
  previousAssignedTo: string;
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
    previousAssignedTo: row[TO_DO_COL.ASSIGNED_TO] ?? "",
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
        previousAssignedTo: "",
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
      previousAssignedTo: row[TO_DO_COL.ASSIGNED_TO] ?? "",
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

// ─── Onboarding Checklist ────────────────────────────────────────────────────
// One row per account, not one row per item — 24 items x every account would
// make this tab huge and every single checkbox toggle a full-table
// scan-and-shift. A single ItemsJson blob per account keeps every save a
// find-or-create-by-accountId + one-row write, and survives the checklist's
// item list changing shape later (see lib/onboardingChecklist.ts) without a
// sheet migration. Lives in the same spreadsheet as To Do/Managers/
// Subcontractors (GOOGLE_MAIN_SHEET_ID), not the customer-portal one.

const ONBOARDING_TAB = "OnboardingChecklist";
const ONBOARDING_RANGE = `'${ONBOARDING_TAB}'`;

const ONBOARDING_COL = {
  ACCOUNT_ID:   0, // A
  ACCOUNT_NAME: 1, // B
  ITEMS_JSON:   2, // C
  STARTED_AT:   3, // D — set once, the first time any item is touched.
  LAST_UPDATED_AT: 4, // E
  COMPLETED_AT: 5, // F — set once every item is checked; cleared back to ""
                    //     if the row is re-fetched and something got
                    //     unchecked again (see setOnboardingChecklistItem).
  // Set once, right after the caller has successfully applied the
  // completion side effect (Account Health -> Stable via the existing
  // updateAccountFields/addAccountUpdate path) — so a later page reload
  // never re-fires that side effect for an already-completed account, even
  // if the checklist stays fully checked.
  AUTO_STABLE_APPLIED_AT: 6, // G
} as const;

async function fetchOnboardingChecklistRows(): Promise<string[][]> {
  const rows = await withTimeout(FETCH_TIMEOUT_MS, async () => {
    const auth = getAuthClient();
    const sheets = google.sheets({ version: "v4", auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
      range: `${ONBOARDING_RANGE}!A:G`,
    });
    return (response.data.values ?? []).slice(1) as string[][];
  });
  return rows;
}

// Never throws on a corrupt/empty cell — falls back to all-unchecked so one
// bad row can't take down the whole read, same posture as this file's other
// JSON-ish fields.
function parseOnboardingItemsJson(raw: string): OnboardingChecklistItems {
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
    // Corrupt cell — keep the all-unchecked default rather than throwing.
  }
  return items;
}

function rowToOnboardingChecklist(row: string[]): OnboardingChecklistState {
  return {
    accountId:          row[ONBOARDING_COL.ACCOUNT_ID]           ?? "",
    accountName:        row[ONBOARDING_COL.ACCOUNT_NAME]         ?? "",
    items:              parseOnboardingItemsJson(row[ONBOARDING_COL.ITEMS_JSON] ?? ""),
    startedAt:          row[ONBOARDING_COL.STARTED_AT]           ?? "",
    lastUpdatedAt:      row[ONBOARDING_COL.LAST_UPDATED_AT]      ?? "",
    completedAt:        row[ONBOARDING_COL.COMPLETED_AT]         ?? "",
    autoStableAppliedAt: row[ONBOARDING_COL.AUTO_STABLE_APPLIED_AT] ?? "",
  };
}

export async function fetchOnboardingChecklist(accountId: string): Promise<OnboardingChecklistState | null> {
  const target = accountId.trim();
  if (!target) return null;
  const rows = await fetchOnboardingChecklistRows();
  const row = rows.find((r) => (r[ONBOARDING_COL.ACCOUNT_ID] ?? "").trim() === target);
  return row ? rowToOnboardingChecklist(row) : null;
}

// Same append-collision hazard as findNextToDoRow (see its comment) —
// targeted find-next-row-then-update instead of values.append().
async function findNextOnboardingRow(sheets: ReturnType<typeof google.sheets>): Promise<number> {
  const res = await withTimeout(FETCH_TIMEOUT_MS, () =>
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
      range: `${ONBOARDING_RANGE}!A:Z`,
    })
  );
  const rows = (res.data.values ?? []) as string[][];
  return rows.length + 1;
}

// Read-modify-write a single item within one account's checklist row,
// creating the row on first interaction with that account's checklist. A
// checklist is only ever edited by one manager at a time in practice, so a
// simple read-then-write is enough here — no optimistic locking.
export async function setOnboardingChecklistItem(input: {
  accountId: string;
  accountName: string;
  itemKey: string;
  checked: boolean;
  note: string;
  // See OnboardingItemState.fieldOverwriteNote — set by the API route after
  // this same item's real-field sync detects it overwrote a pre-existing,
  // different value, via a second call with the checked/note unchanged.
  // Undefined leaves whatever was already stored untouched; null clears it.
  fieldOverwriteNote?: string | null;
}): Promise<OnboardingChecklistState> {
  const accountId = input.accountId.trim();
  if (!accountId) throw new Error("Missing accountId.");
  if (!ONBOARDING_ITEM_KEYS.includes(input.itemKey)) {
    throw new Error(`Unknown checklist item "${input.itemKey}".`);
  }

  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });

  const rows = await fetchOnboardingChecklistRows();
  const rowIndex = rows.findIndex((r) => (r[ONBOARDING_COL.ACCOUNT_ID] ?? "").trim() === accountId);
  const existing = rowIndex === -1 ? null : rowToOnboardingChecklist(rows[rowIndex]);

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
  const nowComplete = isChecklistComplete(items);
  const completedAt = nowComplete ? existing?.completedAt || now : "";

  const values = [
    accountId,
    input.accountName || existing?.accountName || "",
    JSON.stringify(items),
    startedAt,
    now,
    completedAt,
    existing?.autoStableAppliedAt ?? "",
  ];

  if (rowIndex === -1) {
    const targetRow = await findNextOnboardingRow(sheets);
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
      range: `${ONBOARDING_RANGE}!A${targetRow}:G${targetRow}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [values] },
    });
  } else {
    const sheetRow = rowIndex + 2;
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
      range: `${ONBOARDING_RANGE}!A${sheetRow}:G${sheetRow}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [values] },
    });
  }

  return rowToOnboardingChecklist(values);
}

// Marks the completion side effect as done — called once by the client,
// right after it has successfully set Account Health to Stable via the
// existing updateAccountFields/addAccountUpdate path, so a later reload of
// an already-completed checklist never re-triggers that side effect again.
export async function markOnboardingAutoStableApplied(accountId: string): Promise<void> {
  const target = accountId.trim();
  if (!target) return;

  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  const rows = await fetchOnboardingChecklistRows();
  const rowIndex = rows.findIndex((r) => (r[ONBOARDING_COL.ACCOUNT_ID] ?? "").trim() === target);
  if (rowIndex === -1) return;

  const sheetRow = rowIndex + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
    range: `${ONBOARDING_RANGE}!G${sheetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[new Date().toISOString()]] },
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

// ─── Documents (company documents: contracts, handbooks, policies) ─────────
// Lives in the main Accounts spreadsheet (GOOGLE_MAIN_SHEET_ID), matching
// SubSchedules/ScheduleExceptions — created by scripts/setup-documents-tab.js.

const DOCUMENTS_TAB = "Documents";

export const DOCUMENT_CATEGORIES = ["Contract", "Handbook", "Policy", "Other"] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

const DOCUMENT_COL = {
  ID:          0, // A
  NAME:        1, // B
  CATEGORY:    2, // C
  FILE_NAME:   3, // D
  FILE_URL:    4, // E
  FILE_SIZE:   5, // F
  UPLOADED_AT: 6, // G
  UPLOADED_BY: 7, // H
} as const;

export type CwDocument = {
  sheetRow: number;
  id: string;
  name: string;
  category: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  uploadedAt: string;
  uploadedBy: string;
};

async function fetchDocumentRows(): Promise<string[][]> {
  const cacheKey = `tab-${DOCUMENTS_TAB}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const rows = await withTimeout(FETCH_TIMEOUT_MS, async () => {
    const auth = getAuthClient();
    const sheets = google.sheets({ version: "v4", auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
      range: `${DOCUMENTS_TAB}!A:H`,
    });
    return (response.data.values ?? []).slice(1) as string[][];
  });

  setCache(cacheKey, rows);
  return rows;
}

function rowToDocument(row: string[], sheetRow: number): CwDocument {
  return {
    sheetRow,
    id:          row[DOCUMENT_COL.ID]          ?? "",
    name:        row[DOCUMENT_COL.NAME]        ?? "",
    category:    row[DOCUMENT_COL.CATEGORY]    ?? "",
    fileName:    row[DOCUMENT_COL.FILE_NAME]   ?? "",
    fileUrl:     row[DOCUMENT_COL.FILE_URL]    ?? "",
    fileSize:    Number(row[DOCUMENT_COL.FILE_SIZE]) || 0,
    uploadedAt:  row[DOCUMENT_COL.UPLOADED_AT] ?? "",
    uploadedBy:  row[DOCUMENT_COL.UPLOADED_BY] ?? "",
  };
}

export async function fetchDocuments(): Promise<CwDocument[]> {
  const rows = await fetchDocumentRows();
  return rows
    .map((r, i) => rowToDocument(r, i + 2))
    .filter((d) => d.id);
}

export async function getDocumentById(id: string): Promise<CwDocument | null> {
  const targetId = id.trim();
  if (!targetId) return null;
  const documents = await fetchDocuments();
  return documents.find((d) => d.id === targetId) ?? null;
}

export type DocumentInput = {
  name: string;
  category: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  uploadedBy: string;
};

export async function appendDocument(data: DocumentInput): Promise<string> {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const rand = Math.random().toString(36).slice(2, 6);
  const id = `DOC-${stamp.slice(-8)}-${rand}`;
  const uploadedAt = new Date().toISOString();
  await appendToMainSheet(DOCUMENTS_TAB, [
    id,
    data.name,
    data.category,
    data.fileName,
    data.fileUrl,
    String(data.fileSize),
    uploadedAt,
    data.uploadedBy,
  ]);
  return id;
}

// Fresh (uncached) read, same reasoning as findExtraServiceRow — a row's
// position can shift between requests.
async function findDocumentRow(
  sheets: ReturnType<typeof google.sheets>,
  targetId: string
): Promise<{ sheetRow: number; row: string[] }> {
  const res = await withTimeout(FETCH_TIMEOUT_MS, () =>
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
      range: `${DOCUMENTS_TAB}!A:H`,
    })
  );

  const rows = ((res.data.values ?? []) as string[][]).slice(1);
  const rowIndex = rows.findIndex((r) => (r[DOCUMENT_COL.ID] ?? "").trim() === targetId);
  if (rowIndex === -1) {
    throw new Error(`Document "${targetId}" not found.`);
  }
  return { sheetRow: rowIndex + 2, row: rows[rowIndex] };
}

// Hard delete (unlike ExtraServices' soft-delete) — the caller deletes the
// underlying Blob first, so the row and file are removed together.
export async function deleteDocument(id: string): Promise<void> {
  const targetId = id.trim();
  if (!targetId) throw new Error("Missing document id.");

  invalidateCache(`tab-${DOCUMENTS_TAB}`);

  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  const { sheetRow } = await findDocumentRow(sheets, targetId);

  await sheets.spreadsheets.values.clear({
    spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
    range: `${DOCUMENTS_TAB}!A${sheetRow}:H${sheetRow}`,
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
  // Textbelt's quotaRemaining at the moment of THIS send — a point-in-time
  // snapshot, not touched again by updateSmsLogStatus below. Blank for
  // pre-Textbelt failures (lookup errors, no manager/phone) and for
  // Textbelt-reported failures, since Textbelt only returns a quota number
  // on success.
  QUOTA_REMAINING: 6, // G
} as const;

export type SmsLogEntry = {
  sheetRow: number;
  toDoId: string;
  textId: string;
  managerPhone: string;
  status: string;
  sentAt: string;
  lastCheckedAt: string;
  quotaRemaining: string;
};

// Cached (unlike fetchToDoRows) because of who calls this: /api/to-do/[id]/
// sms-status is hit once per rendered to-do card, so an open-heavy to-do
// list fires dozens of concurrent requests on one page load — confirmed
// live as a burst of 500s from this read hitting Sheets' per-user rate
// limit under that concurrency. A shared cache collapses that burst into
// one real fetch. Staleness is a non-issue: the sms-status route already
// only re-checks Textbelt (and only then calls updateSmsLogStatus) once per
// RECHECK_INTERVAL_MS=60s per to-do, so this tab can't legitimately change
// more often than that from this route's own writes anyway — and
// appendSmsLog/updateSmsLogStatus both invalidate this cache key the
// moment they write, so a fresh send or status change is never masked.
const SMS_LOG_CACHE_KEY = `tab-${SMS_LOG_TAB}`;

async function fetchSmsLogRows(): Promise<string[][]> {
  const cached = getCached(SMS_LOG_CACHE_KEY);
  if (cached) return cached;

  const rows = await withTimeout(FETCH_TIMEOUT_MS, async () => {
    const auth = getAuthClient();
    const sheets = google.sheets({ version: "v4", auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
      range: `${SMS_LOG_RANGE}!A:G`,
    });
    return (response.data.values ?? []).slice(1) as string[][];
  });

  setCache(SMS_LOG_CACHE_KEY, rows);
  return rows;
}

function rowToSmsLogEntry(row: string[], sheetRow: number): SmsLogEntry {
  return {
    sheetRow,
    toDoId:         row[SMS_LOG_COL.TO_DO_ID]        ?? "",
    textId:         row[SMS_LOG_COL.TEXT_ID]         ?? "",
    managerPhone:   row[SMS_LOG_COL.MANAGER_PHONE]   ?? "",
    status:         row[SMS_LOG_COL.STATUS]          ?? "",
    sentAt:         row[SMS_LOG_COL.SENT_AT]         ?? "",
    lastCheckedAt:  row[SMS_LOG_COL.LAST_CHECKED_AT] ?? "",
    quotaRemaining: row[SMS_LOG_COL.QUOTA_REMAINING] ?? "",
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
  // Textbelt's quotaRemaining from THIS send's response — undefined for
  // pre-Textbelt and Textbelt-reported failures (see QUOTA_REMAINING's
  // comment above), written as a blank cell rather than "0" so a genuinely
  // exhausted quota (0) stays distinguishable from "unknown."
  quotaRemaining?: number;
}): Promise<void> {
  const sentAt = new Date().toISOString();

  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  const targetRow = await findNextSmsLogRow(sheets);

  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
    range: `${SMS_LOG_RANGE}!A${targetRow}:G${targetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          entry.toDoId,
          entry.textId,
          entry.managerPhone,
          entry.status,
          sentAt,
          "",
          entry.quotaRemaining !== undefined ? String(entry.quotaRemaining) : "",
        ],
      ],
    },
  });

  invalidateCache(SMS_LOG_CACHE_KEY);
}

// Most recent send that actually reported a quota (Textbelt only returns
// one on success) — read once on /to-do page load to drive the low-quota
// banner. Deliberately a single scalar, not per-to-do: Textbelt quota is
// one account-wide number, not something tied to any particular to-do.
export async function fetchLatestSmsQuota(): Promise<{ quotaRemaining: number; sentAt: string } | null> {
  const rows = await fetchSmsLogRows();

  let latest: { quotaRemaining: number; sentAt: string } | null = null;
  for (const row of rows) {
    const raw = row[SMS_LOG_COL.QUOTA_REMAINING];
    if (!raw) continue;
    const quotaRemaining = Number(raw);
    if (!Number.isFinite(quotaRemaining)) continue;

    const sentAt = row[SMS_LOG_COL.SENT_AT] ?? "";
    if (!latest || sentAt > latest.sentAt) {
      latest = { quotaRemaining, sentAt };
    }
  }

  return latest;
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

  invalidateCache(SMS_LOG_CACHE_KEY);
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

// Replaces the Apps Script "getSubcontractors" action for app/api/subcontractors
// route.ts's GET handler. That route already discards the score/scoreStatus/
// complaints/avgCondition fields Apps Script computed in favor of
// getSubcontractorPerformanceMap below, so this only needs to supply the raw
// contact/profile fields the old Apps Script response also carried — same
// header-alias lookup updateSubcontractor above uses to find columns to
// write, reused here read-only. "id" is the row-position id
// ("SUB-ROW-<sheet row>"), matching what Apps Script's getSubcontractors
// always returned (see updateSubcontractor's comment) and what
// updateSubcontractor still parses back out of the frontend's save requests
// — column A's ARRAYFORMULA-computed display ID is never read for this.
export type RawSubcontractorRow = Record<string, string>;

export async function getAllSubcontractorsRaw(): Promise<RawSubcontractorRow[]> {
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

  const normalizedHeaderCols = new Map<string, number>();
  headerRow.forEach((header, colIndex) => {
    const normalized = String(header ?? "").trim().toLowerCase();
    if (!normalized || normalizedHeaderCols.has(normalized)) return;
    normalizedHeaderCols.set(normalized, colIndex);
  });

  return dataRows.map((row, rowIndex) => {
    const sheetRow = rowIndex + 2; // header row + 1-based sheet rows
    const result: RawSubcontractorRow = { id: `SUB-ROW-${sheetRow}` };

    for (const [field, aliases] of Object.entries(SUBCONTRACTOR_FIELD_ALIASES)) {
      let colIndex: number | undefined;
      for (const alias of aliases) {
        if (normalizedHeaderCols.has(alias)) {
          colIndex = normalizedHeaderCols.get(alias);
          break;
        }
      }
      result[field] = colIndex === undefined ? "" : String(row[colIndex] ?? "").trim();
    }

    return result;
  });
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

// ─── Complaints (creation only) ─────────────────────────────────────────────
// Complaint CREATION migrated off the Apps Script backend (strangler-fig,
// same pattern as appendToDo above), prompted by "Reported By" being sent
// correctly by the frontend and /api/complaints but silently dropped by the
// Apps Script addComplaint handler before it reached the sheet — confirmed
// by querying the live getComplaints endpoint directly, which returned an
// empty reportedBy for every existing row including same-day submissions.
// Reads (getComplaints) and the close/edit/resend actions stay on Apps
// Script for now — this covers only the write path that was actually
// broken. Column headers/order confirmed live against the "Complaints" tab
// in GOOGLE_MAIN_SHEET_ID before writing this.
//
// Uses a targeted values.update() to an explicitly computed row rather than
// values.append() — see findNextToDoRow's comment above for why append() is
// unsafe once a sheet has blank cells followed by populated cells further
// right in its last row. The Complaints tab already has that exact shape on
// most rows (Last Follow-Up Date / Resolution Date blank while Notes, one
// column to their right, is often populated), so this isn't a hypothetical
// risk here.

const COMPLAINTS_TAB = "Complaints";

const COMPLAINT_COL = {
  ID:                  0, // A
  ACCOUNT_ID:          1, // B
  ACCOUNT_NAME:        2, // C
  COMPLAINT_DATE:      3, // D
  ISSUE:               4, // E
  PRIORITY:            5, // F
  COMPLAINT_VALIDITY:  6, // G
  STATUS:              7, // H
  REPORTED_BY:         8, // I
  ASSIGNED_TO:         9, // J
  LAST_FOLLOW_UP_DATE: 10, // K
  RESOLUTION_DATE:     11, // L — set only by the (still Apps-Script-owned) close action;
                           // confirmed blank on every real row today (see scoring comment above) —
                           // read defensively, UPDATED_AT is the practical fallback.
  NOTES:               12, // M
  // CREATED_AT:       13, // N — never populated by the old addComplaint either; left blank
  UPDATED_AT:          14, // O — set only by the close action; used as the resolution-date
                           // fallback for scoring when RESOLUTION_DATE is blank.
  // LAST_FOLLOW_UP:   15, // P — unused in every row observed; left blank
} as const;

export type ComplaintInput = {
  accountId: string;
  accountName: string;
  complaintDate: string;
  issue: string;
  priority: string;
  complaintValidity: string;
  status: string;
  reportedBy: string;
  assignedTo: string;
  lastFollowUpDate: string;
  notes: string;
};

function buildComplaintRow(id: string, data: ComplaintInput): string[] {
  const row = Array(16).fill("") as string[];
  row[COMPLAINT_COL.ID] = id;
  row[COMPLAINT_COL.ACCOUNT_ID] = data.accountId;
  row[COMPLAINT_COL.ACCOUNT_NAME] = data.accountName;
  row[COMPLAINT_COL.COMPLAINT_DATE] = data.complaintDate;
  row[COMPLAINT_COL.ISSUE] = data.issue;
  row[COMPLAINT_COL.PRIORITY] = data.priority;
  row[COMPLAINT_COL.COMPLAINT_VALIDITY] = data.complaintValidity;
  row[COMPLAINT_COL.STATUS] = data.status;
  row[COMPLAINT_COL.REPORTED_BY] = data.reportedBy;
  row[COMPLAINT_COL.ASSIGNED_TO] = data.assignedTo;
  row[COMPLAINT_COL.LAST_FOLLOW_UP_DATE] = data.lastFollowUpDate;
  row[COMPLAINT_COL.NOTES] = data.notes;
  return row;
}

async function findNextComplaintRow(sheets: ReturnType<typeof google.sheets>): Promise<number> {
  const res = await withTimeout(FETCH_TIMEOUT_MS, () =>
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
      range: `${COMPLAINTS_TAB}!A:Z`,
    })
  );
  const rows = (res.data.values ?? []) as string[][];
  return rows.length + 1; // 1-indexed sheet row right after the last one with data
}

export async function appendComplaint(data: ComplaintInput): Promise<string> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  // Matches the existing Complaint ID format ("COMP-20260615170222")
  // produced by the Apps Script backend this replaces.
  const id = `COMP-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  const targetRow = await findNextComplaintRow(sheets);

  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
    range: `${COMPLAINTS_TAB}!A${targetRow}:P${targetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [buildComplaintRow(id, data)] },
  });

  return id;
}

// ─── Subcontractor performance scoring ──────────────────────────────────────
// Migrated off the Apps Script backend's calculateSubcontractorScore.
// Root cause (confirmed live before writing this): the Accounts tab's
// Subcontractor column is filled by staff with the contact's first name
// ("Tania"), but the old function matched it with STRICT equality against
// the Subcontractors tab's Company Name ("Tania Cleaning NJ Inc.") —
// "tania" !== "tania cleaning nj inc.", so assignedAccounts came up empty
// for almost every subcontractor (confirmed: live accountsAssigned was "0"
// for all but one, whose Accounts-sheet field happened to exactly equal its
// company name). Since visits/complaints were both matched to a
// subcontractor via that same empty assignedAccountNames set, score stayed
// pinned at its 10/"Excellent" default regardless of real complaints. (The
// Complaints and Visits tabs also have no Subcontractor column of their own
// — same class of issue as the earlier Reported By fix — so this was never
// a viable primary match path either.)
//
// Fix: match accounts↔subcontractor with the same fuzzy substring logic
// already proven correct elsewhere in this codebase (namesMatch in
// app/api/subcontractors/route.ts, and the subcontractorAccounts computation
// in app/subcontractors/[id]/page.tsx), then match visits/complaints↔account
// by exact Account Name — the same approach that page's relatedComplaints
// already uses correctly.
//
// ── Scoring model (severity-weighted deductions + account-size
// normalization + monthly recovery) ────────────────────────────────────────
// Replaces the old flat formula (avg visit condition minus 0.5 per open
// complaint). avgCondition/lastReview are still computed and returned below
// exactly as before — they're their own displayed fields (Avg Condition /
// Last Review columns) independent of the score — but the score itself no
// longer factors avgCondition in at all; it now starts from a flat base of
// 10 and is driven entirely by complaint severity, account-size
// normalization, and time-based recovery. See computeSubcontractorScore
// below for the full algorithm and its rollout behavior.
//
// Data-vocabulary notes (confirmed live against the real sheet + the
// complaint form's actual dropdowns, not assumed):
//   - Priority tiers are Low/Medium/High/Urgent (app/complaints/new/page.tsx)
//     — there is no "Critical" tier anywhere in this app. "Urgent" is the
//     real top tier and takes the weight that would otherwise be Critical's.
//   - Complaint Validity options are Valid/Not Valid/Subjective/Needs Review
//     — "Invalid"/"Unfounded" don't exist as values; only "Not Valid" (and
//     the pre-existing "no"/"invalid"/"notvalid" synonyms this file already
//     tolerated) exclude a complaint from scoring. "Subjective" and "Needs
//     Review" both still count, unchanged from the prior behavior.
//   - Status options are Open/Pending/Needs Attention/Closed — there is no
//     "Resolved" status. "Closed" is this app's resolution state; "needs
//     attention" is now treated as open (the prior code's open-status list
//     checked for "needs review" and "in progress" instead, neither of
//     which is an actual Status value here, while omitting the real "needs
//     attention" option — corrected here to match the real dropdown).
//   - Resolution Date (column L) is part of the schema but is 100% blank on
//     every real row today, including Closed ones — the close action never
//     populated it. Updated At (column O) IS populated by that close action
//     for most Closed rows, so it's used as the resolution-timestamp
//     fallback; a Closed complaint with neither date is unanchorable and is
//     treated as legacy history (see below), not given a resolution date of
//     "now".
//
// Reads Accounts/Visits/Subcontractors directly (not through the Complaints
// tab's cache-relevant machinery above) and deliberately isn't cached — same
// reasoning as fetchToDoRows above: this is what a newly-filed complaint is
// supposed to change, so serving a stale value defeats the point of the fix.

const PERFORMANCE_VISITS_TAB = "Visits";

const ACCOUNTS_TAB = "Accounts";

const PERFORMANCE_ACCOUNT_COL = {
  ACCOUNT_NAME: 1,
  SUBCONTRACTOR: 8,
  STATUS: 16,
} as const;

// Same active/inactive rule as isActiveAccount in app/api/subcontractors/route.ts
// (reused by name here, not reinvented — see computeSubcontractorScore's comment
// on why account-size normalization needs its own active-only count rather than
// reusing that route's own accountsAssigned field directly).
function isActiveAccountStatus(status: unknown): boolean {
  const clean = String(status ?? "").toLowerCase().trim();
  if (!clean) return true;
  return !["cancelled", "canceled", "inactive", "lost", "terminated", "closed"].includes(clean);
}

const PERFORMANCE_VISIT_COL = {
  ACCOUNT_NAME: 2,
  VISIT_DATE: 3,
  CONDITION_SCORE: 6,
} as const;

const PERFORMANCE_SUBCONTRACTOR_COL = {
  ID: 0,
  CONTACT_NAME: 1,
  COMPANY_NAME: 2,
} as const;

function normalizeSubName(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\bllc\b/g, "")
    .replace(/\binc\b/g, "")
    .replace(/\bcorp\b/g, "")
    .replace(/\bcorporation\b/g, "")
    .replace(/\bcompany\b/g, "")
    .replace(/\bco\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Base match shape is the same as namesMatch (app/api/subcontractors/route.ts)
// and subcontractorAccounts (app/subcontractors/[id]/page.tsx) — substring
// match both directions against company name AND contact name, length-guarded
// so a short fragment (e.g. "co") doesn't loosely match everything. But
// unlike those two (which each test one known subcontractor in isolation),
// this is resolved globally across ALL subcontractors per distinct raw
// Accounts-tab value below, because the roster has real contact-name
// prefix collisions (e.g. "Cesar" vs "Cesar Decarvalho", "Giovanna" vs
// "Alonso & Giovanna Mendoza"): an account whose field is literally "Cesar"
// is a substring-match against both, and resolving each subcontractor
// independently — the first version of this fix did — silently
// double-counted every one of that subcontractor's accounts, visits, and
// complaints onto the unrelated one too. An exact match always wins over a
// substring one; if either the exact or the fallback substring pass still
// resolves to more than one subcontractor, the account is left unassigned
// rather than guessed.
function subAssignmentMatches(assignedSub: string, candidate: string): boolean {
  if (!assignedSub || !candidate) return false;
  if (assignedSub === candidate) return true;
  if (assignedSub.length >= 4 && candidate.includes(assignedSub)) return true;
  if (candidate.length >= 4 && assignedSub.includes(candidate)) return true;
  return false;
}

function resolveAssignedSubKey(
  assignedSubRaw: string,
  subEntries: { key: string; company: string; contact: string }[]
): string {
  const assignedSub = normalizeSubName(assignedSubRaw);
  if (!assignedSub) return "";

  const exact = subEntries.filter((e) => assignedSub === e.company || assignedSub === e.contact);
  if (exact.length === 1) return exact[0].key;
  if (exact.length > 1) return "";

  const fuzzy = subEntries.filter(
    (e) => subAssignmentMatches(assignedSub, e.company) || subAssignmentMatches(assignedSub, e.contact)
  );
  return fuzzy.length === 1 ? fuzzy[0].key : "";
}

// One pass over the Accounts tab, resolving each distinct raw "Subcontractor"
// value to at most one subcontractor key (see resolveAssignedSubKey), then
// grouping account names by that key. Also tallies, in the same pass, how
// many of those accounts are currently active — this is the count account-
// size normalization uses (see computeSubcontractorScore), kept separate
// from the Set of ALL-time account names (which visit/complaint matching and
// the existing all-time accountsAssigned field both still rely on unchanged).
//
// Deliberately NOT the same count as route.ts's own accountsAssigned (also
// active-only): that one resolves each subcontractor against the Accounts
// tab in isolation via namesMatch, which — confirmed live — double-counts
// accounts for short ambiguous contact names (e.g. an account whose raw
// field is just "Giovanna" substring-matches both "Giovanna" at G & G Magic
// Touch AND "Alonso & Giovanna Mendoza" at D&A Cleaning Multiple Service,
// inflating the latter's displayed Accounts column from a true 3 to 20).
// This function's global, ambiguity-safe resolution (already proven correct
// by the d579bc5 fix, same one used for this map's own visit/complaint
// matching above) doesn't have that bug, so normalization uses it instead.
function buildAccountAssignmentsBySubKey(
  accountRows: string[][],
  subRows: string[][]
): { allBySubKey: Map<string, Set<string>>; activeCountBySubKey: Map<string, number> } {
  const subEntries = subRows.map((subRow) => {
    const companyName = subRow[PERFORMANCE_SUBCONTRACTOR_COL.COMPANY_NAME] ?? "";
    const contactName = subRow[PERFORMANCE_SUBCONTRACTOR_COL.CONTACT_NAME] ?? "";
    return {
      key: buildSubcontractorPerformanceKey(companyName, contactName),
      company: normalizeSubName(companyName),
      contact: normalizeSubName(contactName),
    };
  });

  const resolveCache = new Map<string, string>();
  const allBySubKey = new Map<string, Set<string>>();
  const activeCountBySubKey = new Map<string, number>();

  for (const row of accountRows) {
    const raw = row[PERFORMANCE_ACCOUNT_COL.SUBCONTRACTOR] ?? "";
    const accountName = normalizeAccountName(row[PERFORMANCE_ACCOUNT_COL.ACCOUNT_NAME]);
    if (!raw || !accountName) continue;

    let resolvedKey = resolveCache.get(raw);
    if (resolvedKey === undefined) {
      resolvedKey = resolveAssignedSubKey(raw, subEntries);
      resolveCache.set(raw, resolvedKey);
    }
    if (!resolvedKey) continue;

    if (!allBySubKey.has(resolvedKey)) allBySubKey.set(resolvedKey, new Set());
    allBySubKey.get(resolvedKey)!.add(accountName);

    if (isActiveAccountStatus(row[PERFORMANCE_ACCOUNT_COL.STATUS])) {
      activeCountBySubKey.set(resolvedKey, (activeCountBySubKey.get(resolvedKey) ?? 0) + 1);
    }
  }

  return { allBySubKey, activeCountBySubKey };
}

function normalizeAccountName(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export type SubcontractorPerformance = {
  score: number;
  scoreStatus: "Excellent" | "Good" | "Needs Attention" | "High Risk";
  openComplaints: number;
  avgCondition: number | null;
  lastReview: string;
  accountsAssigned: number;
};

// Join key for merging this map onto the Apps Script's getSubcontractors
// list. NOT the Subcontractors sheet's own "Subcontractor ID" column
// (confirmed live: the sheet also has a defunct duplicate "ID" header at
// column P, blank on most rows; the Apps Script's own id lookup checks
// "ID" before "Subcontractor ID" and — because of how its header-map
// building silently lets a later duplicate header win — picks up that
// blank column first, so its id/subcontractorId fields are actually
// "SUB-ROW-<n>" row-position fallbacks for most rows, not the real
// Subcontractor ID, and unpredictably the real one for a handful of others
// with legacy data in column P. Company name + contact name are each
// read via a single unambiguous header on both sides, so composing a key
// from both (handles the few subcontractors that share a company name
// across multiple contacts, e.g. "Cleaning World") is the reliable join.
export function buildSubcontractorPerformanceKey(companyName: unknown, contactName: unknown): string {
  return `${normalizeSubName(companyName)}|${normalizeSubName(contactName)}`;
}

// ── New scoring algorithm ────────────────────────────────────────────────
//
// Severity-weighted deduction per valid, non-excluded complaint. "Urgent" is
// this app's real top Priority tier (see data-vocabulary notes above) and
// takes the weight the original design called "Critical".
const SEVERITY_WEIGHT: Record<string, number> = {
  low: 0.5,
  medium: 1.0,
  high: 2.0,
  urgent: 2.5,
};

function getSeverityWeight(priority: unknown): number {
  const clean = String(priority ?? "").toLowerCase().trim();
  return SEVERITY_WEIGHT[clean] ?? SEVERITY_WEIGHT.medium; // unrecognized/blank Priority: assume Medium rather than 0
}

// Same "is this complaint excluded from scoring" rule this file already
// used before this change (Not Valid / the pre-existing "no"/"invalid"/
// "notvalid" synonyms) — extracted to a named function so both the
// existing relatedComplaints filter and the new score computation share it
// instead of drifting apart. "Subjective" and "Needs Review" (the other two
// real Complaint Validity options) are NOT excluded — unchanged behavior.
function isExcludedComplaintValidity(validity: unknown): boolean {
  const clean = String(validity ?? "").toLowerCase().trim();
  return clean === "no" || clean === "not valid" || clean === "invalid" || clean === "notvalid";
}

// Status vocabulary is Open/Pending/Needs Attention/Closed (confirmed live
// against app/complaints/new/page.tsx's actual dropdown) — there's no
// "Resolved" status in this app. Treated as open: blank, Open, Pending,
// Needs Attention. Everything else (Closed, or defensively "Resolved" if
// that string ever shows up via another write path) counts as resolved.
function isOpenComplaintStatus(status: unknown): boolean {
  const clean = String(status ?? "").toLowerCase().trim();
  return clean === "" || clean === "open" || clean === "pending" || clean === "needs attention";
}

function parseDateOrNull(value: unknown): Date | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Resolution Date (column L) is part of the schema but confirmed blank on
// every real complaint row today, including Closed ones — the close action
// never wrote it. Updated At (column O) IS stamped by that action for most
// Closed rows, so it's the practical fallback. A Closed complaint with
// neither populated has no knowable resolution time; computeSubcontractorScore
// treats that as unanchored legacy history (contributes nothing) rather than
// guessing "now".
function getComplaintResolutionDate(row: string[]): Date | null {
  return (
    parseDateOrNull(row[COMPLAINT_COL.RESOLUTION_DATE]) ??
    parseDateOrNull(row[COMPLAINT_COL.UPDATED_AT])
  );
}

function monthIndex(date: Date): number {
  return date.getFullYear() * 12 + date.getMonth();
}

// clamp(10 / accounts managed, 0.5, 2.0) — division by zero naturally
// produces Infinity, which Math.min still clamps down to 2.0, so accountsManaged
// of exactly 0 doesn't need a special case.
function accountSizeMultiplier(activeAccountsManaged: number): number {
  return Math.min(2.0, Math.max(0.5, 10 / activeAccountsManaged));
}

// The date this scoring model went live. Fixed on purpose: this is a fresh
// start, not a retroactive replay of years of complaint history under a
// formula that didn't exist when that history happened. A subcontractor
// with no complaint currently open, the first time this runs, starts at a
// clean 10 — their old resolved/closed complaints (all of which, in the
// real data checked before writing this, predate this date) are done and
// are not walked back through the recovery math below. A subcontractor
// with a complaint that's STILL open gets that complaint's deduction
// applied as of this date (not ignored, not backdated to when it was
// actually filed) — seeing it counted is the whole point of the fix.
// From this date forward, every event (new complaint, resolution, clean
// month) is real and drives the monthly walk normally, with no further
// special-casing — this constant only matters for classifying complaints
// that already existed at rollout.
const SCORING_ROLLOUT_DATE = new Date("2026-08-11");

type ScoreableComplaint = {
  complaintDate: Date | null;
  resolutionDate: Date | null; // null unless status is resolved/closed AND a date could be determined
  isOpenNow: boolean;
  severityWeight: number;
};

// Walks a subcontractor's complaint history to the current score, entirely
// from data (no persisted counters) — see the block comment above
// getSubcontractorPerformanceMap for the full model, and SCORING_ROLLOUT_DATE
// above for why the walk starts there instead of at each complaint's real
// history.
//
// Algorithm:
//  1. Every complaint still open today that predates rollout is a "carry-in"
//     deduction, applied AT rollout (not at its real complaint date) — this
//     is what gives a subcontractor with pre-existing open complaints a
//     starting score below 10 the first time this runs, per the rollout
//     rule above, without walking any recovery math for time that passed
//     before rollout.
//  2. Every complaint filed ON/AFTER rollout is a deduction applied at its
//     real complaint date.
//  3. Every complaint resolved ON/AFTER rollout (regardless of whether it
//     was filed before or after rollout) is a resolution event at its real
//     resolution date — this is what lets an old-but-still-open-at-rollout
//     complaint that gets closed next month correctly start that month's
//     recovery window, while a complaint closed before rollout is simply
//     old history and produces no event at all.
//  4. Walk calendar months from rollout to now:
//       - a resolution event this month switches on 0.5/month recovery mode
//         (persists until score reaches 10, then switches back off);
//       - if any deduction(s) land this month, subtract them (summed, using
//         the exact decimal severity × normalization amounts — no
//         intermediate rounding) and skip this month's recovery tick
//         (deductions and recovery don't both happen the same month, but a
//         resolution event this month still turns recovery mode on for
//         future months even if a deduction also landed this month);
//       - otherwise (a genuinely clean month) add 1.0, or 0.5 if recovery
//         mode is on;
//       - clamp to [0, 10] after every step.
//  5. Round only the final result to 1 decimal — matches this file's
//     existing single-rounding-step convention.
function computeSubcontractorScore(
  complaints: ScoreableComplaint[],
  activeAccountsManaged: number,
  today: Date = new Date()
): number {
  const multiplier = accountSizeMultiplier(activeAccountsManaged);

  type ScoreEvent = { monthIdx: number; kind: "deduction" | "resolution"; amount: number };
  const events: ScoreEvent[] = [];

  const rolloutMonth = monthIndex(SCORING_ROLLOUT_DATE);

  for (const complaint of complaints) {
    const amount = complaint.severityWeight * multiplier;
    const predatesRollout =
      complaint.complaintDate !== null && complaint.complaintDate.getTime() < SCORING_ROLLOUT_DATE.getTime();

    // "Carry-in" means still open AS OF ROLLOUT, not "open right now" —
    // this function is recomputed from scratch on every call, so basing it
    // on current status would make the deduction vanish retroactively the
    // moment a pre-existing open complaint gets resolved (confirmed live:
    // a real carry-in complaint's score bounced back to a full 10, as if it
    // had never happened, the instant it was marked resolved). A complaint
    // still counts as having been open at rollout if it's open now, OR it
    // was resolved on/after rollout (i.e. it was still open when rollout
    // happened, even though it isn't anymore).
    const wasOpenAtRollout =
      complaint.isOpenNow ||
      (complaint.resolutionDate !== null && complaint.resolutionDate.getTime() >= SCORING_ROLLOUT_DATE.getTime());

    if (predatesRollout && wasOpenAtRollout) {
      // Carry-in: open at rollout, deduction lands at rollout itself.
      events.push({ monthIdx: rolloutMonth, kind: "deduction", amount });
    } else if (!predatesRollout && complaint.complaintDate !== null) {
      // Filed on/after rollout: deduction lands on its real date.
      events.push({ monthIdx: monthIndex(complaint.complaintDate), kind: "deduction", amount });
    }

    if (
      complaint.resolutionDate !== null &&
      complaint.resolutionDate.getTime() >= SCORING_ROLLOUT_DATE.getTime()
    ) {
      events.push({ monthIdx: monthIndex(complaint.resolutionDate), kind: "resolution", amount: 0 });
    }
  }

  const currentMonth = monthIndex(today);
  let score = 10;
  let inRecoveryMode = false;

  for (let m = rolloutMonth; m <= currentMonth; m++) {
    const monthEvents = events.filter((e) => e.monthIdx === m);
    const deductions = monthEvents.filter((e) => e.kind === "deduction");
    const hadResolution = monthEvents.some((e) => e.kind === "resolution");

    if (hadResolution) inRecoveryMode = true;

    if (deductions.length > 0) {
      const total = deductions.reduce((sum, e) => sum + e.amount, 0);
      score = Math.max(0, Math.min(10, score - total));
    } else {
      score = Math.max(0, Math.min(10, score + (inRecoveryMode ? 0.5 : 1.0)));
      if (score >= 10) inRecoveryMode = false;
    }
  }

  return Math.round(score * 10) / 10;
}

export async function getSubcontractorPerformanceMap(): Promise<Map<string, SubcontractorPerformance>> {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });

  const [accountsRes, visitsRes, complaintsRes, subsRes] = await Promise.all([
    withTimeout(FETCH_TIMEOUT_MS, () =>
      sheets.spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!, range: `${ACCOUNTS_TAB}!A:Z` })
    ),
    withTimeout(FETCH_TIMEOUT_MS, () =>
      sheets.spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!, range: `${PERFORMANCE_VISITS_TAB}!A:Z` })
    ),
    withTimeout(FETCH_TIMEOUT_MS, () =>
      sheets.spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!, range: `${COMPLAINTS_TAB}!A:P` })
    ),
    withTimeout(FETCH_TIMEOUT_MS, () =>
      sheets.spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!, range: `Subcontractors!A:Z` })
    ),
  ]);

  const accountRows = ((accountsRes.data.values ?? []) as string[][]).slice(1);
  const visitRows = ((visitsRes.data.values ?? []) as string[][]).slice(1);
  const complaintRows = ((complaintsRes.data.values ?? []) as string[][]).slice(1);
  const subRows = ((subsRes.data.values ?? []) as string[][]).slice(1);

  const result = new Map<string, SubcontractorPerformance>();
  const { allBySubKey, activeCountBySubKey } = buildAccountAssignmentsBySubKey(accountRows, subRows);

  for (const subRow of subRows) {
    const companyName = subRow[PERFORMANCE_SUBCONTRACTOR_COL.COMPANY_NAME] ?? "";
    const contactName = subRow[PERFORMANCE_SUBCONTRACTOR_COL.CONTACT_NAME] ?? "";
    const key = buildSubcontractorPerformanceKey(companyName, contactName);
    if (!normalizeSubName(companyName) && !normalizeSubName(contactName)) continue;

    const assignedAccountNames = allBySubKey.get(key) ?? new Set<string>();
    const activeAccountsManaged = activeCountBySubKey.get(key) ?? 0;

    const relatedVisits = visitRows.filter((row) =>
      assignedAccountNames.has(normalizeAccountName(row[PERFORMANCE_VISIT_COL.ACCOUNT_NAME]))
    );

    const conditionScores = relatedVisits
      .map((row) => Number(row[PERFORMANCE_VISIT_COL.CONDITION_SCORE]))
      .filter((score) => !Number.isNaN(score) && score >= 0 && score <= 10);

    const avgCondition =
      conditionScores.length > 0
        ? Math.round((conditionScores.reduce((sum, s) => sum + s, 0) / conditionScores.length) * 10) / 10
        : null;

    let lastReview = "";
    const datedVisits = relatedVisits
      .map((row) => row[PERFORMANCE_VISIT_COL.VISIT_DATE] ?? "")
      .filter(Boolean)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    if (datedVisits.length > 0) lastReview = datedVisits[0];

    const relatedComplaints = complaintRows.filter((row) => {
      if (isExcludedComplaintValidity(row[COMPLAINT_COL.COMPLAINT_VALIDITY])) return false;
      return assignedAccountNames.has(normalizeAccountName(row[COMPLAINT_COL.ACCOUNT_NAME]));
    });

    const openComplaints = relatedComplaints.filter((row) =>
      isOpenComplaintStatus(row[COMPLAINT_COL.STATUS])
    ).length;

    const scoreableComplaints: ScoreableComplaint[] = relatedComplaints.map((row) => {
      const isOpenNow = isOpenComplaintStatus(row[COMPLAINT_COL.STATUS]);
      return {
        complaintDate: parseDateOrNull(row[COMPLAINT_COL.COMPLAINT_DATE]),
        resolutionDate: isOpenNow ? null : getComplaintResolutionDate(row),
        isOpenNow,
        severityWeight: getSeverityWeight(row[COMPLAINT_COL.PRIORITY]),
      };
    });

    const score = computeSubcontractorScore(scoreableComplaints, activeAccountsManaged);

    let scoreStatus: SubcontractorPerformance["scoreStatus"] = "Excellent";
    if (score < 9) scoreStatus = "Good";
    if (score < 8) scoreStatus = "Needs Attention";
    if (score < 7) scoreStatus = "High Risk";

    result.set(key, {
      score,
      scoreStatus,
      openComplaints,
      avgCondition,
      lastReview,
      accountsAssigned: assignedAccountNames.size,
    });
  }

  return result;
}

// Replaces the Apps Script "getAccounts" action for app/api/subcontractors
// route.ts's GET handler — that route only ever used the raw account list to
// join assigned-subcontractor + revenue fields onto each subcontractor
// (enrichSubcontractorsWithRevenue), so this returns just those columns
// rather than the full row. Reuses PERFORMANCE_ACCOUNT_COL's SUBCONTRACTOR/
// STATUS indices (same "Accounts" tab this function's sibling above already
// reads) plus the two revenue columns from MAIN_COL's layout above. Field
// names are chosen to match the first alias each of getAccountAssignedSub/
// getAccountStatus/getAccountMonthlyRevenue/getAccountSubRevenue (route.ts)
// checks, so the row is a drop-in for what those helpers expect.
const ACCOUNTS_REVENUE_COL = {
  MONTHLY_REVENUE: 7,  // H — internal Sub Center view only, never sent to the customer portal
  MONTHLY_SUB_PAY: 10, // K
} as const;

export type RawAccountForSubEnrichment = Record<string, string>;

export async function getAllAccountsForSubEnrichment(): Promise<RawAccountForSubEnrichment[]> {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });

  const res = await withTimeout(FETCH_TIMEOUT_MS, () =>
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_MAIN_SHEET_ID!,
      range: `${ACCOUNTS_TAB}!A:Z`,
    })
  );

  const dataRows = ((res.data.values ?? []) as string[][]).slice(1);

  return dataRows.map((row) => ({
    Subcontractor: row[PERFORMANCE_ACCOUNT_COL.SUBCONTRACTOR] ?? "",
    status: row[PERFORMANCE_ACCOUNT_COL.STATUS] ?? "",
    "Monthly Revenue": row[ACCOUNTS_REVENUE_COL.MONTHLY_REVENUE] ?? "",
    "Monthly Subcontractor Pay": row[ACCOUNTS_REVENUE_COL.MONTHLY_SUB_PAY] ?? "",
  }));
}
