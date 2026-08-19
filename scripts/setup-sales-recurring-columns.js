#!/usr/bin/env node
/**
 * One-time setup script: adds the RecurringStartDate/RecurringEndDate
 * header cells (S1, T1) to the existing "Sales & Commissions" tab in
 * GOOGLE_MAIN_SHEET_ID. Only ever writes those two header cells — never
 * touches column R ("Commission Amount", confirmed dead) or any existing
 * data row. Safe to re-run (idempotent: just re-writes the same two cells).
 *
 * Usage:
 *   node scripts/setup-sales-recurring-columns.js
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

const TAB_NAME = "Sales & Commissions";

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
  const exists = (meta.data.sheets ?? []).some((s) => s.properties?.title === TAB_NAME);
  if (!exists) {
    console.error(`Tab "${TAB_NAME}" not found in this spreadsheet — nothing to do.`);
    process.exit(1);
  }

  // Confirm S1/T1 are actually blank before writing, so a re-run never
  // clobbers a header someone already renamed by hand.
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${TAB_NAME}'!S1:T1`,
  });
  const [existingRow = []] = existing.data.values ?? [];
  const [s1, t1] = existingRow;

  if (s1 && s1 !== "RecurringStartDate") {
    console.error(`S1 is already "${s1}" — refusing to overwrite. Fix manually if this is stale.`);
    process.exit(1);
  }
  if (t1 && t1 !== "RecurringEndDate") {
    console.error(`T1 is already "${t1}" — refusing to overwrite. Fix manually if this is stale.`);
    process.exit(1);
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${TAB_NAME}'!S1:T1`,
    valueInputOption: "RAW",
    requestBody: { values: [["RecurringStartDate", "RecurringEndDate"]] },
  });

  console.log(`Wrote header row for "${TAB_NAME}" (S1:T1) — RecurringStartDate, RecurringEndDate.`);
  console.log("Done. Column R (Commission Amount) was not touched.");
}

main().catch((err) => {
  console.error("Setup script failed:", err);
  process.exit(1);
});
