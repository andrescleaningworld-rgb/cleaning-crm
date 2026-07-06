#!/usr/bin/env node
/**
 * One-time setup script: adds the SubSchedules and ScheduleExceptions tabs
 * (with header rows) to the existing spreadsheet used by lib/googleSheets.ts
 * (GOOGLE_SHEET_ID). Safe to re-run — skips any tab that already exists and
 * never touches any other tab.
 *
 * Usage:
 *   node scripts/setup-schedule-tabs.js
 *
 * Requires GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, and
 * GOOGLE_SHEET_ID in the environment (or .env.local).
 */

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

const TABS = {
  SubSchedules: [
    "ScheduleID", "AccountID", "SubID", "DayOfWeek", "TimeWindow",
    "Recurring", "EffectiveStart", "EffectiveEnd", "Status",
    "SubmittedBy", "SubmittedDate", "LastEditedBy", "LastEditedDate",
  ],
  ScheduleExceptions: [
    "ExceptionID", "AccountID", "OriginalDate", "Type", "NewDate",
    "NewTimeWindow", "Reason", "CreatedBy", "CreatedDate",
  ],
};

async function main() {
  loadEnvLocal();

  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!spreadsheetId || !clientEmail || !privateKey) {
    console.error(
      "Missing GOOGLE_SHEET_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY.\n" +
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

  const tabsToCreate = Object.keys(TABS).filter((title) => !existingTitles.has(title));

  if (tabsToCreate.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: tabsToCreate.map((title) => ({ addSheet: { properties: { title } } })),
      },
    });
    console.log(`Created tab(s): ${tabsToCreate.join(", ")}`);
  } else {
    console.log("Both tabs already exist — no new tabs created.");
  }

  for (const [title, headers] of Object.entries(TABS)) {
    const lastCol = String.fromCharCode(64 + headers.length); // works for <=26 cols
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${title}!A1:${lastCol}1`,
      valueInputOption: "RAW",
      requestBody: { values: [headers] },
    });
    console.log(`Wrote header row for ${title} (A1:${lastCol}1)`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("Setup script failed:", err);
  process.exit(1);
});
