#!/usr/bin/env node
/**
 * One-time backfill: adds City/Zip columns to the Accounts sheet (they don't
 * exist yet — confirmed via scripts/audit-city-zip.js) and populates them,
 * filling blank Latitude/Longitude along the way, using the Google Geocoding
 * API. Also re-checks the known out-of-service-area accounts without ever
 * silently overwriting their existing coordinates.
 *
 * Three different strategies per row, chosen by what we already trust:
 *
 *   A. REVERSE  — row already has Latitude/Longitude AND those coordinates
 *      are inside the expected NJ/NYC service area box. We trust the
 *      coordinates, so we reverse-geocode FROM them to fill in City/Zip
 *      only. Latitude/Longitude are left untouched. This is the majority
 *      of rows and the lowest-risk path — no guessing from a possibly
 *      messy address string.
 *
 *   B. FORWARD-FILL — row has NO Latitude/Longitude at all. We have no
 *      coordinate to anchor on, so we forward-geocode FROM the address
 *      string and write City/Zip/Latitude/Longitude together, but only if
 *      the result clears every confidence check below. Otherwise it's
 *      logged for manual review, nothing is written.
 *
 *   C. OUTLIER RE-CHECK — row already has Latitude/Longitude, but those
 *      coordinates fall OUTSIDE the service area box (the same 29-ish
 *      accounts flagged on the Account Map page). We forward-geocode FROM
 *      the address for comparison only. Old vs. new is logged side by
 *      side. NOTHING is written for these rows in this run, regardless of
 *      how confident the new geocode looks — per explicit instruction,
 *      these need a human decision, not an automatic overwrite.
 *
 * Confidence checks applied before any forward-geocode result is trusted
 * enough to write (category B only — category A's coordinates are already
 * trusted, category C never writes):
 *   - Google status must be OK with exactly one result (0 = failed,
 *     2+ = ambiguous, both go to review)
 *   - result.partial_match must not be true
 *   - result.geometry.location_type must be ROOFTOP or RANGE_INTERPOLATED
 *     (GEOMETRIC_CENTER / APPROXIMATE are too coarse to trust)
 *   - the geocoded point must fall inside the same NJ/NYC service-area box
 *     used by app/map/page.tsx (isInServiceArea) and
 *     GoogleAddressAutocompleteInput.tsx (SERVICE_AREA_BOUNDS)
 *   - the ORIGINAL address string itself must contain some locality hint
 *     (a 5-digit zip or a US state abbreviation) — addresses like
 *     "38 Chatham Road" with no city/state/zip at all are ALWAYS sent to
 *     review, even if Google returns what looks like a confident result,
 *     because a "confident" match against a bare street name+number is
 *     confidently guessing, not confidently correct
 *   - the parsed result must actually contain both a city and a zip
 *     component
 *
 * City/zip parsing mirrors app/components/GoogleAddressAutocompleteInput.tsx's
 * getAddressComponent() exactly (same type-priority lists) — duplicated here
 * rather than imported since that file is a browser "use client" component
 * and this is a plain Node/CommonJS script.
 *
 * Usage:
 *   node scripts/backfill-city-zip.js --dry-run           (preview only, no writes)
 *   node scripts/backfill-city-zip.js --dry-run --limit=10 (preview first 10 target rows)
 *   node scripts/backfill-city-zip.js                     (writes for real)
 *
 * Requires GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY,
 * GOOGLE_MAIN_SHEET_ID, and GOOGLE_GEOCODING_API_KEY in the environment (or
 * .env.local). GOOGLE_GEOCODING_API_KEY is deliberately separate from
 * NEXT_PUBLIC_GOOGLE_MAPS_API_KEY — that key is HTTP-referrer-restricted for
 * browser use (correctly so) and the Geocoding API rejects referrer-restricted
 * keys outright for server-side calls like this script's ("API keys with
 * referer restrictions cannot be used with this API"). Use a separate,
 * narrowly-scoped key (API-restricted to just Geocoding API) instead of
 * loosening the browser key's restriction.
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findColumnIndex(header, candidates) {
  const normalized = header.map((h) => clean(h).toLowerCase());
  for (const candidate of candidates) {
    const idx = normalized.indexOf(candidate.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

function colLetter(idx) {
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

// Same box used by app/map/page.tsx's isInServiceArea() and
// GoogleAddressAutocompleteInput.tsx's SERVICE_AREA_BOUNDS.
const SERVICE_AREA = { latMin: 38.5, latMax: 42.5, lngMin: -76.5, lngMax: -72.5 };

function isInServiceArea(lat, lng) {
  return (
    typeof lat === "number" && typeof lng === "number" &&
    lat >= SERVICE_AREA.latMin && lat <= SERVICE_AREA.latMax &&
    lng >= SERVICE_AREA.lngMin && lng <= SERVICE_AREA.lngMax
  );
}

const US_STATE_ABBREVIATIONS = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
  "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT",
  "VA", "WA", "WV", "WI", "WY", "DC",
]);

// Does the RAW address string itself contain any hint of city/state/zip, or
// is it just a bare street name + number ("38 Chatham Road")? Deliberately
// crude — this only needs to catch "no locality context at all", not parse
// it precisely.
function addressHasLocalityHint(address) {
  const hasZip = /\b\d{5}(-\d{4})?\b/.test(address);
  const hasStateToken = address
    .split(/[,\s]+/)
    .some((token) => US_STATE_ABBREVIATIONS.has(token.toUpperCase()));
  return hasZip || hasStateToken;
}

// Mirrors GoogleAddressAutocompleteInput.tsx's getAddressComponent exactly.
function getAddressComponent(components, types, useShortName = false) {
  for (const type of types) {
    const match = (components || []).find((c) => (c.types || []).includes(type));
    if (match) return useShortName ? match.short_name : match.long_name;
  }
  return "";
}

function parseGeocodeResult(result) {
  const components = result.address_components || [];
  return {
    city: getAddressComponent(components, ["locality", "sublocality", "postal_town", "administrative_area_level_3"]),
    zip: getAddressComponent(components, ["postal_code"]),
    state: getAddressComponent(components, ["administrative_area_level_1"], true),
    lat: result.geometry?.location?.lat,
    lng: result.geometry?.location?.lng,
  };
}

const GEOCODE_DELAY_MS = 200; // ~5 req/s, comfortably within default quotas
const MAX_RETRIES = 3;

async function fetchGeocode(url) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === "OVER_QUERY_LIMIT" && attempt < MAX_RETRIES) {
      const backoffMs = 2000 * attempt;
      console.log(`    OVER_QUERY_LIMIT — retrying in ${backoffMs}ms (attempt ${attempt}/${MAX_RETRIES})`);
      await sleep(backoffMs);
      continue;
    }
    return data;
  }
}

async function forwardGeocode(address, apiKey) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
  return fetchGeocode(url);
}

async function reverseGeocode(lat, lng, apiKey) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;
  return fetchGeocode(url);
}

// Classifies a forward-geocode response for a category-B (no existing
// coordinates) row. Returns either {ok:true, city, zip, lat, lng} or
// {ok:false, reason}.
function classifyForwardGeocode(address, geocodeResponse) {
  if (geocodeResponse.status !== "OK") {
    return { ok: false, reason: `Geocoding API status: ${geocodeResponse.status}${geocodeResponse.error_message ? ` — ${geocodeResponse.error_message}` : ""}` };
  }
  const results = geocodeResponse.results || [];
  if (results.length === 0) return { ok: false, reason: "No results returned" };
  if (results.length > 1) return { ok: false, reason: `Ambiguous — ${results.length} candidate results` };

  const result = results[0];
  if (result.partial_match) return { ok: false, reason: "Google flagged this as a partial match" };

  const locationType = result.geometry?.location_type;
  if (locationType !== "ROOFTOP" && locationType !== "RANGE_INTERPOLATED") {
    return { ok: false, reason: `Low-precision geocode (location_type=${locationType})` };
  }

  if (!addressHasLocalityHint(address)) {
    return { ok: false, reason: "Original address has no city/state/zip context — not trusting a confident-looking match built on a bare street name" };
  }

  const parsed = parseGeocodeResult(result);
  if (!isInServiceArea(parsed.lat, parsed.lng)) {
    return { ok: false, reason: `Geocoded outside expected NJ/NYC service area (${parsed.lat}, ${parsed.lng})` };
  }
  if (!parsed.city || !parsed.zip) {
    return { ok: false, reason: "Geocode succeeded but city or zip component missing from the result" };
  }

  return { ok: true, city: parsed.city, zip: parsed.zip, lat: parsed.lat, lng: parsed.lng };
}

function classifyReverseGeocode(geocodeResponse) {
  if (geocodeResponse.status !== "OK") {
    return { ok: false, reason: `Reverse geocode status: ${geocodeResponse.status}${geocodeResponse.error_message ? ` — ${geocodeResponse.error_message}` : ""}` };
  }
  const results = geocodeResponse.results || [];
  if (results.length === 0) return { ok: false, reason: "No results returned" };

  const parsed = parseGeocodeResult(results[0]);
  if (!parsed.city || !parsed.zip) {
    return { ok: false, reason: "Reverse geocode succeeded but city or zip component missing from the result" };
  }
  return { ok: true, city: parsed.city, zip: parsed.zip };
}

async function main() {
  loadEnvLocal();

  const dryRun = process.argv.includes("--dry-run");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;

  const mainSheetId = process.env.GOOGLE_MAIN_SHEET_ID;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const geocodingApiKey = process.env.GOOGLE_GEOCODING_API_KEY;

  if (!mainSheetId || !clientEmail || !privateKey || !geocodingApiKey) {
    console.error(
      "Missing GOOGLE_MAIN_SHEET_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY / GOOGLE_GEOCODING_API_KEY.\n" +
      "GOOGLE_GEOCODING_API_KEY must be a separate key from NEXT_PUBLIC_GOOGLE_MAPS_API_KEY — that one is HTTP-referrer-restricted " +
      "for browser use, and the Geocoding API rejects referrer-restricted keys for server-side calls. Create a new key in Google " +
      "Cloud Console restricted to just the Geocoding API (Application restrictions: None or your IP), then set " +
      "GOOGLE_GEOCODING_API_KEY in .env.local (or the environment) before running this script."
    );
    process.exitCode = 1;
    return;
  }

  console.log(dryRun ? "Running in --dry-run mode — no writes will be made.\n" : "Running for real — this WILL write to the Accounts sheet.\n");
  if (Number.isFinite(limit)) console.log(`--limit=${limit}: only the first ${limit} target rows (per category) will be processed.\n`);

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

  // ── 1. Read the sheet, resolve columns ─────────────────────────────────
  const response = await sheetsReadOnly.spreadsheets.values.get({
    spreadsheetId: mainSheetId,
    range: SHEET_TAB,
  });
  const allRows = response.data.values ?? [];
  const header = allRows[0] ?? [];
  const dataRows = allRows.slice(1).filter((row) => row.some((cell) => clean(cell)));

  const col = {};
  for (const [key, candidates] of Object.entries(CANDIDATES)) {
    col[key] = findColumnIndex(header, candidates);
  }
  if (col.fullAddress === -1) {
    console.error("Could not find an address column — aborting. Run scripts/audit-city-zip.js to inspect the header row.");
    process.exitCode = 1;
    return;
  }
  if (col.latitude === -1 || col.longitude === -1) {
    console.error("Could not find Latitude/Longitude columns — aborting. Run scripts/audit-city-zip.js to inspect the header row.");
    process.exitCode = 1;
    return;
  }

  // ── 2. Ensure City/Zip columns exist (append at the end if missing) ────
  const newColumns = [];
  let nextFreeIdx = header.length;
  if (col.city === -1) { col.city = nextFreeIdx++; newColumns.push({ label: "City", idx: col.city }); }
  if (col.zip === -1) { col.zip = nextFreeIdx++; newColumns.push({ label: "Zip", idx: col.zip }); }

  if (newColumns.length > 0) {
    // The sheet's underlying grid is sized to exactly the current data
    // width (confirmed live: writing to a column beyond it fails with
    // "Range exceeds grid limits" — the Values API won't auto-expand the
    // grid). Grow the grid first via the spreadsheet-level batchUpdate
    // (updateSheetProperties), which is a different call from the
    // values.batchUpdate used everywhere else in this script.
    const requiredColumnCount = Math.max(...newColumns.map((c) => c.idx)) + 1;
    const meta = await sheetsReadOnly.spreadsheets.get({ spreadsheetId: mainSheetId, fields: "sheets.properties" });
    const sheetProps = meta.data.sheets.find((s) => s.properties.title === SHEET_TAB)?.properties;
    if (!sheetProps) {
      console.error(`Could not find sheet tab "${SHEET_TAB}" in spreadsheet metadata — aborting.`);
      process.exitCode = 1;
      return;
    }
    const currentColumnCount = sheetProps.gridProperties.columnCount;
    if (currentColumnCount < requiredColumnCount) {
      console.log(`${dryRun ? "Would expand" : "Expanding"} sheet grid from ${currentColumnCount} to ${requiredColumnCount} columns (Values API can't write past the current grid width).`);
      if (!dryRun) {
        await sheetsReadWrite.spreadsheets.batchUpdate({
          spreadsheetId: mainSheetId,
          requestBody: {
            requests: [{
              updateSheetProperties: {
                properties: { sheetId: sheetProps.sheetId, gridProperties: { columnCount: requiredColumnCount } },
                fields: "gridProperties.columnCount",
              },
            }],
          },
        });
      }
    }

    console.log(`${dryRun ? "Would add" : "Adding"} header column(s): ${newColumns.map((c) => `${colLetter(c.idx)}="${c.label}"`).join(", ")}`);
    if (!dryRun) {
      await sheetsReadWrite.spreadsheets.values.batchUpdate({
        spreadsheetId: mainSheetId,
        requestBody: {
          valueInputOption: "RAW",
          data: newColumns.map((c) => ({ range: `${SHEET_TAB}!${colLetter(c.idx)}1`, values: [[c.label]] })),
        },
      });
    }
  } else {
    console.log("City/Zip columns already exist — reusing them.");
  }
  console.log("");

  // ── 3. Sanity-check the API key actually works server-side before doing
  //      hundreds of requests (catches referrer-restricted keys / Geocoding
  //      API not enabled on the project early, with a clear message).
  const sanity = await forwardGeocode("1600 Amphitheatre Parkway, Mountain View, CA", geocodingApiKey);
  if (sanity.status !== "OK") {
    console.error(
      `Geocoding API sanity check failed (status: ${sanity.status}${sanity.error_message ? `, message: "${sanity.error_message}"` : ""}).\n` +
      "This usually means either: (a) the Geocoding API isn't enabled for this key's GCP project (Maps JavaScript/Places being enabled doesn't imply Geocoding is), " +
      "or (b) the key has an HTTP referrer restriction meant for browser use, which blocks server-side calls like this one — you'd need a referrer exception, " +
      "an IP allowlist, or a separate unrestricted server-side key.\nAborting before processing any rows."
    );
    process.exitCode = 1;
    return;
  }
  console.log("Geocoding API sanity check passed.\n");

  // ── 4. Classify every address-having row into A/B/C ─────────────────────
  const reverseRows = [];   // A: trusted coords, missing city/zip
  const forwardFillRows = []; // B: no coords at all
  const outlierRows = [];   // C: coords exist but outside service area

  dataRows.forEach((row, i) => {
    const sheetRow = i + 2;
    const address = clean(row[col.fullAddress]);
    if (!address) return;

    const city = clean(row[col.city]);
    const zip = clean(row[col.zip]);
    const latRaw = clean(row[col.latitude]);
    const lngRaw = clean(row[col.longitude]);
    const lat = latRaw ? Number(latRaw) : null;
    const lng = lngRaw ? Number(lngRaw) : null;
    const hasCoords = lat !== null && lng !== null && !Number.isNaN(lat) && !Number.isNaN(lng);

    const meta = {
      sheetRow,
      accountId: col.accountId !== -1 ? clean(row[col.accountId]) : "",
      accountName: col.accountName !== -1 ? clean(row[col.accountName]) : "",
      address,
      existingCity: city,
      existingZip: zip,
      existingLat: lat,
      existingLng: lng,
    };

    if (!hasCoords) {
      if (!city || !zip) forwardFillRows.push(meta);
      return;
    }

    if (isInServiceArea(lat, lng)) {
      if (!city || !zip) reverseRows.push(meta);
      // else: already has coords, city, and zip — nothing to do
    } else {
      outlierRows.push(meta);
    }
  });

  console.log("─── Row classification ─────────────────────────────────");
  console.log(`A. Reverse-geocode (trusted coords, filling City/Zip only): ${reverseRows.length}`);
  console.log(`B. Forward-geocode (no coords at all, filling City/Zip/Lat/Lng): ${forwardFillRows.length}`);
  console.log(`C. Outlier re-check (coords outside service area — log only, never overwritten): ${outlierRows.length}`);
  console.log("");

  const writes = []; // {range, values}
  const reviewLog = { forwardFillFlagged: [], outlierComparisons: [], reverseFlagged: [] };
  let processed = 0;

  // ── A. Reverse geocode ───────────────────────────────────────────────
  for (const meta of reverseRows.slice(0, limit)) {
    processed += 1;
    console.log(`[A ${processed}] Row ${meta.sheetRow} "${meta.accountName}" — reverse geocoding (${meta.existingLat}, ${meta.existingLng})`);
    const result = await reverseGeocode(meta.existingLat, meta.existingLng, geocodingApiKey);
    await sleep(GEOCODE_DELAY_MS);
    const classified = classifyReverseGeocode(result);
    if (classified.ok) {
      writes.push({ range: `${SHEET_TAB}!${colLetter(col.city)}${meta.sheetRow}`, values: [[classified.city]] });
      writes.push({ range: `${SHEET_TAB}!${colLetter(col.zip)}${meta.sheetRow}`, values: [[classified.zip]] });
      console.log(`    -> City="${classified.city}", Zip="${classified.zip}"`);
    } else {
      console.log(`    -> FLAGGED: ${classified.reason}`);
      reviewLog.reverseFlagged.push({ ...meta, reason: classified.reason });
    }
  }

  // ── B. Forward geocode (fill) ────────────────────────────────────────
  for (const meta of forwardFillRows.slice(0, limit)) {
    processed += 1;
    console.log(`[B ${processed}] Row ${meta.sheetRow} "${meta.accountName}" — forward geocoding "${meta.address}"`);
    const result = await forwardGeocode(meta.address, geocodingApiKey);
    await sleep(GEOCODE_DELAY_MS);
    const classified = classifyForwardGeocode(meta.address, result);
    if (classified.ok) {
      writes.push({ range: `${SHEET_TAB}!${colLetter(col.city)}${meta.sheetRow}`, values: [[classified.city]] });
      writes.push({ range: `${SHEET_TAB}!${colLetter(col.zip)}${meta.sheetRow}`, values: [[classified.zip]] });
      writes.push({ range: `${SHEET_TAB}!${colLetter(col.latitude)}${meta.sheetRow}`, values: [[classified.lat]] });
      writes.push({ range: `${SHEET_TAB}!${colLetter(col.longitude)}${meta.sheetRow}`, values: [[classified.lng]] });
      console.log(`    -> City="${classified.city}", Zip="${classified.zip}", (${classified.lat}, ${classified.lng})`);
    } else {
      console.log(`    -> FLAGGED: ${classified.reason}`);
      reviewLog.forwardFillFlagged.push({ ...meta, reason: classified.reason });
    }
  }

  // ── C. Outlier re-check (log only, never write) ──────────────────────
  for (const meta of outlierRows.slice(0, limit)) {
    processed += 1;
    console.log(`[C ${processed}] Row ${meta.sheetRow} "${meta.accountName}" — re-geocoding for comparison only (existing: ${meta.existingLat}, ${meta.existingLng})`);
    const result = await forwardGeocode(meta.address, geocodingApiKey);
    await sleep(GEOCODE_DELAY_MS);
    const classified = classifyForwardGeocode(meta.address, result);
    const comparison = {
      ...meta,
      newResult: classified.ok
        ? { city: classified.city, zip: classified.zip, lat: classified.lat, lng: classified.lng, confident: true }
        : { confident: false, reason: classified.reason },
    };
    reviewLog.outlierComparisons.push(comparison);
    console.log(
      classified.ok
        ? `    -> OLD (${meta.existingLat}, ${meta.existingLng}) vs NEW (${classified.lat}, ${classified.lng}) [confident] — logged, NOT written`
        : `    -> OLD (${meta.existingLat}, ${meta.existingLng}) — new geocode not confident either (${classified.reason}) — logged, NOT written`
    );
  }

  // ── 5. Write (chunked, batched) ───────────────────────────────────────
  console.log("");
  console.log(`Total cell writes queued: ${writes.length}`);
  if (!dryRun && writes.length > 0) {
    const CHUNK_SIZE = 500;
    for (let i = 0; i < writes.length; i += CHUNK_SIZE) {
      const chunk = writes.slice(i, i + CHUNK_SIZE);
      await sheetsReadWrite.spreadsheets.values.batchUpdate({
        spreadsheetId: mainSheetId,
        requestBody: { valueInputOption: "USER_ENTERED", data: chunk },
      });
      console.log(`  Wrote batch ${i / CHUNK_SIZE + 1} (${chunk.length} cells)`);
    }
  }

  // ── 6. Report + review log file ───────────────────────────────────────
  const outputDir = path.join(__dirname, "output");
  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = path.join(outputDir, `city-zip-backfill-review-${stamp}.json`);
  fs.writeFileSync(logPath, JSON.stringify(reviewLog, null, 2));

  console.log("");
  console.log("─── Summary ─────────────────────────────────────────────");
  console.log(`Reverse-geocoded and written: ${reverseRows.slice(0, limit).length - reviewLog.reverseFlagged.length}`);
  console.log(`Forward-geocoded and written: ${forwardFillRows.slice(0, limit).length - reviewLog.forwardFillFlagged.length}`);
  console.log(`Flagged for manual review (reverse): ${reviewLog.reverseFlagged.length}`);
  console.log(`Flagged for manual review (forward-fill): ${reviewLog.forwardFillFlagged.length}`);
  console.log(`Outlier accounts re-geocoded and logged (never written): ${reviewLog.outlierComparisons.length}`);
  console.log(`Full review log written to: ${logPath}`);
  console.log("──────────────────────────────────────────────────────────");
  if (dryRun) console.log("\nDry run complete — no changes were made. Re-run without --dry-run to apply.");
}

main().catch((err) => {
  console.error("Backfill script failed:", err);
  process.exitCode = 1;
});
