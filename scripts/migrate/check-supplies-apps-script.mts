// Compares the two lists rebuilt from Postgres (lib/pg/supplies.ts) with what
// the Apps Script backend returns for getSupplyItemsAdmin and
// getSupplyOrders: every row, every field, exact value, same order, same
// keys.
//
//   npx tsx scripts/migrate/check-supplies-apps-script.mts [--cache <dir>] [--fresh]
//
// Apps Script is the live production backend, so its answers are cached as
// JSON in <dir> (default: a folder in the system temp dir, never in the
// repo). --fresh fetches again (two read-only calls). Run the supplies
// import first so both sides are from the same moment. Prints counts only.
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

const { getSupplyItemsAdminShape, getSupplyOrdersShape } = await import("../../lib/pg/supplies");

type Row = Record<string, unknown>;
let failed = false;

async function compare(action: string, listKey: string, idKey: string, ours: Row[]) {
  const file = path.join(cacheDir, `${action}.json`);
  if (fresh || !fs.existsSync(file)) {
    const response = await fetch(`${process.env.GOOGLE_SCRIPT_URL}?action=${action}`);
    const body = await response.text();
    try {
      JSON.parse(body);
      fs.writeFileSync(file, body);
    } catch {
      console.log(`SKIP   ${action}: Apps Script did not answer with JSON (status ${response.status}). Not retried.`);
    }
  }
  if (!fs.existsSync(file)) {
    console.log(`FAIL   ${action}: no cached answer to compare with.`);
    failed = true;
    return;
  }
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, Row[] | undefined>;
  const theirs = data[listKey] ?? data.data ?? [];
  const sameKeys = theirs.length > 0 && ours.length > 0 && JSON.stringify(Object.keys(theirs[0])) === JSON.stringify(Object.keys(ours[0]));
  const sameOrder = theirs.length === ours.length && theirs.every((row, i) => row[idKey] === ours[i][idKey]);
  const differentFields = new Map<string, number>();
  let rowsDifferent = 0;
  if (sameOrder) {
    theirs.forEach((row, i) => {
      let different = false;
      for (const key of Object.keys(row)) {
        // Strict: rowNumber must be the same number, text the same text.
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
    `${ok ? "SAME  " : "DIFF  "} ${action}: Apps Script ${theirs.length} rows / Postgres ${ours.length} rows; same keys in the same order: ${sameKeys}; same rows in the same order: ${sameOrder}; rows with a different value: ${rowsDifferent}` +
      (differentFields.size ? ` (${[...differentFields].map(([k, n]) => `${k} in ${n}`).join(", ")})` : "")
  );
}

await compare("getSupplyItemsAdmin", "supplyItems", "id", (await getSupplyItemsAdminShape()) as unknown as Row[]);
await compare("getSupplyOrders", "supplyOrders", "orderId", (await getSupplyOrdersShape()) as unknown as Row[]);

console.log(failed ? "\nDIFFERENCES FOUND" : "\nBoth lists are identical to the Apps Script answers.");
if (failed) process.exitCode = 1;
