#!/usr/bin/env node
/**
 * Read-only audit for the planned City/Zip backfill — makes NO writes.
 *
 * lib/googleSheets.ts's own MAIN_COL map (used elsewhere in this app) stops
 * at column X and has no City/Zip entries at all, so this doesn't trust any
 * hardcoded column letters. It reads the real header row from the Accounts
 * tab and resolves Full Address / City / Zip (and Latitude/Longitude, for
 * later) by matching header text, then reports what it found.
 *
 * Usage:
 *   node scripts/audit-city-zip.js
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

function clean(value) {
  return String(value ?? "").trim();
}

// Header text -> column index, tried in order, case-insensitive exact match.
function findColumnIndex(header, candidates) {
  const normalized = header.map((h) => clean(h).toLowerCase());
  for (const candidate of candidates) {
    const idx = normalized.indexOf(candidate.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

function colLetter(idx) {
  if (idx === -1) return "(not found)";
  let n = idx;
  let letters = "";
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letters;
}

const SHEET_TAB = "Accounts";

const CANDIDATES = {
  accountName: ["Account Name", "Account", "Name"],
  accountId: ["Account ID", "ID"],
  fullAddress: ["Full Address", "Address", "Street Address", "Service Address", "Location Address", "Google Address"],
  city: ["City"],
  zip: ["Zip", "ZIP", "Zip Code", "Postal Code"],
  latitude: ["Latitude", "Lat", "Google Latitude"],
  longitude: ["Longitude", "Lng", "Long", "Google Longitude"],
  status: ["Status", "Account Status"],
};

async function main() {
  loadEnvLocal();

  const mainSheetId = process.env.GOOGLE_MAIN_SHEET_ID;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!mainSheetId || !clientEmail || !privateKey) {
    console.error(
      "Missing GOOGLE_MAIN_SHEET_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY.\n" +
      "Set these in .env.local (or the environment) before running this script."
    );
    process.exit(1);
  }

  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: mainSheetId,
    range: SHEET_TAB,
  });

  const allRows = response.data.values ?? [];
  const header = allRows[0] ?? [];
  const dataRows = allRows.slice(1).filter((row) => row.some((cell) => clean(cell)));

  console.log("─── Header row (as found) ─────────────────────────────");
  header.forEach((h, i) => console.log(`  ${colLetter(i)} [${i}]: ${clean(h) || "(blank)"}`));
  console.log("");

  const col = {};
  for (const [key, candidates] of Object.entries(CANDIDATES)) {
    col[key] = findColumnIndex(header, candidates);
  }

  console.log("─── Resolved columns ──────────────────────────────────");
  for (const [key, idx] of Object.entries(col)) {
    console.log(`  ${key.padEnd(12)} -> column ${colLetter(idx)}${idx !== -1 ? ` "${clean(header[idx])}"` : " — NOT FOUND"}`);
  }
  console.log("");

  if (col.fullAddress === -1) {
    console.error("Could not find an address column by any known header name — stopping. Check the header row above.");
    process.exit(1);
  }
  if (col.city === -1 || col.zip === -1) {
    console.log("⚠ City and/or Zip column not found by header name — see header list above.");
    console.log("  If they exist under a different label, tell me the exact header text and I'll adjust the candidates.\n");
  }

  const withAddress = dataRows.filter((row) => clean(row[col.fullAddress]));
  const missingCityOrZip = withAddress.filter((row) => {
    const city = col.city !== -1 ? clean(row[col.city]) : "";
    const zip = col.zip !== -1 ? clean(row[col.zip]) : "";
    return !city || !zip;
  });
  const missingCityOnly = withAddress.filter((row) => col.city !== -1 && !clean(row[col.city]));
  const missingZipOnly = withAddress.filter((row) => col.zip !== -1 && !clean(row[col.zip]));
  const missingBoth = withAddress.filter((row) => {
    const city = col.city !== -1 ? clean(row[col.city]) : "";
    const zip = col.zip !== -1 ? clean(row[col.zip]) : "";
    return !city && !zip;
  });

  console.log("─── Audit results ─────────────────────────────────────");
  console.log(`Total data rows in ${SHEET_TAB} tab: ${dataRows.length}`);
  console.log(`Rows with a non-blank address: ${withAddress.length}`);
  console.log(`Rows with address but blank City and/or Zip: ${missingCityOrZip.length}`);
  console.log(`  — blank City: ${missingCityOnly.length}`);
  console.log(`  — blank Zip: ${missingZipOnly.length}`);
  console.log(`  — blank both: ${missingBoth.length}`);
  console.log("");

  const sampleSize = Math.min(10, missingCityOrZip.length);
  console.log(`─── Sample of ${sampleSize} raw address strings (rows missing City/Zip) ───`);
  missingCityOrZip.slice(0, sampleSize).forEach((row, i) => {
    const name = col.accountName !== -1 ? clean(row[col.accountName]) : "(unknown)";
    console.log(`  ${i + 1}. [${name}] "${clean(row[col.fullAddress])}"`);
  });
  console.log("");

  if (col.latitude !== -1 || col.longitude !== -1) {
    const missingLatLng = withAddress.filter((row) => {
      const lat = col.latitude !== -1 ? clean(row[col.latitude]) : "";
      const lng = col.longitude !== -1 ? clean(row[col.longitude]) : "";
      return !lat || !lng;
    });
    console.log(`Rows with address but blank Latitude/Longitude: ${missingLatLng.length} (lat/lng columns exist)`);
  } else {
    console.log("No Latitude/Longitude columns found — backfill would only write City/Zip, not coordinates.");
  }
  console.log("────────────────────────────────────────────────────────");
}

main().catch((err) => {
  console.error("Audit script failed:", err);
  process.exit(1);
});
