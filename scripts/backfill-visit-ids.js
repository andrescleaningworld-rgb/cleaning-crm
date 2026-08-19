#!/usr/bin/env node
/**
 * One-time backfill: writes a real, unique Visit ID into column A of every
 * row in the Visits tab (GOOGLE_MAIN_SHEET_ID) that has visit data (a
 * non-empty Account ID) but no usable ID yet.
 *
 * Root cause of the broken ID column: A2 held a legacy
 * `=ARRAYFORMULA(IF(C2:C="","","VIS-"&TEXT(ROW(C2:C)-1,"00000")&"-"&TEXT(RANDBETWEEN(1000,9999),"0000")))`
 * meant to spill an ID down the whole column. Apps Script's addVisit action
 * has since been writing its own plain "VISIT-<timestamp>" value directly
 * into column A for every new row (confirmed live — see app/api/visits/route.ts's
 * addVisit action) — perfectly fine on its own, but it landed inside the
 * formula's spill range, and one literal value inside an ARRAYFORMULA's
 * target range blocks the entire spill. That's the "#REF!" — Sheets'
 * "Array result was not expanded because it would overwrite data in
 * A<row>" error, surfaced as #REF! — and it's why every row above the
 * first blocking row has always read back empty. Per the investigation,
 * plain values (not a live formula) are the fix, matching what Apps
 * Script's addVisit already does for new rows: this script overwrites A2's
 * formula and every blank ID with the same kind of plain, generated value.
 *
 * Safe to re-run — only touches rows that still lack a usable ID; already-
 * backfilled or already-valid rows are left untouched.
 *
 * Usage:
 *   node scripts/backfill-visit-ids.js
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

const TAB_NAME = "Visits";

// Same shape as the ID Apps Script's addVisit already writes for new rows
// (e.g. "VISIT-20260818205235"), plus a short random suffix — a backfill
// pass can write many rows within the same second, and the timestamp alone
// isn't unique enough for that to be safe.
function generateVisitId(usedIds) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:-]/g, "");
    const rand = Math.random().toString(36).slice(2, 6);
    const id = `VISIT-${stamp}-${rand}`;
    if (!usedIds.has(id)) return id;
  }
  throw new Error("Could not generate a unique visit id after 10 attempts.");
}

function isUsableId(value) {
  const text = (value ?? "").toString().trim();
  if (!text) return false;
  if (text.includes("#REF") || text.includes("Array result")) return false;
  return true;
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

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${TAB_NAME}!A2:J`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const rows = res.data.values || [];

  const usedIds = new Set();
  for (const row of rows) {
    const id = (row[0] ?? "").toString().trim();
    if (isUsableId(id)) usedIds.add(id);
  }

  const data = [];
  let skippedBlankRow = 0;
  let alreadyValid = 0;

  rows.forEach((row, i) => {
    const sheetRow = i + 2; // header row + 1-based sheet rows
    const currentId = row[0] ?? "";
    // A visit row isn't always identifiable by Account ID alone — one
    // legacy row has blank Account ID/Name/Date/Type but real content in
    // Completed By/Condition/Notes, and Apps Script's getVisits still
    // surfaces it. Match its broader definition of "has visit data": any of
    // columns B (Account ID) through J (Notes) is non-blank.
    const hasVisitData = row.slice(1, 10).some((cell) => (cell ?? "").toString().trim());

    if (!hasVisitData) {
      skippedBlankRow++; // no visit data in this row — leave untouched
      return;
    }
    if (isUsableId(currentId)) {
      alreadyValid++;
      return;
    }

    const newId = generateVisitId(usedIds);
    usedIds.add(newId);
    data.push({
      range: `${TAB_NAME}!A${sheetRow}`,
      values: [[newId]],
    });
  });

  console.log(`Rows with visit data: ${data.length + alreadyValid}`);
  console.log(`Already had a usable ID: ${alreadyValid}`);
  console.log(`Blank/padding rows skipped: ${skippedBlankRow}`);
  console.log(`Backfilling: ${data.length} rows`);

  if (data.length === 0) {
    console.log("Nothing to backfill. Done.");
    return;
  }

  // RAW, not USER_ENTERED — these are plain opaque ID strings and must never
  // be reinterpreted as a formula, number, or date by Sheets.
  const CHUNK_SIZE = 500;
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.slice(i, i + CHUNK_SIZE);
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: "RAW", data: chunk },
    });
    console.log(`Wrote ${Math.min(i + CHUNK_SIZE, data.length)}/${data.length}`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("Backfill script failed:", err);
  process.exit(1);
});
