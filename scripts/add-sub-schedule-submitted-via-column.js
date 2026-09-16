#!/usr/bin/env node
/**
 * One-time setup script: adds a "SubmittedVia" header cell to the existing
 * "SubSchedules" tab in GOOGLE_MAIN_SHEET_ID, in the first empty column
 * after whatever headers are already there (expected to land at P, right
 * after MonthlyOccurrence at O). Never touches any existing header or data
 * row. Safe to re-run — if "SubmittedVia" already exists anywhere in row 1,
 * it just reports that column and exits.
 *
 * Prints the resulting column letter/index — wire that into
 * SUB_SCHEDULE_COL / fetchSubScheduleRows in lib/googleSheets.ts after
 * running this.
 *
 * Usage:
 *   node scripts/add-sub-schedule-submitted-via-column.js
 *
 * Requires GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, and
 * GOOGLE_MAIN_SHEET_ID in the environment (or .env.local).
 */

/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node/CommonJS
   script run via `node scripts/x.js`, not bundled into the app; matches every
   other scripts/*.js file in this repo. */

const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

const TAB_NAME = "SubSchedules";
const NEW_HEADER = "SubmittedVia";

// 1 -> A, 26 -> Z, 27 -> AA, ... (spreadsheet columns aren't capped at 26)
function colIndexToLetters(oneBasedIndex) {
  let n = oneBasedIndex;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

async function main() {
  loadEnvLocal();

  const spreadsheetId = process.env.GOOGLE_MAIN_SHEET_ID;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!spreadsheetId || !clientEmail || !privateKey) {
    console.error(
      "Missing GOOGLE_MAIN_SHEET_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY.\n" +
      "Set these in .env.local (or the environment) before running this script."
    );
    process.exit(1);
  }

  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const targetSheet = (meta.data.sheets ?? []).find((s) => s.properties?.title === TAB_NAME);
  if (!targetSheet) {
    console.error(`Tab "${TAB_NAME}" not found in this spreadsheet — nothing to do.`);
    process.exit(1);
  }

  const headerResp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${TAB_NAME}'!1:1`,
  });
  const headerRow = headerResp.data.values?.[0] ?? [];

  const existingIndex = headerRow.findIndex((h) => (h ?? "").trim() === NEW_HEADER);
  if (existingIndex !== -1) {
    const letter = colIndexToLetters(existingIndex + 1);
    console.log(`"${NEW_HEADER}" already exists at column ${letter} (index ${existingIndex}, 0-based).`);
    console.log("Nothing to do.");
    return;
  }

  // headerRow can include trailing blank cells (formatting artifacts) — the
  // true last-used column is the last one with real header text, not just
  // the array length.
  let lastUsedIndex = -1;
  for (let i = headerRow.length - 1; i >= 0; i--) {
    if ((headerRow[i] ?? "").trim()) { lastUsedIndex = i; break; }
  }
  const nextColOneBased = lastUsedIndex + 2; // 1-based index of the first free column
  const nextColLetter = colIndexToLetters(nextColOneBased);

  const gridColumnCount = targetSheet?.properties?.gridProperties?.columnCount ?? 0;

  console.log(`Header row has ${headerRow.length} cells read, last used at column ${colIndexToLetters(lastUsedIndex + 1)} (index ${lastUsedIndex}).`);
  console.log(`Grid currently has ${gridColumnCount} columns.`);

  if (nextColOneBased > gridColumnCount) {
    console.log(`Expanding grid to ${nextColOneBased} columns to make room for ${nextColLetter}1...`);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          updateSheetProperties: {
            properties: { sheetId: targetSheet.properties.sheetId, gridProperties: { columnCount: nextColOneBased } },
            fields: "gridProperties.columnCount",
          },
        }],
      },
    });
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${TAB_NAME}'!${nextColLetter}1`,
    valueInputOption: "RAW",
    requestBody: { values: [[NEW_HEADER]] },
  });

  console.log(`Wrote "${NEW_HEADER}" header to ${TAB_NAME}!${nextColLetter}1`);
  console.log(`Column letter: ${nextColLetter}`);
  console.log(`0-based column index (for SUB_SCHEDULE_COL): ${nextColOneBased - 1}`);
  console.log("Done.");
}

main().catch((err) => {
  console.error("Setup script failed:", err);
  process.exit(1);
});
