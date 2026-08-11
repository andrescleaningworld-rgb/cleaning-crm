#!/usr/bin/env node
/**
 * One-time setup script: writes the "AccountId" header into column P1 of the
 * existing "To Do" tab (GOOGLE_MAIN_SHEET_ID), backing the new
 * TO_DO_COL.ACCOUNT_ID column lib/googleSheets.ts reads/writes. Only ever
 * touches cell P1 — never rewrites existing rows/columns, and existing rows
 * simply read back with a blank AccountId (see ACCOUNT_ID's comment in
 * lib/googleSheets.ts). Safe to re-run.
 *
 * Usage:
 *   node scripts/add-todo-account-id-column.js
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

const TAB_NAME = "To Do";

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

  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${TAB_NAME}'!P1`,
  });
  const currentValue = existing.data.values?.[0]?.[0];

  if (currentValue) {
    console.log(`P1 already has a value ("${currentValue}") — leaving it untouched.`);
    return;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${TAB_NAME}'!P1`,
    valueInputOption: "RAW",
    requestBody: { values: [["AccountId"]] },
  });
  console.log(`Wrote header "AccountId" to '${TAB_NAME}'!P1`);
  console.log("Done.");
}

main().catch((err) => {
  console.error("Setup script failed:", err);
  process.exit(1);
});
