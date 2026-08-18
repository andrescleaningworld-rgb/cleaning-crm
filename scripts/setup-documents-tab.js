#!/usr/bin/env node
/**
 * One-time setup script: adds the Documents tab (with header row) to the
 * spreadsheet used by lib/googleSheets.ts's main-sheet tabs (GOOGLE_MAIN_SHEET_ID).
 * Safe to re-run — skips creation if the tab already exists and never touches
 * any other tab.
 *
 * Usage:
 *   node scripts/setup-documents-tab.js
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

const TAB_NAME = "Documents";
const HEADERS = ["ID", "Name", "Category", "FileName", "FileURL", "FileSize", "UploadedAt", "UploadedBy"];

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
  const existingTitles = new Set((meta.data.sheets ?? []).map((s) => s.properties?.title));

  if (!existingTitles.has(TAB_NAME)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: TAB_NAME } } }] },
    });
    console.log(`Created tab: ${TAB_NAME}`);
  } else {
    console.log(`Tab "${TAB_NAME}" already exists — reusing it.`);
  }

  const lastCol = String.fromCharCode(64 + HEADERS.length); // works for <=26 cols
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${TAB_NAME}!A1:${lastCol}1`,
    valueInputOption: "RAW",
    requestBody: { values: [HEADERS] },
  });
  console.log(`Wrote header row for ${TAB_NAME} (A1:${lastCol}1)`);

  console.log("Done.");
}

main().catch((err) => {
  console.error("Setup script failed:", err);
  process.exit(1);
});
