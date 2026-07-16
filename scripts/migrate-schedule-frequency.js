#!/usr/bin/env node
/**
 * One-time migration: adds Frequency and MonthlyOccurrence columns to the
 * SubSchedules tab (in the GOOGLE_MAIN_SHEET_ID spreadsheet — NOT
 * GOOGLE_SHEET_ID, which is a different, unrelated spreadsheet) and
 * backfills Frequency from the existing Recurring column:
 *   Recurring "Y" -> Frequency "WEEKLY"
 *   Recurring "N" -> Frequency "AS_NEEDED"
 *
 * MonthlyOccurrence is left blank for all existing rows. DayOfWeek,
 * TimeWindow, EffectiveStart, EffectiveEnd, and Recurring are untouched.
 *
 * Safety:
 *   - Duplicates the SubSchedules tab as a timestamped backup before
 *     making any changes, and verifies the backup is readable before
 *     writing anything.
 *   - Idempotent: if a Frequency column already exists, exits without
 *     making any changes.
 *
 * Usage:
 *   node scripts/migrate-schedule-frequency.js
 *
 * Requires GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, and
 * GOOGLE_MAIN_SHEET_ID in the environment (or .env.local).
 */

const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
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

const SUB_SCHEDULES_TAB = "SubSchedules";

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
  const subSheet = (meta.data.sheets || []).find((s) => s.properties.title === SUB_SCHEDULES_TAB);
  if (!subSheet) {
    console.error(`Tab "${SUB_SCHEDULES_TAB}" not found in spreadsheet ${spreadsheetId}.`);
    process.exit(1);
  }
  const subSheetId = subSheet.properties.sheetId;

  // ── Idempotency check ────────────────────────────────────────────────────
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SUB_SCHEDULES_TAB}!1:1`,
  });
  const header = (headerRes.data.values || [[]])[0] || [];
  if (header.includes("Frequency")) {
    console.log(`"${SUB_SCHEDULES_TAB}" already has a Frequency column — migration already applied. Exiting.`);
    return;
  }

  // ── Backup: duplicate the SubSchedules tab before writing anything ──────
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const backupTitle = `SubSchedules_backup_${stamp}`;

  console.log(`Backing up "${SUB_SCHEDULES_TAB}" -> "${backupTitle}"...`);
  const dupRes = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          duplicateSheet: {
            sourceSheetId: subSheetId,
            newSheetName: backupTitle,
          },
        },
      ],
    },
  });
  const backupSheetId = dupRes.data.replies[0].duplicateSheet.properties.sheetId;

  // Verify the backup is actually readable before touching the original.
  const verifyRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${backupTitle}!A1:C3`,
  });
  const verifyRows = verifyRes.data.values || [];
  if (verifyRows.length < 2 || verifyRows[0][0] !== "ScheduleID") {
    console.error(
      `Backup verification failed — "${backupTitle}" (sheetId ${backupSheetId}) did not read back as expected. ` +
        "Aborting before making any changes to the live tab."
    );
    process.exit(1);
  }
  console.log(`Backup verified: "${backupTitle}" contains ${verifyRows.length}+ rows and matches the expected header.`);

  // ── Add Frequency / MonthlyOccurrence columns ────────────────────────────
  console.log("Adding Frequency (N) and MonthlyOccurrence (O) columns...");
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SUB_SCHEDULES_TAB}!N1:O1`,
    valueInputOption: "RAW",
    requestBody: { values: [["Frequency", "MonthlyOccurrence"]] },
  });

  // ── Backfill Frequency from Recurring ────────────────────────────────────
  const recurringRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SUB_SCHEDULES_TAB}!F:F`,
  });
  const recurringRows = (recurringRes.data.values || []).slice(1); // drop header
  const rowCount = recurringRows.length;

  const FREQUENCY_BY_RECURRING = { Y: "WEEKLY", N: "AS_NEEDED" };
  const unrecognized = [];
  const frequencyValues = recurringRows.map((r, i) => {
    const recurring = (r[0] ?? "").trim();
    const freq = FREQUENCY_BY_RECURRING[recurring];
    if (!freq) {
      unrecognized.push({ row: i + 2, recurring });
      return [""]; // leave blank rather than guess
    }
    return [freq];
  });

  if (unrecognized.length > 0) {
    console.warn(
      `Warning: ${unrecognized.length} row(s) had an unrecognized Recurring value and were left with a blank ` +
        `Frequency — review manually: ${JSON.stringify(unrecognized)}`
    );
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SUB_SCHEDULES_TAB}!N2:N${rowCount + 1}`,
    valueInputOption: "RAW",
    requestBody: { values: frequencyValues },
  });

  console.log(`Backfilled Frequency for ${rowCount} row(s). MonthlyOccurrence left blank for all rows.`);
  console.log(`Done. Backup tab "${backupTitle}" (sheetId ${backupSheetId}) left in place — delete it manually once verified.`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
