// Compares the visit list rebuilt from Postgres (lib/pg/visits.ts,
// getVisitsAppsScriptShape) with what the Apps Script backend returns for
// getVisits: every row, every field, exact text, same order, same keys.
//
//   npx tsx scripts/migrate/check-visits-apps-script.mts [--cache <dir>] [--fresh]
//
// Apps Script is the live production backend and is slow, so its answer is
// cached as JSON in <dir> (default: a folder in the system temp dir, never
// in the repo: the list holds customer names and notes). --fresh fetches
// again (one read-only call). Run the visits import first so both sides are
// from the same moment. Prints counts only.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadEnv } from "./lib/env.mjs";
import { assertDevDatabase } from "./lib/guard.mjs";

loadEnv();
process.env.DATABASE_URL = assertDevDatabase(process.env.MIGRATION_DATABASE_URL);

const args = process.argv.slice(2);
const cacheDir = args.includes("--cache") ? args[args.indexOf("--cache") + 1] : path.join(os.tmpdir(), "cw-apps-script-cache");
const fresh = args.includes("--fresh");
fs.mkdirSync(cacheDir, { recursive: true });

const { getVisitsAppsScriptShape } = await import("../../lib/pg/visits");

const file = path.join(cacheDir, "getVisits.json");
if (fresh || !fs.existsSync(file)) {
  const started = Date.now();
  const response = await fetch(`${process.env.GOOGLE_SCRIPT_URL}?action=getVisits`);
  const body = await response.text();
  try {
    JSON.parse(body);
    fs.writeFileSync(file, body);
    console.log(`fetched getVisits in ${Math.round((Date.now() - started) / 1000)}s`);
  } catch {
    console.log(`SKIP   getVisits: Apps Script did not answer with JSON (status ${response.status}). Not retried.`);
  }
}

let failed = false;
if (!fs.existsSync(file)) {
  console.log("No cached answer to compare with.");
  failed = true;
} else {
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as { visits?: Record<string, unknown>[]; data?: Record<string, unknown>[] };
  const theirs = data.visits ?? data.data ?? [];
  const ours = (await getVisitsAppsScriptShape()) as unknown as Record<string, unknown>[];

  const sameKeys = theirs.length > 0 && ours.length > 0 && JSON.stringify(Object.keys(theirs[0])) === JSON.stringify(Object.keys(ours[0]));
  const sameOrder = theirs.length === ours.length && theirs.every((row, i) => row.id === ours[i].id);
  const differentFields = new Map<string, number>();
  let rowsDifferent = 0;
  if (sameOrder) {
    theirs.forEach((row, i) => {
      let different = false;
      for (const key of Object.keys(row)) {
        if (row[key] !== ours[i][key]) {
          different = true;
          differentFields.set(key, (differentFields.get(key) ?? 0) + 1);
        }
      }
      if (different) rowsDifferent++;
    });
  }
  const ok = sameKeys && sameOrder && rowsDifferent === 0;
  if (!ok) failed = true;
  console.log(
    `${ok ? "SAME  " : "DIFF  "} getVisits: Apps Script ${theirs.length} rows, Postgres ${ours.length} rows, same keys in the same order: ${sameKeys}, same row order: ${sameOrder}, rows with a difference: ${rowsDifferent}` +
      (differentFields.size ? ` (${[...differentFields].map(([k, n]) => `${k}: ${n}`).join(", ")})` : "")
  );
}

if (failed) process.exitCode = 1;
