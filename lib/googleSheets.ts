import { google } from "googleapis";

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
  // J=9  Manager — staff only
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
    range: `${VISITS_TAB}!A:G`,
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
      range: `${VISITS_TAB}!${colLetters[key]}${sheetRow}`,
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
    range: `${VISITS_TAB}!A${sheetRow}:G${sheetRow}`,
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
  await appendToSheet(VISITS_TAB, [
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
    range: `${VISITS_TAB}!A:G`,
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
  SCHEDULE_ID:       0, // A
  ACCOUNT_ID:        1, // B
  SUB_ID:            2, // C
  DAY_OF_WEEK:       3, // D
  TIME_WINDOW:       4, // E
  RECURRING:         5, // F
  EFFECTIVE_START:   6, // G
  EFFECTIVE_END:     7, // H
  STATUS:            8, // I
  SUBMITTED_BY:      9, // J
  SUBMITTED_DATE:    10, // K
  LAST_EDITED_BY:    11, // L
  LAST_EDITED_DATE:  12, // M
} as const;

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
};

async function fetchSubScheduleRows(): Promise<string[][]> {
  const cacheKey = `tab-${SUB_SCHEDULES_TAB}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const rows = await withTimeout(FETCH_TIMEOUT_MS, async () => {
    const auth = getAuthClient();
    const sheets = google.sheets({ version: "v4", auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SUB_SCHEDULES_TAB}!A:M`,
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
}): Promise<string> {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const rand = Math.random().toString(36).slice(2, 6);
  const scheduleId = `SCH-${data.accountId}-${stamp.slice(-8)}-${rand}`;
  const today = new Date().toISOString().slice(0, 10);
  await appendToSheet(SUB_SCHEDULES_TAB, [
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
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: "USER_ENTERED", data },
  });
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
      spreadsheetId: SHEET_ID,
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
  await appendToSheet(SCHEDULE_EXCEPTIONS_TAB, [
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
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: "USER_ENTERED", data },
  });
}

export async function deleteScheduleException(sheetRow: number): Promise<void> {
  invalidateCache(`tab-${SCHEDULE_EXCEPTIONS_TAB}`);
  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `${SCHEDULE_EXCEPTIONS_TAB}!A${sheetRow}:I${sheetRow}`,
  });
}
