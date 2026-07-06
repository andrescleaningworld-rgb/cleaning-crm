#!/usr/bin/env node
/**
 * One-time backfill: creates a customer-portal row for every account in the
 * main Accounts sheet that doesn't already have one, using the same
 * account-name matching logic as getMergedPortalAccounts() and the same row
 * shape as enablePortalAccount() in lib/googleSheets.ts.
 *
 * PORTAL_ACCESS is set per account based on its Accounts-tab status: "active"
 * (case-insensitive) gets YES, everything else (Cancelled, Inactive, blank,
 * etc.) gets NO. Every account still gets a row created either way, so no
 * second backfill is needed later — only login access differs.
 *
 * Safe to re-run: on each run it re-reads the customer-portal tab fresh and
 * only creates rows for account names not already present there, so accounts
 * backfilled by a previous run are skipped, not duplicated.
 *
 * Never touches the existing "Cleaning World" / CW-0001 row — that row is
 * excluded from matching (so it can never "already satisfy" a real account)
 * and this script only ever appends new rows, never edits existing ones.
 *
 * Usage:
 *   node scripts/backfill-portal-accounts.js            (writes real rows)
 *   node scripts/backfill-portal-accounts.js --dry-run   (plan only, no writes)
 *
 * Requires GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID,
 * and GOOGLE_MAIN_SHEET_ID in the environment (or .env.local).
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

// Mirrors MAIN_COL in lib/googleSheets.ts
const MAIN_COL = {
  ACCOUNT_ID: 0,   // A
  ACCOUNT_NAME: 1, // B
  PHONE: 13,       // N
  STATUS: 16,      // Q
};

// Mirrors COL in lib/googleSheets.ts
const PORTAL_COL = {
  ACCOUNT_ID: 0,    // A
  ACCOUNT_NAME: 1,  // B
  PHONE: 8,         // I
  PORTAL_CODE: 17,  // R
  PORTAL_ACCESS: 18,// S
};

const PORTAL_TAB = "customer-portal";
const DUMMY_ACCOUNT_NAME = "cleaning world";
const DUMMY_PORTAL_CODE = "cw-0001";

function generatePortalCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return "CW-" + Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

async function main() {
  loadEnvLocal();

  const dryRun = process.argv.includes("--dry-run");

  const mainSheetId = process.env.GOOGLE_MAIN_SHEET_ID;
  const portalSheetId = process.env.GOOGLE_SHEET_ID;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!mainSheetId || !portalSheetId || !clientEmail || !privateKey) {
    console.error(
      "Missing GOOGLE_MAIN_SHEET_ID / GOOGLE_SHEET_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY.\n" +
      "Set these in .env.local (or the environment) before running this script."
    );
    process.exit(1);
  }

  const readOnlyAuth = new google.auth.GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const readWriteAuth = new google.auth.GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheetsReadOnly = google.sheets({ version: "v4", auth: readOnlyAuth });
  const sheetsReadWrite = google.sheets({ version: "v4", auth: readWriteAuth });

  console.log(dryRun ? "Running in --dry-run mode — no rows will be written.\n" : "Running for real — this WILL write rows to the customer-portal tab.\n");

  // 1. Read every account row from the main Accounts sheet.
  const mainResponse = await sheetsReadOnly.spreadsheets.values.get({
    spreadsheetId: mainSheetId,
    range: "Accounts!A:X",
  });
  const mainRows = (mainResponse.data.values ?? []).slice(1);

  const accounts = mainRows
    .map((row) => ({
      accountId: (row[MAIN_COL.ACCOUNT_ID] ?? "").trim(),
      accountName: (row[MAIN_COL.ACCOUNT_NAME] ?? "").trim(),
      phone: (row[MAIN_COL.PHONE] ?? "").trim(),
      status: (row[MAIN_COL.STATUS] ?? "").trim(),
    }))
    .filter((account) => account.accountName);

  // 2. Read all existing rows from the customer-portal tab.
  const portalResponse = await sheetsReadWrite.spreadsheets.values.get({
    spreadsheetId: portalSheetId,
    range: `${PORTAL_TAB}!A:S`,
  });
  const portalRows = (portalResponse.data.values ?? []).slice(1);

  // 3. Index existing portal rows by lowercase/trimmed account name — same
  // matching logic as getMergedPortalAccounts() — but exclude the known
  // "Cleaning World" / CW-0001 dummy row so it can never count as a match.
  const existingNames = new Set();
  let dummyRowSkipped = false;

  portalRows.forEach((row) => {
    const name = (row[PORTAL_COL.ACCOUNT_NAME] ?? "").trim();
    const code = (row[PORTAL_COL.PORTAL_CODE] ?? "").trim();
    if (!name) return;

    if (name.toLowerCase() === DUMMY_ACCOUNT_NAME && code.toLowerCase() === DUMMY_PORTAL_CODE) {
      dummyRowSkipped = true;
      return;
    }

    existingNames.add(name.toLowerCase());
  });

  // 4. Build one row per account with no existing match, then write them all
  // in a single append call — writing one row at a time as separate API
  // calls blows through the Sheets API's per-minute write quota well before
  // a few hundred accounts are done.
  const created = [];
  const skipped = [];
  const failed = [];
  const rowsToAppend = [];

  for (const account of accounts) {
    const nameKey = account.accountName.toLowerCase();

    if (existingNames.has(nameKey)) {
      skipped.push(account.accountName);
      continue;
    }

    if (!account.phone) {
      failed.push({ accountName: account.accountName, reason: "missing phone number" });
      continue;
    }

    // Everyone gets a row (so no second backfill is needed later), but only
    // currently-active accounts get login access enabled immediately.
    const portalAccess = account.status.toLowerCase() === "active" ? "YES" : "NO";
    const code = account.accountId || generatePortalCode();
    const row = Array(19).fill("");
    row[PORTAL_COL.ACCOUNT_ID] = account.accountId;
    row[PORTAL_COL.ACCOUNT_NAME] = account.accountName;
    row[PORTAL_COL.PHONE] = account.phone;
    row[PORTAL_COL.PORTAL_CODE] = code;
    row[PORTAL_COL.PORTAL_ACCESS] = portalAccess;

    rowsToAppend.push(row);

    // Prevent duplicate rows for accounts sharing the same name within this
    // same run (in addition to across separate runs).
    existingNames.add(nameKey);
    created.push({ accountName: account.accountName, portalAccess });
  }

  if (!dryRun && rowsToAppend.length > 0) {
    try {
      await sheetsReadWrite.spreadsheets.values.append({
        spreadsheetId: portalSheetId,
        range: `${PORTAL_TAB}!A:S`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: rowsToAppend },
      });
    } catch (err) {
      // The whole batch failed together — move everything back out of
      // "created" and into "failed" rather than reporting false successes.
      const reason = err instanceof Error ? err.message : String(err);
      created.forEach(({ accountName }) => failed.push({ accountName, reason }));
      created.length = 0;
    }
  }

  // 5. Report.
  console.log("─── Backfill report ───────────────────────────────");
  console.log(`Accounts found in Accounts tab: ${accounts.length}`);
  if (dummyRowSkipped) {
    console.log('Excluded the "Cleaning World" / CW-0001 dummy row from matching.');
  }
  console.log(`Already had a customer-portal row (skipped): ${skipped.length}`);
  console.log(`${dryRun ? "Would create" : "Created"}: ${created.length}`);
  if (created.length) {
    created.forEach(({ accountName, portalAccess }) => console.log(`  + ${accountName} (PORTAL_ACCESS=${portalAccess})`));
    const yesCount = created.filter((c) => c.portalAccess === "YES").length;
    const noCount = created.length - yesCount;
    console.log(`  → PORTAL_ACCESS=YES: ${yesCount}, PORTAL_ACCESS=NO: ${noCount}`);
  }
  console.log(`Failed: ${failed.length}`);
  if (failed.length) {
    failed.forEach(({ accountName, reason }) => console.log(`  ! ${accountName} — ${reason}`));
  }
  console.log("────────────────────────────────────────────────────");

  if (dryRun) {
    console.log("\nDry run complete — no rows were written. Re-run without --dry-run to apply.");
  }
}

main().catch((err) => {
  console.error("Backfill script failed:", err);
  process.exit(1);
});
