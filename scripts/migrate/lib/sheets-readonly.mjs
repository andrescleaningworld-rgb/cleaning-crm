// Read-only Google Sheets access for migration scripts. The auth scope is
// spreadsheets.readonly, and only read calls are exported, so nothing here
// can write, rename, or delete anything in Sheets (plan rule 3).
import { google } from "googleapis";
import { loadEnv } from "./env.mjs";

// Same id that lib/googleSheets.ts hard-codes as CUSTOMER_VISITS_SHEET_ID.
const CUSTVISITS_SHEET_ID = "10MDGlN8pVKVcthd2MA5ygsBLVI3nN3DF98i_cF-Pqjs";

let _api = null;

function api() {
  if (!_api) {
    loadEnv();
    // `vercel env pull` writes the literal text "[SENSITIVE]" for sensitive
    // variables, so a pulled .env.local has no usable Google credentials.
    for (const name of ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY"]) {
      const value = process.env[name];
      if (!value || value === "[SENSITIVE]") {
        throw new Error(`${name} is missing or a "[SENSITIVE]" placeholder. Put the real service-account value in .env.development.local.`);
      }
    }
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    _api = google.sheets({ version: "v4", auth });
  }
  return _api;
}

/** sheet: "MAIN" | "PORTAL" | "CUSTVISITS" */
export function spreadsheetId(sheet) {
  loadEnv();
  const id = {
    MAIN: process.env.GOOGLE_MAIN_SHEET_ID,
    PORTAL: process.env.GOOGLE_SHEET_ID,
    CUSTVISITS: CUSTVISITS_SHEET_ID,
  }[sheet];
  if (!id || id === "[SENSITIVE]") throw new Error(`No spreadsheet id for "${sheet}" (missing or a "[SENSITIVE]" placeholder)`);
  return id;
}

/** Tab names with their grid size. */
export async function listTabs(sheet) {
  const res = await api().spreadsheets.get({
    spreadsheetId: spreadsheetId(sheet),
    fields: "properties.title,sheets.properties(title,gridProperties(rowCount,columnCount))",
  });
  return {
    title: res.data.properties?.title ?? "",
    tabs: (res.data.sheets ?? []).map((s) => ({
      name: s.properties?.title ?? "",
      gridRows: s.properties?.gridProperties?.rowCount ?? 0,
      gridCols: s.properties?.gridProperties?.columnCount ?? 0,
    })),
  };
}

/**
 * All values of a tab as strings, header row first. Rows keep their sheet
 * position: rows[i] is sheet row i + 1. Trailing empty cells are missing, as
 * the Sheets API returns them.
 */
export async function readTab(sheet, tab, { range, formulas = false, unformatted = false } = {}) {
  const res = await api().spreadsheets.values.get({
    spreadsheetId: spreadsheetId(sheet),
    range: range ? `'${tab}'!${range}` : `'${tab}'`,
    // unformatted: raw numbers, but dates still as the text the sheet shows —
    // the same options getSubcontractorActivityLog uses in lib/googleSheets.ts.
    valueRenderOption: formulas ? "FORMULA" : unformatted ? "UNFORMATTED_VALUE" : "FORMATTED_VALUE",
    ...(unformatted ? { dateTimeRenderOption: "FORMATTED_STRING" } : {}),
  });
  return (res.data.values ?? []).map((row) => row.map((cell) => String(cell ?? "")));
}

/** True when every cell in the row is blank. */
export function isBlankRow(row) {
  return !row || row.every((cell) => String(cell ?? "").trim() === "");
}
